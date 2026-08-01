import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Articles de recherche — le format académique de Tituba.
 *
 * Texte long, avec l'appareil complet : notes de bas de page,
 * bibliographie, exports BibTeX/RIS. C'est le seul format à porter un
 * DOI, quand l'article est aussi déposé ailleurs.
 *
 * Le socle de champs (numéro, titre/slug, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Articles: CollectionConfig = buildPublicationCollection({
  slug: 'articles',
  labels: { singular: 'Article de recherche', plural: 'Articles de recherche' },
  extraFields: [
    {
      name: 'doi',
      type: 'text',
      required: false,
      label: 'DOI',
      admin: {
        position: 'sidebar',
        description:
          "Identifiant pérenne, si l'article est aussi déposé sur HAL, Zenodo ou une revue. Ex. « 10.5281/zenodo.1234567 ». Repris dans les exports de citation.",
      },
    },
  ],
  afterChange: [
    makeUpdateSearchVector('articles'),
    makeNotifyNewPublication({
      slug: 'articles',
      routePrefix: '/articles',
      label: 'Article de recherche',
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
