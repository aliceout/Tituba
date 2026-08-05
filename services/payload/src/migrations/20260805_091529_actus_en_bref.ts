import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "actus_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar
  );
  
  ALTER TABLE "actus" ADD COLUMN "en_bref" varchar;
  ALTER TABLE "actus_sources" ADD CONSTRAINT "actus_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."actus"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "actus_sources_order_idx" ON "actus_sources" USING btree ("_order");
  CREATE INDEX "actus_sources_parent_id_idx" ON "actus_sources" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "actus_sources" CASCADE;
  ALTER TABLE "actus" DROP COLUMN "en_bref";`)
}
