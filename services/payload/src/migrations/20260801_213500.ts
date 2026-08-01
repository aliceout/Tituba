import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { generatePublicId } from '../lib/public-id'

/** Tables de publication à doter d'un identifiant public. */
const TABLES = ['articles', 'analyses', 'actus', 'podcasts', 'outils'] as const

/**
 * Attribue un identifiant aux lignes déjà en base.
 *
 * Fait en JS et non en SQL : la génération réutilise ainsi exactement
 * l'alphabet de lib/public-id.ts, au lieu d'en dupliquer une variante en
 * pl/pgsql qui divergerait au premier ajustement. Un tirage SQL poserait
 * en plus un piège — une sous-requête non corrélée est évaluée une seule
 * fois, et toutes les lignes recevraient le même identifiant.
 *
 * Une nouvelle tentative en cas de collision : l'index unique vient
 * d'être posé, un doublon ferait échouer la migration entière.
 */
async function backfill({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    const rows = await db.execute(
      sql.raw(`SELECT id FROM "${table}" WHERE public_id IS NULL`),
    )
    for (const row of (rows.rows ?? []) as Array<{ id: number }>) {
      for (let essai = 0; essai < 10; essai++) {
        try {
          await db.execute(
            sql.raw(
              `UPDATE "${table}" SET public_id = '${generatePublicId()}' WHERE id = ${row.id}`,
            ),
          )
          break
        } catch {
          // Collision sur l'index unique — on retire.
        }
      }
    }
  }
}

export async function up(args: MigrateUpArgs): Promise<void> {
  const { db } = args
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "public_id" varchar;
  ALTER TABLE "analyses" ADD COLUMN "public_id" varchar;
  ALTER TABLE "actus" ADD COLUMN "public_id" varchar;
  ALTER TABLE "podcasts" ADD COLUMN "public_id" varchar;
  ALTER TABLE "outils" ADD COLUMN "public_id" varchar;
  CREATE UNIQUE INDEX "articles_public_id_idx" ON "articles" USING btree ("public_id");
  CREATE UNIQUE INDEX "analyses_public_id_idx" ON "analyses" USING btree ("public_id");
  CREATE UNIQUE INDEX "actus_public_id_idx" ON "actus" USING btree ("public_id");
  CREATE UNIQUE INDEX "podcasts_public_id_idx" ON "podcasts" USING btree ("public_id");
  CREATE UNIQUE INDEX "outils_public_id_idx" ON "outils" USING btree ("public_id");`)

  await backfill(args)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_public_id_idx";
  DROP INDEX "analyses_public_id_idx";
  DROP INDEX "actus_public_id_idx";
  DROP INDEX "podcasts_public_id_idx";
  DROP INDEX "outils_public_id_idx";
  ALTER TABLE "articles" DROP COLUMN "public_id";
  ALTER TABLE "analyses" DROP COLUMN "public_id";
  ALTER TABLE "actus" DROP COLUMN "public_id";
  ALTER TABLE "podcasts" DROP COLUMN "public_id";
  ALTER TABLE "outils" DROP COLUMN "public_id";`)
}
