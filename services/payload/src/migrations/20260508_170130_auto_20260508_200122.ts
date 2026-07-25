import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_reading_notes_mode" AS ENUM('classic', 'sidenotes');
  ALTER TABLE "site" ADD COLUMN "reading_notes_mode" "enum_site_reading_notes_mode" DEFAULT 'classic';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site" DROP COLUMN "reading_notes_mode";
  DROP TYPE "public"."enum_site_reading_notes_mode";`)
}
