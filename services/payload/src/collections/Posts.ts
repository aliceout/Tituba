import type { CollectionConfig } from 'payload';
import {
  lexicalEditor,
  BlocksFeature,
} from '@payloadcms/richtext-lexical';

import { authenticated } from '../access/authenticated';
import { Footnote, CitationBloc, BiblioInline, Figure } from '../blocks';
import { extractLexicalText } from '../lib/extract-lexical-text';
import { updatePostSearchVector } from '../hooks/update-post-search-vector';
import { notifyNewPost } from '../hooks/notify-new-post';

/**
 * Collection principale du Carnet — un billet académique.
 *
 * Schéma figé par le handoff design :
 *  - numero          : entier unique, affiché en n° 042 (zero-pad 3)
 *  - title / slug    : standards
 *  - type            : analyse (long), note de lecture, fiche
 *  - themes          : taxonomie multivaluée (relation Themes)
 *  - publishedAt     : date de première publication
 *  - updatedAt       : géré par Payload (suivi natif)
 *  - lede            : chapô / deck (~22 px italique muted dans le proto)
 *  - body            : rich text Lexical avec blocks custom (Footnote,
 *                      CitationBloc, BiblioInline, Figure)
 *  - bibliography    : array de relations vers Bibliography
 *  - readingTime     : minutes (auto-calculé via hook beforeChange)
 *  - idCarnet        : `carnet:YYYY-NNN` (auto-dérivé de year + numero)
 *  - draft           : masque le billet en prod (idem 2mains)
 *
 * Ref design : design_handoff_carnet/Carnet B.html → Article component.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Billet', plural: 'Billets' },
  access: {
    read: () => true,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  hooks: {
    // Numérotation automatique à la création — on ne demande jamais
    // à l'autrice de saisir le numéro. Cherche le max existant et
    // assigne max+1. S'exécute en `beforeValidate` (donc avant le
    // check `required: true`) pour qu'un billet créé sans numero
    // dans le payload passe la validation.
    //
    // Auteur·ice par défaut : on auto-assigne req.user comme premier
    // auteur·ice (kind=user) si la liste est vide à la création. La
    // signataire peut ensuite ajouter co-auteur·ices (du Carnet ou
    // externes). Cf issue #2.
    beforeValidate: [
      async ({ data, req, operation }) => {
        let next = data;
        if (operation === 'create') {
          // Numéro auto
          if (!next || typeof next.numero !== 'number' || next.numero <= 0) {
            try {
              const existing = await req.payload.find({
                collection: 'posts',
                sort: '-numero',
                limit: 1,
                depth: 0,
              });
              const top = existing.docs[0] as { numero?: number } | undefined;
              const max = typeof top?.numero === 'number' ? top.numero : 0;
              next = { ...(next ?? {}), numero: max + 1 };
            } catch {
              // Fallback prudent : on laisse Payload échouer sur le
              // required, plutôt que d'écrire un numéro arbitraire.
            }
          }
          // Auteur·ice par défaut
          const authors = (next as { authors?: unknown[] } | undefined)?.authors;
          const userId = (req.user as { id?: number | string } | null | undefined)?.id;
          if ((!authors || authors.length === 0) && userId) {
            next = { ...(next ?? {}), authors: [{ kind: 'user', user: userId }] };
          }
        }
        return next;
      },
    ],
    // Hooks afterChange exécutés en séquence (ordre = ordre du tableau) :
    //  1. updatePostSearchVector : recalcule la colonne search_vector
    //     (FTS Postgres) après chaque create/update. Cf hooks/update-
    //     post-search-vector + lib/post-search-vector et la migration
    //     qui ajoute la colonne + l'index GIN.
    //  2. notifyNewPost : à la première publication (draft=false +
    //     publishedAt passé + notificationsSentAt vide), envoie les
    //     mails d'alerte aux abonné·es actif·ves. Idempotent.
    //     Cf hooks/notify-new-post + issue #3.
    afterChange: [updatePostSearchVector, notifyNewPost],
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['numero', 'title', 'type', 'publishedAt', 'draft', 'updatedAt'],
    listSearchableFields: ['title', 'slug', 'lede'],
    components: {
      views: {
        // Vue d'édition entièrement custom — remplace tout le rendu
        // natif Payload (form stacked + sidebar) par le layout éditorial
        // du handoff : header + .ed-card (title/lede/Lexical custom)
        // + meta sidebar 300px + .fn-block. Cf Design/design_handoff_admin/
        // carnet-admin.html → ScreenDoc.
        edit: {
          root: {
            Component: '@/components/admin/PostEditView#default',
          },
        },
        // List view custom — remplace entièrement la liste native Payload
        // par le tableau éditorial du handoff (toolbar 4 filtres, chips
        // de statut, pagination compacte).
        // Cf Design/design_handoff_admin/carnet-admin.html → ScreenList.
        list: {
          Component: '@/components/admin/PostListView#default',
        },
      },
    },
  },
  fields: [
    {
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
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Titre',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "URL-safe, ex : 'homonationalisme-diplomatie'. Sert à la route /billets/<slug>/.",
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'analyse',
      options: [
        { label: 'Article', value: 'analyse' },
        { label: 'Note de lecture', value: 'note' },
        { label: 'Fiche thématique', value: 'fiche' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'themes',
      type: 'relationship',
      relationTo: 'themes',
      hasMany: true,
      required: false,
      label: 'Thèmes',
      admin: {
        description: 'Taxonomie multivaluée — un billet peut appartenir à plusieurs thèmes.',
      },
    },
    {
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
    },
    {
      // Auteur·ices d'un billet — chaque entrée est soit un user du
      // Carnet (relation Users), soit un·e auteur·ice externe (texte
      // libre + rattachement optionnel). Ordre = ordre de signature.
      // Au create, on auto-assigne req.user comme premier·ère auteur·ice
      // (cf hook beforeValidate). L'admin peut ensuite ajouter, retirer,
      // réordonner. Cf issue #2.
      name: 'authors',
      type: 'array',
      label: 'Auteur·ices',
      minRows: 1,
      admin: {
        description:
          'Au moins un·e. La première entrée est auto-remplie au create avec l’utilisateur·rice connecté·e. Pour les externes (collègues hors Carnet), choisir « Externe » et saisir le nom + rattachement.',
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
    },
    {
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
    },
    {
      name: 'lede',
      type: 'textarea',
      required: true,
      label: 'Chapô',
      admin: {
        description: '~2-3 phrases — affichées en deck sous le titre.',
      },
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      label: "Corps de l'article",
      admin: {
        description:
          'Lexical — slash menu pour insérer des notes, citations longues, références biblio, figures.',
      },
      // Override l'éditeur par défaut (lexicalEditor() global) pour
      // brancher les blocks académiques du carnet via une seule
      // BlocksFeature, qui accepte deux listes :
      //
      //   blocks (niveau bloc, entre paragraphes) :
      //     - Figure : image + légende, prend toute la largeur
      //     - CitationBloc : citation longue avec attribution
      //
      //   inlineBlocks (insérés dans un paragraphe, entre du texte) :
      //     - Footnote : note de bas de page numérotée auto au render
      //     - BiblioInline : référence (Auteur, année) cliquable vers
      //       l'entrée Bibliography correspondante en pied d'article
      //
      // Côté admin : tous apparaissent dans le slash menu Lexical.
      // Côté frontend Astro : sérialisés comme nodes type='block' ou
      // type='inlineBlock' dans le JSON Lexical, rendus par
      // renderLexicalWithFootnotes (cf src/lib/lexical.ts) qui
      // collecte les Footnote dans une liste en pied.
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({
            blocks: [Figure, CitationBloc],
            inlineBlocks: [Footnote, BiblioInline],
          }),
        ],
      }),
    },
    {
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
    },
    {
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
            const body = siblingData?.body;
            const text = extractTextFromLexical(body);
            const words = text.trim().split(/\s+/).filter(Boolean).length;
            return Math.max(1, Math.ceil(words / 220));
          },
        ],
      },
    },
    {
      name: 'idCarnet',
      type: 'text',
      required: false,
      label: 'ID Carnet',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Identifiant stable, dérivé de l’année et du numéro (ex : carnet:2026-042).',
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
            return `carnet:${year}-${String(numero).padStart(3, '0')}`;
          },
        ],
      },
    },
    {
      name: 'draft',
      type: 'checkbox',
      defaultValue: false,
      label: 'Brouillon (masqué en prod)',
      admin: { position: 'sidebar' },
    },
    {
      // Date à laquelle on a envoyé les mails d'alerte aux abonné·es à
      // la première publication du billet. Sert de garde d'idempotence
      // côté hook notify-new-post : si déjà set, on ne renvoie plus.
      // Cf hooks/notify-new-post.ts + issue #3.
      name: 'notificationsSentAt',
      type: 'date',
      required: false,
      label: 'Mails d\'alerte envoyés le',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Date à laquelle les abonné·es aux alertes mail ont été notifié·es de ce billet. Set automatiquement à la première publication, jamais re-déclenché.',
      },
    },
    {
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
          ({ siblingData }) => {
            const body = siblingData?.body;
            return hasDraftContainerInLexical(body);
          },
        ],
      },
    },
  ],
};

/**
 * Helper local : extrait le texte « courant » du body pour le calcul
 * du temps de lecture. Délègue à extractLexicalText() avec les options
 * par défaut (pas de blocks custom, pas de zones brouillon) — on
 * n'inclut PAS les notes de bas de page / citations dans le compte
 * mots, considérées comme « hors flux de lecture principale ».
 */
function extractTextFromLexical(node: unknown): string {
  return extractLexicalText(node);
}

/**
 * Vérifie si un body Lexical contient au moins une zone brouillon
 * (node `draft_container`). Walk récursif sur les children.
 */
function hasDraftContainerInLexical(node: unknown): boolean {
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
