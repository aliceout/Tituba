import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "podcasts" ADD COLUMN "image_id" integer;
  ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "podcasts_image_idx" ON "podcasts" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "podcasts" DROP CONSTRAINT "podcasts_image_id_media_id_fk";
  
  DROP INDEX "podcasts_image_idx";
  ALTER TABLE "podcasts" DROP COLUMN "image_id";`)
}
