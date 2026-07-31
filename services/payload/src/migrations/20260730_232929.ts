import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "analyses" ADD COLUMN "image_id" integer;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "analyses_image_idx" ON "analyses" USING btree ("image_id");
  ALTER TABLE "index_pages" DROP COLUMN "home_layout";
  DROP TYPE "public"."enum_index_pages_home_layout";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_pages_home_layout" AS ENUM('flux', 'une');
  ALTER TABLE "analyses" DROP CONSTRAINT "analyses_image_id_media_id_fk";
  
  DROP INDEX "analyses_image_idx";
  ALTER TABLE "index_pages" ADD COLUMN "home_layout" "enum_index_pages_home_layout" DEFAULT 'flux';
  ALTER TABLE "analyses" DROP COLUMN "image_id";`)
}
