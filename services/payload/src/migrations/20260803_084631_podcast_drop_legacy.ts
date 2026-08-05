import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscriptions_podcast_category" AS ENUM('Society & Culture', 'News', 'Science', 'Education', 'Arts', 'History', 'Health & Fitness');
  CREATE TABLE "audio" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
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
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audio_id" integer;
  ALTER TABLE "subscriptions" ADD COLUMN "podcast_cover_id" integer;
  ALTER TABLE "subscriptions" ADD COLUMN "podcast_category" "enum_subscriptions_podcast_category" DEFAULT 'Society & Culture';
  ALTER TABLE "subscriptions" ADD COLUMN "podcast_explicit" boolean DEFAULT false;
  ALTER TABLE "subscriptions" ADD COLUMN "podcast_owner_email" varchar;
  CREATE INDEX "audio_updated_at_idx" ON "audio" USING btree ("updated_at");
  CREATE INDEX "audio_created_at_idx" ON "audio" USING btree ("created_at");
  CREATE UNIQUE INDEX "audio_filename_idx" ON "audio" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audio_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_podcast_cover_id_media_id_fk" FOREIGN KEY ("podcast_cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_audio_id_idx" ON "payload_locked_documents_rels" USING btree ("audio_id");
  CREATE INDEX "subscriptions_podcast_cover_idx" ON "subscriptions" USING btree ("podcast_cover_id");
  ALTER TABLE "podcasts" DROP COLUMN "audio_url";
  ALTER TABLE "podcasts" DROP COLUMN "guests";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "audio" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "audio" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audio_fk";
  
  ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_podcast_cover_id_media_id_fk";
  
  DROP INDEX "payload_locked_documents_rels_audio_id_idx";
  DROP INDEX "subscriptions_podcast_cover_idx";
  ALTER TABLE "podcasts" ADD COLUMN "audio_url" varchar NOT NULL;
  ALTER TABLE "podcasts" ADD COLUMN "guests" varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audio_id";
  ALTER TABLE "subscriptions" DROP COLUMN "podcast_cover_id";
  ALTER TABLE "subscriptions" DROP COLUMN "podcast_category";
  ALTER TABLE "subscriptions" DROP COLUMN "podcast_explicit";
  ALTER TABLE "subscriptions" DROP COLUMN "podcast_owner_email";
  DROP TYPE "public"."enum_subscriptions_podcast_category";`)
}
