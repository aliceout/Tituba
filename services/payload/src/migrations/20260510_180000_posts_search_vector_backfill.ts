/**
 * Backfill de la colonne `posts.search_vector` (FTS Postgres) pour
 * tous les billets existants au moment de l'application.
 *
 * Migration séparée de la création de la colonne (cf migration
 * 20260510_175000_posts_search_vector qui tourne juste avant) :
 *  - La création column+index est purement structurelle.
 *  - Le backfill nécessite d'extraire le texte du `body` Lexical
 *    (impossible en pl/pgsql), donc côté Node.
 *
 * On lit les posts en SQL pur (PAS via `payload.find`) parce que la
 * local API utilise le schéma TS *courant* — qui inclut des colonnes
 * ajoutées par des migrations *postérieures* (ex. `notifications_sent_at`
 * ajoutée par 20260511_161012). Avec `payload.find`, le SELECT
 * généré référencerait ces colonnes → ERROR "column does not exist".
 * En SQL pur on liste explicitement les colonnes garanties d'exister
 * à ce point de l'historique.
 *
 * Idempotent : UPDATE row par row. Rejouable sans drame (recalculé à
 * l'identique).
 */

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

import { buildPostSearchVectorSQL } from '../lib/post-search-vector';

type PostRow = {
  id: number;
  title: string | null;
  slug: string | null;
  lede: string | null;
  body: unknown;
  id_carnet: string | null;
};

type RelRow = { parent_id: number; name: string | null };

type AuthorRow = {
  parent_id: number;
  kind: 'user' | 'external';
  external_name: string | null;
  display_name: string | null;
  email: string | null;
};

function groupNames(rows: RelRow[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;
    const arr = map.get(row.parent_id) ?? [];
    arr.push(name);
    map.set(row.parent_id, arr);
  }
  return map;
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Colonnes listées explicitement — celles qui existent à ce point de
  // l'historique (avant 20260511_161012 qui ajoute notifications_sent_at).
  const postsResult = await db.execute(sql`
    SELECT "id", "title", "slug", "lede", "body", "id_carnet"
    FROM "posts"
    LIMIT 5000
  `);
  const posts = postsResult.rows as unknown as PostRow[];
  if (posts.length === 0) return;

  // Thèmes : posts_rels (path='themes') → themes.name
  const themesResult = await db.execute(sql`
    SELECT pr."parent_id" AS parent_id, t."name" AS name
    FROM "posts_rels" pr
    JOIN "themes" t ON pr."themes_id" = t."id"
    WHERE pr."path" = 'themes'
  `);
  const themesByPost = groupNames(themesResult.rows as unknown as RelRow[]);

  // Tags : posts_rels (path='tags') → tags.name. La colonne tags_id sur
  // posts_rels et la table tags ont été ajoutées avant cette migration —
  // mais on guard quand même par try/catch au cas où la version déployée
  // n'aurait pas tags (forks, environnements bricolés).
  let tagsByPost = new Map<number, string[]>();
  try {
    const tagsResult = await db.execute(sql`
      SELECT pr."parent_id" AS parent_id, t."name" AS name
      FROM "posts_rels" pr
      JOIN "tags" t ON pr."tags_id" = t."id"
      WHERE pr."path" = 'tags'
    `);
    tagsByPost = groupNames(tagsResult.rows as unknown as RelRow[]);
  } catch {
    // tags pas encore là — skip silencieusement
  }

  // Auteur·ices : posts_authors → kind decides which name to use
  const authorsResult = await db.execute(sql`
    SELECT pa."_parent_id" AS parent_id, pa."kind" AS kind,
           pa."name" AS external_name,
           u."display_name" AS display_name, u."email" AS email
    FROM "posts_authors" pa
    LEFT JOIN "users" u ON pa."user_id" = u."id"
    ORDER BY pa."_parent_id", pa."_order"
  `);
  const authorsByPost = new Map<number, string[]>();
  for (const row of authorsResult.rows as unknown as AuthorRow[]) {
    let name = '';
    if (row.kind === 'external') {
      name = (row.external_name ?? '').trim();
    } else {
      name = (row.display_name ?? row.email ?? '').toString().trim();
    }
    if (!name) continue;
    const arr = authorsByPost.get(row.parent_id) ?? [];
    arr.push(name);
    authorsByPost.set(row.parent_id, arr);
  }

  for (const post of posts) {
    const vectorSQL = buildPostSearchVectorSQL({
      title: post.title,
      lede: post.lede,
      body: post.body,
      slug: post.slug,
      idCarnet: post.id_carnet,
      themeNames: themesByPost.get(post.id) ?? [],
      tagNames: tagsByPost.get(post.id) ?? [],
      authorNames: authorsByPost.get(post.id) ?? [],
    });
    await db.execute(sql`UPDATE "posts" SET "search_vector" = ${vectorSQL} WHERE "id" = ${post.id}`);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Le down ne défait pas le backfill — il met juste les vecteurs à
  // NULL au cas où (cohérent avec un down qui rollback la migration
  // de schéma juste avant, qui dropera la colonne de toute façon).
  await db.execute(sql`UPDATE "posts" SET "search_vector" = NULL`);
}
