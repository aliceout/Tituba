import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_series_format" AS ENUM('podcasts', 'articles', 'analyses');
  CREATE TYPE "public"."enum_series_feed_category" AS ENUM('Society & Culture', 'News', 'Science', 'Education', 'Arts', 'History', 'Health & Fitness');
  CREATE TABLE "series" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"format" "enum_series_format" NOT NULL,
  	"lede" varchar,
  	"image_id" integer,
  	"feed_category" "enum_series_feed_category",
  	"feed_explicit" boolean DEFAULT false,
  	"feed_owner_email" varchar,
  	"draft" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "articles" ADD COLUMN "series_id" integer;
  ALTER TABLE "articles" ADD COLUMN "series_number" numeric;
  ALTER TABLE "analyses" ADD COLUMN "series_id" integer;
  ALTER TABLE "analyses" ADD COLUMN "series_number" numeric;
  ALTER TABLE "podcasts" ADD COLUMN "series_id" integer;
  ALTER TABLE "podcasts" ADD COLUMN "series_number" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "series_id" integer;
  ALTER TABLE "series" ADD CONSTRAINT "series_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "series_slug_idx" ON "series" USING btree ("slug");
  CREATE INDEX "series_format_idx" ON "series" USING btree ("format");
  CREATE INDEX "series_image_idx" ON "series" USING btree ("image_id");
  CREATE INDEX "series_updated_at_idx" ON "series" USING btree ("updated_at");
  CREATE INDEX "series_created_at_idx" ON "series" USING btree ("created_at");
  ALTER TABLE "articles" ADD CONSTRAINT "articles_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_series_idx" ON "articles" USING btree ("series_id");
  CREATE INDEX "analyses_series_idx" ON "analyses" USING btree ("series_id");
  CREATE INDEX "podcasts_series_idx" ON "podcasts" USING btree ("series_id");
  CREATE INDEX "payload_locked_documents_rels_series_id_idx" ON "payload_locked_documents_rels" USING btree ("series_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "series" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "series" CASCADE;
  ALTER TABLE "articles" DROP CONSTRAINT "articles_series_id_series_id_fk";
  
  ALTER TABLE "analyses" DROP CONSTRAINT "analyses_series_id_series_id_fk";
  
  ALTER TABLE "podcasts" DROP CONSTRAINT "podcasts_series_id_series_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_series_fk";
  
  DROP INDEX "articles_series_idx";
  DROP INDEX "analyses_series_idx";
  DROP INDEX "podcasts_series_idx";
  DROP INDEX "payload_locked_documents_rels_series_id_idx";
  ALTER TABLE "articles" DROP COLUMN "series_id";
  ALTER TABLE "articles" DROP COLUMN "series_number";
  ALTER TABLE "analyses" DROP COLUMN "series_id";
  ALTER TABLE "analyses" DROP COLUMN "series_number";
  ALTER TABLE "podcasts" DROP COLUMN "series_id";
  ALTER TABLE "podcasts" DROP COLUMN "series_number";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "series_id";
  DROP TYPE "public"."enum_series_format";
  DROP TYPE "public"."enum_series_feed_category";`)
}
