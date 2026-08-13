import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

/**
 * Ce que la médiathèque accepte, et rien d'autre.
 *
 * Trois usages, trois familles : les images de couverture et
 * d'illustration, les épisodes de podcast, et les documents joints. La
 * liste est écrite à partir de ce qui est réellement stocké, augmentée
 * des formats d'image modernes qu'on voudra servir un jour sans avoir à
 * repasser par une migration.
 *
 * SVG EN EST ABSENT, DÉLIBÉRÉMENT. Un SVG est un document XML : il peut
 * porter du script, et il est servi depuis le domaine du site. L'y
 * admettre reviendrait à ouvrir un dépôt de HTML exécutable à toute
 * personne ayant un compte rédaction. Si une icône vectorielle devient
 * nécessaire, elle passera par le dépôt, pas par la médiathèque.
 *
 * Renseigner `mimeTypes` désactive le filtre intégré de Payload sur les
 * types « à problème » (`allowRestrictedFileTypes`, faux par défaut) :
 * cette liste le remplace, elle ne s'y ajoute pas. D'où l'énumération
 * explicite plutôt qu'un `image/*` commode.
 */
const TYPES_ACCEPTES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
] as const

/**
 * Plafonds de taille, par famille.
 *
 * Un seul plafond pour tout le monde serait soit trop bas pour un
 * épisode d'une heure, soit absurdement haut pour une vignette. Les
 * valeurs sont larges — il s'agit d'écarter l'accident et l'abus, pas
 * de rogner sur la qualité : la plus grosse image en base fait 1,2 Mo,
 * le plus gros épisode 16 Mo.
 */
const PLAFONDS: Array<{ prefixe: string; octets: number; dit: string }> = [
  { prefixe: 'audio/', octets: 250 * 1024 * 1024, dit: '250 Mo' },
  { prefixe: 'application/pdf', octets: 25 * 1024 * 1024, dit: '25 Mo' },
  { prefixe: 'image/', octets: 12 * 1024 * 1024, dit: '12 Mo' },
]

function plafondPour(mime: string): { octets: number; dit: string } | null {
  return PLAFONDS.find((p) => mime.startsWith(p.prefixe)) ?? null
}

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
    {
      /**
       * `filesize` est un champ que Payload pose lui-même sur toute
       * collection téléversable. Le redéclarer ne le crée pas en double :
       * la configuration d'upload est fusionnée par `mergeBaseFields`,
       * qui superpose ce qui est déclaré ici au champ natif. On ne fait
       * donc qu'y accrocher une validation — le reste (type, libellé,
       * lecture seule) reste celui de Payload.
       *
       * Pourquoi ici plutôt qu'un plafond global : le plafond du parseur
       * est unique pour toutes les collections, donc calibré sur le plus
       * gros fichier légitime — un épisode de podcast. Une image de
       * 200 Mo passerait. Le contrôle qui a du sens dépend du type, et
       * c'est ici qu'on connaît les deux.
       *
       * Limite assumée : ce contrôle intervient une fois le fichier
       * reçu. Il refuse l'enregistrement, pas le transfert. Créer un
       * média demande un compte (`create: authenticated`), ce qui borne
       * déjà qui peut en abuser.
       */
      name: 'filesize',
      type: 'number',
      validate: (
        value: number | null | undefined,
        { siblingData }: { siblingData?: { mimeType?: string | null } },
      ) => {
        const mime = siblingData?.mimeType ?? ''
        const plafond = plafondPour(mime)
        if (!plafond || typeof value !== 'number') return true
        if (value <= plafond.octets) return true
        const taille = `${(value / 1024 / 1024).toFixed(1)} Mo`
        return `Fichier trop lourd : ${taille}, pour un maximum de ${plafond.dit}.`
      },
    },
  ],
  upload: {
    mimeTypes: [...TYPES_ACCEPTES],
    /**
     * Les fichiers sont servis depuis le domaine du site. Deux en-têtes,
     * pour deux risques distincts :
     *
     *  - `nosniff` empêche le navigateur de deviner un type autre que
     *    celui annoncé. Sans lui, un fichier accepté comme image mais
     *    dont le contenu ressemble à du HTML peut être interprété comme
     *    tel — c'est le chemin classique du XSS par téléversement.
     *  - `sandbox` neutralise ce qui s'exécuterait malgré tout : ni
     *    script, ni formulaire, ni accès au reste de l'origine.
     *
     * Ces en-têtes ne portent que sur les fichiers, jamais sur les pages
     * du site — ils sont posés par la route de service des médias.
     */
    modifyResponseHeaders: ({ headers }) => {
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Content-Security-Policy', 'sandbox; default-src \'none\'')
      return headers
    },
  },
}
