import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "crop_x" numeric;
  ALTER TABLE "media" ADD COLUMN "crop_y" numeric;
  ALTER TABLE "media" ADD COLUMN "crop_w" numeric;
  ALTER TABLE "media" ADD COLUMN "crop_h" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "crop_x";
  ALTER TABLE "media" DROP COLUMN "crop_y";
  ALTER TABLE "media" DROP COLUMN "crop_w";
  ALTER TABLE "media" DROP COLUMN "crop_h";`)
}
