/**
 * Endpoint custom — recherche plein texte sur les cinq formats.
 *
 *   GET /cms/api/search?q=…&page=1&limit=20
 *
 * Public (pas d'auth). Ne renvoie que les publications réellement
 * publiques : ni brouillon, ni datée dans le futur.
 *
 * Monté à la racine de la config Payload et non sur une collection :
 * la recherche couvre les cinq tables, la rattacher à l'une d'elles
 * donnerait une URL trompeuse (/cms/api/articles/search pour des
 * résultats qui contiennent des podcasts).
 *
 * Implémentation : SQL natif via drizzle — Payload n'expose pas les
 * opérateurs `@@` / `ts_rank` du FTS Postgres. `websearch_to_tsquery`
 * accepte la syntaxe naturelle (mots simples, "phrase exacte",
 * -exclusion, OR) et ne lève pas d'erreur sur une entrée malformée.
 *
 * Quatre points de conception valent la peine d'être explicités, parce
 * qu'ils ne se voient pas à la lecture du SQL :
 *
 * 1. `ts_headline` est appliqué **après** le LIMIT, dans une projection
 *    finale sur les ≤20 lignes retenues. Le placer dans les branches de
 *    l'union le ferait calculer sur tous les résultats des cinq tables
 *    avant pagination — coûteux et inutile.
 *
 * 2. Le total vient d'un `count(*) OVER ()` plutôt que d'une seconde
 *    requête. La fenêtre est évaluée sur l'ensemble des lignes avant
 *    LIMIT, ce qui donne exactement le total voulu, et évite un second
 *    balayage des cinq tables.
 *
 * 3. `ORDER BY` départage jusqu'à `collection, id`. Sans ces deux
 *    dernières clés l'ordre n'est pas total : les identifiants des cinq
 *    tables démarrent tous à 1 et les rangs s'égalisent souvent, si
 *    bien que sous LIMIT/OFFSET une même ligne pourrait apparaître sur
 *    deux pages et une autre disparaître.
 *
 * 4. `ts_rank` est normalisé (drapeau 32 → rank/(rank+1)). Le rang brut
 *    croît avec le nombre de correspondances, donc les articles de
 *    recherche — longs par nature — écraseraient systématiquement les
 *    billets d'actu et les notes d'épisode sur le même terme.
 */

import type { Endpoint } from 'payload';
import { sql } from '@payloadcms/db-postgres/drizzle';

import { jsonResponse } from '../auth/helpers';
import { PUBLICATION_TABLES, type PublicationTable } from '../db/publications-union';

type SearchRow = {
  collection: PublicationTable;
  id: number;
  numero: number | null;
  slug: string | null;
  title: string | null;
  lede: string | null;
  published_at: string | null;
  id_carnet: string | null;
  excerpt: string | null;
  rank: number;
  total: number;
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

export const publicationsSearchEndpoint: Endpoint = {
  path: '/search',
  method: 'get',
  handler: async (req) => {
    const url = new URL(req.url ?? '', 'http://placeholder');
    const q = (url.searchParams.get('q') ?? '').trim();
    const page = parseIntInRange(url.searchParams.get('page'), 1, 1, 10_000);
    const limit = parseIntInRange(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = (page - 1) * limit;

    // Query vide → résultat vide, pas une erreur : c'est l'état de la
    // page de recherche avant toute saisie.
    if (!q) {
      return jsonResponse({ docs: [], totalDocs: 0, totalPages: 0, page: 1, q: '' });
    }

    const headlineOpts =
      'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,FragmentDelimiter=…,MaxWords=30,MinWords=10';

    // Une branche par table. Elles doivent projeter exactement les mêmes
    // colonnes, dans le même ordre, sinon Postgres refuse l'UNION.
    const branches = PUBLICATION_TABLES.map(
      (t) => sql`
        SELECT ${sql.raw(`'${t}'`)}::text AS collection,
               p.id, p.numero, p.slug, p.title, p.lede,
               p.published_at, p.id_carnet,
               ts_rank(p.search_vector, q.query, 32) AS rank
        FROM ${sql.raw(`"${t}"`)} p, q
        WHERE p.search_vector @@ q.query
          AND p.draft IS NOT TRUE
          AND p.published_at <= now()`,
    );

    const rowsResult = await req.payload.db.drizzle.execute<SearchRow>(sql`
      WITH q AS MATERIALIZED (
        SELECT websearch_to_tsquery('french', ${q}) AS query
      ),
      hits AS (
        ${sql.join(branches, sql` UNION ALL `)}
      ),
      page AS (
        SELECT h.*, count(*) OVER () AS total
        FROM hits h
        ORDER BY h.rank DESC, h.published_at DESC, h.collection ASC, h.id ASC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT p.*,
             ts_headline('french', coalesce(p.lede, ''), q.query, ${headlineOpts}) AS excerpt
      FROM page p, q
      ORDER BY p.rank DESC, p.published_at DESC, p.collection ASC, p.id ASC
    `);

    const rows = rowsResult.rows ?? [];
    const docs = rows.map((r) => ({
      collection: r.collection,
      id: r.id,
      numero: r.numero,
      slug: r.slug,
      title: r.title,
      lede: r.lede,
      publishedAt: r.published_at,
      idTituba: r.id_carnet,
      excerpt: r.excerpt,
      rank: typeof r.rank === 'string' ? parseFloat(r.rank) : r.rank,
    }));
    const totalDocs = Number(rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalDocs / limit));

    return jsonResponse({ docs, totalDocs, totalPages, page, q });
  },
};
