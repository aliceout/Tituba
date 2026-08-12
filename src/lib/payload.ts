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
const ADDRESS = /^https?:\/\//.test(RAW_ADDRESS) ? RAW_ADDRESS : `https://${RAW_ADDRESS}`;

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

/**
 * Même chose pour un épisode de podcast. Servi par `media` comme les
 * images depuis que les deux collections ont fusionné : une médiathèque
 * unique, filtrée par type, plutôt qu'une liste par nature de fichier.
 * URL absolue sur ADDRESS comme les images : c'est le navigateur du
 * visiteur qui la demande, et il ne connaît pas le réseau interne.
 *
 * Fonction distincte de `mediaUrl` malgré le chemin identique : le flux
 * podcast et le lecteur passent par ici, et un jour où les épisodes
 * partiraient sur un stockage à part, c'est le seul endroit à changer.
 */
export function audioFileUrl(filename: string | undefined | null): string | null {
  if (!filename) return null;
  return `${ADDRESS.replace(/\/$/, '')}/cms/api/media/file/${encodeURIComponent(filename)}`;
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
/**
 * IP réelle de l'appelant, telle qu'on peut la connaître derrière un
 * proxy inverse.
 *
 * `x-forwarded-for` est une liste, du client vers le proxy le plus
 * proche : le premier saut est le seul qui nous intéresse. Il est
 * falsifiable par le client, mais nginx le réécrit — la valeur ne vaut
 * donc que ce que vaut la configuration du serveur.
 */
export function ipReelle(request: Request, clientAddress?: string): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const premier = xff.split(',')[0]?.trim();
    if (premier) return premier;
  }
  return request.headers.get('x-real-ip')?.trim() || clientAddress || 'unknown';
}

/**
 * En-têtes à transmettre à Payload depuis une route de proxy : l'IP de
 * l'appelant, et la preuve que l'appel vient bien du site.
 *
 * Sans eux, aucune information sur l'appelant ne franchit le proxy, et
 * les endpoints protégés « par IP » voient toutes les requêtes arriver
 * de la même origine inconnue — leur plafond devient global au site
 * entier. C'était le cas de l'inscription aux alertes depuis toujours :
 * cinq inscriptions par quart d'heure pour la planète.
 *
 * Le secret partagé n'est posé que s'il est configuré ; Payload ne
 * l'exige que dans le même cas, les deux s'accordant sur son absence
 * plutôt que de tomber en panne (cf endpoints/contact.ts).
 */
export function entetesProxy(
  request: Request,
  clientAddress?: string,
): Record<string, string> {
  const entetes: Record<string, string> = { 'x-real-ip': ipReelle(request, clientAddress) };
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (secret) entetes['x-tituba-proxy'] = secret;
  return entetes;
}

export async function postPayload<T = unknown>(
  path: string,
  body: unknown,
  /**
   * En-têtes supplémentaires transmis à Payload.
   *
   * Existe pour une raison précise : sans eux, aucune information sur
   * l'appelant ne franchit ce proxy, et les endpoints protégés par une
   * limitation « par IP » voient tous leurs appels arriver de la même
   * origine inconnue. Leur plafond devient alors GLOBAL au site entier
   * — c'est le cas de l'inscription aux alertes depuis toujours (cinq
   * inscriptions par quart d'heure pour toute la planète), et ce serait
   * arrivé au formulaire de contact. Facultatif, donc sans effet sur
   * les appels existants.
   */
  headers?: Record<string, string>,
): Promise<{ status: number; body: T }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
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
 * Jumeau GET de `postPayload` : même contrat de retour, mêmes en-têtes
 * transmissibles, et surtout la même absence d'exception sur une
 * réponse d'erreur — l'appelant lit le statut et décide.
 *
 * `fetchPayload` ne convient pas ici : il lève dès que la réponse n'est
 * pas 2xx, alors que le tirage d'un défi de contact doit pouvoir
 * distinguer un 429 d'une panne.
 */
