import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "has_draft_zones" boolean DEFAULT false;
  CREATE INDEX "posts_has_draft_zones_idx" ON "posts" USING btree ("has_draft_zones");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "posts_has_draft_zones_idx";
  ALTER TABLE "posts" DROP COLUMN "has_draft_zones";`)
}
