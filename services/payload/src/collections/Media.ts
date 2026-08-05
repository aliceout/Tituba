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
      /**
       * Obligatoire pour une image, sans objet pour un fichier audio :
       * un texte alternatif décrit ce qu'on ne peut pas voir, et un
       * épisode n'a rien à faire voir. D'où une validation conditionnelle
       * plutôt qu'un `required` global — qui aurait empêché d'enregistrer
       * le moindre mp3, ou forcé à inventer une description bidon.
       *
       * La contrainte reste tenue là où elle compte : aucune image ne
       * peut être enregistrée sans alternative textuelle.
       */
      name: 'alt',
      type: 'text',
      required: false,
      label: 'Texte alternatif',
      validate: (value: string | null | undefined, { data }: { data?: { mimeType?: string | null } }) => {
        const estImage = (data?.mimeType ?? '').startsWith('image/');
        if (estImage && !String(value ?? '').trim()) {
          return 'Obligatoire sur une image : c’est ce que lisent les personnes qui ne la voient pas.';
        }
        return true;
      },
      admin: {
        description:
          'Ce que décrit l’image pour qui ne la voit pas. Laissé vide sur un fichier audio, qui n’a rien à décrire.',
      },
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
