/**
 * Fabriques de champs partagées par les collections de publication.
 *
 * Toutes les publications de Tituba (articles de recherche, billets
 * d'analyse, billets d'actu, podcasts, outils) partagent le même socle :
 * numérotation, titre/slug, taxonomie, auteur·ices, dates, chapô, corps
 * Lexical, bibliographie, et les champs calculés (temps de lecture,
 * identifiant citable, zones brouillon).
 *
 * Déclarer ce socle une fois ici évite de le dupliquer cinq fois et
 * garantit que les cinq collections restent alignées — notamment sur
 * les champs que la recherche plein texte et les exports de citation
 * lisent par leur nom.
 *
 * Chaque fabrique retourne un `Field` neuf à chaque appel : pas d'objet
 * partagé entre collections, que Payload pourrait muter au boot.
 */

import type { Field } from 'payload';
import { lexicalEditor, BlocksFeature } from '@payloadcms/richtext-lexical';

import { Footnote, CitationBloc, BiblioInline, Figure } from '../../blocks';
import { extractLexicalText } from '../../lib/extract-lexical-text';

/** Comment afficher la durée d'une publication côté lecteur·ice. */
export type ReadingLabel = 'minutes' | 'duration' | 'none';

export function numeroField(): Field {
  return {
    name: 'numero',
    type: 'number',
    required: true,
    unique: true,
    index: true,
    label: 'Numéro',
    min: 1,
    max: 9999,
    admin: {
      position: 'sidebar',
      description:
        'Numéro de série du carnet — affiché « n° 042 » côté lecteur. Manuel et stable.',
    },
  };
}

export function titleField(): Field {
  return {
    name: 'title',
    type: 'text',
    required: true,
    label: 'Titre',
  };
}

export function slugField(): Field {
  return {
    name: 'slug',
    type: 'text',
    required: true,
    unique: true,
    index: true,
    admin: {
      description:
        "URL-safe, ex : 'homonationalisme-diplomatie'. Sert à la route /billets/<slug>/.",
    },
  };
}

/**
 * Sous-genre optionnel à l'intérieur d'un format. Ne sert plus qu'à la
 * collection `posts` héritée du Carnet ; les collections Tituba n'en
 * déclarent pas, le format étant porté par la collection elle-même.
 */
export function subtypeField(options: { label: string; value: string }[], defaultValue: string): Field {
  return {
    name: 'type',
    type: 'select',
    required: true,
    defaultValue,
    options,
    admin: {
      position: 'sidebar',
    },
  };
}

export function themesField(): Field {
  return {
    name: 'themes',
    type: 'relationship',
    relationTo: 'themes',
    hasMany: true,
    required: false,
    label: 'Thèmes',
    admin: {
      description: 'Taxonomie multivaluée — un billet peut appartenir à plusieurs thèmes.',
    },
  };
}

export function tagsField(): Field {
  return {
    name: 'tags',
    type: 'relationship',
    relationTo: 'tags',
    hasMany: true,
    required: false,
    label: 'Tags',
    admin: {
      description:
        'Mots-clés libres, ajoutés à la volée depuis l’édition du billet. Différents des thèmes (qui sont structurants).',
    },
  };
}

/**
 * Auteur·ices — chaque entrée est soit un compte Tituba (relation Users),
 * soit une personne externe (texte libre + rattachement optionnel).
 * L'ordre du tableau est l'ordre de signature.
 */
export function authorsField(): Field {
  return {
    name: 'authors',
    type: 'array',
    label: 'Auteur·ices',
    minRows: 1,
    admin: {
      description:
        'Au moins un·e. La première entrée est auto-remplie au create avec l’utilisateur·rice connecté·e. Pour les externes (collègues hors Tituba), choisir « Externe » et saisir le nom + rattachement.',
    },
    fields: [
      {
        name: 'kind',
        type: 'radio',
        required: true,
        defaultValue: 'user',
        options: [
          { label: 'Interne', value: 'user' },
          { label: 'Externe', value: 'external' },
        ],
        admin: { layout: 'horizontal' },
      },
      {
        name: 'user',
        type: 'relationship',
        relationTo: 'users',
        required: false,
        admin: {
          condition: (_, sibling) => sibling?.kind === 'user',
        },
      },
      {
        name: 'name',
        type: 'text',
        required: false,
        label: 'Nom complet',
        admin: {
          condition: (_, sibling) => sibling?.kind === 'external',
          description: 'Ex. « Aïcha Touré »',
        },
      },
      {
        name: 'affiliation',
        type: 'text',
        required: false,
        label: 'Rattachement',
        admin: {
          condition: (_, sibling) => sibling?.kind === 'external',
          description: 'Optionnel, ex. « LATTS ».',
        },
      },
    ],
  };
}

export function publishedAtField(): Field {
  return {
    name: 'publishedAt',
    type: 'date',
    required: true,
    label: 'Date de publication',
    admin: {
      position: 'sidebar',
      date: {
        pickerAppearance: 'dayOnly',
        displayFormat: 'd MMMM yyyy',
      },
    },
  };
}

export function ledeField(): Field {
  return {
    name: 'lede',
    type: 'textarea',
    required: true,
    label: 'Chapô',
    admin: {
      description: '~2-3 phrases — affichées en deck sous le titre.',
    },
  };
}

