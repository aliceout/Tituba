/**
 * Hooks partagés par les collections de publication.
 *
 * Les hooks Payload ne reçoivent pas le slug de la collection courante
 * dans leurs arguments : une fabrique qui en aurait besoin doit être
 * fermée dessus à la construction.
 */

import type { CollectionBeforeValidateHook } from 'payload';

import { generatePublicId } from '../../lib/public-id';

/**
 * Attribue l'identifiant public à la création (cf lib/public-id.ts pour
 * le choix de l'alphabet et de la longueur).
 *
 * Quelques tentatives en cas de collision, puis on laisse filer : la
 * contrainte d'unicité en base tranche. C'est volontaire — cette
 * vérification applicative ne peut de toute façon pas couvrir la course
 * entre deux créations simultanées, seul l'index le peut. Elle sert à
 * éviter l'erreur, pas à la garantir impossible.
 */
export function makePublicId(collectionSlug: string): CollectionBeforeValidateHook {
  return async ({ data, req, operation }) => {
    if (operation !== 'create') return data;
    if ((data as { publicId?: string } | undefined)?.publicId) return data;

    for (let essai = 0; essai < 5; essai++) {
      const candidat = generatePublicId();
      try {
        const existant = await req.payload.find({
          collection: collectionSlug as never,
          where: { publicId: { equals: candidat } },
          limit: 1,
          depth: 0,
        });
        if (existant.totalDocs === 0) return { ...(data ?? {}), publicId: candidat };
      } catch {
        // Base injoignable : on pose quand même l'identifiant plutôt que
        // de bloquer la création. L'index unique reste le garde-fou.
        return { ...(data ?? {}), publicId: candidat };
      }
    }
    return { ...(data ?? {}), publicId: generatePublicId() };
  };
}

/**
 * Auteur·ice par défaut à la création : la personne connectée signe en
 * premier. Elle peut ensuite ajouter des co-auteur·ices, internes ou
 * externes.
 *
 * Ce hook portait aussi l'attribution d'un numéro de série auto-
 * incrémenté, hérité de Carnet. Tituba n'a pas d'usage pour une telle
 * numérotation : les publications sont identifiées par leur id et
 * datées, et rien — ni les URL, ni les citations, ni les métadonnées
 * Zotero — ne s'appuyait dessus.
 */
export function makeDefaultAuthor(): CollectionBeforeValidateHook {
  return async ({ data, req, operation }) => {
    if (operation !== 'create') return data;

    const authors = (data as { authors?: unknown[] } | undefined)?.authors;
    const userId = (req.user as { id?: number | string } | null | undefined)?.id;
    if ((!authors || authors.length === 0) && userId) {
      return { ...(data ?? {}), authors: [{ kind: 'user', user: userId }] };
    }

    return data;
  };
}
