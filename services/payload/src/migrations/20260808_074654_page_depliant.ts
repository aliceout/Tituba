import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pages_blocks_depliant" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titre" varchar,
  	"ouvert" boolean DEFAULT false,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_depliant" ADD CONSTRAINT "pages_blocks_depliant_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_depliant_order_idx" ON "pages_blocks_depliant" USING btree ("_order");
  CREATE INDEX "pages_blocks_depliant_parent_id_idx" ON "pages_blocks_depliant" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_depliant_path_idx" ON "pages_blocks_depliant" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_depliant" CASCADE;`)
}
