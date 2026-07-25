import type { Block } from 'payload';

/**
 * Référence bibliographique inline — pointeur vers une entrée de la
 * collection `bibliography`.
 *
 * Au rendu, devient un lien interne typé « (Auteur, année) » qui ancre
 * vers la section Bibliographie en pied d'article (id = `#bib-<slug>`).
 *
 * Le format affiché peut être surchargé par les champs `prefix` /
 * `suffix` (ex : « cf. » avant, « , p. 47 » après). C'est utile pour
 * une citation type Chicago author-date.
 */
export const BiblioInline: Block = {
  slug: 'biblio_inline',
  labels: { singular: 'Référence biblio (inline)', plural: 'Références biblio (inline)' },
  fields: [
    {
      name: 'entry',
      type: 'relationship',
      relationTo: 'bibliography',
      // Optionnel côté schéma : le slash menu de l'éditeur insère
      // d'abord un block vide, l'utilisatrice choisit la référence
      // ensuite via le popover inline. Côté rendu Astro, un
      // biblio_inline sans entry est rendu en « (réf. manquante) ».
      required: false,
      label: 'Entrée bibliographique',
    },
    {
      name: 'prefix',
      type: 'text',
      required: false,
      label: 'Préfixe',
      admin: { description: 'Ex : « cf. », « voir », « comparer ».' },
    },
    {
      name: 'pages',
      type: 'text',
      required: false,
      label: 'Page(s) citée(s)',
      admin: {
        description:
          'Page(s) précisément citées dans ce passage du billet — pas la pagination de l\'ouvrage en biblio. Ex : « 47 », « 47-52 », « 47, 53-55 ».',
      },
    },
    {
      name: 'suffix',
      type: 'text',
      required: false,
      label: 'Suffixe',
      admin: { description: 'Complément libre. Ex : « chap. 3 », « tableau 4 ».' },
    },
  ],
};
