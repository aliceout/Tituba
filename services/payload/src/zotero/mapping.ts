// Mapping Zotero → Bibliography du Carnet.
//
// On reste conservateur : si une info Zotero ne tient pas dans le schéma,
// on la laisse tomber plutôt que de tordre le modèle. L'autrice peut
// toujours ouvrir Zotero pour voir le détail complet.

import type { ZoteroCreator, ZoteroItem, ZoteroItemData } from './types';

type BibType = 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';
type BibRole = 'author' | 'editor' | 'translator';

type BibAuthor = {
  lastName: string;
  firstName?: string;
  role: BibRole;
};

export type MappedBibliography = {
  zoteroKey: string;
  zoteroVersion: number;
  source: 'zotero';
  type: BibType;
  authors: BibAuthor[];
  year: number;
  title: string;
  publisher?: string;
  place?: string;
  journal?: string;
  volume?: string;
  pages?: string;
  url?: string;
  doi?: string;
};

/**
 * Mapping itemType Zotero → type Carnet.
 *
 * Zotero a ~30 itemTypes ; on les regroupe en 6 buckets. Tout ce qui
 * ne tombe pas dans nos 5 catégories explicites devient `other`.
 */
const ITEM_TYPE_MAP: Record<string, BibType> = {
  book: 'book',
  bookSection: 'chapter',
  encyclopediaArticle: 'chapter',
  dictionaryEntry: 'chapter',
  journalArticle: 'article',
  magazineArticle: 'article',
  newspaperArticle: 'article',
  conferencePaper: 'article',
  preprint: 'paper',
  manuscript: 'paper',
  thesis: 'paper',
  report: 'paper',
  document: 'paper',
  webpage: 'web',
  blogPost: 'web',
  forumPost: 'web',
  podcast: 'web',
  videoRecording: 'web',
};

function mapItemType(zoteroType: string | undefined): BibType {
  if (!zoteroType) return 'other';
  return ITEM_TYPE_MAP[zoteroType] ?? 'other';
}

/**
 * Mapping creatorType Zotero → role Carnet. Tout ce qui n'est pas
 * editor/translator devient 'author' (englobe author, contributor,
 * bookAuthor, seriesEditor traité comme editor, etc.)
 */
function mapCreatorRole(zoteroType: string | undefined): BibRole {
  switch (zoteroType) {
    case 'editor':
    case 'seriesEditor':
    case 'bookEditor':
      return 'editor';
    case 'translator':
      return 'translator';
    default:
      return 'author';
  }
}

/**
 * Convertit la liste creators[] de Zotero en authors[] du Carnet.
 *
 * Zotero supporte deux formes de créateur :
 *  - { firstName, lastName }       — personne physique
 *  - { name }                      — auteur corporatif (UNESCO, GIEC…)
 *
 * Pour le 2e cas on met `name` dans `lastName` et on laisse `firstName`
 * vide, ce qui est aligné avec notre convention (rendu Chicago : juste
 * « UNESCO » au lieu de « UNESCO, »).
 */
function mapCreators(creators: ZoteroCreator[] | undefined): BibAuthor[] {
  if (!Array.isArray(creators)) return [];
  return creators
    .map((c) => {
      const role = mapCreatorRole(c.creatorType);
      if (c.lastName || c.firstName) {
        return {
          lastName: (c.lastName ?? '').trim(),
          firstName: (c.firstName ?? '').trim() || undefined,
          role,
        };
      }
      if (c.name) {
        return {
          lastName: c.name.trim(),
          role,
        };
      }
      return null;
    })
    .filter((a): a is BibAuthor => a !== null && a.lastName.length > 0);
}

/**
 * Extrait l'année d'une date Zotero. Zotero accepte des formats très
 * variés (« 2017 », « March 2017 », « 2017-03-14 », « ca. 1850 »…) —
 * on extrait juste le premier nombre à 4 chiffres rencontré, qui est
 * l'année dans tous les cas pratiques pour de la biblio académique.
 *
 * Renvoie 0 si rien de valide ne sort — l'appelant décidera quoi faire
 * (typiquement : skipper l'item, parce que `year` est required côté
 * collection Bibliography).
 */
function parseYear(date: string | undefined): number {
  if (!date) return 0;
  const match = date.match(/(\d{4})/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  if (n < 1700 || n > 3000) return 0;
  return n;
}

/**
 * Compose un slug Carnet stable pour une ref Zotero. Préfixé par `zot-`
 * pour distinguer du saisi-main, et inclut l'id du user pour éviter
 * les collisions entre plusieurs utilisateurs synchronisant des refs
 * potentiellement homonymes.
 */
export function makeSlug(userId: string | number, zoteroKey: string): string {
  return `zot-${String(userId)}-${zoteroKey}`.toLowerCase();
}

/**
 * Résultat du mapping : soit succès avec le doc Bibliography prêt à
 * écrire, soit échec avec une raison précise (et le titre de l'item
 * Zotero si dispo, pour que l'autrice puisse identifier la ref dans
 * Zotero sans avoir à chercher par clé).
 */
export type MapResult =
  | { ok: true; mapped: MappedBibliography; title: string }
  | { ok: false; reason: string; title: string | null };

/**
 * Mappe un item Zotero complet vers le shape Bibliography. Renvoie
 * `{ ok: false, reason }` avec une raison précise si l'item est
 * inutilisable côté Carnet : pas de titre, année invalide ou hors
 * plage 1700-3000, pas d'auteur·ice (l'auteur principal est requis
 * pour la citation Chicago courte).
 */
export function mapItem(item: ZoteroItem): MapResult {
  const d: ZoteroItemData = item.data ?? (item as unknown as ZoteroItemData);
  const title = (d.title ?? '').trim();
  if (!title) {
    return { ok: false, reason: 'titre manquant côté Zotero.', title: null };
  }
  if (!d.date || !d.date.trim()) {
    return {
      ok: false,
      reason: 'date manquante côté Zotero (ajoutez au moins une année).',
      title,
    };
  }
  const year = parseYear(d.date);
  if (!year) {
    return {
      ok: false,
      reason: `année non reconnue dans « ${d.date.trim()} » (attendu : 4 chiffres entre 1700 et 3000).`,
      title,
    };
  }
  const authors = mapCreators(d.creators);
  if (authors.length === 0) {
    return {
      ok: false,
      reason: 'aucun·e auteur·ice (champ Creators vide côté Zotero).',
      title,
    };
  }

  // Pour les articles : Zotero met la revue dans publicationTitle
  // (et non publisher). Le Carnet a un seul champ `journal` qu'on
  // utilise pour ça, et `publisher` reste pour l'éditeur des livres.
  const isArticleLike = ['article', 'paper'].includes(mapItemType(d.itemType));

  // Volume + numéro Zotero → champ `volume` Carnet (concaténé).
  const volumeStr = [d.volume, d.issue].filter(Boolean).join(', ');

  const mapped: MappedBibliography = {
    zoteroKey: item.key,
    zoteroVersion: item.version,
    source: 'zotero',
    type: mapItemType(d.itemType),
    authors,
    year,
    title,
    publisher: !isArticleLike && d.publisher ? d.publisher : undefined,
    place: d.place || undefined,
    journal: isArticleLike && d.publicationTitle ? d.publicationTitle : undefined,
    volume: volumeStr || undefined,
    pages: d.pages || undefined,
    url: d.url || undefined,
    doi: d.DOI || undefined,
  };
  return { ok: true, mapped, title };
}
