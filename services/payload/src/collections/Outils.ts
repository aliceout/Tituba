import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Outils — ressources pratiques mises à disposition.
 *
 * Guides, kits d'animation, grilles d'auto-évaluation, supports de
 * formation. La ressource elle-même est un fichier ou un lien ; le
 * corps sert à la présenter et reste facultatif.
 *
 * Le socle de champs (identifiant public, titre, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Outils: CollectionConfig = buildPublicationCollection({
  slug: 'outils',
  labels: { singular: 'Outil', plural: 'Outils' },
  bodyRequired: false,
  extraFields: [
    {
      name: 'resourceUrl',
      type: 'text',
      required: true,
      label: 'Lien de la ressource',
      admin: {
        description:
          "URL du fichier à télécharger (média Tituba ou hébergement externe), ou de la page qui l'héberge.",
      },
    },
    {
      name: 'audience',
      type: 'select',
      required: false,
      defaultValue: 'tous',
      label: 'Public visé',
      options: [
        { label: 'Tous publics', value: 'tous' },
        { label: 'Militant·es et collectifs', value: 'militantes' },
        { label: 'Professionnel·les', value: 'pros' },
        { label: 'Structures et institutions', value: 'structures' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
  afterChange: [
    makeUpdateSearchVector('outils'),
    makeNotifyNewPublication({
      slug: 'outils',
      routePrefix: '/outils',
      label: 'Outil',
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