export async function getPayloadRaw<T = unknown>(
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
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

/**
 * Récupère une publication par son identifiant public — le code court
 * qui figure dans l'URL (`/analyses/k7m2xp/`), et non la clé primaire.
 *
 * Retourne null sur un identifiant mal formé sans interroger Payload :
 * les URL trafiquées sont le cas courant, inutile d'aller jusqu'à la
 * base pour les rejeter.
 */
export async function fetchByPublicId<T = unknown>(
  collection: string,
  publicId: string,
  depth = 2,
): Promise<T | null> {
  if (!/^[a-z0-9]{4,12}$/.test(publicId)) return null;
  try {
    const data = await fetchPayload<FindResult<T>>(
      `/${collection}?where[publicId][equals]=${encodeURIComponent(publicId)}&depth=${depth}&limit=1`,
    );
    return data.docs[0] ?? null;
  } catch {
    return null;
  }
}

/** Variante pour `pages` — passe par fetchBySlug avec un cast confortable. */
export async function fetchPage<T = unknown>(slug: string, depth = 2): Promise<T | null> {
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
    | 'greater_than_equal'
    | 'less_than'
    | 'less_than_equal'
    | 'like'
    | 'contains'
    | 'exists';
  value: string | number | boolean;
};

/**
 * Récupère les documents d'une collection (sans pagination).
 *
 * `where` accepte un tableau de conditions qui sont serialisées au format
 * `where[<field>][<operator>]=<value>` attendu par l'API REST Payload.
 *
 * `select` limite les champs renvoyés (`?select[<champ>]=true`). À
 * utiliser dès qu'on affiche des cartes ou des listes : sans lui, chaque
 * document embarque son corps Lexical complet (20-60 Ko de JSON pour un
 * article), ce qui se paie à **chaque rendu SSR**. Une liste de 40
 * publications passe d'environ 1 Mo à quelques dizaines de Ko.
 *
 * Attention : `select` et `depth` interagissent — un champ relationnel
 * doit être listé dans `select` pour être peuplé, même avec depth > 0.
 */
export async function fetchCollection<T = unknown>(
  collection: string,
  options: {
    depth?: number;
    limit?: number;
    sort?: string;
    where?: WhereCondition[];
    select?: string[];
  } = {},
): Promise<T[]> {
  const { depth = 2, limit = 500, sort, where, select } = options;
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
  if (select && select.length > 0) {
    for (const field of select) {
      parts.push(`select[${encodeURIComponent(field)}]=true`);
    }
  }
  const data = await fetchPayload<FindResult<T>>(`/${collection}?${parts.join('&')}`);
  return data.docs;
}

/**
 * Conditions `where` restreignant une collection aux documents réellement
 * publics : ni brouillon, ni daté dans le futur.
 *
 * À préférer à `filterPublished` (qui filtre *après* coup, donc laisse
 * les brouillons consommer le `limit` et rétrécir silencieusement la
 * liste visible). Surtout : le filtre de date n'existait nulle part
 * côté front, si bien qu'une publication programmée était **visible
 * publiquement** dès sa saisie, en home comme dans le flux RSS.
 *
 * Neutralisé par SHOW_DRAFTS=1 en dev, comme `filterPublished`.
 */
export function publishedOnly(): WhereCondition[] {
  if (process.env.SHOW_DRAFTS === '1') return [];
  return [
    { field: 'draft', operator: 'not_equals', value: true },
    { field: 'publishedAt', operator: 'less_than_equal', value: new Date().toISOString() },
  ];
}

/** Récupère le global Site (paramètres). */
export async function fetchSite<T = unknown>(depth = 1): Promise<T> {
  return fetchPayload<T>(`/globals/site?depth=${depth}`);
}

/** Récupère le global Navigation (onglets header + liens footer). */
export async function fetchNavigation<T = unknown>(depth = 1): Promise<T> {
  return fetchPayload<T>(`/globals/navigation?depth=${depth}`);
}

/**
 * En-têtes des quatre pages fixes du site — accueil, archives, thèmes,
 * abonnement.
 *
 * Elles vivaient dans un global `index-pages` ; elles sont désormais des
 * documents de la collection `pages`, marqués `kind: 'fixe'`, pour qu'il
 * n'y ait qu'un seul endroit nommé « Pages » dans l'admin.
 *
 * La forme rendue est celle du global d'avant — un objet indexé par clé,
 * chaque entrée portant `heroTitle`, `heroLede` et `enabled`. C'est
 * délibéré : cinq fichiers la consomment, et changer la source d'une
 * donnée ne devrait pas obliger à retoucher tout ce qui la lit.
 */
export async function fetchIndexPages<T = unknown>(): Promise<T> {
  const res = await fetchPayload<{
    docs?: { slug?: string; title?: string | null; lede?: string | null; enabled?: boolean }[];
  }>('/pages?where[kind][equals]=fixe&limit=10&depth=0');

  const sortie: Record<string, { heroTitle?: string; heroLede?: string; enabled?: boolean }> =
    {};
  for (const d of res.docs ?? []) {
    if (!d.slug) continue;
    sortie[d.slug] = {
      heroTitle: d.title ?? undefined,
      heroLede: d.lede ?? undefined,
      // Absent vaut affiché : une page fixe dont la case n'a jamais été
      // touchée doit apparaître, pas disparaître.
      enabled: d.enabled !== false,
    };
  }
  return sortie as T;
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

// ─── API unifiée des publications ───────────────────────────────
// Trois endpoints SQL montés à la racine de Payload, qui portent sur
// les cinq collections à la fois (cf. services/payload/src/endpoints/).
// Ils existent parce que l'API REST de Payload interroge une collection
// par requête : fusionner, paginer ou compter côté client imposerait
// cinq appels et un tri en mémoire.

/** Slug d'une collection de publication. */
export type PublicationCollection = 'articles' | 'analyses' | 'actus' | 'podcasts' | 'outils';

export type SearchPost = {
  collection: PublicationCollection;
  id: number | string;
  /** Identifiant public court — sert à bâtir l'URL. */
  publicId: string;
  title: string | null;
  lede: string | null;
  publishedAt: string | null;
  /**
   * Extrait avec les termes trouvés enveloppés dans <mark>…</mark>,
   * produit par ts_headline. Injecté via set:html — la source est
   * Postgres, pas une saisie utilisateur.
   */
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

/** Recherche plein texte sur les cinq formats. */
export async function searchPublications(
  q: string,
  opts: { page?: number; limit?: number } = {},
): Promise<SearchResult> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  return fetchPayload<SearchResult>(`/search?${params.toString()}`);
}

export type FeedDoc = {
  collection: PublicationCollection;
  id: number | string;
  /** Identifiant public court — sert à bâtir l'URL. */
  publicId: string;
  title: string | null;
  lede: string | null;
  publishedAt: string | null;
  readingTime: number | null;
  /** Duree d ecoute, renseignee pour les podcasts uniquement. */
  durationSeconds: number | null;
  /** Slugs des thematiques, pour le filtrage client de la page d accueil. */
  themeSlugs: string[];
  /** Noms des auteur·ices, dans l ordre de saisie. */
  authors: string[];
};

export type FeedResult = {
  docs: FeedDoc[];
  totalDocs: number;
  totalPages: number;
  page: number;
};

/**
 * Flux fusionné des cinq collections, trié par date décroissante et
 * paginé côté SQL. Filtrable par thématique ou par tag.
 */
export async function fetchPublicationsFeed(
  opts: {
    page?: number;
    limit?: number;
    theme?: string;
    tag?: string;
    author?: number | string;
    featured?: boolean;
  } = {},
): Promise<FeedResult> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.theme) params.set('theme', opts.theme);
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.author) params.set('author', String(opts.author));
  if (opts.featured) params.set('featured', '1');
  const qs = params.toString();
  return fetchPayload<FeedResult>(`/publications${qs ? `?${qs}` : ''}`);
}

