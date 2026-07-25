import type { Block } from 'payload';

/**
 * Bloc « prose » — section de texte rich (Lexical) avec ses propres
 * paragraphes, titres, citations, listes et liens. Utilisé dans la
 * collection `Pages` (À propos, Mentions légales, etc.) où on a besoin
 * d'empiler des sections de texte sans la structure académique stricte
 * d'un Post.
 *
 * Pour un Post, on n'a pas besoin de Prose : son champ `body` est déjà
 * un rich text Lexical à part entière.
 */
export const Prose: Block = {
  slug: 'prose',
  labels: { singular: 'Texte (prose)', plural: 'Textes (prose)' },
  fields: [
    {
      name: 'titre',
      type: 'text',
      required: false,
      label: 'Titre de section (optionnel)',
      admin: {
        description: 'Apparaît en h2 si présent. Laisser vide pour pas de titre.',
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: 'Contenu',
    },
  ],
};
