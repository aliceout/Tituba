import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_subscribers_rythmes" AS ENUM('newsletter', 'publications');
  CREATE TABLE "subscribers_rythmes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_subscribers_rythmes",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "subscribers_rythmes" ADD CONSTRAINT "subscribers_rythmes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "subscribers_rythmes_order_idx" ON "subscribers_rythmes" USING btree ("order");
  CREATE INDEX "subscribers_rythmes_parent_idx" ON "subscribers_rythmes" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "subscribers_rythmes" CASCADE;
  DROP TYPE "public"."enum_subscribers_rythmes";`)
}
