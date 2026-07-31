import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "unsplash_photo_id" varchar;
  ALTER TABLE "media" ADD COLUMN "unsplash_photographer_name" varchar;
  ALTER TABLE "media" ADD COLUMN "unsplash_photographer_profile_url" varchar;
  ALTER TABLE "media" ADD COLUMN "unsplash_photo_page_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "unsplash_photo_id";
  ALTER TABLE "media" DROP COLUMN "unsplash_photographer_name";
  ALTER TABLE "media" DROP COLUMN "unsplash_photographer_profile_url";
  ALTER TABLE "media" DROP COLUMN "unsplash_photo_page_url";`)
}
