/**
 * Endpoints custom — flux fusionné et comptages par taxonomie.
 *
 *   GET /cms/api/publications?page=1&limit=20[&theme=slug][&tag=slug]
 *   GET /cms/api/publications/counts?groupBy=theme|tag
 *
 * Les deux existent pour la même raison : ce sont des opérations qui
 * portent sur les cinq collections à la fois, et que l'API REST de
 * Payload — qui interroge une collection par requête — ne sait pas
 * faire efficacement.
 *
 * Le flux, parce que la pagination d'une fusion ne se fait pas côté
 * client : obtenir la page N d'un mélange de cinq sources triées
 * demande N × pageSize documents de *chacune* d'elles.
 *
 * Les comptages, parce que les vues admin des thématiques et des tags
 * comptaient jusqu'ici une requête REST par ligne affichée. Avec cinq
 * collections, cela deviendrait cinq requêtes par ligne, soit plus de
 * cent requêtes parallèles sur une page de vingt-cinq thématiques. Ici,
 * une seule requête SQL renvoie tous les compteurs.
 */

import type { Endpoint } from 'payload';
import { sql } from '@payloadcms/db-postgres/drizzle';

import { jsonResponse } from '../auth/helpers';
import { PUBLICATION_TABLES, type PublicationTable } from '../db/publications-union';

type FeedRow = {
  collection: PublicationTable;
  id: number;
  numero: number | null;
  slug: string | null;
  title: string | null;
  lede: string | null;
  published_at: string | null;
  id_carnet: string | null;
  reading_time: number | null;
  duration_seconds: number | null;
  theme_slugs: string | null;
  authors: string | null;
  total: number;
};

/**
 * Séparateur des noms d'auteur·ices agrégés. Une barre entourée
 * d'espaces : aucun patronyme ni rattachement n'en contient, là où une
 * virgule casserait sur « Dupuis, Olga » ou sur un nom composé.
 */
