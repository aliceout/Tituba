import type { CollectionConfig } from 'payload';

import { authenticated } from '../access/authenticated';

/**
 * Taxonomie « Thèmes » du Carnet — appellation publique des sujets
 * de recherche. Multivaluée : un Post peut être rattaché à plusieurs
 * thèmes (ex. « queer-theory » + « postcolonial »).
 *
 * Slug = pivot URL (`/theme/{slug}/`). Description optionnelle, affichée
 * en hero de la page d'un thème individuel.
 *
 * Ref design : design_handoff_carnet/Carnet B.html → PolePage.
 *  Le mot « Pôle » du proto est remplacé par « Thème » côté Carnet (cf
 *  README), parce que la taxonomie est multivaluée et libre, pas une
 *  catégorie unique.
 */
export const Themes: CollectionConfig = {
  slug: 'themes',
  labels: { singular: 'Thème', plural: 'Thèmes' },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    listSearchableFields: ['name', 'slug'],
    components: {
      views: {
        // Vue d'édition custom — remplace le rendu natif Payload par
        // CarnetTopbar + h1 hero + champs + used-in.
        edit: {
          root: {
            Component: '@/components/admin/ThemeEditView#default',
          },
        },
        list: {
          Component: '@/components/admin/ThemeListView#default',
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
          "Ex : « Genre & géopolitique », « Queer theory », « Migrations & exil ».",
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
          "Identifiant URL, ex : 'genre-geopolitique'. Sert aussi de hash de tag inline (#queer-theory).",
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      label: 'Description éditoriale',
      admin: {
        description:
          "1 à 2 phrases — apparaît en hero de la page /theme/<slug>/.",
      },
    },
  ],
};
