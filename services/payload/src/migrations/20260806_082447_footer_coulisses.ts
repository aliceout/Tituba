import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "navigation_nav_footer_coulisses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"external" boolean DEFAULT false
  );
  
  ALTER TABLE "navigation_nav_footer_coulisses" ADD CONSTRAINT "navigation_nav_footer_coulisses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navigation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "navigation_nav_footer_coulisses_order_idx" ON "navigation_nav_footer_coulisses" USING btree ("_order");
  CREATE INDEX "navigation_nav_footer_coulisses_parent_id_idx" ON "navigation_nav_footer_coulisses" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "navigation_nav_footer_coulisses" CASCADE;`)
}
