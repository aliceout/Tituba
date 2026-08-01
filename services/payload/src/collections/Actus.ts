import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Billets d'actu — rebond court et rapide sur l'actualité.
 *
 * Format chaud : on réagit à une actualité pendant qu'elle est
 * encore vive. Volontairement bref, sans appareil.
 *
 * Le socle de champs (numéro, titre/slug, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Actus: CollectionConfig = buildPublicationCollection({
  slug: 'actus',
  labels: { singular: "Billet d'actu", plural: "Billets d'actu" },
  afterChange: [
    makeUpdateSearchVector('actus'),
    makeNotifyNewPublication({
      slug: 'actus',
      routePrefix: '/actus',
      label: "Billet d'actu",
    }),
  ],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'slug', 'lede'],
    components: {
      views: {
        edit: { root: { Component: '@/components/admin/PublicationEditView#default' } },
        list: { Component: '@/components/admin/PublicationListView#default' },
      },
    },
  },
});