const AUTHOR_SEP = ' | ';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseIntInRange(raw: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export const publicationsFeedEndpoint: Endpoint = {
  path: '/publications',
  method: 'get',
  handler: async (req) => {
    const url = new URL(req.url ?? '', 'http://placeholder');
    const page = parseIntInRange(url.searchParams.get('page'), 1, 1, 10_000);
    const limit = parseIntInRange(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = (page - 1) * limit;
    const theme = (url.searchParams.get('theme') ?? '').trim();
    const tag = (url.searchParams.get('tag') ?? '').trim();
    // Restreint aux publications mises à la une. Combiné à limit=1,
    // c'est ainsi que l'accueil désigne sa une.
    const featuredOnly = url.searchParams.get('featured') === '1';

    // Filtre thématique/tag : les relations vivent dans la table
    // `<collection>_rels`, qui pointe vers themes/tags par id. On passe
    // par un EXISTS plutôt qu'une jointure pour ne pas dupliquer les
    // lignes quand une publication porte plusieurs thématiques.
    const branches = PUBLICATION_TABLES.map((t) => {
      const preds = [sql`p.draft IS NOT TRUE`, sql`p.published_at <= now()`];
      if (featuredOnly) preds.push(sql`p.featured IS TRUE`);
      if (theme) {
        preds.push(sql`EXISTS (
          SELECT 1 FROM ${sql.raw(`"${t}_rels"`)} r
          JOIN themes th ON th.id = r.themes_id
          WHERE r.parent_id = p.id AND th.slug = ${theme}
        )`);
      }
      if (tag) {
        preds.push(sql`EXISTS (
          SELECT 1 FROM ${sql.raw(`"${t}_rels"`)} r
          JOIN tags tg ON tg.id = r.tags_id
          WHERE r.parent_id = p.id AND tg.slug = ${tag}
        )`);
      }
      return sql`
        SELECT ${sql.raw(`'${t}'`)}::text AS collection,
               p.id, p.numero, p.slug, p.title, p.lede,
               p.published_at, p.id_carnet, p.reading_time,
               -- Durée d'écoute. Seule la table des podcasts porte la
               -- colonne ; les quatre autres branches projettent un NULL
               -- typé, sans quoi l'UNION refuserait des listes de
               -- colonnes de types différents.
               ${sql.raw(t === 'podcasts' ? 'p.duration_seconds' : 'NULL::numeric')} AS duration_seconds,
               -- Slugs des thématiques, agrégés en une chaîne. Le flux
               -- alimente les filtres de la page d'accueil, qui filtrent
               -- côté client sur un attribut data-themes : sans cette
               -- colonne il faudrait une requête par publication.
               (
                 SELECT coalesce(string_agg(th.slug, ' ' ORDER BY th.slug), '')
                 FROM ${sql.raw(`"${t}_rels"`)} rr
                 JOIN themes th ON th.id = rr.themes_id
                 WHERE rr.parent_id = p.id
               ) AS theme_slugs,
               -- Auteur·ices, dans l'ordre de saisie. Une entrée est
               -- soit interne (user_id renseigné, nom porté par la
               -- fiche utilisateur·ice) soit externe (nom saisi à la
               -- main) : le coalesce couvre les deux d'un seul tenant.
               -- L'agrégat ignore les NULL, donc une entrée incomplète
               -- disparaît au lieu de produire un séparateur orphelin.
               --
               -- Attention : pas de backtick dans ces commentaires. Ils
               -- vivent dans un template literal JS, où le backtick
               -- ferme la chaîne — l'erreur remonte alors en faute de
               -- syntaxe TypeScript à des lignes de distance.
               (
                 -- Séparateur en littéral SQL plutôt qu'en paramètre
                 -- lié : c'est une constante du code, la lier n'aurait
                 -- rien protégé et aurait laissé Postgres deviner le
                 -- type d'un argument d'agrégat.
                 SELECT string_agg(
                          coalesce(nullif(a.name, ''), u.display_name),
                          ${sql.raw(`'${AUTHOR_SEP}'`)} ORDER BY a._order
                        )
                 FROM ${sql.raw(`"${t}_authors"`)} a
                 LEFT JOIN users u ON u.id = a.user_id
                 WHERE a._parent_id = p.id
               ) AS authors
        FROM ${sql.raw(`"${t}"`)} p
        WHERE ${sql.join(preds, sql` AND `)}`;
    });

    const result = await req.payload.db.drizzle.execute<FeedRow>(sql`
      WITH feed AS (
        ${sql.join(branches, sql` UNION ALL `)}
      )
      SELECT f.*, count(*) OVER () AS total
      FROM feed f
      ORDER BY f.published_at DESC, f.collection ASC, f.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const rows = result.rows ?? [];
    const docs = rows.map((r) => ({
      collection: r.collection,
      id: r.id,
      numero: r.numero,
      slug: r.slug,
      title: r.title,
      lede: r.lede,
      publishedAt: r.published_at,
      idTituba: r.id_carnet,
      readingTime: r.reading_time,
      durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
      themeSlugs: (r.theme_slugs ?? '').split(' ').filter(Boolean),
      authors: (r.authors ?? '').split(AUTHOR_SEP).filter(Boolean),
    }));
    const totalDocs = Number(rows[0]?.total ?? 0);

    return jsonResponse({
      docs,
      totalDocs,
      totalPages: Math.max(1, Math.ceil(totalDocs / limit)),
      page,
    });
  },
};

type CountRow = { slug: string; total: number };

export const publicationsCountsEndpoint: Endpoint = {
  path: '/publications/counts',
  method: 'get',
  handler: async (req) => {
    const url = new URL(req.url ?? '', 'http://placeholder');
    const groupBy = url.searchParams.get('groupBy') === 'tag' ? 'tag' : 'theme';
    // `includeUnpublished` sert les vues admin, qui comptent aussi les
    // brouillons — un compteur qui ignore les brouillons donnerait
    // l'impression qu'une thématique est inutilisée alors qu'elle est
    // en cours de rédaction.
    const includeUnpublished = url.searchParams.get('all') === '1';

    const relColumn = groupBy === 'tag' ? 'tags_id' : 'themes_id';
    const targetTable = groupBy === 'tag' ? 'tags' : 'themes';

    const branches = PUBLICATION_TABLES.map((t) => {
      const preds = [sql.raw(`r.${relColumn} IS NOT NULL`)];
      if (!includeUnpublished) {
        preds.push(sql`p.draft IS NOT TRUE`);
        preds.push(sql`p.published_at <= now()`);
      }
      return sql`
        SELECT ${sql.raw(`r.${relColumn}`)} AS target_id
        FROM ${sql.raw(`"${t}_rels"`)} r
        JOIN ${sql.raw(`"${t}"`)} p ON p.id = r.parent_id
        WHERE ${sql.join(preds, sql` AND `)}`;
    });

    const result = await req.payload.db.drizzle.execute<CountRow>(sql`
      WITH rels AS (
        ${sql.join(branches, sql` UNION ALL `)}
      )
      SELECT t.slug AS slug, count(rels.target_id)::int AS total
      FROM ${sql.raw(`"${targetTable}"`)} t
      LEFT JOIN rels ON rels.target_id = t.id
      GROUP BY t.slug
    `);

    const counts: Record<string, number> = {};
    for (const r of result.rows ?? []) counts[r.slug] = Number(r.total ?? 0);

    return jsonResponse({ groupBy, counts });
  },
};
