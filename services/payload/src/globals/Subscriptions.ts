import type { GlobalConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Abonnements — moyens pour le public de suivre Tituba sans visiter
 * la home régulièrement.
 *
 * Trois axes :
 *  - `rssEnabled` : activation globale du flux RSS. Si désactivé,
 *    /rss.xml renvoie 404, le lien « Flux RSS » du footer disparaît,
 *    et la section RSS de /abonnement/ disparaît.
 *  - URLs des profils sociaux (Mastodon, Bluesky, ORCID, HAL). Si
 *    toutes vides, la section « Sur les réseaux » disparaît
 *    automatiquement du footer (col 3) et de /abonnement/.
 *  - À venir : alertes mail (cf issue #3).
 */
export const Subscriptions: GlobalConfig = {
  slug: 'subscriptions',
  label: 'Abonnements',
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/SubscriptionsEditView#default',
          },
        },
      },
    },
  },
  fields: [
    {
      name: 'rssEnabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Flux RSS activé',
      admin: {
        description:
          'Si décoché : /rss.xml renvoie 404, le lien « Flux RSS » du footer disparaît, et la section RSS de la page /abonnement/ disparaît.',
      },
    },
    {
      name: 'emailEnabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Alertes mail activées',
      admin: {
        description:
          "Si décoché : le formulaire d'inscription disparaît de /abonnement/ et aucun mail n'est envoyé à la publication des nouveaux billets — même pour les abonné·es déjà actif·ves (qui ne sont pas supprimé·es pour autant : on peut réactiver plus tard).",
      },
    },
    // Flux podcast — /podcasts/rss.xml. Ces quatre réglages ne sont pas
    // décoratifs : Apple Podcasts et Spotify refusent un flux auquel il
    // manque une couverture carrée, une catégorie ou la mention de
    // contenu explicite, et exigent une adresse de contact pour vérifier
    // que le flux est bien déposé par qui le publie. Sans eux, les
    // épisodes restent écoutables sur le site mais nulle part ailleurs.
    {
      name: 'podcastCover',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Couverture du podcast',
      admin: {
        description:
          'Image carrée, entre 1400 et 3000 px de côté. Affichée comme vignette dans les applications d’écoute.',
      },
    },
    {
      name: 'podcastExplicit',
      type: 'checkbox',
      defaultValue: false,
      label: 'Contenu explicite',
      admin: {
        description:
          'À cocher si les épisodes comportent des propos crus. Déclaration obligatoire : une omission peut faire retirer le flux.',
      },
    },
    {
      name: 'podcastOwnerEmail',
      type: 'text',
      required: false,
      label: 'Adresse de contact du flux',
      admin: {
        description:
          'Sert à Apple et Spotify pour vérifier que le flux est bien déposé par vous. Non affichée sur le site, mais présente dans le flux, donc publique.',
      },
    },
    {
      name: 'mastodon',
      type: 'text',
      required: false,
      admin: { description: 'URL complète du profil Mastodon.' },
    },
    {
      name: 'bluesky',
      type: 'text',
      required: false,
      admin: { description: 'URL complète du profil Bluesky.' },
    },
    {
      name: 'orcid',
      type: 'text',
      required: false,
      admin: { description: 'URL complète du profil ORCID.' },
    },
    {
      name: 'hal',
      type: 'text',
      required: false,
      admin: { description: 'URL complète de la page HAL.' },
    },
  ],
};
