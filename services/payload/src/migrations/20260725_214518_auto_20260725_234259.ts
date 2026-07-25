import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "archives_hero_title" SET DEFAULT 'Toutes les publications, par année.';
  ALTER TABLE "index_pages" ALTER COLUMN "archives_hero_lede" SET DEFAULT 'Chaque publication porte un numéro, une date de publication et, le cas échéant, une date de mise à jour.';
  ALTER TABLE "index_pages" ALTER COLUMN "themes_hero_title" SET DEFAULT 'Nos *thématiques*.';
  ALTER TABLE "index_pages" ALTER COLUMN "themes_hero_lede" SET DEFAULT 'Chaque publication est rattachée à une ou plusieurs thématiques. La taxonomie est libre et évolue avec nos travaux.';
  ALTER TABLE "identity" ALTER COLUMN "site_name" SET DEFAULT 'Tituba';
  ALTER TABLE "identity" ALTER COLUMN "baseline" SET DEFAULT 'Collectif féministe intersectionnel. Auto-hébergé.';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "archives_hero_title" SET DEFAULT 'Tous les billets, par année.';
  ALTER TABLE "index_pages" ALTER COLUMN "archives_hero_lede" SET DEFAULT 'Le carnet est versionné : chaque billet a un numéro, une date de publication et, le cas échéant, une date de mise à jour. Les fiches thématiques sont régulièrement révisées.';
  ALTER TABLE "index_pages" ALTER COLUMN "themes_hero_title" SET DEFAULT 'Les *thèmes* du carnet.';
  ALTER TABLE "index_pages" ALTER COLUMN "themes_hero_lede" SET DEFAULT 'Chaque billet est rattaché à un ou plusieurs thèmes. La taxonomie est libre et évolue avec le carnet.';
  ALTER TABLE "identity" ALTER COLUMN "site_name" SET DEFAULT 'Carnet';
  ALTER TABLE "identity" ALTER COLUMN "baseline" SET DEFAULT 'Carnet de recherche. Auto-hébergé.';`)
}
