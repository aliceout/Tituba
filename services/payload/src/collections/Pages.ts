import type { CollectionConfig } from 'payload';

import { authenticated } from '../access/authenticated';
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
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
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
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre de la page',
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
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string') return true;
        const normalized = value.trim().toLowerCase();
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
        description: 'Compose la page en empilant des sections (Prose, Figure, Citation).',
      },
    },
  ],
};
