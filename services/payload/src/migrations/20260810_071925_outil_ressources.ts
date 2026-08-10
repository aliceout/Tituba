import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "outils_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"fichier_id" integer NOT NULL,
  	"description" varchar
  );
  
  ALTER TABLE "outils_rels" DROP CONSTRAINT "outils_rels_media_fk";
  
  DROP INDEX "outils_rels_media_id_idx";
  ALTER TABLE "outils_resources" ADD CONSTRAINT "outils_resources_fichier_id_media_id_fk" FOREIGN KEY ("fichier_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "outils_resources" ADD CONSTRAINT "outils_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."outils"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "outils_resources_order_idx" ON "outils_resources" USING btree ("_order");
  CREATE INDEX "outils_resources_parent_id_idx" ON "outils_resources" USING btree ("_parent_id");
  CREATE INDEX "outils_resources_fichier_idx" ON "outils_resources" USING btree ("fichier_id");
  ALTER TABLE "outils_rels" DROP COLUMN "media_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "outils_resources" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "outils_resources" CASCADE;
  ALTER TABLE "outils_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "outils_rels" ADD CONSTRAINT "outils_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "outils_rels_media_id_idx" ON "outils_rels" USING btree ("media_id");`)
}
