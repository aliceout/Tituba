import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Le genre aux prismes *féministe*, *décoloniaux*, et *intersectionnels* — recherches, analyses, ressources.';
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Association loi 1901 fondée à Paris en octobre 2024. Nous construisons un espace de ressources en accès libre autour d''une conviction : les inégalités structurelles se nouent ensemble — orientation sexuelle, construction sociale de la race, classe, colonialité — et ne se démêlent pas une à une. Dix thématiques, cinq formats, rien derrière un mur payant.';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_pages" ALTER COLUMN "home_hero_title" SET DEFAULT 'Prendre les questions de *genre* au sérieux — ici et *ailleurs*.';
  ALTER TABLE "index_pages" ALTER COLUMN "home_hero_lede" SET DEFAULT 'Association féministe intersectionnelle, inclusive et décoloniale. Nous publions des recherches, des analyses et des outils pour comprendre les inégalités structurelles — et tenter de les défaire.';`)
}
