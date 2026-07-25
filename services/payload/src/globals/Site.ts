import type { GlobalConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Options du carnet — branding visuel + réglages de lecture.
 *
 * L'identité (siteName, authorName, baseline, copyright) vit dans le
 * global `Identity`, les profils sociaux dans `Social`, la nav dans
 * `Navigation`, les hero des landings dans `IndexPages`.
 *
 * Le slug reste `site` pour des raisons de stabilité (URL admin, REST
 * API, données existantes) — le label « Options » est purement
 * cosmétique côté sidebar.
 */
export const Site: GlobalConfig = {
  slug: 'site',
  label: 'Options',
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/SiteEditView#default',
          },
        },
      },
    },
  },
  fields: [
    {
      name: 'branding',
      type: 'group',
      label: 'Branding',
      fields: [
        {
          name: 'accentColor',
          type: 'select',
          required: false,
          label: "Couleur d'accentuation",
          defaultValue: '#5a3a7a',
          options: [
            { label: 'Violet (par défaut)', value: '#5a3a7a' },
            { label: 'Rouge sourd', value: '#8a3a3a' },
            { label: 'Bleu encre', value: '#1f3a5a' },
            { label: 'Gris ardoise', value: '#3a3a3a' },
            { label: 'Vert forêt', value: '#2d5a3d' },
          ],
          admin: {
            description:
              "Teinte d'accent appliquée à tout le site (point de la marque, item nav actif, kickers, liens dans les billets, boutons actifs, etc.).",
          },
        },
        {
          name: 'backgroundColor',
          type: 'select',
          required: false,
          label: 'Couleur de fond',
          defaultValue: '#f6f5f1',
          options: [
            { label: 'Ivoire (par défaut)', value: '#f6f5f1' },
            { label: 'Presque-blanc', value: '#fdfcf8' },
            { label: 'Blanc pur', value: '#ffffff' },
            { label: 'Craie', value: '#f1efe8' },
            { label: 'Parchemin', value: '#eee9dd' },
            { label: 'Froid pâle', value: '#e9eaec' },
          ],
          admin: {
            description:
              'Teinte de fond du Carnet — appliquée au body et aux zones neutres (header, footer, fond des billets, fond admin).',
          },
        },
      ],
    },
    {
      name: 'reading',
      type: 'group',
      label: 'Lecture des billets',
      fields: [
        {
          name: 'notesMode',
          type: 'select',
          required: false,
          label: 'Affichage des notes de bas de page',
          defaultValue: 'classic',
          options: [
            { label: 'Classique — toutes les notes en pied d\'article', value: 'classic' },
            { label: 'En marge — notes alignées à droite du paragraphe', value: 'sidenotes' },
          ],
          admin: {
            description:
              'Le mode classique empile les notes en bas du billet (style académique). Le mode en marge les place dans une colonne à droite, alignée sur le paragraphe qui les appelle (style « Tufte »). S\'applique uniformément à tous les billets du Carnet. Cf issue #6.',
          },
        },
      ],
    },
  ],
};
