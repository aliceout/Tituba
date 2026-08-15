import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "analyses" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "actus" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "podcasts" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "outils" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "series" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "tags" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "bibliography" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "media" ADD COLUMN "demo" boolean DEFAULT false;
  ALTER TABLE "site" ADD COLUMN "preparation_noindex" boolean DEFAULT false;
  ALTER TABLE "site" ADD COLUMN "preparation_acces_restreint" boolean DEFAULT false;
  ALTER TABLE "site" ADD COLUMN "preparation_clef_apercu" varchar;
  ALTER TABLE "site" ADD COLUMN "preparation_clef_apercu_hash" varchar;
  ALTER TABLE "site" ADD COLUMN "preparation_demo_chargee" boolean DEFAULT false;
  ALTER TABLE "site" ADD COLUMN "preparation_demo_etat" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" DROP COLUMN "demo";
  ALTER TABLE "analyses" DROP COLUMN "demo";
  ALTER TABLE "actus" DROP COLUMN "demo";
  ALTER TABLE "podcasts" DROP COLUMN "demo";
  ALTER TABLE "outils" DROP COLUMN "demo";
  ALTER TABLE "series" DROP COLUMN "demo";
  ALTER TABLE "tags" DROP COLUMN "demo";
  ALTER TABLE "bibliography" DROP COLUMN "demo";
  ALTER TABLE "users" DROP COLUMN "demo";
  ALTER TABLE "media" DROP COLUMN "demo";
  ALTER TABLE "site" DROP COLUMN "preparation_noindex";
  ALTER TABLE "site" DROP COLUMN "preparation_acces_restreint";
  ALTER TABLE "site" DROP COLUMN "preparation_clef_apercu";
  ALTER TABLE "site" DROP COLUMN "preparation_clef_apercu_hash";
  ALTER TABLE "site" DROP COLUMN "preparation_demo_chargee";
  ALTER TABLE "site" DROP COLUMN "preparation_demo_etat";`)
}
