import type { CollectionConfig } from 'payload';

import { authenticated } from '../access/authenticated';

/**
 * Tags non-structurants — mots-clés libres ajoutés à la volée par
 * l'autrice depuis l'édition d'un billet. Différents des Themes :
 *
 *   - Themes  : axes structurants, peu nombreux, choisis avec soin
 *   - Tags    : mots-clés libres, granulaires, créés en passant
 *
 * Le slug est auto-dérivé du nom (slugify) pour que l'autrice n'ait
 * jamais à y penser. Pas de field description : volontairement minimal.
 */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Tag', plural: 'Tags' },
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
        // Vue Liste custom — édition inline du nom + suppression par
        // ligne, pas de page d'édition séparée (le modèle est trop
        // simple pour mériter une vue dédiée).
        list: {
          Component: '@/components/admin/TagListView#default',
        },
        // La vue Édition redirige vers la liste : tout se passe inline
        // dans le tableau, on n'expose jamais de page par tag.
        edit: {
          root: {
            Component: '@/components/admin/TagEditView#default',
          },
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
          'Mot-clé libre, ex : « Russie », « pinkwashing », « Conseil des droits de l’homme ».',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Auto-dérivé du nom (slugify). Sert d’ancre URL `/tag/<slug>/`.',
      },
      hooks: {
        beforeChange: [
          ({ data, originalDoc }) => {
            // Re-slugify si le nom change ou si pas encore défini.
            const nameChanged = data?.name && data.name !== originalDoc?.name;
            if (!data?.slug || nameChanged) {
              return slugify(data?.name ?? '');
            }
            return data.slug;
          },
        ],
      },
    },
  ],
};
