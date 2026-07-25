/**
 * Hooks partagés par les collections de publication.
 *
 * Chaque fabrique est fermée sur le slug de sa collection, parce que
 * les hooks Payload ne reçoivent pas le slug courant dans leurs
 * arguments — il faut le leur donner à la construction.
 */

import type { CollectionBeforeValidateHook } from 'payload';

/**
 * Numérotation automatique à la création : on ne demande jamais le
 * numéro à l'auteur·ice. Cherche le max existant **dans cette
 * collection** et assigne max+1.
 *
 * La numérotation est volontairement **par format** : chaque collection
 * a sa propre série (Podcast n° 003, Article n° 012). Conséquence
 * technique importante — l'unicité reste exprimable en contrainte
 * Postgres (`unique: true` est per-table), donc la base rattrape une
 * éventuelle collision au lieu de laisser passer deux publications
 * portant le même numéro. Un compteur global partagé entre les cinq
 * tables n'aurait pas cette garantie et aurait exigé un verrou
 * consultatif.
 *
 * S'exécute en `beforeValidate` — donc avant le check `required: true` —
 * pour qu'une création sans `numero` dans le payload passe la validation.
 */
export function makeAutoNumero(collectionSlug: string): CollectionBeforeValidateHook {
  return async ({ data, req, operation }) => {
    if (operation !== 'create') return data;
    let next = data;

    // Numéro auto
    if (!next || typeof next.numero !== 'number' || next.numero <= 0) {
      try {
        const existing = await req.payload.find({
          collection: collectionSlug as never,
          sort: '-numero',
          limit: 1,
          depth: 0,
        });
        const top = existing.docs[0] as { numero?: number } | undefined;
        const max = typeof top?.numero === 'number' ? top.numero : 0;
        next = { ...(next ?? {}), numero: max + 1 };
      } catch {
        // Repli prudent : on laisse Payload échouer sur le `required`
        // plutôt que d'écrire un numéro arbitraire.
      }
    }

    // Auteur·ice par défaut : la personne connectée signe en premier.
    // Elle peut ensuite ajouter des co-auteur·ices, internes ou externes.
    const authors = (next as { authors?: unknown[] } | undefined)?.authors;
    const userId = (req.user as { id?: number | string } | null | undefined)?.id;
    if ((!authors || authors.length === 0) && userId) {
      next = { ...(next ?? {}), authors: [{ kind: 'user', user: userId }] };
    }

    return next;
  };
}
