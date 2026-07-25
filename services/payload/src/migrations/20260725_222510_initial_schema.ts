import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_analyses_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_actus_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_podcasts_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_outils_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_outils_audience" AS ENUM('tous', 'militantes', 'pros', 'structures');
  CREATE TYPE "public"."enum_bibliography_authors_role" AS ENUM('author', 'editor', 'translator');
  CREATE TYPE "public"."enum_bibliography_type" AS ENUM('book', 'chapter', 'article', 'paper', 'web', 'other');
  CREATE TYPE "public"."enum_bibliography_source" AS ENUM('manual', 'zotero');
  CREATE TYPE "public"."enum_pages_blocks_figure_align" AS ENUM('left', 'center', 'wide');
  CREATE TYPE "public"."enum_users_role" AS ENUM('root', 'admin', 'editor');
  CREATE TYPE "public"."enum_users_status" AS ENUM('pending', 'active', 'disabled');
  CREATE TYPE "public"."enum_users_zotero_library_type" AS ENUM('user', 'group');
  CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'active', 'unsubscribed');
  CREATE TYPE "public"."enum_site_branding_accent_color" AS ENUM('#5a3a7a', '#8a3a3a', '#1f3a5a', '#3a3a3a', '#2d5a3d');
  CREATE TYPE "public"."enum_site_branding_background_color" AS ENUM('#f6f5f1', '#fdfcf8', '#ffffff', '#f1efe8', '#eee9dd', '#e9eaec');
  CREATE TYPE "public"."enum_site_reading_notes_mode" AS ENUM('classic', 'sidenotes');
  CREATE TYPE "public"."enum_navigation_blocks_nav_item_kind" AS ENUM('index', 'editorial');
  CREATE TYPE "public"."enum_navigation_blocks_nav_item_index_target" AS ENUM('archives', 'themes', 'subscribe');
  CREATE TABLE "articles_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_articles_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lede" varchar NOT NULL,
  	"body" jsonb NOT NULL,
  	"doi" varchar,
  	"reading_time" numeric,
  	"id_carnet" varchar,
  	"draft" boolean DEFAULT false,
  	"notifications_sent_at" timestamp(3) with time zone,
  	"has_draft_zones" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"search_vector" "tsvector"
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer
  );
  
  CREATE TABLE "analyses_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_analyses_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "analyses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lede" varchar NOT NULL,
  	"body" jsonb NOT NULL,
  	"reading_time" numeric,
  	"id_carnet" varchar,
  	"draft" boolean DEFAULT false,
  	"notifications_sent_at" timestamp(3) with time zone,
  	"has_draft_zones" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"search_vector" "tsvector"
  );
  
  CREATE TABLE "analyses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer
  );
  
  CREATE TABLE "actus_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_actus_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "actus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lede" varchar NOT NULL,
  	"body" jsonb NOT NULL,
  	"reading_time" numeric,
  	"id_carnet" varchar,
  	"draft" boolean DEFAULT false,
  	"notifications_sent_at" timestamp(3) with time zone,
  	"has_draft_zones" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"search_vector" "tsvector"
  );
  
  CREATE TABLE "actus_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer
  );
  
  CREATE TABLE "podcasts_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_podcasts_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "podcasts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lede" varchar NOT NULL,
  	"body" jsonb,
  	"audio_url" varchar NOT NULL,
  	"duration_seconds" numeric,
  	"guests" varchar,
  	"reading_time" numeric,
  	"id_carnet" varchar,
  	"draft" boolean DEFAULT false,
  	"notifications_sent_at" timestamp(3) with time zone,
  	"has_draft_zones" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"search_vector" "tsvector"
  );
  
  CREATE TABLE "podcasts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer
  );
  
  CREATE TABLE "outils_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_outils_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "outils" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"lede" varchar NOT NULL,
  	"body" jsonb,
  	"resource_url" varchar NOT NULL,
  	"audience" "enum_outils_audience" DEFAULT 'tous',
  	"reading_time" numeric,
  	"id_carnet" varchar,
  	"draft" boolean DEFAULT false,
  	"notifications_sent_at" timestamp(3) with time zone,
  	"has_draft_zones" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"search_vector" "tsvector"
  );
  
  CREATE TABLE "outils_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer
  );
  
  CREATE TABLE "themes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bibliography_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"last_name" varchar NOT NULL,
  	"first_name" varchar,
  	"role" "enum_bibliography_authors_role" DEFAULT 'author' NOT NULL
  );
  
  CREATE TABLE "bibliography" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"type" "enum_bibliography_type" DEFAULT 'book' NOT NULL,
  	"year" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"publisher" varchar,
  	"place" varchar,
  	"volume" varchar,
  	"journal" varchar,
  	"pages" varchar,
  	"url" varchar,
  	"doi" varchar,
  	"annotation" varchar,
  	"source" "enum_bibliography_source" DEFAULT 'manual' NOT NULL,
  	"zotero_key" varchar,
  	"zotero_version" numeric,
  	"owner_id" integer,
  	"author_label" varchar,
  	"display_label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_blocks_prose" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"content" jsonb NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_figure" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"legende" varchar,
  	"credit" varchar,
  	"align" "enum_pages_blocks_figure_align" DEFAULT 'left',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_citation_bloc" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"source" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"noindex" boolean DEFAULT false,
  	"eyebrow" varchar,
  	"lede" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_trusted_devices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"device_id" varchar NOT NULL,
  	"fingerprint_hash" varchar NOT NULL,
  	"label" varchar,
  	"user_agent" varchar,
  	"ip" varchar,
  	"created_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"display_name" varchar,
  	"citation_format" varchar,
  	"role" "enum_users_role" NOT NULL,
  	"status" "enum_users_status" DEFAULT 'active',
  	"invitation_token_hash" varchar,
  	"invitation_expires_at" timestamp(3) with time zone,
  	"invitation_invited_by_id" integer,
  	"invitation_invited_at" timestamp(3) with time zone,
  	"two_factor_email_code_hash" varchar,
  	"two_factor_email_code_expires_at" timestamp(3) with time zone,
  	"two_factor_email_code_attempts" numeric DEFAULT 0,
  	"last_activity_at" timestamp(3) with time zone,
  	"last_login_at" timestamp(3) with time zone,
  	"zotero_api_key" varchar,
  	"zotero_library_id" varchar,
  	"zotero_library_type" "enum_users_zotero_library_type" DEFAULT 'user',
  	"zotero_last_sync_at" timestamp(3) with time zone,
  	"zotero_last_sync_version" numeric,
  	"zotero_last_sync_added" numeric,
  	"zotero_last_sync_updated" numeric,
  	"zotero_last_sync_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
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
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"articles_id" integer,
  	"analyses_id" integer,
  	"actus_id" integer,
  	"podcasts_id" integer,
  	"outils_id" integer,
  	"themes_id" integer,
  	"tags_id" integer,
  	"bibliography_id" integer,
  	"pages_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"subscribers_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"branding_accent_color" "enum_site_branding_accent_color" DEFAULT '#5a3a7a',
  	"branding_background_color" "enum_site_branding_background_color" DEFAULT '#f6f5f1',
  	"reading_notes_mode" "enum_site_reading_notes_mode" DEFAULT 'classic',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
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
  
  CREATE TABLE "identity" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_name" varchar DEFAULT 'Tituba',
  	"author_name" varchar DEFAULT '',
  	"baseline" varchar DEFAULT 'Collectif féministe intersectionnel. Auto-hébergé.',
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
  
  ALTER TABLE "articles_authors" ADD CONSTRAINT "articles_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_authors" ADD CONSTRAINT "articles_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses_authors" ADD CONSTRAINT "analyses_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analyses_authors" ADD CONSTRAINT "analyses_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses_rels" ADD CONSTRAINT "analyses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses_rels" ADD CONSTRAINT "analyses_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses_rels" ADD CONSTRAINT "analyses_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses_rels" ADD CONSTRAINT "analyses_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "actus_authors" ADD CONSTRAINT "actus_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "actus_authors" ADD CONSTRAINT "actus_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."actus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "actus_rels" ADD CONSTRAINT "actus_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."actus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "actus_rels" ADD CONSTRAINT "actus_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "actus_rels" ADD CONSTRAINT "actus_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "actus_rels" ADD CONSTRAINT "actus_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcasts_authors" ADD CONSTRAINT "podcasts_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcasts_authors" ADD CONSTRAINT "podcasts_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcasts_rels" ADD CONSTRAINT "podcasts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcasts_rels" ADD CONSTRAINT "podcasts_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcasts_rels" ADD CONSTRAINT "podcasts_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "podcasts_rels" ADD CONSTRAINT "podcasts_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "outils_authors" ADD CONSTRAINT "outils_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "outils_authors" ADD CONSTRAINT "outils_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."outils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "outils_rels" ADD CONSTRAINT "outils_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."outils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "outils_rels" ADD CONSTRAINT "outils_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "outils_rels" ADD CONSTRAINT "outils_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "outils_rels" ADD CONSTRAINT "outils_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bibliography_authors" ADD CONSTRAINT "bibliography_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bibliography" ADD CONSTRAINT "bibliography_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_prose" ADD CONSTRAINT "pages_blocks_prose_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_figure" ADD CONSTRAINT "pages_blocks_figure_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_figure" ADD CONSTRAINT "pages_blocks_figure_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_citation_bloc" ADD CONSTRAINT "pages_blocks_citation_bloc_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_trusted_devices" ADD CONSTRAINT "users_trusted_devices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_invitation_invited_by_id_users_id_fk" FOREIGN KEY ("invitation_invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analyses_fk" FOREIGN KEY ("analyses_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_actus_fk" FOREIGN KEY ("actus_id") REFERENCES "public"."actus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_podcasts_fk" FOREIGN KEY ("podcasts_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_outils_fk" FOREIGN KEY ("outils_id") REFERENCES "public"."outils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_themes_fk" FOREIGN KEY ("themes_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bibliography_fk" FOREIGN KEY ("bibliography_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navigation_blocks_nav_item" ADD CONSTRAINT "navigation_blocks_nav_item_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "navigation_blocks_nav_item" ADD CONSTRAINT "navigation_blocks_nav_item_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navigation_nav_footer" ADD CONSTRAINT "navigation_nav_footer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_authors_order_idx" ON "articles_authors" USING btree ("_order");
  CREATE INDEX "articles_authors_parent_id_idx" ON "articles_authors" USING btree ("_parent_id");
  CREATE INDEX "articles_authors_user_idx" ON "articles_authors" USING btree ("user_id");
  CREATE UNIQUE INDEX "articles_numero_idx" ON "articles" USING btree ("numero");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE INDEX "articles_has_draft_zones_idx" ON "articles" USING btree ("has_draft_zones");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles_search_vector_idx" ON "articles" USING gin ("search_vector");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_themes_id_idx" ON "articles_rels" USING btree ("themes_id");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "articles_rels_bibliography_id_idx" ON "articles_rels" USING btree ("bibliography_id");
  CREATE INDEX "analyses_authors_order_idx" ON "analyses_authors" USING btree ("_order");
  CREATE INDEX "analyses_authors_parent_id_idx" ON "analyses_authors" USING btree ("_parent_id");
  CREATE INDEX "analyses_authors_user_idx" ON "analyses_authors" USING btree ("user_id");
  CREATE UNIQUE INDEX "analyses_numero_idx" ON "analyses" USING btree ("numero");
  CREATE UNIQUE INDEX "analyses_slug_idx" ON "analyses" USING btree ("slug");
  CREATE INDEX "analyses_has_draft_zones_idx" ON "analyses" USING btree ("has_draft_zones");
  CREATE INDEX "analyses_updated_at_idx" ON "analyses" USING btree ("updated_at");
  CREATE INDEX "analyses_created_at_idx" ON "analyses" USING btree ("created_at");
  CREATE INDEX "analyses_search_vector_idx" ON "analyses" USING gin ("search_vector");
  CREATE INDEX "analyses_rels_order_idx" ON "analyses_rels" USING btree ("order");
  CREATE INDEX "analyses_rels_parent_idx" ON "analyses_rels" USING btree ("parent_id");
  CREATE INDEX "analyses_rels_path_idx" ON "analyses_rels" USING btree ("path");
  CREATE INDEX "analyses_rels_themes_id_idx" ON "analyses_rels" USING btree ("themes_id");
  CREATE INDEX "analyses_rels_tags_id_idx" ON "analyses_rels" USING btree ("tags_id");
  CREATE INDEX "analyses_rels_bibliography_id_idx" ON "analyses_rels" USING btree ("bibliography_id");
  CREATE INDEX "actus_authors_order_idx" ON "actus_authors" USING btree ("_order");
  CREATE INDEX "actus_authors_parent_id_idx" ON "actus_authors" USING btree ("_parent_id");
  CREATE INDEX "actus_authors_user_idx" ON "actus_authors" USING btree ("user_id");
  CREATE UNIQUE INDEX "actus_numero_idx" ON "actus" USING btree ("numero");
  CREATE UNIQUE INDEX "actus_slug_idx" ON "actus" USING btree ("slug");
  CREATE INDEX "actus_has_draft_zones_idx" ON "actus" USING btree ("has_draft_zones");
  CREATE INDEX "actus_updated_at_idx" ON "actus" USING btree ("updated_at");
  CREATE INDEX "actus_created_at_idx" ON "actus" USING btree ("created_at");
  CREATE INDEX "actus_search_vector_idx" ON "actus" USING gin ("search_vector");
  CREATE INDEX "actus_rels_order_idx" ON "actus_rels" USING btree ("order");
  CREATE INDEX "actus_rels_parent_idx" ON "actus_rels" USING btree ("parent_id");
  CREATE INDEX "actus_rels_path_idx" ON "actus_rels" USING btree ("path");
  CREATE INDEX "actus_rels_themes_id_idx" ON "actus_rels" USING btree ("themes_id");
  CREATE INDEX "actus_rels_tags_id_idx" ON "actus_rels" USING btree ("tags_id");
  CREATE INDEX "actus_rels_bibliography_id_idx" ON "actus_rels" USING btree ("bibliography_id");
  CREATE INDEX "podcasts_authors_order_idx" ON "podcasts_authors" USING btree ("_order");
  CREATE INDEX "podcasts_authors_parent_id_idx" ON "podcasts_authors" USING btree ("_parent_id");
  CREATE INDEX "podcasts_authors_user_idx" ON "podcasts_authors" USING btree ("user_id");
  CREATE UNIQUE INDEX "podcasts_numero_idx" ON "podcasts" USING btree ("numero");
  CREATE UNIQUE INDEX "podcasts_slug_idx" ON "podcasts" USING btree ("slug");
  CREATE INDEX "podcasts_has_draft_zones_idx" ON "podcasts" USING btree ("has_draft_zones");
  CREATE INDEX "podcasts_updated_at_idx" ON "podcasts" USING btree ("updated_at");
  CREATE INDEX "podcasts_created_at_idx" ON "podcasts" USING btree ("created_at");
  CREATE INDEX "podcasts_search_vector_idx" ON "podcasts" USING gin ("search_vector");
  CREATE INDEX "podcasts_rels_order_idx" ON "podcasts_rels" USING btree ("order");
  CREATE INDEX "podcasts_rels_parent_idx" ON "podcasts_rels" USING btree ("parent_id");
  CREATE INDEX "podcasts_rels_path_idx" ON "podcasts_rels" USING btree ("path");
  CREATE INDEX "podcasts_rels_themes_id_idx" ON "podcasts_rels" USING btree ("themes_id");
  CREATE INDEX "podcasts_rels_tags_id_idx" ON "podcasts_rels" USING btree ("tags_id");
  CREATE INDEX "podcasts_rels_bibliography_id_idx" ON "podcasts_rels" USING btree ("bibliography_id");
  CREATE INDEX "outils_authors_order_idx" ON "outils_authors" USING btree ("_order");
  CREATE INDEX "outils_authors_parent_id_idx" ON "outils_authors" USING btree ("_parent_id");
  CREATE INDEX "outils_authors_user_idx" ON "outils_authors" USING btree ("user_id");
  CREATE UNIQUE INDEX "outils_numero_idx" ON "outils" USING btree ("numero");
  CREATE UNIQUE INDEX "outils_slug_idx" ON "outils" USING btree ("slug");
  CREATE INDEX "outils_has_draft_zones_idx" ON "outils" USING btree ("has_draft_zones");
  CREATE INDEX "outils_updated_at_idx" ON "outils" USING btree ("updated_at");
  CREATE INDEX "outils_created_at_idx" ON "outils" USING btree ("created_at");
  CREATE INDEX "outils_search_vector_idx" ON "outils" USING gin ("search_vector");
  CREATE INDEX "outils_rels_order_idx" ON "outils_rels" USING btree ("order");
  CREATE INDEX "outils_rels_parent_idx" ON "outils_rels" USING btree ("parent_id");
  CREATE INDEX "outils_rels_path_idx" ON "outils_rels" USING btree ("path");
  CREATE INDEX "outils_rels_themes_id_idx" ON "outils_rels" USING btree ("themes_id");
  CREATE INDEX "outils_rels_tags_id_idx" ON "outils_rels" USING btree ("tags_id");
  CREATE INDEX "outils_rels_bibliography_id_idx" ON "outils_rels" USING btree ("bibliography_id");
  CREATE UNIQUE INDEX "themes_slug_idx" ON "themes" USING btree ("slug");
  CREATE INDEX "themes_updated_at_idx" ON "themes" USING btree ("updated_at");
  CREATE INDEX "themes_created_at_idx" ON "themes" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "bibliography_authors_order_idx" ON "bibliography_authors" USING btree ("_order");
  CREATE INDEX "bibliography_authors_parent_id_idx" ON "bibliography_authors" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "bibliography_slug_idx" ON "bibliography" USING btree ("slug");
  CREATE INDEX "bibliography_zotero_key_idx" ON "bibliography" USING btree ("zotero_key");
  CREATE INDEX "bibliography_owner_idx" ON "bibliography" USING btree ("owner_id");
  CREATE INDEX "bibliography_updated_at_idx" ON "bibliography" USING btree ("updated_at");
  CREATE INDEX "bibliography_created_at_idx" ON "bibliography" USING btree ("created_at");
  CREATE INDEX "pages_blocks_prose_order_idx" ON "pages_blocks_prose" USING btree ("_order");
  CREATE INDEX "pages_blocks_prose_parent_id_idx" ON "pages_blocks_prose" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_prose_path_idx" ON "pages_blocks_prose" USING btree ("_path");
  CREATE INDEX "pages_blocks_figure_order_idx" ON "pages_blocks_figure" USING btree ("_order");
  CREATE INDEX "pages_blocks_figure_parent_id_idx" ON "pages_blocks_figure" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_figure_path_idx" ON "pages_blocks_figure" USING btree ("_path");
  CREATE INDEX "pages_blocks_figure_image_idx" ON "pages_blocks_figure" USING btree ("image_id");
  CREATE INDEX "pages_blocks_citation_bloc_order_idx" ON "pages_blocks_citation_bloc" USING btree ("_order");
  CREATE INDEX "pages_blocks_citation_bloc_parent_id_idx" ON "pages_blocks_citation_bloc" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_citation_bloc_path_idx" ON "pages_blocks_citation_bloc" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "users_trusted_devices_order_idx" ON "users_trusted_devices" USING btree ("_order");
  CREATE INDEX "users_trusted_devices_parent_id_idx" ON "users_trusted_devices" USING btree ("_parent_id");
  CREATE INDEX "users_invitation_invitation_token_hash_idx" ON "users" USING btree ("invitation_token_hash");
  CREATE INDEX "users_invitation_invitation_invited_by_idx" ON "users" USING btree ("invitation_invited_by_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_analyses_id_idx" ON "payload_locked_documents_rels" USING btree ("analyses_id");
  CREATE INDEX "payload_locked_documents_rels_actus_id_idx" ON "payload_locked_documents_rels" USING btree ("actus_id");
  CREATE INDEX "payload_locked_documents_rels_podcasts_id_idx" ON "payload_locked_documents_rels" USING btree ("podcasts_id");
  CREATE INDEX "payload_locked_documents_rels_outils_id_idx" ON "payload_locked_documents_rels" USING btree ("outils_id");
  CREATE INDEX "payload_locked_documents_rels_themes_id_idx" ON "payload_locked_documents_rels" USING btree ("themes_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_bibliography_id_idx" ON "payload_locked_documents_rels" USING btree ("bibliography_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "navigation_blocks_nav_item_order_idx" ON "navigation_blocks_nav_item" USING btree ("_order");
  CREATE INDEX "navigation_blocks_nav_item_parent_id_idx" ON "navigation_blocks_nav_item" USING btree ("_parent_id");
  CREATE INDEX "navigation_blocks_nav_item_path_idx" ON "navigation_blocks_nav_item" USING btree ("_path");
  CREATE INDEX "navigation_blocks_nav_item_page_idx" ON "navigation_blocks_nav_item" USING btree ("page_id");
  CREATE INDEX "navigation_nav_footer_order_idx" ON "navigation_nav_footer" USING btree ("_order");
  CREATE INDEX "navigation_nav_footer_parent_id_idx" ON "navigation_nav_footer" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "articles_authors" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "analyses_authors" CASCADE;
  DROP TABLE "analyses" CASCADE;
  DROP TABLE "analyses_rels" CASCADE;
  DROP TABLE "actus_authors" CASCADE;
  DROP TABLE "actus" CASCADE;
  DROP TABLE "actus_rels" CASCADE;
  DROP TABLE "podcasts_authors" CASCADE;
  DROP TABLE "podcasts" CASCADE;
  DROP TABLE "podcasts_rels" CASCADE;
  DROP TABLE "outils_authors" CASCADE;
  DROP TABLE "outils" CASCADE;
  DROP TABLE "outils_rels" CASCADE;
  DROP TABLE "themes" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "bibliography_authors" CASCADE;
  DROP TABLE "bibliography" CASCADE;
  DROP TABLE "pages_blocks_prose" CASCADE;
  DROP TABLE "pages_blocks_figure" CASCADE;
  DROP TABLE "pages_blocks_citation_bloc" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "users_trusted_devices" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site" CASCADE;
  DROP TABLE "navigation_blocks_nav_item" CASCADE;
  DROP TABLE "navigation_nav_footer" CASCADE;
  DROP TABLE "navigation" CASCADE;
  DROP TABLE "index_pages" CASCADE;
  DROP TABLE "identity" CASCADE;
  DROP TABLE "subscriptions" CASCADE;
  DROP TYPE "public"."enum_articles_authors_kind";
  DROP TYPE "public"."enum_analyses_authors_kind";
  DROP TYPE "public"."enum_actus_authors_kind";
  DROP TYPE "public"."enum_podcasts_authors_kind";
  DROP TYPE "public"."enum_outils_authors_kind";
  DROP TYPE "public"."enum_outils_audience";
  DROP TYPE "public"."enum_bibliography_authors_role";
  DROP TYPE "public"."enum_bibliography_type";
  DROP TYPE "public"."enum_bibliography_source";
  DROP TYPE "public"."enum_pages_blocks_figure_align";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_users_zotero_library_type";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_site_branding_accent_color";
  DROP TYPE "public"."enum_site_branding_background_color";
  DROP TYPE "public"."enum_site_reading_notes_mode";
  DROP TYPE "public"."enum_navigation_blocks_nav_item_kind";
  DROP TYPE "public"."enum_navigation_blocks_nav_item_index_target";`)
}