/**
 * Corps Lexical avec les blocs éditoriaux de Tituba.
 *
 * On surcharge l'éditeur global (`lexicalEditor()` dans payload.config)
 * pour brancher une seule `BlocksFeature`, qui accepte deux listes :
 *
 *   blocks (niveau bloc, entre paragraphes) :
 *     - Figure : image + légende, prend toute la largeur
 *     - CitationBloc : citation longue avec attribution
 *
 *   inlineBlocks (insérés dans un paragraphe, entre du texte) :
 *     - Footnote : note de bas de page numérotée auto au render
 *     - BiblioInline : référence (Auteur, année) cliquable vers l'entrée
 *       Bibliography correspondante en pied de publication
 *
 * Côté frontend Astro, ces nœuds sont sérialisés en `type='block'` ou
 * `type='inlineBlock'` et rendus par renderLexicalWithFootnotes
 * (cf. src/lib/lexical.ts), qui collecte les Footnote en pied.
 */
export function bodyField(): Field {
  return {
    name: 'body',
    type: 'richText',
    required: true,
    label: "Corps de l'article",
    admin: {
      description:
        'Lexical — slash menu pour insérer des notes, citations longues, références biblio, figures.',
    },
    editor: lexicalEditor({
      features: ({ defaultFeatures }) => [
        ...defaultFeatures,
        BlocksFeature({
          blocks: [Figure, CitationBloc],
          inlineBlocks: [Footnote, BiblioInline],
        }),
      ],
    }),
  };
}

export function bibliographyField(): Field {
  return {
    name: 'bibliography',
    type: 'relationship',
    relationTo: 'bibliography',
    hasMany: true,
    required: false,
    label: 'Bibliographie',
    admin: {
      description:
        'Références listées en pied du billet, dans l’ordre choisi ici. Cliquables depuis les biblio_inline du corps.',
    },
  };
}

export function readingTimeField(): Field {
  return {
    name: 'readingTime',
    type: 'number',
    required: false,
    label: 'Temps de lecture (minutes)',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: 'Calculé automatiquement depuis le corps au save.',
    },
    hooks: {
      beforeChange: [
        ({ siblingData }) => {
          const text = extractLexicalText(siblingData?.body);
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          return Math.max(1, Math.ceil(words / 220));
        },
      ],
    },
  };
}

/**
 * Identifiant citable stable, dérivé de l'année de publication et du
 * numéro de série (ex. `carnet:2026-042`). Repris tel quel dans les
 * exports BibTeX (`note`) et RIS (`AN`), et indexé en poids B dans le
 * vecteur de recherche.
 */
export function idField(prefix: string): Field {
  return {
    name: 'idCarnet',
    type: 'text',
    required: false,
    label: 'ID Carnet',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: `Identifiant stable, dérivé de l’année et du numéro (ex : ${prefix}:2026-042).`,
    },
    hooks: {
      beforeChange: [
        ({ siblingData }) => {
          const numero = siblingData?.numero;
          const publishedAt = siblingData?.publishedAt;
          if (typeof numero !== 'number' || !publishedAt) return undefined;
          const year =
            typeof publishedAt === 'string'
              ? new Date(publishedAt).getFullYear()
              : publishedAt instanceof Date
              ? publishedAt.getFullYear()
              : new Date(String(publishedAt)).getFullYear();
          if (!Number.isFinite(year)) return undefined;
          return `${prefix}:${year}-${String(numero).padStart(3, '0')}`;
        },
      ],
    },
  };
}

export function draftField(): Field {
  return {
    name: 'draft',
    type: 'checkbox',
    defaultValue: false,
    label: 'Brouillon (masqué en prod)',
    admin: { position: 'sidebar' },
  };
}

/**
 * Date d'envoi des mails d'alerte, posée à la première publication.
 * Sert de garde d'idempotence au hook de notification : si elle est
 * remplie, on ne renvoie plus rien.
 */
export function notificationsSentAtField(): Field {
  return {
    name: 'notificationsSentAt',
    type: 'date',
    required: false,
    label: "Mails d'alerte envoyés le",
    admin: {
      position: 'sidebar',
      readOnly: true,
      description:
        'Date à laquelle les abonné·es aux alertes mail ont été notifié·es de ce billet. Set automatiquement à la première publication, jamais re-déclenché.',
    },
  };
}

export function hasDraftZonesField(): Field {
  return {
    name: 'hasDraftZones',
    type: 'checkbox',
    defaultValue: false,
    index: true,
    label: 'Zones brouillon en cours',
    admin: {
      position: 'sidebar',
      readOnly: true,
      description:
        'Calculé automatiquement — vrai si le corps contient au moins une zone marquée brouillon. Filtrable depuis la liste des billets.',
    },
    hooks: {
      beforeChange: [
        ({ siblingData }) => hasDraftContainerInLexical(siblingData?.body),
      ],
    },
  };
}

/**
 * Vrai si un corps Lexical contient au moins une zone brouillon
 * (nœud `draft_container`). Walk récursif sur les children.
 */
export function hasDraftContainerInLexical(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'draft_container') return true;
  const root = (obj.root ?? obj) as Record<string, unknown>;
  const children = root.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (hasDraftContainerInLexical(child)) return true;
    }
  }
  return false;
}
