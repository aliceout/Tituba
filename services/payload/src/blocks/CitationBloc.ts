import type { Block } from 'payload';

/**
 * Citation longue typographiée — blockquote avec source optionnelle.
 *
 * Ref design : design_handoff_carnet/Carnet B.html → .body-grid blockquote
 * (border-left 2px accent, font-size 22px, line-height 1.5, italique optionnel).
 */
export const CitationBloc: Block = {
  slug: 'citation_bloc',
  labels: { singular: 'Citation longue', plural: 'Citations longues' },
  fields: [
    {
      name: 'text',
      type: 'textarea',
      required: true,
      label: 'Texte de la citation',
    },
    {
      name: 'source',
      type: 'text',
      required: false,
      label: 'Source / attribution',
      admin: {
        description: "Ex : « Puar (2007), p. 23 ». Affichée en petits caractères mutés.",
      },
    },
  ],
};
