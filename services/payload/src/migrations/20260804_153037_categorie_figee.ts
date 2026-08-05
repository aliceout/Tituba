import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "series" DROP COLUMN "feed_category";
  ALTER TABLE "subscriptions" DROP COLUMN "podcast_category";
  DROP TYPE "public"."enum_series_feed_category";
  DROP TYPE "public"."enum_subscriptions_podcast_category";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_series_feed_category" AS ENUM('Society & Culture', 'News', 'Science', 'Education', 'Arts', 'History', 'Health & Fitness');
  CREATE TYPE "public"."enum_subscriptions_podcast_category" AS ENUM('Society & Culture', 'News', 'Science', 'Education', 'Arts', 'History', 'Health & Fitness');
  ALTER TABLE "series" ADD COLUMN "feed_category" "enum_series_feed_category";
  ALTER TABLE "subscriptions" ADD COLUMN "podcast_category" "enum_subscriptions_podcast_category" DEFAULT 'Society & Culture';`)
}
