/**
 * Endpoint custom — recherche fulltext sur les billets.
 *
 *   GET /cms/api/posts/search?q=…&page=1&limit=20
 *
 * Public (pas d'auth requise). Ne renvoie que les billets `draft = false`
 * — un brouillon n'est pas censé apparaître côté lecteurs.
 *
 * Implémentation :
 *  - SQL natif via `db.execute` (drizzle) — Payload n'expose pas
 *    nativement les opérateurs `@@` / `ts_rank` du FTS Postgres.
 *  - `websearch_to_tsquery('french', :q)` accepte la syntaxe utilisateur
 *    naturelle : mots simples, "phrase entre guillemets", -exclusion,
 *    OR. Robuste aux entrées malformées (pas d'erreur sur un seul `:`).
 *  - Tri : ts_rank desc, puis publishedAt desc en départage (récent
 *    d'abord à pertinence égale).
 *  - Excerpt : `ts_headline` sur le chapô (lede) — si le match est
 *    dans le titre ou le chapô, on a un beau snippet surligné. Si le
 *    match est dans le body uniquement, on retombe sur le lede sans
 *    highlight (acceptable v1 ; étendre au body_text plus tard si
 *    besoin de snippets précis sur le contenu).
 *
 * Le SELECT ramène uniquement les colonnes utiles côté Astro pour la
 * page /recherche : id, numero, slug, title, lede, published_at,
 * id_carnet + un excerpt avec highlight + rank.
 *
 * Branchement : payload.config.ts attache cet endpoint à la collection
 * `posts` → exposé sous /cms/api/posts/search.
 */

import type { Endpoint } from 'payload';
import { sql } from '@payloadcms/db-postgres/drizzle';

import { jsonResponse } from '../auth/helpers';

type SearchRow = {
  id: number;
  numero: number | null;
  slug: string | null;
  title: string | null;
  lede: string | null;
  published_at: string | null;
  id_carnet: string | null;
  excerpt: string | null;
  rank: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseIntInRange(raw: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export const postsSearchEndpoint: Endpoint = {
  path: '/search',
  method: 'get',
  handler: async (req) => {
    // req.url contient juste le path absolu côté Payload — on parse
    // la query string nous-mêmes via URLSearchParams.
    const url = new URL(req.url ?? '', 'http://placeholder');
    const q = (url.searchParams.get('q') ?? '').trim();
    const page = parseIntInRange(url.searchParams.get('page'), 1, 1, 10_000);
    const limit = parseIntInRange(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = (page - 1) * limit;

    // Query vide → résultat vide (pas d'erreur, c'est un état UX
    // valide : page de recherche affichée sans rien chercher encore).
    if (!q) {
      return jsonResponse({ docs: [], totalDocs: 0, totalPages: 0, page: 1, q: '' });
    }

    // Options pour ts_headline : on encadre les matches en <mark>,
    // 2 fragments max, chaque fragment ~30 mots, séparés par « … ».
    const headlineOpts =
      'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,FragmentDelimiter=…,MaxWords=30,MinWords=10';

    // SELECT : on calcule la query tsquery une seule fois en CTE pour
    // pouvoir la réutiliser dans WHERE / ORDER BY / ts_headline /
    // count(*) sans la recalculer.
    const rowsResult = await req.payload.db.drizzle.execute<SearchRow>(sql`
      WITH q AS (
        SELECT websearch_to_tsquery('french', ${q}) AS query
      )
      SELECT
        p.id,
        p.numero,
        p.slug,
        p.title,
        p.lede,
        p.published_at,
        p.id_carnet,
        ts_headline('french', coalesce(p.lede, ''), q.query, ${headlineOpts}) AS excerpt,
        ts_rank(p.search_vector, q.query) AS rank
      FROM posts p, q
      WHERE p.search_vector @@ q.query
        AND p.draft = false
      ORDER BY rank DESC, p.published_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const countResult = await req.payload.db.drizzle.execute<{ total: number }>(sql`
      WITH q AS (
        SELECT websearch_to_tsquery('french', ${q}) AS query
      )
      SELECT count(*)::int AS total
      FROM posts p, q
      WHERE p.search_vector @@ q.query
        AND p.draft = false
    `);

    const docs = (rowsResult.rows ?? []).map((r) => ({
      id: r.id,
      numero: r.numero,
      slug: r.slug,
      title: r.title,
      lede: r.lede,
      publishedAt: r.published_at,
      idCarnet: r.id_carnet,
      excerpt: r.excerpt,
      rank: typeof r.rank === 'string' ? parseFloat(r.rank) : r.rank,
    }));
    const totalDocs = Number(countResult.rows?.[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));

    return jsonResponse({ docs, totalDocs, totalPages, page, q });
  },
};
