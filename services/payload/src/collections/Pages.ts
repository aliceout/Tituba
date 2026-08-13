import type { CollectionConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';
import { pageBlocks } from '../blocks';

/**
 * Slugs que le routeur Astro sert déjà avec une route dédiée. Une page
 * éditoriale portant l'un d'eux serait créée, sauvée… et définitivement
 * inatteignable : `src/pages/<slug>/` gagne toujours sur le catch-all
 * `src/pages/[slug].astro`, sans erreur nulle part. On refuse à la
 * saisie plutôt que de laisser l'éditeur·ice découvrir un 404 permanent.
 *
 * À tenir à jour si on ajoute une racine d'URL côté Astro.
 */
/**
 * Les quatre pages fixes du site, et leur adresse. Ce ne sont pas des
 * pages qu'on crée : ce sont des routes écrites en dur dans Astro
 * (`src/pages/archives.astro`, etc.) dont on peut seulement régler le
 * titre, le chapô et l'affichage au menu.
 *
 * Elles vivent dans cette collection plutôt que dans un global à part
 * pour qu'il n'y ait qu'un seul endroit nommé « Pages » dans l'admin.
 * Le prix à payer, ce sont les trois verrous ci-dessous : on ne peut ni
 * en créer une cinquième, ni en supprimer une, ni changer son slug.
 * Sans eux, supprimer « accueil » ferait disparaître le hero de la page
 * d'accueil sans que rien ne le signale.
 */
export const FIXED_PAGES: Record<string, string> = {
  home: "Page d'accueil",
  archives: 'Page Archives',
  themes: 'Page Thèmes',
  // Pendant de la page Thèmes, et jusqu'ici la seule des cinq dont le
  // titre et le chapô étaient écrits en dur dans le gabarit Astro :
  // l'ancien global l'avait oubliée.
  formats: 'Page Formats',
  subscribe: 'Page Abonnement',
};

const RESERVED_SLUGS = new Set([
  'articles',
  'analyses',
  'actus',
  'podcasts',
  'outils',
  'theme',
  'themes',
  'tag',
  'tags',
  'archives',
  'recherche',
  'abonnement',
  'rss.xml',
  'cms',
  'api',
  '404',
]);

/**
 * Pages éditoriales libres — À propos, Colophon, Mentions légales,
 * Accessibilité, RGPD, Index. Composées en empilant des blocs (cf.
 * `pageBlocks` → Prose, Figure, CitationBloc).
 *
 * Schéma proche de 2mains/Pages mais simplifié pour Tituba (pas de
 * variant de hero, pas de CTAs — la page À propos est typographique
 * avec sections empilées simples, cf design_handoff_tituba/README §
 * page-about.hbs).
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  /**
   * Écriture réservée aux administratrices, et non ouverte à tout compte
   * connecté comme avant.
   *
   * Ces pages sont la configuration du site, pas son contenu courant :
   * on y trouve les mentions légales, la page de l'association, et les
   * en-têtes des quatre routes fixes. Elles vivent dans « Config site »
   * dans la nav, et la nav n'y donnait accès qu'aux administratrices —
   * mais masquer une entrée n'empêche pas d'atteindre son URL, ni
   * d'appeler l'API. Un `editor` pouvait donc retitrer la page d'accueil
   * ou supprimer les mentions légales.
   *
   * La lecture reste publique : c'est ce qui permet à Astro de servir
   * ces pages sans jeton.
   */
  access: {
    read: () => true,
    create: isAdminOrRoot,
    update: isAdminOrRoot,
    delete: isAdminOrRoot,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    listSearchableFields: ['title', 'slug'],
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/PageEditView#default',
          },
        },
        list: {
          Component: '@/components/admin/PagesListView#default',
        },
      },
    },
  },
  hooks: {
    // Verrous des pages fixes. Posés en hooks et non dans l'interface :
    // une règle qui ne tient que dans le formulaire ne tient pas du tout,
    // l'API REST étant ouverte aux mêmes personnes.
    beforeValidate: [
      ({ data, originalDoc, operation }) => {
        if (!data) return data;
        const kind = data.kind ?? originalDoc?.kind ?? 'libre';
        if (kind !== 'fixe') return data;
        if (operation === 'create' && !(String(data.slug ?? '') in FIXED_PAGES)) {
          throw new Error(
            "Les pages fixes correspondent à des routes du site : on ne peut pas en créer d'autres.",
          );
        }
        // Le slug d'une page fixe est la clé qui la relie à sa route.
        // Le laisser modifier détacherait la page de l'écran qu'elle
        // titre, sans erreur nulle part.
        if (originalDoc?.slug) data.slug = originalDoc.slug;
        return data;
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const doc = await req.payload.findByID({
          collection: 'pages',
          id,
          depth: 0,
          overrideAccess: true,
        });
        if ((doc as { kind?: string })?.kind === 'fixe') {
          throw new Error(
            'Cette page correspond à une route du site : elle ne se supprime pas. Décochez « Affichée » pour la retirer du menu.',
          );
        }
      },
    ],
  },
  fields: [
    {
      /**
       * Une page libre se crée et se supprime ; une page fixe titre une
       * route qui existe déjà. Verrouillé après création : changer la
       * nature d'une page reviendrait soit à inventer une route, soit à
       * orpheliner celle qu'elle titrait.
       */
      name: 'kind',
      type: 'select',
      // Non requis mais toujours renseigné, par la valeur par défaut :
      // l'exiger obligerait chaque appel de création — scripts de seed
      // compris — à le répéter pour rien. Une valeur absente se lit
      // comme « libre » partout où le champ est testé.
      required: false,
      defaultValue: 'libre',
      index: true,
      label: 'Nature',
      access: { update: () => false },
      options: [
        { label: 'Page libre', value: 'libre' },
        { label: 'Page fixe du site', value: 'fixe' },
      ],
      admin: {
        description:
          'Une page libre se crée et se supprime. Une page fixe titre une route existante du site (accueil, archives, thèmes, abonnement) — non modifiable.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre de la page',
      admin: {
        description:
          'Les *astérisques* surlignent un mot dans le hero, comme sur les titres de billets.',
      },
    },
    {
      /**
       * Affichage au menu — propre aux pages fixes : une page libre s'y
       * ajoute depuis la vue Navigation, alors que ces quatre-là y sont
       * câblées et ne peuvent qu'être montrées ou masquées.
       */
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Affichée',
      admin: {
        condition: (data) => data?.kind === 'fixe',
        description:
          'Décochée, la page disparaît du menu du site. Sa route continue d’exister — c’est le lien qui s’en va, pas la page.',
      },
    },
    {
      /**
       * Brouillon — même sémantique que sur les publications : la page
       * existe dans l'admin, elle n'est pas servie au public.
       *
       * Réservé aux pages libres. Une page fixe est une route du site
       * (l'accueil, les archives, les formats…) : la mettre en
       * brouillon reviendrait à casser une page que la navigation
       * annonce. Ces quatre-là ont `enabled` pour les retirer du menu,
       * ce qui n'est pas la même chose et ne casse rien.
       *
       * Par défaut à faux : les pages existantes étaient publiques
       * avant l'ajout de ce champ, et une valeur par défaut à vrai les
       * aurait toutes dépubliées d'un coup à la migration.
       */
      name: 'draft',
      type: 'checkbox',
      defaultValue: false,
      label: 'Brouillon',
      admin: {
        condition: (data) => data?.kind !== 'fixe',
        description:
          'Cochée, la page n’est plus servie sur le site — elle reste modifiable ici. À décocher pour la publier.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "URL-safe, ex : 'about', 'colophon', 'mentions-legales'. Sert de match de route Astro.",
        readOnly: false,
      },
      validate: (value: unknown, { data }: { data?: { kind?: string } }) => {
        if (typeof value !== 'string') return true;
        const normalized = value.trim().toLowerCase();
        // Une page fixe porte justement l'un de ces slugs réservés :
        // c'est ce qui la relie à sa route. La règle ne vaut que pour
        // les pages libres, qui, elles, seraient rendues inatteignables.
        if (data?.kind === 'fixe') {
          return normalized in FIXED_PAGES
            ? true
            : `« ${normalized} » ne correspond à aucune route fixe du site.`;
        }
        if (RESERVED_SLUGS.has(normalized)) {
          return `« ${normalized} » est une adresse réservée du site : une page portant ce slug ne serait jamais affichée. Merci d'en choisir un autre.`;
        }
        return true;
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      label: 'Description SEO',
      admin: { description: '~150 caractères, affichée dans Google.' },
    },
    {
      name: 'noindex',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Si coché, demande aux moteurs de ne pas indexer.' },
    },
    {
      name: 'eyebrow',
      type: 'text',
      required: false,
      label: 'Sur-titre (kicker)',
      admin: {
        description: "Ex : « À propos », « Colophon ». Apparaît au-dessus du titre, en accent.",
      },
    },
    {
      name: 'lede',
      type: 'textarea',
      required: false,
      label: 'Chapô (lede)',
      admin: { description: '1 phrase, affichée en gros sous le titre.' },
    },
    {
      name: 'sections',
      type: 'blocks',
      label: 'Sections de la page',
      blocks: pageBlocks,
      admin: {
        // Une page fixe n'a pas de corps : son écran est composé par
        // Astro (une liste d'archives, une grille de thématiques). Elle
        // n'en fournit que le titre et le chapô — laisser l'éditeur de
        // sections visible aurait promis un contenu que rien n'affiche.
        condition: (data) => data?.kind !== 'fixe',
        description: 'Compose la page en empilant des sections (Prose, Figure, Citation).',
      },
    },
  ],
};
