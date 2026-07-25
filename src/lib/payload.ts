/**
 * Client Payload CMS pour Astro SSR.
 *
 * Tape l'API REST de Payload via le réseau docker interne en prod
 * (`http://payload:3001/cms/api/...`) ou localhost en dev. Tous les
 * appels sont server-side (Astro SSR) — le navigateur du visiteur
 * ne contacte jamais Payload directement.
 *
 * Conventions répliquées du projet 2mains : routes `/cms/admin` +
 * `/cms/api`, fetchBySlug/fetchCollection, helper mediaUrl, filterPublished.
 */

const INTERNAL_URL =
  // En prod, set par Infisical/compose : http://payload:3001
  process.env.PAYLOAD_INTERNAL_URL ??
  // En dev, Payload tourne sur localhost:3001
  'http://localhost:3001';

/** URL de base de l'API REST Payload (ajoute `/cms/api`). */
const API_BASE = `${INTERNAL_URL.replace(/\/$/, '')}/cms/api`;

/** URL publique pour servir les fichiers media (côté browser).
 *  Si ADDRESS n'a pas de schème, on préfixe https:// — convention
 *  Infisical = on stocke juste le domaine. */
const RAW_ADDRESS = process.env.ADDRESS ?? 'http://localhost:3001';
const ADDRESS = /^https?:\/\//.test(RAW_ADDRESS)
  ? RAW_ADDRESS
  : `https://${RAW_ADDRESS}`;

/**
 * Construit l'URL publique d'une image Payload depuis son `filename`
 * (champ `media.filename` retourné par l'API).
 */
export function mediaUrl(filename: string | undefined | null): string | null {
  if (!filename) return null;
  return `${ADDRESS.replace(/\/$/, '')}/cms/api/media/file/${encodeURIComponent(filename)}`;
}

/**
 * Si un champ upload Payload a été populated (depth >= 1), il
 * contient un objet `media` avec `filename`. Helper qui extrait
 * l'URL publique en gérant les cas null / unpopulated.
 */
export function uploadedImageUrl(
  field: { filename?: string } | string | number | null | undefined,
): string | null {
  if (!field) return null;
  if (typeof field === 'string' || typeof field === 'number') {
    return null;
  }
  return mediaUrl(field.filename);
}

// ─── Fetch generics ─────────────────────────────────────────────

type FindResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

async function fetchPayload<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Payload fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * POST une JSON à un endpoint Payload public. Utilisé par les pages
 * Astro qui orchestrent les flows publics (alertes mail : subscribe,
 * confirm, unsubscribe). Ne lève pas sur statut HTTP non-2xx : on
 * remonte `{ status, body }` à l'appelant qui décide de l'UX.
 */
export async function postPayload<T = unknown>(
  path: string,
  body: unknown,
): Promise<{ status: number; body: T }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: T;
  try {
    parsed = (await res.json()) as T;
  } catch {
    parsed = {} as T;
  }
  return { status: res.status, body: parsed };
}

/**
 * Récupère un document d'une collection par son slug. Retourne null
 * si pas trouvé. Avec `depth=2` les uploads sont populated en objets
 * (donc `media.filename` accessible).
 */
export async function fetchBySlug<T = unknown>(
  collection: string,
  slug: string,
  depth = 2,
): Promise<T | null> {
  const data = await fetchPayload<FindResult<T>>(
    `/${collection}?where[slug][equals]=${encodeURIComponent(slug)}&depth=${depth}&limit=1`,
  );
  return data.docs[0] ?? null;
}

/** Variante pour `pages` — passe par fetchBySlug avec un cast confortable. */
export async function fetchPage<T = unknown>(
  slug: string,
  depth = 2,
): Promise<T | null> {
  return fetchBySlug<T>('pages', slug, depth);
}

/**
 * Conditions de filtre pour Payload, format `where[field][operator]=value`.
 * Cf. https://payloadcms.com/docs/queries/overview#operators
 */
