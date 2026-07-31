/**
 * Table des cinq formats de publication, côté site.
 *
 * Source unique pour : la racine d'URL de chaque format, ses libellés,
 * la façon d'annoncer sa durée, et le type de citation à produire dans
 * les exports BibTeX / RIS.
 *
 * Les routes Astro, les cartes, la page de recherche et le flux RSS
 * lisent tous cette table plutôt que de coder « /articles » en dur :
 * une racine d'URL ne se change pas après publication sans casser les
 * liens partagés, et il vaut mieux qu'elle n'existe qu'à un endroit.
 */

import { fetchCollection, fetchPublicationsFeed, publishedOnly, type FeedDoc, type PublicationCollection } from './payload';
import type { PostAuthorEntry } from './site';

export type { PublicationCollection, FeedDoc };

// ─── Types partagés par la page de détail d'une publication ────────────
// Vivent ici (et non dans PublicationArticle.astro) parce qu'ils décrivent
// la forme des données de la collection, pas la page qui les affiche.
export type PublicationTheme = { id: number | string; slug: string; name: string };
export type PublicationTag = { id: number | string; slug: string; name: string };
export type BiblioAuthor = {
  firstName?: string | null;
  lastName: string;
  role?: 'author' | 'editor' | 'translator';
};
export type BiblioEntry = {
  id: number | string;
  slug: string;
  authors?: BiblioAuthor[] | null;
  authorLabel?: string | null;
  year: number;
  title: string;
  type?: string;
  publisher?: string;
  place?: string;
  pages?: string;
  journal?: string;
  volume?: string;
  url?: string;
  doi?: string;
};
export type PublicationPost = {
  id: number | string;
  numero: number;
  slug: string;
  title: string;
  type: 'analyse' | 'note' | 'fiche';
  themes?: PublicationTheme[] | null;
  tags?: PublicationTag[] | null;
  authors?: PostAuthorEntry[] | null;
  publishedAt: string;
  updatedAt?: string;
  lede: string;
  body?: unknown;
  bibliography?: BiblioEntry[] | null;
  readingTime?: number | null;
  /** Durée d'écoute, pour les podcasts. */
  durationSeconds?: number | null;
  /** Image de couverture — pour l'instant, seules les analyses portent
   *  ce champ (cf Analyses.ts → extraFields). `unsplash` n'est rempli
   *  que pour une image importée via le picker (cf Media.ts) — absent
   *  pour un upload manuel, donc pas de crédit à afficher dans ce cas. */
  image?:
    | {
        filename?: string;
        alt?: string;
        /** Zone retenue pour la couverture, en % des dimensions de
         *  l'image (0–100). Choisie dans l'admin, puisque le hero n'en
         *  montre qu'un carré. Absente = image entière, cadrée au
         *  centre par `object-fit: cover`. */
        crop?: {
          x?: number | null;
          y?: number | null;
          w?: number | null;
          h?: number | null;
        } | null;
        unsplash?: {
          photographerName?: string;
          photographerProfileUrl?: string;
          photoPageUrl?: string;
        } | null;
      }
    | number
    | string
    | null;
  draft?: boolean;
};

export type PublicationSpec = {
  collection: PublicationCollection;
  /** Racine publique, sans slash final. */
  routePrefix: string;
  labelSingular: string;
  labelPlural: string;
  /** Libellé court affiché en pastille sur les cartes. */
  badge: string;
  /**
   * Ce que le format contient, en une phrase. Vit ici et non dans la
   * page qui l'affiche : c'est une propriété du format, et deux surfaces
   * la lisent déjà (l'index /formats/ et le pied de page).
   */
  description: string;
  /**
   * Comment annoncer la durée : temps de lecture estimé, durée d'écoute,
   * ou rien du tout pour une ressource téléchargeable.
   */
  readingLabel: 'minutes' | 'duration' | 'none';
  /**
   * Type de citation. Un podcast n'est pas un article : l'annoncer comme
   * tel ferait importer l'épisode comme article de revue dans Zotero.
   */
  citationType: 'article' | 'misc' | 'sound' | 'generic';
};

export const PUBLICATIONS: Record<PublicationCollection, PublicationSpec> = {
  articles: {
    collection: 'articles',
    routePrefix: '/articles',
    labelSingular: 'Article de recherche',
    labelPlural: 'Articles de recherche',
    badge: 'Article',
    description:
      'Travaux de fond, avec notes et bibliographie. Citables et exportables aux formats BibTeX et RIS.',
    readingLabel: 'minutes',
    citationType: 'article',
  },
  analyses: {
    collection: 'analyses',
    routePrefix: '/analyses',
    labelSingular: "Billet d'analyse",
    labelPlural: "Billets d'analyse",
    badge: 'Analyse',
    description:
      "Textes qui prennent le temps d'argumenter, sans l'appareil formel d'un article de recherche.",
    readingLabel: 'minutes',
    citationType: 'article',
  },
  actus: {
    collection: 'actus',
    routePrefix: '/actus',
    labelSingular: "Billet d'actu",
    labelPlural: "Billets d'actu",
    badge: 'Actu',
    description:
      "Rebonds courts sur l'actualité, publiés pendant qu'elle est encore vive.",
    readingLabel: 'minutes',
    citationType: 'misc',
  },
  podcasts: {
    collection: 'podcasts',
    routePrefix: '/podcasts',
    labelSingular: 'Podcast',
    labelPlural: 'Podcasts',
    badge: 'Podcast',
    description:
      'Conversations et lectures, en voix. Avec celles et ceux qui pensent depuis le terrain.',
    readingLabel: 'duration',
    citationType: 'sound',
  },
  outils: {
    collection: 'outils',
    routePrefix: '/outils',
    labelSingular: 'Outil',
    labelPlural: 'Outils',
    badge: 'Outil',
    description:
      "Ressources à réutiliser : guides, kits d'animation, supports de formation. En accès libre.",
    readingLabel: 'none',
    citationType: 'generic',
  },
};

