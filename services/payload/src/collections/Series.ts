import type { CollectionConfig } from 'payload';

import { authenticated } from '../access/authenticated';

/**
 * Séries — ensembles ordonnés de publications d'un même format.
 *
 * Une série est homogène : une émission ne contient que des épisodes,
 * une série d'articles que des articles. C'est le champ `format` qui le
 * garantit, et c'est lui qui décide du vocabulaire employé partout
 * ailleurs (« épisode 3 » pour un podcast, « volet 3 » pour un texte).
 *
 * À ne pas confondre avec le dossier thématique, à venir : celui-là
 * regroupera plusieurs formats autour d'un sujet — un hors-série. La
 * série ordonne une suite ; le dossier rassemble un thème. Deux objets,
 * deux mots, et « dossier » est réservé au second.
 *
 * Une seule collection pour les trois formats, et non une par format :
 * dans cet admin, chaque collection coûte deux vues écrites à la main
 * (liste et édition), puisque les vues natives de Payload sont
 * intégralement remplacées. Trois collections auraient donc coûté six
 * vues pour un objet identique. La nav, elle, en présente deux portes —
 * « Émissions » et « Séries d'articles » — parce que le vocabulaire et
 * le travail diffèrent même quand la table est la même (cf Nav.client).
 *
 * Slug = pivot URL (`/series/{slug}/`), sur le modèle des thèmes.
 */
export const Series: CollectionConfig = {
  slug: 'series',
  labels: { singular: 'Série', plural: 'Séries' },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'format', 'slug', 'updatedAt'],
    listSearchableFields: ['name', 'slug'],
    components: {
      views: {
        // Vues sur mesure, comme partout ailleurs dans cet admin : le
        // rendu natif de Payload y est intégralement remplacé, et une
        // collection qui s'en passerait détonnerait au milieu du reste.
        edit: {
          root: {
            Component: '@/components/admin/SeriesEditView#default',
          },
        },
        list: {
          Component: '@/components/admin/SeriesListView#default',
        },
      },
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nom',
      admin: {
        description:
          'Ex : « Voix de la mer » pour une émission, « Homonationalismes » pour une série d’articles.',
      },
    },
    {
      /**
       * Choisi à la création, figé ensuite — comme le format juste
       * dessous. C'est l'adresse publique de la série : la laisser
       * changer casserait tous les liens déjà partagés, et rien dans la
       * page ne dirait pourquoi ils ne mènent plus nulle part.
       *
       * Verrou côté API et pas seulement dans le formulaire : une règle
       * qui ne tient que dans l'interface ne tient pas.
       */
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: () => false },
      admin: {
        description:
          'Identifiant URL, ex : « voix-de-la-mer ». Forme l’adresse /series/<slug>/, définitivement.',
      },
    },
    {
      /**
       * Le format n'est pas décoratif : c'est lui qui restreint la liste
       * des billets rattachables, qui décide si un flux RSS est publié,
       * et qui choisit entre « épisode » et « volet ». Le changer après
       * coup sur une série déjà peuplée orphelinerait ses billets, d'où
       * le verrouillage : modifiable à la création, plus après. Un
       * simple avertissement dans l'admin n'aurait rien empêché, la
       * contrainte devant tenir aussi pour l'API.
       */
      name: 'format',
      type: 'select',
      required: true,
      index: true,
      label: 'Format',
      access: { update: () => false },
      options: [
        { label: 'Émission (podcasts)', value: 'podcasts' },
        { label: 'Articles de recherche', value: 'articles' },
        { label: "Billets d'analyse", value: 'analyses' },
      ],
      admin: {
        description:
          'Décide de ce qu’on peut ranger dans cette série, et du mot employé pour ses entrées. Non modifiable une fois la série créée.',
      },
    },
    {
      /**
       * Thématiques de la série, saisies et non déduites de ses billets.
       *
       * Une émission de cinq épisodes en toucherait six par addition, et
       * sa page afficherait un nuage plutôt qu'un sujet. C'est la série
       * qui dit de quoi elle parle, ses billets ne font que s'y ranger.
       *
       * Elles la font aussi exister dans la taxonomie du site : sans
       * elles, une série n'est atteignable que depuis un billet qui en
       * fait partie.
       */
      name: 'themes',
      type: 'relationship',
      relationTo: 'themes',
      hasMany: true,
      required: false,
      label: 'Thématiques',
      admin: {
        description:
          'Ce dont traite la série dans son ensemble. Indépendantes de celles de ses billets, qui peuvent être plus précises.',
      },
    },
    {
      name: 'lede',
      type: 'textarea',
      required: false,
      label: 'Présentation',
      admin: {
        description:
          '2 à 4 phrases — en tête de la page de la série, et reprise comme description du flux pour une émission.',
      },
    },
    {
      /**
       * Pour une émission, c'est la couverture que les applications
       * d'écoute affichent, et Apple la refuse hors du carré 1400–3000
       * px. Pour une série de textes, c'est l'image de la page de série
       * et le fond du hero de ses volets — aucune contrainte de format.
       */
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Image',
      admin: {
        description:
          'Fond du hero des billets de la série. Pour une émission, elle sert aussi de couverture dans les applications d’écoute : carrée, entre 1400 et 3000 px de côté.',
      },
    },
    {
      /**
       * Réglages iTunes propres à l'émission. Ils existent déjà pour le
       * site entier dans le global Abonnements : ceux-ci ne servent qu'à
       * les surcharger émission par émission. Laissés vides, c'est le
       * réglage global qui s'applique — sinon on ressaisirait la même
       * adresse de contact à chaque nouvelle émission.
       */
      name: 'feed',
      type: 'group',
      label: 'Flux podcast',
      admin: {
        condition: (data) => data?.format === 'podcasts',
        description:
          'Laissez vide pour reprendre les réglages du global Abonnements. Ne renseignez ici que ce qui doit différer pour cette émission.',
      },
      fields: [
        {
          name: 'explicit',
          type: 'checkbox',
          defaultValue: false,
          label: 'Contenu explicite',
          admin: {
            description:
              'À cocher si les épisodes de cette émission comportent des propos crus. Une omission peut faire retirer le flux.',
          },
        },
        {
          name: 'ownerEmail',
          type: 'text',
          required: false,
          label: 'Adresse de contact du flux',
          admin: {
            description:
              'Sert à Apple et Spotify pour vérifier que le flux est bien déposé par vous. Publique, puisque présente dans le flux.',
          },
        },
      ],
    },
    {
      /**
       * Une série en préparation existe dans l'admin sans être publiée :
       * on lui rattache des billets, on écrit sa présentation, et rien
       * n'apparaît côté public tant que la case n'est pas décochée.
       * Même mécanique que le brouillon d'une publication.
       */
      name: 'draft',
      type: 'checkbox',
      defaultValue: true,
      label: 'Brouillon',
      admin: {
        position: 'sidebar',
        description:
          'Tant que la case est cochée, la série n’a pas de page publique et son flux n’est pas publié.',
      },
    },
  ],
};
