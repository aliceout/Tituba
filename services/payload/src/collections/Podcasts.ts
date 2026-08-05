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
 * Le socle de champs (identifiant public, titre, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Podcasts: CollectionConfig = buildPublicationCollection({
  slug: 'podcasts',
  labels: { singular: 'Podcast', plural: 'Podcasts' },
  bodyRequired: false,
  // Un épisode se range dans une émission, qui porte son flux RSS.
  series: true,
  extraFields: [
    // Fichier auto-hébergé plutôt qu'un lien vers une plateforme : c'est
    // lui que sert le lecteur du site et que référence l'`enclosure` du
    // flux podcast, donc l'écoute ne dépend d'aucun tiers et ne laisse
    // pas de traceur chez lui.
    //
    // Facultatif côté base, obligatoire côté vue d'édition : un épisode
    // s'ouvre souvent avant que le montage soit prêt, et un `NOT NULL`
    // interdirait d'enregistrer la fiche en attendant le fichier.
    {
      /**
       * Le fichier vit dans `media`, avec les images, et non dans une
       * collection à part : une médiathèque unique avec un filtre par
       * type est ce que l'on cherche quand on cherche « le fichier », et
       * c'est ainsi que fonctionnent les CMS auxquels on est habitué·e.
       * `filterOptions` fait le tri à la source — le sélecteur d'un
       * épisode ne propose que de l'audio, jamais une photo.
       */
      name: 'audio',
      type: 'upload',
      relationTo: 'media',
      filterOptions: () => ({ mimeType: { like: 'audio' } }),
      required: false,
      label: 'Fichier audio',
      admin: {
        description:
          "Épisode à déposer (mp3 de préférence). Il est servi depuis nos serveurs et alimente le lecteur du site comme le flux podcast.",
      },
    },
    // Même champ que sur les billets d'analyse, au même endroit dans la
    // page : un épisode a une couverture comme un billet a une image.
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Image de couverture',
      admin: {
        description:
          "Affichée à côté du titre en haut de l'épisode. Sans image, la page garde son rendu actuel (titre pleine largeur).",
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
        description: 'Relevée dans le fichier au moment du dépôt.',
      },
    },
    // `hasMany` et non une chaîne à virgules : un nom peut contenir une
    // virgule (« Camille Roux, dir. »), et chaque surface qui affiche la
    // liste aurait eu à la redécouper pour son compte.
    {
      name: 'guests',
      type: 'text',
      hasMany: true,
      required: false,
      label: 'Invité·es',
      admin: {
        description:
          "Personnes reçues dans l'épisode. Distinct des auteur·ices, qui signent la production.",
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
