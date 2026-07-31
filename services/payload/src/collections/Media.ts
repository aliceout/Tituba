import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médias' },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    components: {
      views: {
        // Vue d'édition custom — drop-zone fichier + champ alt + meta
        // (mime, taille, dims) + aperçu image. Cf BibliographyEditView
        // / ThemeEditView.
        edit: {
          root: {
            Component: '@/components/admin/MediaEditView#default',
          },
        },
        list: {
          Component: '@/components/admin/MediaListView#default',
        },
      },
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre',
      admin: {
        description:
          'Affiché en légende ou en infobulle selon le contexte.',
      },
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    // Rempli automatiquement à l'import depuis le picker Unsplash (cf.
    // endpoints/unsplash.ts) — vide pour un média uploadé à la main.
    // Sert au crédit obligatoire (conditions d'utilisation Unsplash),
    // affiché à la fois dans l'admin et sur la page publique.
    {
      name: 'unsplash',
      type: 'group',
      admin: {
        readOnly: true,
        description: 'Rempli automatiquement pour les images importées depuis Unsplash.',
      },
      fields: [
        { name: 'photoId', type: 'text' },
        { name: 'photographerName', type: 'text' },
        { name: 'photographerProfileUrl', type: 'text' },
        { name: 'photoPageUrl', type: 'text' },
      ],
    },
    // Zone retenue quand l'image sert de couverture : le hero d'un billet
    // l'affiche dans un carré, il faut donc dire laquelle de ses parties
    // montrer. Choisie dans le sélecteur de zone du picker.
    //
    // Rectangle et non simple point focal : la zone est redimensionnable,
    // ce qui revient à zoomer — quatre valeurs sont nécessaires, un point
    // focal n'en porte que deux et ne sait que déplacer.
    //
    // Exprimé en pourcentages des dimensions de l'image (0–100) et non en
    // pixels : reste juste quelle que soit la taille du fichier servi, et
    // se traduit directement en CSS côté site. Vide = image entière,
    // cadrée au centre.
    {
      name: 'crop',
      type: 'group',
      admin: {
        readOnly: true,
        description: 'Zone visible en couverture. Réglée depuis le sélecteur de zone.',
      },
      fields: [
        { name: 'x', type: 'number', label: 'Bord gauche (%)' },
        { name: 'y', type: 'number', label: 'Bord haut (%)' },
        { name: 'w', type: 'number', label: 'Largeur (%)' },
        { name: 'h', type: 'number', label: 'Hauteur (%)' },
      ],
    },
  ],
  upload: true,
}
