import type { Block } from 'payload';

/**
 * Note de bas de page numérotée.
 *
 * Insérée dans le rich text Lexical d'un Post via le slash menu.
 * Le numéro est attribué côté rendu Astro (ordre d'apparition), pas
 * en base — pour permettre les ré-arrangements du corps sans casser
 * la numérotation.
 *
 * Ref design : design_handoff_carnet/Carnet B.html → .footnotes-classic.
 */
export const Footnote: Block = {
  slug: 'footnote',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: [
    {
      name: 'content',
      type: 'textarea',
      required: true,
      label: 'Texte de la note',
      admin: {
        description:
          'Markdown léger autorisé : *italique*, **gras**, [liens](url), <em>balises</em>.',
      },
    },
  ],
};
