import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "podcasts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "podcasts" ADD COLUMN "audio_id" integer;
  ALTER TABLE "podcasts_texts" ADD CONSTRAINT "podcasts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "podcasts_texts_order_parent" ON "podcasts_texts" USING btree ("order","parent_id");
  ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_audio_id_audio_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "podcasts_audio_idx" ON "podcasts" USING btree ("audio_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "podcasts_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "podcasts_texts" CASCADE;
  ALTER TABLE "podcasts" DROP CONSTRAINT "podcasts_audio_id_audio_id_fk";
  
  DROP INDEX "podcasts_audio_idx";
  ALTER TABLE "podcasts" DROP COLUMN "audio_id";`)
}
