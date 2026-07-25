import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'active', 'unsubscribed');
  CREATE TYPE "public"."enum_navigation_blocks_nav_item_kind" AS ENUM('index', 'editorial');
  CREATE TYPE "public"."enum_navigation_blocks_nav_item_index_target" AS ENUM('archives', 'themes', 'subscribe');
  CREATE TABLE "subscribers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"status" "enum_subscribers_status" DEFAULT 'pending' NOT NULL,
  	"confirm_token_hash" varchar,
  	"confirm_token_expires_at" timestamp(3) with time zone,
  	"subscribed_at" timestamp(3) with time zone,
  	"confirmed_at" timestamp(3) with time zone,
  	"unsubscribed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "navigation_blocks_nav_item" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_navigation_blocks_nav_item_kind" DEFAULT 'index' NOT NULL,
  	"index_target" "enum_navigation_blocks_nav_item_index_target",
  	"page_id" integer,
  	"label" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "navigation_nav_footer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"external" boolean DEFAULT false
  );
  
  CREATE TABLE "navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "index_pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"home_hero_title" varchar DEFAULT 'Notes de recherche',
  	"home_hero_lede" varchar DEFAULT 'Analyses longues, notes de lecture et fiches thématiques.',
  	"archives_enabled" boolean DEFAULT true,
  	"archives_hero_title" varchar DEFAULT 'Tous les billets, par année.',
  	"archives_hero_lede" varchar DEFAULT 'Le carnet est versionné : chaque billet a un numéro, une date de publication et, le cas échéant, une date de mise à jour. Les fiches thématiques sont régulièrement révisées.',
  	"themes_enabled" boolean DEFAULT true,
  	"themes_hero_title" varchar DEFAULT 'Les *thèmes* du carnet.',
  	"themes_hero_lede" varchar DEFAULT 'Chaque billet est rattaché à un ou plusieurs thèmes. La taxonomie est libre et évolue avec le carnet.',
  	"subscribe_enabled" boolean DEFAULT true,
  	"subscribe_hero_title" varchar DEFAULT '*S''abonner* aux billets',
  	"subscribe_hero_lede" varchar DEFAULT 'Plusieurs façons de recevoir les nouveaux billets : sur les réseaux où l''autrice est présente, ou via un flux RSS — sans algorithme, sans publicité, sans pisteur.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "identity" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'Carnet',
  	"author_name" varchar DEFAULT '',
  	"baseline" varchar DEFAULT 'Carnet de recherche. Auto-hébergé.',
  	"copyright_line" varchar DEFAULT 'CC BY-NC-SA 4.0',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "subscriptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"rss_enabled" boolean DEFAULT true,
  	"email_enabled" boolean DEFAULT true,
  	"mastodon" varchar,
  	"bluesky" varchar,
  	"orcid" varchar,
  	"hal" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "site_nav_footer" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "site_nav_footer" CASCADE;
  ALTER TABLE "posts" ADD COLUMN "notifications_sent_at" timestamp(3) with time zone;
  -- search_vector + index posts_search_vector_idx déjà créés par
  -- 20260510_175000_posts_search_vector (avec IF NOT EXISTS). L'auto-
  -- generator les a re-listés ici parce qu'il scanne le schéma final,
  -- sans connaître l'historique. On garde des no-ops idempotents pour
  -- ne pas casser un environnement où seul l'auto-gen aurait tourné.
  ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "search_vector" "tsvector";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscribers_id" integer;
  ALTER TABLE "navigation_blocks_nav_item" ADD CONSTRAINT "navigation_blocks_nav_item_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "navigation_blocks_nav_item" ADD CONSTRAINT "navigation_blocks_nav_item_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navigation_nav_footer" ADD CONSTRAINT "navigation_nav_footer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE INDEX "navigation_blocks_nav_item_order_idx" ON "navigation_blocks_nav_item" USING btree ("_order");
  CREATE INDEX "navigation_blocks_nav_item_parent_id_idx" ON "navigation_blocks_nav_item" USING btree ("_parent_id");
  CREATE INDEX "navigation_blocks_nav_item_path_idx" ON "navigation_blocks_nav_item" USING btree ("_path");
  CREATE INDEX "navigation_blocks_nav_item_page_idx" ON "navigation_blocks_nav_item" USING btree ("page_id");
  CREATE INDEX "navigation_nav_footer_order_idx" ON "navigation_nav_footer" USING btree ("_order");
  CREATE INDEX "navigation_nav_footer_parent_id_idx" ON "navigation_nav_footer" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "posts_search_vector_idx" ON "posts" USING gin ("search_vector");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  ALTER TABLE "site" DROP COLUMN "identity_author_name";
  ALTER TABLE "site" DROP COLUMN "home_hero_title";
  ALTER TABLE "site" DROP COLUMN "home_hero_lede";
  ALTER TABLE "site" DROP COLUMN "archives_hero_title";
  ALTER TABLE "site" DROP COLUMN "archives_hero_lede";
  ALTER TABLE "site" DROP COLUMN "themes_hero_title";
  ALTER TABLE "site" DROP COLUMN "themes_hero_lede";
  ALTER TABLE "site" DROP COLUMN "baseline";
  ALTER TABLE "site" DROP COLUMN "copyright_line";
  ALTER TABLE "site" DROP COLUMN "social_mastodon";
  ALTER TABLE "site" DROP COLUMN "social_bluesky";
  ALTER TABLE "site" DROP COLUMN "social_orcid";
  ALTER TABLE "site" DROP COLUMN "social_hal";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "site_nav_footer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"external" boolean DEFAULT false
  );
  
  ALTER TABLE "subscribers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "navigation_blocks_nav_item" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "navigation_nav_footer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "index_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "identity" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "navigation_blocks_nav_item" CASCADE;
  DROP TABLE "navigation_nav_footer" CASCADE;
  DROP TABLE "navigation" CASCADE;
  DROP TABLE "index_pages" CASCADE;
  DROP TABLE "identity" CASCADE;
  DROP TABLE "subscriptions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscribers_fk";
  
  DROP INDEX "posts_search_vector_idx";
  DROP INDEX "payload_locked_documents_rels_subscribers_id_idx";
  ALTER TABLE "site" ADD COLUMN "identity_author_name" varchar DEFAULT '';
  ALTER TABLE "site" ADD COLUMN "home_hero_title" varchar DEFAULT 'Notes de recherche';
  ALTER TABLE "site" ADD COLUMN "home_hero_lede" varchar DEFAULT 'Analyses longues, notes de lecture et fiches thématiques.';
  ALTER TABLE "site" ADD COLUMN "archives_hero_title" varchar DEFAULT 'Tous les billets, par année.';
  ALTER TABLE "site" ADD COLUMN "archives_hero_lede" varchar DEFAULT 'Le carnet est versionné : chaque billet a un numéro, une date de publication et, le cas échéant, une date de mise à jour. Les fiches thématiques sont régulièrement révisées.';
  ALTER TABLE "site" ADD COLUMN "themes_hero_title" varchar DEFAULT 'Les *thèmes* du carnet.';
  ALTER TABLE "site" ADD COLUMN "themes_hero_lede" varchar DEFAULT 'Chaque billet est rattaché à un ou plusieurs thèmes. La taxonomie est libre et évolue avec le carnet.';
  ALTER TABLE "site" ADD COLUMN "baseline" varchar DEFAULT 'Carnet de recherche. Auto-hébergé.';
  ALTER TABLE "site" ADD COLUMN "copyright_line" varchar DEFAULT 'CC BY-NC-SA 4.0';
  ALTER TABLE "site" ADD COLUMN "social_mastodon" varchar;
  ALTER TABLE "site" ADD COLUMN "social_bluesky" varchar;
  ALTER TABLE "site" ADD COLUMN "social_orcid" varchar;
  ALTER TABLE "site" ADD COLUMN "social_hal" varchar;
  ALTER TABLE "site_nav_footer" ADD CONSTRAINT "site_nav_footer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_nav_footer_order_idx" ON "site_nav_footer" USING btree ("_order");
  CREATE INDEX "site_nav_footer_parent_id_idx" ON "site_nav_footer" USING btree ("_parent_id");
  ALTER TABLE "posts" DROP COLUMN "notifications_sent_at";
  ALTER TABLE "posts" DROP COLUMN "search_vector";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscribers_id";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_navigation_blocks_nav_item_kind";
  DROP TYPE "public"."enum_navigation_blocks_nav_item_index_target";`)
}
