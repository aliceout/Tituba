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
      /**
       * Les documents mis à disposition, chacun avec ce qu'il faut pour
       * l'annoncer.
       *
       * Trois formes se sont succédé ici, et la raison de la dernière
       * mérite d'être écrite. C'était d'abord une adresse saisie à la
       * main : rien ne garantissait qu'elle mène quelque part. Puis une
       * relation d'upload, qui garantit le fichier mais n'offre aucune
       * prise sur ce qu'on en dit — la page affichait « guide-v3.pdf »
       * faute de mieux. D'où ce tableau : le fichier reste garanti, et
       * sa description devient du contenu éditorial.
       *
       * L'intitulé, lui, n'est PAS répété ici : c'est le titre du
       * média, saisi une fois dans la médiathèque et affiché partout
       * où le document apparaît. Le dupliquer aurait créé deux noms
       * pour un même fichier, dont un seul se corrige au bon endroit.
       */
      name: 'resources',
      type: 'array',
      required: true,
      minRows: 1,
      label: 'Les fichiers',
      labels: { singular: 'Fichier', plural: 'Fichiers' },
      admin: {
        description:
          'Les documents mis à disposition — PDF, ODT, tableur. C’est ce que l’outil sert à transmettre ; le texte du billet ne fait que les présenter. Un outil peut en réunir plusieurs : un guide et sa grille, un support et son corrigé.',
      },
      fields: [
        {
          name: 'fichier',
          type: 'upload',
          relationTo: 'media',
          required: true,
          label: 'Fichier',
        },
        {
          name: 'description',
          type: 'textarea',
          required: false,
          label: 'Description',
          admin: {
            description:
              'Une ou deux lignes sur ce que contient ce document, et à quoi il sert. Affichée sous son intitulé.',
          },
        },
      ],
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
