import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_pages_home_layout" AS ENUM('flux', 'une');
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Prendre les questions de *genre* au sérieux — ici et *ailleurs*.';
  ALTER TABLE "articles" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "analyses" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "actus" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "podcasts" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "outils" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "index_pages" ADD COLUMN "home_layout" "enum_index_pages_home_layout" DEFAULT 'flux';
  CREATE INDEX "articles_featured_idx" ON "articles" USING btree ("featured");
  CREATE INDEX "analyses_featured_idx" ON "analyses" USING btree ("featured");
  CREATE INDEX "actus_featured_idx" ON "actus" USING btree ("featured");
  CREATE INDEX "podcasts_featured_idx" ON "podcasts" USING btree ("featured");
  CREATE INDEX "outils_featured_idx" ON "outils" USING btree ("featured");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_featured_idx";
  DROP INDEX "analyses_featured_idx";
  DROP INDEX "actus_featured_idx";
  DROP INDEX "podcasts_featured_idx";
  DROP INDEX "outils_featured_idx";
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Le genre, *partout* où il se joue.';
  ALTER TABLE "articles" DROP COLUMN "featured";
  ALTER TABLE "analyses" DROP COLUMN "featured";
  ALTER TABLE "actus" DROP COLUMN "featured";
  ALTER TABLE "podcasts" DROP COLUMN "featured";
  ALTER TABLE "outils" DROP COLUMN "featured";
  ALTER TABLE "index_pages" DROP COLUMN "home_layout";
  DROP TYPE "public"."enum_index_pages_home_layout";`)
}
