import type { Block, GlobalConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Réglages de navigation — édités depuis l'admin via une vue custom.
 *
 * Pilote les onglets du header (blocs réordonnables) et les liens du
 * footer (col 2 « Naviguer »).
 *
 * Modèle unifié pour le header : un seul type de bloc `navItem`. Chaque
 * onglet pointe soit vers une page d'index (home / archives / themes /
 * subscribe — câblées sur des routes Astro fixes), soit vers une page
 * éditoriale (collection Pages). La distinction est portée par le champ
 * `kind` (discriminator).
 *
 * NB : « home » (la page d'accueil) n'est jamais listée ici — l'onglet
 * « Billets » est toujours rendu en première position côté Header.astro.
 * Les pages d'index désactivées (cf. global IndexPages) sont masquées
 * automatiquement côté front et exclues du sélecteur côté admin.
 */
const NavItemBlock: Block = {
  slug: 'navItem',
  labels: { singular: 'Onglet', plural: 'Onglets' },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'index',
      label: 'Type',
      options: [
        { label: 'Page principale', value: 'index' },
        { label: 'Page éditoriale', value: 'editorial' },
      ],
    },
    {
      // Cible parmi les 3 pages principales proposables dans le header
      // (home est exclue : c'est l'onglet « Billets » hardcodé).
      name: 'indexTarget',
      type: 'select',
      required: false,
      label: 'Page principale',
      options: [
        { label: 'Archives', value: 'archives' },
        // Conservée pour ne pas invalider les configurations existantes,
        // mais sans effet : le header rend un menu déroulant « Thématiques »
        // qui couvre déjà /themes/ et chaque thématique.
        { label: 'Thèmes (remplacé par le menu déroulant)', value: 'themes' },
        { label: 'Abonnement', value: 'subscribe' },
      ],
      admin: { condition: (_, sibling) => sibling?.kind === 'index' },
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      required: false,
      label: 'Page éditoriale',
      admin: { condition: (_, sibling) => sibling?.kind === 'editorial' },
    },
    {
      name: 'label',
      type: 'text',
      required: false,
      label: 'Libellé (optionnel)',
      admin: {
        description:
          'Override du libellé affiché. Sinon : le libellé natif de la page (eyebrow ou title pour les pages éditoriales, libellé par défaut pour les pages d\'index).',
      },
    },
  ],
};

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/NavigationEditView#default',
          },
        },
      },
    },
  },
  fields: [
    {
      name: 'navHeader',
      type: 'blocks',
      label: 'Onglets du header',
      labels: { singular: 'Onglet', plural: 'Onglets' },
      blocks: [NavItemBlock],
      admin: {
        description:
          'Onglets affichés dans le header du site, dans l\'ordre. Le lien « Billets » (page d\'accueil) reste toujours en première position et n\'est pas listé ici. Pour cacher un onglet : on le supprime de la liste.',
      },
      defaultValue: [
        { blockType: 'navItem', kind: 'index', indexTarget: 'archives' },
        { blockType: 'navItem', kind: 'index', indexTarget: 'themes' },
        { blockType: 'navItem', kind: 'index', indexTarget: 'subscribe' },
      ],
    },
    {
      name: 'navFooter',
      type: 'array',
      label: 'Liens du footer (col 2 « Naviguer »)',
      labels: { singular: 'Lien', plural: 'Liens' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
        { name: 'external', type: 'checkbox', defaultValue: false },
      ],
      defaultValue: [
        { label: 'Formats', href: '/formats/', external: false },
        { label: 'Thèmes', href: '/themes/', external: false },
        { label: 'Auteur·ices', href: '/auteurices/', external: false },
        { label: 'Archives', href: '/archives/', external: false },
      ],
    },
    {
      name: 'navFooterCoulisses',
      type: 'array',
      label: 'Liens du footer (col 3 « Coulisses »)',
      labels: { singular: 'Lien', plural: 'Liens' },
      admin: {
        description:
          'L’envers du site plutôt que son contenu : l’administration, le suivi des tickets, le formulaire de contact. Un lien sans adresse ne s’affiche pas — laissez-la vide tant que le service n’existe pas.',
      },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
        { name: 'external', type: 'checkbox', defaultValue: false },
      ],
      defaultValue: [
        { label: 'Nous rejoindre', href: '/nous-rejoindre/', external: false },
        { label: 'Nous écrire', href: '/contact/', external: false },
        { label: 'Admin', href: '/cms/admin', external: false },
      ],
    },
  ],
};
