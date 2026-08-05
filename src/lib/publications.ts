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
  /** Identifiant public court — celui qui figure dans l'URL. */
  publicId: string;
  id: number | string;
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
  /** Épisode auto-hébergé — podcasts uniquement (cf Podcasts.ts). Le
   *  document est peuplé au fetch (depth ≥ 1) ; `filesize` et `mimeType`
   *  ne servent pas au lecteur mais à l'`enclosure` du flux podcast, que
   *  les applications d'écoute exigent renseignée. */
  audio?:
    | {
        filename?: string;
        filesize?: number | null;
        mimeType?: string | null;
      }
    | number
    | string
    | null;
  /** Personnes reçues dans l'épisode — podcasts uniquement. Distinct
   *  des auteur·ices, qui signent la production. */
  guests?: string[] | null;
  /**
   * Série de rattachement — articles de recherche, billets d'analyse et
   * podcasts (où elle s'appelle une émission). Peuplée au fetch
   * (depth ≥ 2, pour que son image le soit aussi).
   *
   * Son image sert de fond au hero de ses billets : c'est l'identité de
   * la série qu'on voit derrière, celle de l'épisode restant dans le
   * carré au premier plan.
   */
  series?:
    | {
        name?: string;
        slug?: string;
        lede?: string | null;
        image?: { filename?: string } | number | string | null;
      }
    | number
    | string
    | null;
  /** Rang dans la série. Absent = ordre de parution. */
  seriesNumber?: number | null;
  /**
   * Le fait dont part un billet d'actu, résumé en quelques phrases —
   * actus uniquement. Rendu en colonne latérale, à la place du sommaire
   * des autres formats : une analyse suppose l'actualité connue, un
   * billet d'actu ne le peut pas.
   */
  enBref?: string | null;
  /** Liens permettant de vérifier ce fait — distincts de la bibliographie. */
  sources?: { label?: string | null; url?: string | null }[] | null;
  /** Image de couverture — portée par les billets d'analyse et les
   *  podcasts (cf leurs extraFields). `unsplash` n'est rempli que pour
   *  une image importée via le picker (cf Media.ts) — absent pour un
   *  upload manuel, donc pas de crédit à afficher dans ce cas. */
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
  /**
   * Verbe de l'appel à l'action, sur les cartes et vignettes. On ne lit
   * pas un épisode de podcast — et c'est la seule promesse que fait ce
   * lien, autant qu'elle soit juste.
   */
  actionLabel: string;
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
    actionLabel: 'Lire',
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
    actionLabel: 'Lire',
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
    actionLabel: 'Lire',
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
    actionLabel: 'Écouter',
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
    actionLabel: 'Lire',
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

/**
 * URL publique d'une publication, bâtie sur son identifiant.
 *
 * Pas de slug : l'adresse n'est pas rédigée au coup par coup, elle
 * découle de l'identifiant attribué à la création. Elle est donc
 * insensible aux corrections de titre, et personne n'a à choisir —
 * ni à s'accorder sur — la forme d'une URL.
 */
export function publicationHref(
  collection: PublicationCollection | string,
  publicId: string,
): string {
  const spec = isPublicationCollection(collection) ? PUBLICATIONS[collection] : PUBLICATIONS.articles;
  return `${spec.routePrefix}/${publicId}/`;
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
/** Une série ou une émission, telle que le site la lit. */
export type Serie = {
  id: number | string;
  name: string;
  slug: string;
  /** Décide du vocabulaire et de la collection interrogée. */
  format: PublicationCollection;
  lede?: string | null;
  image?: { filename?: string } | number | string | null;
  themes?: PublicationTheme[] | null;
  draft?: boolean;
};

/**
 * Séries publiées d'un format donné, par ordre alphabétique.
 *
 * Les brouillons sont écartés côté requête et non après coup : filtrer
 * ensuite les laisserait consommer la limite et rétrécirait la liste
 * sans que rien ne le signale — c'est le raisonnement de `publishedOnly`,
 * appliqué ici à la main puisque les séries n'ont pas de date de
 * publication à comparer.
 */
export async function fetchSeries(format: PublicationCollection): Promise<Serie[]> {
  try {
    return await fetchCollection<Serie>('series', {
      depth: 1,
      limit: 100,
      sort: 'name',
      where: [
        { field: 'format', value: format },
        ...(process.env.SHOW_DRAFTS === '1'
          ? []
          : [{ field: 'draft', operator: 'not_equals' as const, value: true }]),
      ],
    });
  } catch (err) {
    console.warn('[series] fetchSeries failed:', (err as Error).message);
    return [];
  }
}

/** Une série par son slug, ou null — y compris si elle est en brouillon. */
export async function fetchSerieBySlug(slug: string): Promise<Serie | null> {
  try {
    const docs = await fetchCollection<Serie>('series', {
      depth: 1,
      limit: 1,
      where: [{ field: 'slug', value: slug }],
    });
    return docs[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Billets d'une série, dans l'ordre où elle veut être parcourue : le
 * rang saisi d'abord, la date de parution pour départager ceux qui n'en
 * ont pas.
 *
 * Le tri est fait ici et non par l'API : `sort=seriesNumber` y placerait
 * les valeurs nulles en tête ou en queue selon le moteur, alors qu'on
 * veut les intercaler à leur date.
 */
export async function fetchSeriePosts(serie: Serie): Promise<FeedDoc[]> {
  try {
    const docs = await fetchCollection<FeedDoc & { seriesNumber?: number | null }>(
      serie.format,
      {
        depth: 1,
        limit: 200,
        where: [{ field: 'series', value: String(serie.id) }, ...publishedOnly()],
      },
    );
    return [...docs].sort((a, b) => {
      const ra = a.seriesNumber ?? null;
      const rb = b.seriesNumber ?? null;
      if (ra !== null && rb !== null) return ra - rb;
      if (ra !== null) return -1;
      if (rb !== null) return 1;
      return (
        new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
      );
    });
  } catch (err) {
    console.warn('[series] fetchSeriePosts failed:', (err as Error).message);
    return [];
  }
}

export async function fetchRelatedPosts(
  collection: PublicationCollection,
  themeSlug: string | undefined,
  excludeId: number | string,
): Promise<Array<{ publicId: string; title: string; publishedAt: string }>> {
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
      select: ['publicId', 'title', 'publishedAt', 'draft'],
    });
    return raw
      .filter((p) => String(p.id) !== String(excludeId) && !p.draft)
      .slice(0, 4)
      .map((p) => ({ publicId: p.publicId, title: p.title, publishedAt: p.publishedAt }));
  } catch (err) {
    console.warn('[publications] fetchRelatedPosts failed:', (err as Error).message);
    return [];
  }
}