/** Ordre d'affichage des formats (filtres, menus, pages d'index). */
export const PUBLICATION_ORDER: PublicationCollection[] = [
  'articles',
  'analyses',
  'actus',
  'podcasts',
  'outils',
];

export function isPublicationCollection(v: unknown): v is PublicationCollection {
  return typeof v === 'string' && v in PUBLICATIONS;
}

/** URL publique d'une publication. */
export function publicationHref(
  collection: PublicationCollection | string,
  slug: string,
): string {
  const spec = isPublicationCollection(collection) ? PUBLICATIONS[collection] : PUBLICATIONS.articles;
  return `${spec.routePrefix}/${slug}/`;
}

/**
 * Libellé de durée d'une publication, selon son format — court, pour
 * les cartes (grille d'accueil, pages d'index) : « 3 min de lecture ».
 * Retourne une chaîne vide quand le format n'en annonce pas.
 */
export function readingLabelFor(
  collection: PublicationCollection | string,
  doc: { readingTime?: number | null; durationSeconds?: number | null },
): string {
  const spec = isPublicationCollection(collection)
    ? PUBLICATIONS[collection]
    : PUBLICATIONS.articles;
  if (spec.readingLabel === 'none') return '';
  if (spec.readingLabel === 'duration') {
    const sec = doc.durationSeconds;
    if (typeof sec !== 'number' || sec <= 0) return '';
    return `${Math.round(sec / 60)} min d'écoute`;
  }
  const min = doc.readingTime;
  if (typeof min !== 'number' || min <= 0) return '';
  return `${min} min de lecture`;
}

/**
 * Variante « phrase » pour le sommaire flottant de la page article, le
 * seul endroit avec la place pour un libellé + une valeur séparés (le
 * libellé en gras, la valeur en corps normal — cf ArticleToc) plutôt
 * qu'une chaîne compacte comme dans les cartes.
 */
export function readingLabelParts(
  collection: PublicationCollection | string,
  doc: { readingTime?: number | null; durationSeconds?: number | null },
): { label: string; value: string } | null {
  const spec = isPublicationCollection(collection)
    ? PUBLICATIONS[collection]
    : PUBLICATIONS.articles;
  if (spec.readingLabel === 'none') return null;
  if (spec.readingLabel === 'duration') {
    const sec = doc.durationSeconds;
    if (typeof sec !== 'number' || sec <= 0) return null;
    return { label: "Temps d'écoute", value: `${Math.round(sec / 60)} min` };
  }
  const min = doc.readingTime;
  if (typeof min !== 'number' || min <= 0) return null;
  return { label: 'Temps de lecture', value: `${min} min` };
}

/**
 * Flux fusionné des cinq formats, trié par date décroissante.
 *
 * Délègue à l'endpoint SQL `/cms/api/publications` plutôt que d'appeler
 * les cinq collections puis de trier en mémoire : la pagination d'une
 * fusion faite côté client demanderait N × pageSize documents de
 * *chaque* source pour afficher la page N.
 */
export async function fetchFeed(
  opts: {
    page?: number;
    limit?: number;
    theme?: string;
    tag?: string;
    author?: number | string;
    featured?: boolean;
  } = {},
) {
  return fetchPublicationsFeed(opts);
}

/**
 * Publications liées à un article — même thème principal, exclut le
 * post courant. Utilisé par le bloc « Dans le même thème » en pied de
 * page de lecture.
 */
export async function fetchRelatedPosts(
  collection: PublicationCollection,
  themeSlug: string | undefined,
  excludeSlug: string,
): Promise<Array<{ slug: string; title: string; publishedAt: string }>> {
  if (!themeSlug) return [];
  try {
    const raw = await fetchCollection<PublicationPost>(collection, {
      where: [
        { field: 'themes.slug', operator: 'equals', value: themeSlug },
        ...publishedOnly(),
      ],
      limit: 10,
      sort: '-publishedAt',
      depth: 0,
      select: ['slug', 'title', 'publishedAt', 'draft'],
    });
    return raw
      .filter((p) => p.slug !== excludeSlug && !p.draft)
      .slice(0, 4)
      .map((p) => ({ slug: p.slug, title: p.title, publishedAt: p.publishedAt }));
  } catch (err) {
    console.warn('[publications] fetchRelatedPosts failed:', (err as Error).message);
    return [];
  }
}
