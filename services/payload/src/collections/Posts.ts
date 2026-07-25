import type { CollectionConfig } from 'payload';

import { buildPublicationCollection } from './shared/build-publication';
import { updatePostSearchVector } from '../hooks/update-post-search-vector';
import { notifyNewPost } from '../hooks/notify-new-post';

/**
 * Collection héritée du Carnet — un billet académique.
 *
 * Elle est en sursis : Tituba la remplace par cinq collections de
 * publication (articles, analyses, actus, podcasts, outils), toutes
 * construites avec la même fabrique `buildPublicationCollection`. Elle
 * reste ici le temps de la bascule, et sert de témoin : tant qu'elle
 * produit exactement le même schéma qu'avant l'extraction des briques
 * partagées, on sait que la fabrique est fidèle.
 *
 * Le socle de champs (numéro, titre/slug, taxonomie, auteur·ices, dates,
 * chapô, corps Lexical, bibliographie, champs calculés) vit dans
 * `shared/fields.ts`. Ne restent ici que les spécificités du Carnet :
 * le sous-genre `type` à trois valeurs et le préfixe d'identifiant.
 *
 * Hooks afterChange, dans l'ordre :
 *  1. updatePostSearchVector — recalcule `search_vector` (FTS Postgres)
 *     après chaque create/update.
 *  2. notifyNewPost — à la première publication, envoie les mails
 *     d'alerte aux abonné·es actif·ves. Idempotent.
 */
export const Posts: CollectionConfig = buildPublicationCollection({
  slug: 'posts',
  labels: { singular: 'Billet', plural: 'Billets' },
  idPrefix: 'carnet',
  subtypes: {
    defaultValue: 'analyse',
    options: [
      { label: 'Article', value: 'analyse' },
      { label: 'Note de lecture', value: 'note' },
      { label: 'Fiche thématique', value: 'fiche' },
    ],
  },
  afterChange: [updatePostSearchVector, notifyNewPost],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['numero', 'title', 'type', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'slug', 'lede'],
    components: {
      views: {
        // Vue d'édition entièrement custom — remplace le rendu natif
        // Payload (form stacked + sidebar) par le layout éditorial :
        // header + .ed-card (title/lede/Lexical custom) + meta sidebar
        // 300px + .fn-block.
        edit: {
          root: {
            Component: '@/components/admin/PublicationEditView#default',
          },
        },
        // List view custom — remplace la liste native par le tableau
        // éditorial (toolbar 4 filtres, chips de statut, pagination
        // compacte).
        list: {
          Component: '@/components/admin/PublicationListView#default',
        },
      },
    },
  },
});
