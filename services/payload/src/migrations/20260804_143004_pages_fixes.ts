import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Le global « Pages principales » devient quatre documents de la
 * collection `pages`, marqués `kind: 'fixe'` — une seule liste de pages
 * dans l'admin au lieu de deux entrées aux noms voisins.
 *
 * L'ordre compte, et c'est pour ça que le SQL généré a été réordonné à
 * la main : les colonnes doivent exister, puis les quatre lignes être
 * recopiées depuis le global, et seulement alors sa table peut tomber.
 * Dans l'ordre inverse, un déploiement aurait perdu sans rien dire les
 * titres de hero et les interrupteurs de menu déjà saisis en
 * production — le schéma aurait été juste, le site vide.
 *
 * `NOT EXISTS` sur chaque insertion : la base de développement a reçu
 * ces quatre lignes à la main avant que la migration existe, elle ne
 * doit pas s'en retrouver avec huit.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_kind" AS ENUM('libre', 'fixe');
  ALTER TABLE "pages_blocks_prose" ALTER COLUMN "content" DROP NOT NULL;
  ALTER TABLE "pages_blocks_citation_bloc" ALTER COLUMN "text" DROP NOT NULL;
  ALTER TABLE "pages" ADD COLUMN "kind" "enum_pages_kind" DEFAULT 'libre';
  ALTER TABLE "pages" ADD COLUMN "enabled" boolean DEFAULT true;
  CREATE INDEX "pages_kind_idx" ON "pages" USING btree ("kind");`)

  // Reprise des valeurs du global. `title` est NOT NULL sur `pages`,
  // d'où le repli sur un libellé : un titre de hero vide en base ne doit
  // pas faire échouer un déploiement.
  await db.execute(sql`
  INSERT INTO "pages" ("title", "slug", "kind", "enabled", "lede", "noindex", "updated_at", "created_at")
  SELECT COALESCE(NULLIF(g."home_hero_title", ''), 'Accueil'), 'home', 'fixe', true, g."home_hero_lede", false, now(), now()
  FROM "index_pages" g WHERE NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'home');

  INSERT INTO "pages" ("title", "slug", "kind", "enabled", "lede", "noindex", "updated_at", "created_at")
  SELECT COALESCE(NULLIF(g."archives_hero_title", ''), 'Archives'), 'archives', 'fixe', COALESCE(g."archives_enabled", true), g."archives_hero_lede", false, now(), now()
  FROM "index_pages" g WHERE NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'archives');

  INSERT INTO "pages" ("title", "slug", "kind", "enabled", "lede", "noindex", "updated_at", "created_at")
  SELECT COALESCE(NULLIF(g."themes_hero_title", ''), 'Thèmes'), 'themes', 'fixe', COALESCE(g."themes_enabled", true), g."themes_hero_lede", false, now(), now()
  FROM "index_pages" g WHERE NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'themes');

  INSERT INTO "pages" ("title", "slug", "kind", "enabled", "lede", "noindex", "updated_at", "created_at")
  SELECT COALESCE(NULLIF(g."subscribe_hero_title", ''), 'Abonnement'), 'subscribe', 'fixe', COALESCE(g."subscribe_enabled", true), g."subscribe_hero_lede", false, now(), now()
  FROM "index_pages" g WHERE NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'subscribe');`)

  // La page /formats/ n'existait pas dans le global — son titre et son
  // chapô vivaient en dur dans le gabarit Astro, seule des cinq à ne
  // pas être réglable. Elle est créée avec ces valeurs-là, sans source
  // à reprendre, et devient modifiable comme les autres.
  await db.execute(sql`
  INSERT INTO "pages" ("title", "slug", "kind", "enabled", "lede", "noindex", "updated_at", "created_at")
  SELECT 'Cinq *formats*, une même exigence.', 'formats', 'fixe', true,
    'Un texte long avec son appareil de notes n''appelle pas la même lecture qu''un rebond d''actualité ou qu''un kit d''animation. Chaque format a sa place, ses codes et sa page.',
    false, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'formats');`)

  await db.execute(sql`
  ALTER TABLE "index_pages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "index_pages" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "index_pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"home_hero_title" varchar DEFAULT 'Le genre aux prismes *féministe*, *décoloniaux*, et *intersectionnels* — recherches, analyses, ressources.',
  	"home_hero_lede" varchar DEFAULT 'Association loi 1901 fondée à Paris en octobre 2024. Nous construisons un espace de ressources en accès libre autour d''une conviction : les inégalités structurelles se nouent ensemble — orientation sexuelle, construction sociale de la race, classe, colonialité — et ne se démêlent pas une à une. Dix thématiques, cinq formats, rien derrière un mur payant.',
  	"archives_enabled" boolean DEFAULT true,
  	"archives_hero_title" varchar DEFAULT 'Toutes les publications, par année.',
  	"archives_hero_lede" varchar DEFAULT 'Chaque publication porte un numéro, une date de publication et, le cas échéant, une date de mise à jour.',
  	"themes_enabled" boolean DEFAULT true,
  	"themes_hero_title" varchar DEFAULT 'Nos *thématiques*.',
  	"themes_hero_lede" varchar DEFAULT 'Chaque publication est rattachée à une ou plusieurs thématiques. La taxonomie est libre et évolue avec nos travaux.',
  	"subscribe_enabled" boolean DEFAULT true,
  	"subscribe_hero_title" varchar DEFAULT '*S''abonner* aux billets',
  	"subscribe_hero_lede" varchar DEFAULT 'Plusieurs façons de recevoir les nouveaux billets : sur les réseaux où l''autrice est présente, ou via un flux RSS — sans algorithme, sans publicité, sans pisteur.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  DROP INDEX "pages_kind_idx";
  ALTER TABLE "pages_blocks_prose" ALTER COLUMN "content" SET NOT NULL;
  ALTER TABLE "pages_blocks_citation_bloc" ALTER COLUMN "text" SET NOT NULL;`)

  // Retour en arrière symétrique : les valeurs repassent dans le global
  // avant que les documents disparaissent. Un `down` qui se contente de
  // recréer la table rendrait au site ses valeurs par défaut, effaçant
  // sans bruit tout ce qui avait été écrit depuis.
  await db.execute(sql`
  INSERT INTO "index_pages" (
    "home_hero_title", "home_hero_lede",
    "archives_enabled", "archives_hero_title", "archives_hero_lede",
    "themes_enabled", "themes_hero_title", "themes_hero_lede",
    "subscribe_enabled", "subscribe_hero_title", "subscribe_hero_lede",
    "updated_at", "created_at")
  SELECT
    MAX(CASE WHEN "slug" = 'home' THEN "title" END),
    MAX(CASE WHEN "slug" = 'home' THEN "lede" END),
    BOOL_OR(CASE WHEN "slug" = 'archives' THEN "enabled" END),
    MAX(CASE WHEN "slug" = 'archives' THEN "title" END),
    MAX(CASE WHEN "slug" = 'archives' THEN "lede" END),
    BOOL_OR(CASE WHEN "slug" = 'themes' THEN "enabled" END),
    MAX(CASE WHEN "slug" = 'themes' THEN "title" END),
    MAX(CASE WHEN "slug" = 'themes' THEN "lede" END),
    BOOL_OR(CASE WHEN "slug" = 'subscribe' THEN "enabled" END),
    MAX(CASE WHEN "slug" = 'subscribe' THEN "title" END),
    MAX(CASE WHEN "slug" = 'subscribe' THEN "lede" END),
    now(), now()
  FROM "pages" WHERE "kind" = 'fixe'
  HAVING COUNT(*) > 0;`)

  // Les quatre documents repartent avec le global : les laisser en
  // ferait des pages libres aux slugs réservés, jamais servies par
  // Astro et impossibles à distinguer des vraies une fois la colonne
  // `kind` disparue.
  await db.execute(sql`
  DELETE FROM "pages" WHERE "kind" = 'fixe';`)

  await db.execute(sql`
  ALTER TABLE "pages" DROP COLUMN "kind";
  ALTER TABLE "pages" DROP COLUMN "enabled";
  DROP TYPE "public"."enum_pages_kind";`)
}
