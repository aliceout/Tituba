import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Le genre, *partout* où il se joue.';
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Association féministe intersectionnelle, inclusive et décoloniale. Nous publions des recherches, des analyses et des outils pour comprendre les inégalités structurelles — et tenter de les défaire.';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Notes de recherche';
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Analyses longues, notes de lecture et fiches thématiques.';`)
}
