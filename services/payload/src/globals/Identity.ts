import type { GlobalConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Identité de Tituba — source de vérité unique pour le wordmark + le
 * nom de l'auteur·ice + les lignes affichées dans le footer (baseline
 * + copyright).
 *
 * Le wordmark (siteName) est consommé partout côté front : header,
 * footer, suffixe des onglets navigateur, mails transactionnels, flux
 * RSS, champ « publisher » des exports BibTeX / RIS / Highwire.
 *
 * Ces champs vivaient dans Site (groupes identity + baseline +
 * copyrightLine). On les a extraits dans un global dédié pour avoir
 * une page admin propre et alignée avec les autres axes (Navigation,
 * Pages d'index, Réseaux sociaux).
 */
export const Identity: GlobalConfig = {
  slug: 'identity',
  label: 'Identité',
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/IdentityEditView#default',
          },
        },
      },
    },
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      required: false,
      label: 'Nom du site (wordmark)',
      defaultValue: 'Tituba',
      admin: {
        description:
          'Nom court qui apparaît dans le header (logo), le footer, le suffixe des onglets navigateur (« … — Nom »), les mails d\'invitation et le flux RSS. Court de préférence (1 à 2 mots).',
      },
    },
    {
      name: 'authorName',
      type: 'text',
      required: false,
      label: 'Nom complet',
      defaultValue: '',
      admin: {
        description:
          'Nom du laboratoire de recherche, de la personne, du collectif… selon l\'utilisation du site. Affiché en signature dans la baseline du footer et la description meta.',
      },
    },
    {
      name: 'baseline',
      type: 'textarea',
      required: false,
      label: 'Baseline',
      defaultValue: 'Collectif féministe intersectionnel. Auto-hébergé.',
      admin: { description: 'Affichée dans le footer (col 1).' },
    },
    {
      name: 'copyrightLine',
      type: 'text',
      required: false,
      label: 'Ligne copyright',
      defaultValue: 'CC BY-NC-SA 4.0',
      admin: { description: 'Footer (col 1, sous la baseline, en mono).' },
    },
    {
      name: 'contactEmail',
      type: 'text',
      required: false,
      label: 'Adresse de réception',
      admin: {
        description:
          'Adresse à laquelle arrivent les messages du formulaire de contact. Elle n’apparaît jamais sur le site — c’est tout l’intérêt du formulaire. Si vous la laissez vide, les messages partent vers l’adresse d’expédition configurée sur le serveur.',
      },
    },
  ],
};
