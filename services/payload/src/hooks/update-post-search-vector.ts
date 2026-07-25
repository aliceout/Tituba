/**
 * Hook afterChange sur la collection `posts` qui recalcule la colonne
 * `search_vector` (tsvector) à chaque save. Cf. lib/post-search-vector
 * pour la pondération et migrations/<…>_posts_search_vector.ts pour
 * la création de la colonne et de l'index GIN.
 *
 * Pourquoi afterChange + UPDATE séparé plutôt qu'un beforeChange qui
 * pose un champ Payload : la colonne search_vector ne fait pas partie
 * du schema Payload — elle est gérée DB-side. La poser via une UPDATE
 * raw évite d'avoir à exposer le tsvector comme un field Payload (qui
 * n'a pas de type tsvector natif) tout en restant atomique : si
 * l'UPDATE échoue, on log mais on ne bloque pas le save (le billet
 * reste sauvable, juste pas indexé pour la recherche jusqu'au prochain
 * save).
 *
 * Le hook re-fetch le billet avec depth=1 pour avoir les relations
 * (thèmes, tags, auteur·ices internes) résolues en objets — leurs
 * noms entrent dans le tsvector poids D.
 *
 * L'UPDATE passe par `txDrizzle(req)` et non par `req.payload.db.drizzle` :
 * ce dernier est le pool, pas la transaction du save. À la création, la
 * ligne n'est pas encore visible depuis le pool, donc l'UPDATE matchait
 * zéro ligne et le billet restait non indexé jusqu'au save suivant.
 * Cf. db/tx.ts.
 */

import type { CollectionAfterChangeHook } from 'payload';
import { sql } from '@payloadcms/db-postgres/drizzle';

import { buildPostSearchVectorSQL } from '../lib/post-search-vector';
import { txDrizzle } from '../db/tx';

type ResolvedRelation = { name?: string | null } | { displayName?: string | null; email?: string | null };

function relationName(r: unknown): string {
  if (!r || typeof r !== 'object') return '';
  const o = r as ResolvedRelation;
  if ('name' in o && typeof o.name === 'string') return o.name;
  if ('displayName' in o && typeof o.displayName === 'string' && o.displayName.trim()) {
    return o.displayName;
  }
  if ('email' in o && typeof o.email === 'string') return o.email;
  return '';
}

type AuthorEntry = {
  kind?: 'user' | 'external';
  user?: unknown;
  name?: string | null;
};

function authorName(a: AuthorEntry): string {
  if (a.kind === 'external') return (a.name ?? '').toString();
  return relationName(a.user);
}

/**
 * Forme du document telle que l'indexation la consomme. Le slug de
 * collection n'étant connu qu'à l'exécution, Payload ne peut pas
 * inférer le type de retour de findByID : on le décrit ici plutôt que
 * de laisser TypeScript le réduire à `never`.
 */
type IndexableDoc = {
  title?: string | null;
  lede?: string | null;
  body?: unknown;
  slug?: string | null;
  idCarnet?: string | null;
  themes?: unknown[] | null;
  tags?: unknown[] | null;
  authors?: unknown[] | null;
};

export function makeUpdateSearchVector(collectionSlug: string): CollectionAfterChangeHook {
  return async ({ doc, req, operation }) => {
  // On ne ré-indexe que sur create/update — pas sur les autres
  // opérations (ex: lecture qui pourrait déclencher un afterRead).
  if (operation !== 'create' && operation !== 'update') return doc;
  if (doc?.id == null) return doc;

  try {
    // Re-fetch avec depth=1 pour résoudre themes / tags / authors.user
    // en objets. overrideAccess=true : le hook tourne avec les
    // privilèges de l'opération courante, on a déjà passé la barrière
    // d'accès au save.
    const fresh = (await req.payload.findByID({
      collection: collectionSlug as never,
      id: doc.id,
      depth: 1,
      overrideAccess: true,
      req,
    })) as unknown as IndexableDoc;

    const themeNames = (Array.isArray(fresh.themes) ? fresh.themes : [])
      .map(relationName)
      .filter(Boolean);
    const tagNames = (Array.isArray(fresh.tags) ? fresh.tags : [])
      .map(relationName)
      .filter(Boolean);
    const authorNames = (Array.isArray(fresh.authors) ? fresh.authors : [])
      .map((a: unknown) => authorName(a as AuthorEntry))
      .filter(Boolean);

    const vectorSQL = buildPostSearchVectorSQL({
      title: fresh.title as string | null | undefined,
      lede: fresh.lede as string | null | undefined,
      body: fresh.body,
      slug: fresh.slug as string | null | undefined,
      idCarnet: fresh.idCarnet as string | null | undefined,
      themeNames,
      tagNames,
      authorNames,
    });

    // UPDATE direct sur posts, via l'instance Drizzle **de la
    // transaction en cours** (cf. db/tx.ts). Passer par le pool ici
    // serait un bug silencieux : à la création, la ligne n'est pas
    // encore visible hors transaction et l'UPDATE matcherait zéro ligne.
    await txDrizzle(req).execute(
      sql`UPDATE ${sql.raw(`"${collectionSlug}"`)} SET search_vector = ${vectorSQL} WHERE id = ${doc.id}`,
    );
  } catch (err) {
    // On log mais on ne throw pas : la recherche peut tolérer un
    // billet temporairement non-indexé, le prochain save le rattrapera.
    req.payload.logger.error(
      { err, postId: doc.id },
      `Failed to update ${collectionSlug}.search_vector`,
    );
  }

    return doc;
  };
}
