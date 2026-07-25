import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site" ALTER COLUMN "home_hero_title" SET DEFAULT 'Notes de recherche';
  ALTER TABLE "site" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Analyses longues, notes de lecture et fiches thématiques.';
  ALTER TABLE "site" ALTER COLUMN "baseline" SET DEFAULT 'Carnet de recherche. Auto-hébergé.';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site" ALTER COLUMN "home_hero_title" SET DEFAULT 'Notes de recherche en *études de genre* et en relations internationales.';
  ALTER TABLE "site" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Analyses longues, notes de lecture et fiches thématiques sur le genre, la géopolitique et les droits LGBTQI+ dans les rapports internationaux. Principalement en français.';
  ALTER TABLE "site" ALTER COLUMN "baseline" SET DEFAULT 'Carnet de recherche. Auto-hébergé. Sans pisteur.';`)
}
