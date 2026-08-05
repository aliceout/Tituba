import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fusion de la collection `audio` dans `media` : une seule médiathèque,
 * triée par type de fichier, au lieu de deux listes selon la nature de
 * ce qu'on a déposé.
 *
 * Cette migration ne déplace **que le schéma**. Elle table sur une
 * chose : nulle part encore l'audio n'a été déposé en production — la
 * collection y a été créée puis supprimée sans avoir jamais rien reçu,
 * et `podcasts.audio_id` n'y vaut donc que NULL. C'est ce qui permet
 * d'ajouter la contrainte vers `media` sans rien remapper.
 *
 * Si un jour cette hypothèse tombe (données réelles à reprendre), il
 * faudra deux choses que du SQL ne sait pas faire seul :
 *   1. recopier les lignes de `audio` dans `media` et repointer
 *      `podcasts.audio_id` sur les nouveaux identifiants, AVANT la
 *      contrainte ;
 *   2. déplacer les fichiers de `media/audio/` vers `media/` sur le
 *      volume monté — sans quoi la base référencerait des fichiers
 *      absents, sans la moindre erreur pour le signaler.
 * C'est exactement ce qui a été fait à la main sur la base de
 * développement, qui portait deux fichiers et un épisode.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "audio" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "audio" CASCADE;
  ALTER TABLE "podcasts" DROP CONSTRAINT "podcasts_audio_id_audio_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audio_fk";
  
  DROP INDEX "payload_locked_documents_rels_audio_id_idx";
  ALTER TABLE "media" ALTER COLUMN "alt" DROP NOT NULL;
  ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_audio_id_media_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audio_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "audio" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "podcasts" DROP CONSTRAINT "podcasts_audio_id_media_id_fk";
  
  ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audio_id" integer;
  CREATE INDEX "audio_updated_at_idx" ON "audio" USING btree ("updated_at");
  CREATE INDEX "audio_created_at_idx" ON "audio" USING btree ("created_at");
  CREATE UNIQUE INDEX "audio_filename_idx" ON "audio" USING btree ("filename");
  ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_audio_id_audio_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audio_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_audio_id_idx" ON "payload_locked_documents_rels" USING btree ("audio_id");`)
}
