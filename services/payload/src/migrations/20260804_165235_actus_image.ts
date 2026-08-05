import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "actus" ADD COLUMN "image_id" integer;
  ALTER TABLE "actus" ADD CONSTRAINT "actus_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "actus_image_idx" ON "actus" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "actus" DROP CONSTRAINT "actus_image_id_media_id_fk";
  
  DROP INDEX "actus_image_idx";
  ALTER TABLE "actus" DROP COLUMN "image_id";`)
}
