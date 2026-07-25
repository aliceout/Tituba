/**
 * Construit le tsvector pondéré d'un billet pour la recherche fulltext
 * Postgres (cf. migration qui ajoute la colonne `search_vector` +
 * GIN index sur la table `posts`).
 *
 * Pondération (poids tsvector) :
 *  - A : titre — match prioritaire
 *  - B : chapô (lede) + idCarnet — l'identifiant n° canonique
 *  - C : corps + footnotes + citations + légendes — le gros du contenu
 *  - D : métadonnées (slug, noms de thèmes, noms de tags, auteur·ices)
 *
 * Le calcul se fait côté Node (hook beforeChange), pas via un trigger
 * SQL, parce que le `body` est en JSON Lexical — extraire son texte
 * en pl/pgsql serait pénible. Le résultat est stocké dans la colonne
 * `search_vector` ; la migration fournit aussi un fallback côté SQL au
 * cas où la colonne serait laissée NULL (raw text concaténé).
 *
 * Toutes les requêtes utilisent le dictionnaire `french` qui gère
 * stemming + stop-words natifs.
 */

import { sql, type SQL } from '@payloadcms/db-postgres/drizzle';

import { extractLexicalText } from './extract-lexical-text';

export type PostSearchSource = {
  title?: string | null;
  lede?: string | null;
  body?: unknown;
  slug?: string | null;
  idCarnet?: string | null;
  // Liste de noms (pas d'IDs) résolus côté hook avant l'appel.
  themeNames?: string[];
  tagNames?: string[];
  authorNames?: string[];
};

/** Concatène et normalise un set de strings — vide si tout est falsy. */
function joinNonEmpty(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').toString().trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Renvoie un fragment SQL drizzle qui, évalué côté DB, produit le
 * tsvector pondéré du billet. Utilisable en `db.execute(sql`UPDATE
 * posts SET search_vector = ${...} WHERE id = ${id}`)`.
 *
 * On délègue le tsvector lui-même à Postgres (`to_tsvector('french',
 * $1)`) plutôt que de construire un littéral en JS — Postgres gère
 * mieux le stemming + l'échappement.
 */
export function buildPostSearchVectorSQL(src: PostSearchSource): SQL {
  // A : titre seul.
  const a = (src.title ?? '').toString().trim();
  // B : chapô + idCarnet (souvent cherché tel quel : « carnet:2026-042 »).
  const b = joinNonEmpty([src.lede, src.idCarnet]);
  // C : corps + tous les blocks (footnotes, citations, légendes).
  //     On inclut les blocks custom pour que la recherche matche aussi
  //     une phrase enfouie dans une note de bas de page.
  const c = extractLexicalText(src.body, { includeBlocks: true });
  // D : métadonnées textuelles utiles à matcher (taxonomie, auteur·ices,
  //     slug pour les permaliens copiés-collés).
  const d = joinNonEmpty([
    src.slug,
    ...(src.themeNames ?? []),
    ...(src.tagNames ?? []),
    ...(src.authorNames ?? []),
  ]);

  return sql`
    setweight(to_tsvector('french', coalesce(${a}, '')), 'A')
      || setweight(to_tsvector('french', coalesce(${b}, '')), 'B')
      || setweight(to_tsvector('french', coalesce(${c}, '')), 'C')
      || setweight(to_tsvector('french', coalesce(${d}, '')), 'D')
  `;
}
