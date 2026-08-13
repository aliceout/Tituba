import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { makeUpdateSearchVector } from '../hooks/update-post-search-vector';
import { makeNotifyNewPublication } from '../hooks/notify-new-post';

/**
 * Billets d'actu — rebond court et rapide sur l'actualité.
 *
 * Format chaud : on réagit à une actualité pendant qu'elle est
 * encore vive. Volontairement bref, sans appareil.
 *
 * Le socle de champs (identifiant public, titre, thématiques, auteur·ices,
 * dates, chapô, corps Lexical, bibliographie, champs calculés) vient de
 * `buildPublicationCollection`. Ne figure ici que ce qui distingue ce
 * format des quatre autres.
 */
export const Actus: CollectionConfig = buildPublicationCollection({
  slug: 'actus',
  labels: { singular: "Billet d'actu", plural: "Billets d'actu" },
  extraFields: [
    {
      /**
       * Le fait qui déclenche le billet, résumé sèchement — qui, quoi,
       * quand. Affiché en colonne latérale collante, à côté du texte.
       *
       * C'est ce qui distingue ce format des quatre autres : une analyse
       * suppose connue l'actualité dont elle part, un billet d'actu ne
       * peut pas. Séparer les deux registres évite au texte d'ouvrir sur
       * un rappel des faits, qui est le pire début possible pour qui les
       * connaît déjà — et sa condition d'entrée pour qui les ignore.
       *
       * Facultatif : sans lui, la colonne ne se monte pas et le billet
       * s'affiche seul.
       */
      name: 'enBref',
      type: 'textarea',
      required: false,
      label: 'En bref — le fait',
      admin: {
        description:
          'Deux à quatre phrases factuelles : ce qui s’est passé, quand, décidé par qui. Affiché en colonne à côté du texte, pas dans le billet.',
      },
    },
    {
      /**
       * Les sources du fait, pas celles du billet. La bibliographie sert
       * l'argumentation ; ces liens-là servent la vérification, et se
       * lisent avant le texte plutôt qu'après.
       */
      name: 'sources',
      type: 'array',
      required: false,
      label: 'Sources du fait',
      admin: {
        description: 'Les liens qui permettent de vérifier le fait résumé ci-dessus.',
        condition: (data) => Boolean(data?.enBref),
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          label: 'Intitulé',
          admin: { description: 'Ex : « Cour suprême du Royaume-Uni », « Le Monde ».' },
        },
        { name: 'url', type: 'text', required: true, label: 'Adresse' },
      ],
    },
    {
      /**
       * Facultative, et c'est important : ce format vaut par sa vitesse,
       * et rendre l'image obligatoire reviendrait à imposer une chasse à
       * la photo avant de pouvoir publier un rebond de trois
       * paragraphes.
       *
       * Traitée en bandeau large côté site, et non en carré à côté du
       * titre comme sur un billet d'analyse : c'est la convention de la
       * presse en ligne, et elle se lit d'un coup d'œil.
       */
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
      label: 'Image',
      admin: {
        description:
          'Facultative. Affichée en bandeau au-dessus du titre, et en vignette dans les listes.',
      },
    },
  ],
  afterChange: [
    makeUpdateSearchVector('actus'),
    makeNotifyNewPublication({
      slug: 'actus',
      routePrefix: '/actus',
      label: "Billet d'actu",
    }),
  ],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'publicId', 'lede'],
    components: {
      views: {
        edit: { root: { Component: '@/components/admin/PublicationEditView#default' } },
        list: { Component: '@/components/admin/PublicationListView#default' },
      },
    },
  },
});
