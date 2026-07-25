import type { GlobalConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Réglages des pages d'index — titre, lede, et toggle d'activation
 * pour les quatre landings « système » du site :
 *
 *  - Accueil    (/)
 *  - Archives   (/archives/)
 *  - Thèmes     (/themes/)
 *  - Abonnement (/abonnement/)
 *
 * Le toggle `enabled` (sur archives/themes/subscribe) désactive l'URL
 * (404 côté Astro) et fait disparaître l'entrée correspondante du
 * sélecteur de Navigation. La page d'accueil n'a pas de toggle — elle
 * est la racine du site, donc toujours présente.
 *
 * Convention markdown du titre : entourer une portion de `*` la met
 * en italique (rendu en couleur accent côté Astro via le composant
 * Hero). Idem `<em>` (rendu identique).
 */
export const IndexPages: GlobalConfig = {
  slug: 'index-pages',
  label: "Pages principales",
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/IndexPagesEditView#default',
          },
        },
      },
    },
  },
  fields: [
    {
      name: 'home',
      type: 'group',
      label: "Page d'accueil",
      fields: [
        // Pas de toggle `enabled` ici : la page d'accueil est la racine
        // du site, elle doit toujours exister.
        {
          name: 'heroTitle',
          type: 'textarea',
          required: false,
          label: 'Titre du hero',
          defaultValue: 'Notes de recherche',
          admin: {
            description:
              'H1 de la page d\'accueil. Entourer une portion de "*" pour la mettre en italique.',
          },
        },
        {
          name: 'heroLede',
          type: 'textarea',
          required: false,
          label: 'Texte de présentation (lede)',
          defaultValue:
            'Analyses longues, notes de lecture et fiches thématiques.',
          admin: {
            description: "Paragraphe sous le titre de la page d'accueil.",
          },
        },
      ],
    },
    {
      name: 'archives',
      type: 'group',
      label: 'Page Archives',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Activée',
          admin: {
            description: 'Si décochée, /archives/ renvoie 404.',
          },
        },
        {
          name: 'heroTitle',
          type: 'textarea',
          required: false,
          label: 'Titre du hero',
          defaultValue: 'Tous les billets, par année.',
          admin: {
            description:
              'H1 de la page /archives/. Entourer une portion de "*" pour la mettre en italique.',
          },
        },
        {
          name: 'heroLede',
          type: 'textarea',
          required: false,
          label: 'Texte de présentation (lede)',
          defaultValue:
            'Le carnet est versionné : chaque billet a un numéro, une date de publication et, le cas échéant, une date de mise à jour. Les fiches thématiques sont régulièrement révisées.',
          admin: {
            description: 'Paragraphe sous le titre de /archives/.',
          },
        },
      ],
    },
    {
      name: 'themes',
      type: 'group',
      label: 'Page Thèmes',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Activée',
          admin: {
            description: 'Si décochée, /themes/ et /theme/<slug>/ renvoient 404.',
          },
        },
        {
          name: 'heroTitle',
          type: 'textarea',
          required: false,
          label: 'Titre du hero',
          defaultValue: 'Les *thèmes* du carnet.',
          admin: {
            description:
              'H1 de la page /themes/. Entourer une portion de "*" pour la mettre en italique (ex. *thèmes*).',
          },
        },
        {
          name: 'heroLede',
          type: 'textarea',
          required: false,
          label: 'Texte de présentation (lede)',
          defaultValue:
            'Chaque billet est rattaché à un ou plusieurs thèmes. La taxonomie est libre et évolue avec le carnet.',
          admin: {
            description: 'Paragraphe sous le titre de /themes/.',
          },
        },
      ],
    },
    {
      name: 'subscribe',
      type: 'group',
      label: 'Page Abonnement',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Activée',
          admin: {
            description: 'Si décochée, /abonnement/ renvoie 404.',
          },
        },
        {
          name: 'heroTitle',
          type: 'textarea',
          required: false,
          label: 'Titre du hero',
          defaultValue: "*S'abonner* aux billets",
          admin: {
            description:
              'H1 de la page /abonnement/. Entourer une portion de "*" pour la mettre en italique.',
          },
        },
        {
          name: 'heroLede',
          type: 'textarea',
          required: false,
          label: 'Texte de présentation (lede)',
          defaultValue:
            "Plusieurs façons de recevoir les nouveaux billets : sur les réseaux où l'autrice est présente, ou via un flux RSS — sans algorithme, sans publicité, sans pisteur.",
          admin: {
            description: 'Paragraphe sous le titre de /abonnement/.',
          },
        },
      ],
    },
  ],
};
