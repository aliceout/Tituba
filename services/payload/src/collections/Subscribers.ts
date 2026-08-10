import type { CollectionConfig } from 'payload';

import { isAdminOrRoot } from '../access/roles';

/**
 * Subscribers — abonné·es aux alertes mail pour les nouveaux billets.
 *
 * Flow double opt-in :
 *  1. Visiteur·euse soumet son email via le formulaire sur /abonnement/
 *     → POST /api/subscribers/subscribe → création d'un doc avec status
 *     `pending` + `confirmTokenHash` + `confirmTokenExpiresAt`.
 *     Un mail de confirmation est envoyé avec un lien
 *     /abonnement/confirmer?token=<token> (token brut dans l'URL, hash
 *     en base — même pattern que les invitations admin).
 *  2. Clic sur le lien → POST /api/subscribers/confirm vérifie le hash,
 *     flip status `pending` → `active`, efface le confirmToken.
 *  3. À chaque publication d'un billet, on envoie à tous les `active`
 *     un mail avec un lien désabo signé en HMAC :
 *     /abonnement/desabonner?id=<sub-id>&sig=<hmac>. Pas de token
 *     stocké en DB pour le désabo : la signature recalculée côté
 *     serveur suffit, et on évite un champ stable de plus.
 *
 * Accès :
 *  - read   : admin/root uniquement (les emails sont des données
 *             personnelles, jamais exposés publiquement)
 *  - create : false (les routes Astro utilisent overrideAccess pour
 *             insérer ; pas d'API publique d'admin pour ajouter)
 *  - update : admin/root (et système via overrideAccess pour les
 *             transitions de statut)
 *  - delete : admin/root (purge manuelle si besoin)
 *
 * RGPD : statut `unsubscribed` plutôt que delete pour éviter qu'une
 * personne désabonnée se ré-inscrive accidentellement et reçoive à
 * nouveau des mails. Si une personne demande une suppression complète,
 * l'admin peut supprimer manuellement le doc.
 */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  labels: { singular: 'Abonné·e', plural: 'Abonné·es' },
  access: {
    read: isAdminOrRoot,
    create: () => false,
    update: isAdminOrRoot,
    delete: isAdminOrRoot,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'status', 'subscribedAt', 'confirmedAt'],
    listSearchableFields: ['email'],
    components: {
      views: {
        list: {
          Component: '@/components/admin/SubscribersListView#default',
        },
      },
    },
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
      label: 'Email',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      label: 'Statut',
      options: [
        { label: 'En attente de confirmation', value: 'pending' },
        { label: 'Actif·ve', value: 'active' },
        { label: 'Désabonné·e', value: 'unsubscribed' },
      ],
      admin: {
        description:
          "« En attente » : lien de confirmation pas encore cliqué. « Actif·ve » : reçoit les mails de nouveaux billets. « Désabonné·e » : a cliqué sur le lien de désabo dans un mail, ne reçoit plus rien.",
      },
    },
    /**
     * Mécanique du lien de confirmation — masquée de l'admin.
     *
     * Ces deux champs ne se lisent pas, ne se corrigent pas et ne
     * disent rien d'utile sur une personne abonnée : afficher le
     * condensat d'un jeton, c'est encombrer une fiche d'une donnée
     * technique en donnant l'impression qu'elle se règle à la main.
     * `hidden` les retire de l'interface sans toucher au stockage, dont
     * le flux de confirmation dépend.
     */
    {
      name: 'confirmTokenHash',
      type: 'text',
      required: false,
      label: 'Hash du token de confirmation',
      admin: { hidden: true, readOnly: true },
    },
    {
      name: 'confirmTokenExpiresAt',
      type: 'date',
      required: false,
      label: 'Expiration du token de confirmation',
      admin: { hidden: true, readOnly: true },
    },
    {
      name: 'subscribedAt',
      type: 'date',
      required: false,
      label: 'Date d\'inscription',
      admin: { readOnly: true },
    },
    {
      name: 'confirmedAt',
      type: 'date',
      required: false,
      label: 'Date de confirmation',
      admin: { readOnly: true },
    },
    {
      name: 'unsubscribedAt',
      type: 'date',
      required: false,
      label: 'Date de désabonnement',
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
};
