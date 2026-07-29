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

import { fetchPublicationsFeed, type FeedDoc, type PublicationCollection } from './payload';

export type { PublicationCollection, FeedDoc };

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
    citationType: 'misc',
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
 * Libellé de durée d'une publication, selon son format.
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
 * Flux fusionné des cinq formats, trié par date décroissante.
 *
 * Délègue à l'endpoint SQL `/cms/api/publications` plutôt que d'appeler
 * les cinq collections puis de trier en mémoire : la pagination d'une
 * fusion faite côté client demanderait N × pageSize documents de
 * *chaque* source pour afficher la page N.
 */
export async function fetchFeed(
  opts: { page?: number; limit?: number; theme?: string; tag?: string; featured?: boolean } = {},
) {
  return fetchPublicationsFeed(opts);
}
