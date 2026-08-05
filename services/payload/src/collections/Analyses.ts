import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Billets d'analyse — format libre, sans contrainte académique.
 *
 * Texte de fond qui prend le temps d'argumenter, sans l'appareil
 * formel d'un article de recherche. Les notes et la bibliographie
 * restent disponibles, mais ne sont pas attendues.
 *
 * Le socle de champs (identifiant public, titre, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Analyses: CollectionConfig = buildPublicationCollection({
  slug: 'analyses',
  labels: { singular: "Billet d'analyse", plural: "Billets d'analyse" },
  // Une suite de billets qui se répondent au fil d'un même dossier.
  series: true,
  extraFields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Image de couverture',
      admin: {
        description:
          "Affichée à côté du titre en haut du billet. Sans image, la page garde son rendu actuel (titre pleine largeur).",
      },
    },
  ],
  afterChange: [
    makeUpdateSearchVector('analyses'),
    makeNotifyNewPublication({
      slug: 'analyses',
      routePrefix: '/analyses',
      label: "Billet d'analyse",
    }),
  ],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'publicId', 'lede'],
    components: {
      views: {
        edit: { root: { Component: '@/components/admin/PublicationEditView#default' } },
        list: { Component: '@/components/admin/PublicationListView#default' },
      },
    },
  },
});
