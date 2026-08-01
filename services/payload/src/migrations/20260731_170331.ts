import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_numero_idx";
  DROP INDEX "articles_slug_idx";
  DROP INDEX "analyses_numero_idx";
  DROP INDEX "analyses_slug_idx";
  DROP INDEX "actus_numero_idx";
  DROP INDEX "actus_slug_idx";
  DROP INDEX "podcasts_numero_idx";
  DROP INDEX "podcasts_slug_idx";
  DROP INDEX "outils_numero_idx";
  DROP INDEX "outils_slug_idx";
  ALTER TABLE "articles" DROP COLUMN "numero";
  ALTER TABLE "articles" DROP COLUMN "slug";
  ALTER TABLE "articles" DROP COLUMN "id_carnet";
  ALTER TABLE "analyses" DROP COLUMN "numero";
  ALTER TABLE "analyses" DROP COLUMN "slug";
  ALTER TABLE "analyses" DROP COLUMN "id_carnet";
  ALTER TABLE "actus" DROP COLUMN "numero";
  ALTER TABLE "actus" DROP COLUMN "slug";
  ALTER TABLE "actus" DROP COLUMN "id_carnet";
  ALTER TABLE "podcasts" DROP COLUMN "numero";
  ALTER TABLE "podcasts" DROP COLUMN "slug";
  ALTER TABLE "podcasts" DROP COLUMN "id_carnet";
  ALTER TABLE "outils" DROP COLUMN "numero";
  ALTER TABLE "outils" DROP COLUMN "slug";
  ALTER TABLE "outils" DROP COLUMN "id_carnet";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "numero" numeric NOT NULL;
  ALTER TABLE "articles" ADD COLUMN "slug" varchar NOT NULL;
  ALTER TABLE "articles" ADD COLUMN "id_carnet" varchar;
  ALTER TABLE "analyses" ADD COLUMN "numero" numeric NOT NULL;
  ALTER TABLE "analyses" ADD COLUMN "slug" varchar NOT NULL;
  ALTER TABLE "analyses" ADD COLUMN "id_carnet" varchar;
  ALTER TABLE "actus" ADD COLUMN "numero" numeric NOT NULL;
  ALTER TABLE "actus" ADD COLUMN "slug" varchar NOT NULL;
  ALTER TABLE "actus" ADD COLUMN "id_carnet" varchar;
  ALTER TABLE "podcasts" ADD COLUMN "numero" numeric NOT NULL;
  ALTER TABLE "podcasts" ADD COLUMN "slug" varchar NOT NULL;
  ALTER TABLE "podcasts" ADD COLUMN "id_carnet" varchar;
  ALTER TABLE "outils" ADD COLUMN "numero" numeric NOT NULL;
  ALTER TABLE "outils" ADD COLUMN "slug" varchar NOT NULL;
  ALTER TABLE "outils" ADD COLUMN "id_carnet" varchar;
  CREATE UNIQUE INDEX "articles_numero_idx" ON "articles" USING btree ("numero");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE UNIQUE INDEX "analyses_numero_idx" ON "analyses" USING btree ("numero");
  CREATE UNIQUE INDEX "analyses_slug_idx" ON "analyses" USING btree ("slug");
  CREATE UNIQUE INDEX "actus_numero_idx" ON "actus" USING btree ("numero");
  CREATE UNIQUE INDEX "actus_slug_idx" ON "actus" USING btree ("slug");
  CREATE UNIQUE INDEX "podcasts_numero_idx" ON "podcasts" USING btree ("numero");
  CREATE UNIQUE INDEX "podcasts_slug_idx" ON "podcasts" USING btree ("slug");
  CREATE UNIQUE INDEX "outils_numero_idx" ON "outils" USING btree ("numero");
  CREATE UNIQUE INDEX "outils_slug_idx" ON "outils" USING btree ("slug");`)
}
