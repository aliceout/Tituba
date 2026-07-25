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
  ],
  upload: true,
}
