/**
 * Création de la colonne `posts.search_vector` (tsvector, FTS Postgres)
 * + index GIN pour la recherche fulltext.
 *
 * En dev (push: true), cette migration ne tourne pas — c'est le hook
 * afterSchemaInit (cf. db/extend-posts-search-vector) qui déclare la
 * colonne et laisse drizzle push la créer au boot.
 *
 * En prod (push: false), c'est cette migration qui crée le schéma au
 * boot du container. Le backfill des billets existants suit dans la
 * migration 20260510_180000_posts_search_vector_backfill.
 *
 * IF NOT EXISTS : le hook afterSchemaInit + push pourrait avoir déjà
 * créé la colonne dans certains cas (env hybride / ré-application
 * accidentelle) — IF NOT EXISTS rend la migration safe à rejouer.
 */

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "posts_search_vector_idx"
      ON "posts" USING GIN ("search_vector");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "posts_search_vector_idx";`);
  await db.execute(sql`ALTER TABLE "posts" DROP COLUMN IF EXISTS "search_vector";`);
}
