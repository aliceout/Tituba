import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "outils" ADD COLUMN "resource_id" integer NOT NULL;
  ALTER TABLE "outils" ADD CONSTRAINT "outils_resource_id_media_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "outils_resource_idx" ON "outils" USING btree ("resource_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "outils" DROP CONSTRAINT "outils_resource_id_media_id_fk";
  
  DROP INDEX "outils_resource_idx";
  ALTER TABLE "outils" DROP COLUMN "resource_id";`)
}