export type WhereCondition = {
  field: string;
  operator?:
    | 'equals'
    | 'not_equals'
    | 'in'
    | 'not_in'
    | 'greater_than'
    | 'less_than'
    | 'like'
    | 'contains'
    | 'exists';
  value: string | number | boolean;
};

/**
 * Récupère tous les documents d'une collection (sans pagination,
 * en supposant que les collections du carnet restent < 500 entrées).
 *
 * `where` accepte un tableau de conditions qui sont serialisées au format
 * `where[<field>][<operator>]=<value>` attendu par l'API REST Payload.
 */
export async function fetchCollection<T = unknown>(
  collection: string,
  options: {
    depth?: number;
    limit?: number;
    sort?: string;
    where?: WhereCondition[];
  } = {},
): Promise<T[]> {
  const { depth = 2, limit = 500, sort, where } = options;
  const parts: string[] = [];
  parts.push(`depth=${depth}`);
  parts.push(`limit=${limit}`);
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`);
  if (where && where.length > 0) {
    for (const c of where) {
      const op = c.operator ?? 'equals';
      parts.push(
        `where[${encodeURIComponent(c.field)}][${op}]=${encodeURIComponent(String(c.value))}`,
      );
    }
  }
  const data = await fetchPayload<FindResult<T>>(
    `/${collection}?${parts.join('&')}`,
  );
  return data.docs;
}

/** Récupère le global Site (paramètres). */
export async function fetchSite<T = unknown>(depth = 1): Promise<T> {
  return fetchPayload<T>(`/globals/site?depth=${depth}`);
}

/** Récupère le global Navigation (onglets header + liens footer). */
export async function fetchNavigation<T = unknown>(depth = 1): Promise<T> {
  return fetchPayload<T>(`/globals/navigation?depth=${depth}`);
}

/** Récupère le global IndexPages (hero des landings home/archives/themes). */
export async function fetchIndexPages<T = unknown>(depth = 0): Promise<T> {
  return fetchPayload<T>(`/globals/index-pages?depth=${depth}`);
}

/** Récupère le global Identity (siteName, authorName, baseline, copyright). */
export async function fetchIdentity<T = unknown>(depth = 0): Promise<T> {
  return fetchPayload<T>(`/globals/identity?depth=${depth}`);
}

/** Récupère le global Subscriptions (URLs des profils sociaux + futurs toggles RSS/mail). */
export async function fetchSubscriptions<T = unknown>(depth = 0): Promise<T> {
  return fetchPayload<T>(`/globals/subscriptions?depth=${depth}`);
}

/**
 * Filtre les drafts pour les rendus publics. À appliquer après
 * fetchCollection sur les collections qui ont un champ `draft`.
 *
 * En dev local on peut tout afficher (override via SHOW_DRAFTS=1) ;
 * en prod on cache.
 */
export function filterPublished<T extends { draft?: boolean }>(docs: T[]): T[] {
  if (process.env.SHOW_DRAFTS === '1') return docs;
  return docs.filter((d) => !d.draft);
}

// ─── Recherche fulltext ─────────────────────────────────────────
// Tape l'endpoint custom Payload /cms/api/posts/search qui exécute
// websearch_to_tsquery + ts_rank côté Postgres (cf. services/payload/
// src/endpoints/posts-search.ts). Le filtre `draft = false` est posé
// côté serveur, donc ici on n'a pas besoin de filterPublished.

export type SearchPost = {
  id: number | string;
  numero: number | null;
  slug: string | null;
  title: string | null;
  lede: string | null;
  publishedAt: string | null;
  idCarnet: string | null;
  /** Extrait court avec mots matchés enveloppés dans <mark>…</mark>.
   *  Vient de ts_headline. À injecter via set:html après check de la
   *  source (Postgres, donc ok). */
  excerpt: string | null;
  rank: number;
};

export type SearchResult = {
  docs: SearchPost[];
  totalDocs: number;
  totalPages: number;
  page: number;
  q: string;
};

export async function searchPosts(
  q: string,
  opts: { page?: number; limit?: number } = {},
): Promise<SearchResult> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  return fetchPayload<SearchResult>(`/posts/search?${params.toString()}`);
}
