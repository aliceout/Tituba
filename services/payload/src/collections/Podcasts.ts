import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Podcasts — épisodes audio.
 *
 * Le contenu principal est le fichier audio ; le corps ne sert qu'aux
 * notes d'épisode, il est donc facultatif.
 *
 * Le socle de champs (numéro, titre/slug, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Podcasts: CollectionConfig = buildPublicationCollection({
  slug: 'podcasts',
  labels: { singular: 'Podcast', plural: 'Podcasts' },
  idPrefix: 'tituba:podcast',
  bodyRequired: false,
  extraFields: [
    {
      name: 'audioUrl',
      type: 'text',
      required: true,
      label: 'Lien du fichier audio',
      admin: {
        description:
          "URL directe du fichier (mp3, ogg…) ou de la page d'écoute chez l'hébergeur. C'est ce lien qui alimente le lecteur côté site.",
      },
    },
    {
      name: 'durationSeconds',
      type: 'number',
      required: false,
      min: 0,
      label: 'Durée (secondes)',
      admin: {
        position: 'sidebar',
        description:
          "Durée de l'épisode, affichée en « 42 min » côté lecteur·ice. Remplace le temps de lecture, qui n'a pas de sens pour de l'audio.",
      },
    },
    {
      name: 'guests',
      type: 'text',
      required: false,
      label: 'Invité·es',
      admin: {
        description:
          "Personnes reçues dans l'épisode, séparées par des virgules. Distinct des auteur·ices, qui signent la production.",
      },
    },
  ],
  afterChange: [
    makeUpdateSearchVector('podcasts'),
    makeNotifyNewPublication({
      slug: 'podcasts',
      routePrefix: '/podcasts',
      label: 'Podcast',
    }),
  ],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['numero', 'title', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'slug', 'lede'],
    components: {
      views: {
        edit: { root: { Component: '@/components/admin/PublicationEditView#default' } },
        list: { Component: '@/components/admin/PublicationListView#default' },
      },
    },
  },
});