/**
 * Nombre de publications par thématique ou par tag, toutes collections
 * confondues, en une seule requête SQL.
 */
export async function fetchPublicationCounts(
  groupBy: 'theme' | 'tag' = 'theme',
): Promise<Record<string, number>> {
  const res = await fetchPayload<{ counts: Record<string, number> }>(
    `/publications/counts?groupBy=${groupBy}`,
  );
  return res.counts ?? {};
}

export type AuthorListEntry = {
  id: number | string;
  displayName: string | null;
  count: number;
};

/**
 * Auteur·ices internes (comptes Users) ayant signé au moins une
 * publication publiée, toutes collections confondues, avec leur compte
 * de publications. Sert la page /auteurices/.
 */
export async function fetchAuthorsList(): Promise<AuthorListEntry[]> {
  const res = await fetchPayload<{ docs: AuthorListEntry[] }>('/publications/authors');
  return res.docs ?? [];
}

/**
 * Nom affichable d'un user par id, pour la page /auteurice/<id>/. Le
 * `select` explicite est une barrière volontaire : `Users.access.read`
 * autorise déjà la lecture anonyme au niveau collection (nécessaire à
 * l'hydratation JWT interne de Payload, cf. collections/Users.ts), mais
 * `email` n'a pas de restriction `access.read` au niveau champ — ne
 * jamais élargir ce select sous peine de l'exposer publiquement ici.
 */
export async function fetchUserDisplayName(id: number | string): Promise<{
  id: number | string;
  displayName: string | null;
  /** Présentation saisie par la personne depuis « Mon compte ». */
  bio?: string | null;
  /** Portrait, peuplé (depth 1) pour en tirer le nom de fichier. */
  photo?: { filename?: string; alt?: string } | number | string | null;
} | null> {
  try {
    // `depth=1` et non 0 : sans peuplement, `photo` ne serait qu'un
    // identifiant, dont on ne peut pas tirer d'URL. La sélection reste
    // limitée aux trois champs affichés — le reste d'un compte
    // (adresse, rôle, jetons) n'a rien à faire dans une réponse
    // publique.
    return await fetchPayload(
      `/users/${encodeURIComponent(String(id))}?depth=1` +
        '&select[displayName]=true&select[bio]=true&select[photo]=true',
    );
  } catch {
    return null;
  }
}
