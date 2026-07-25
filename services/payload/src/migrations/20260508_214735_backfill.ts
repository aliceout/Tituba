import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_authors_kind" AS ENUM('user', 'external');
  CREATE TYPE "public"."enum_bibliography_authors_role" AS ENUM('author', 'editor', 'translator');
  CREATE TYPE "public"."enum_bibliography_source" AS ENUM('manual', 'zotero');
  CREATE TYPE "public"."enum_users_zotero_library_type" AS ENUM('user', 'group');
  CREATE TABLE "posts_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_posts_authors_kind" DEFAULT 'user' NOT NULL,
  	"user_id" integer,
  	"name" varchar,
  	"affiliation" varchar
  );
  
  CREATE TABLE "bibliography_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"last_name" varchar NOT NULL,
  	"first_name" varchar,
  	"role" "enum_bibliography_authors_role" DEFAULT 'author' NOT NULL
  );
  
  ALTER TABLE "bibliography" ADD COLUMN "source" "enum_bibliography_source" DEFAULT 'manual' NOT NULL;
  ALTER TABLE "bibliography" ADD COLUMN "zotero_key" varchar;
  ALTER TABLE "bibliography" ADD COLUMN "zotero_version" numeric;
  ALTER TABLE "bibliography" ADD COLUMN "owner_id" integer;
  ALTER TABLE "bibliography" ADD COLUMN "author_label" varchar;
  ALTER TABLE "users" ADD COLUMN "citation_format" varchar;
  ALTER TABLE "users" ADD COLUMN "zotero_api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "zotero_library_id" varchar;
  ALTER TABLE "users" ADD COLUMN "zotero_library_type" "enum_users_zotero_library_type" DEFAULT 'user';
  ALTER TABLE "users" ADD COLUMN "zotero_last_sync_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "zotero_last_sync_version" numeric;
  ALTER TABLE "users" ADD COLUMN "zotero_last_sync_added" numeric;
  ALTER TABLE "users" ADD COLUMN "zotero_last_sync_updated" numeric;
  ALTER TABLE "users" ADD COLUMN "zotero_last_sync_error" varchar;
  ALTER TABLE "media" ADD COLUMN "title" varchar;
  ALTER TABLE "posts_authors" ADD CONSTRAINT "posts_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_authors" ADD CONSTRAINT "posts_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bibliography_authors" ADD CONSTRAINT "bibliography_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bibliography"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_authors_order_idx" ON "posts_authors" USING btree ("_order");
  CREATE INDEX "posts_authors_parent_id_idx" ON "posts_authors" USING btree ("_parent_id");
  CREATE INDEX "posts_authors_user_idx" ON "posts_authors" USING btree ("user_id");
  CREATE INDEX "bibliography_authors_order_idx" ON "bibliography_authors" USING btree ("_order");
  CREATE INDEX "bibliography_authors_parent_id_idx" ON "bibliography_authors" USING btree ("_parent_id");
  ALTER TABLE "bibliography" ADD CONSTRAINT "bibliography_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bibliography_zotero_key_idx" ON "bibliography" USING btree ("zotero_key");
  CREATE INDEX "bibliography_owner_idx" ON "bibliography" USING btree ("owner_id");
  ALTER TABLE "bibliography" DROP COLUMN "author";
  ALTER TABLE "site" DROP COLUMN "identity_author_citation";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_authors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bibliography_authors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_authors" CASCADE;
  DROP TABLE "bibliography_authors" CASCADE;
  ALTER TABLE "bibliography" DROP CONSTRAINT "bibliography_owner_id_users_id_fk";
  
  DROP INDEX "bibliography_zotero_key_idx";
  DROP INDEX "bibliography_owner_idx";
  ALTER TABLE "bibliography" ADD COLUMN "author" varchar NOT NULL;
  ALTER TABLE "site" ADD COLUMN "identity_author_citation" varchar DEFAULT '';
  ALTER TABLE "bibliography" DROP COLUMN "source";
  ALTER TABLE "bibliography" DROP COLUMN "zotero_key";
  ALTER TABLE "bibliography" DROP COLUMN "zotero_version";
  ALTER TABLE "bibliography" DROP COLUMN "owner_id";
  ALTER TABLE "bibliography" DROP COLUMN "author_label";
  ALTER TABLE "users" DROP COLUMN "citation_format";
  ALTER TABLE "users" DROP COLUMN "zotero_api_key";
  ALTER TABLE "users" DROP COLUMN "zotero_library_id";
  ALTER TABLE "users" DROP COLUMN "zotero_library_type";
  ALTER TABLE "users" DROP COLUMN "zotero_last_sync_at";
  ALTER TABLE "users" DROP COLUMN "zotero_last_sync_version";
  ALTER TABLE "users" DROP COLUMN "zotero_last_sync_added";
  ALTER TABLE "users" DROP COLUMN "zotero_last_sync_updated";
  ALTER TABLE "users" DROP COLUMN "zotero_last_sync_error";
  ALTER TABLE "media" DROP COLUMN "title";
  DROP TYPE "public"."enum_posts_authors_kind";
  DROP TYPE "public"."enum_bibliography_authors_role";
  DROP TYPE "public"."enum_bibliography_source";
  DROP TYPE "public"."enum_users_zotero_library_type";`)
}
