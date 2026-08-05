/**
 * Rattache un fichier audio local à un épisode de podcast, pour
 * éprouver le lecteur et le flux sans passer par l'admin.
 *
 * Usage :
 *   pnpm --dir services/payload exec tsx scripts/seed-podcast-audio.ts \
 *     <chemin-du-mp3> [identifiant-public-de-l-épisode]
 *
 * Sans identifiant, prend l'épisode le plus récent. La durée n'est pas
 * relevée ici : c'est le navigateur qui la lit au dépôt (cf
 * AudioUploadField), un script n'a pas de décodeur audio sous la main.
 * On la passe donc en argument facultatif.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getPayload } from 'payload';

import config from '../src/payload.config';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed-podcast-audio] refus : NODE_ENV=production.');
  process.exit(1);
}

const [, , fichier, publicId, dureeArg] = process.argv;

if (!fichier || !fs.existsSync(fichier)) {
  console.error(`[seed-podcast-audio] fichier introuvable : ${fichier}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  const data = fs.readFileSync(fichier);
  const nom = path.basename(fichier);

  // Les épisodes vivent dans `media` avec les images depuis la fusion
  // des deux collections. `alt` explicitement vide : la colonne est
  // NOT NULL, et la validation ne l'exige que pour une image (cf Media.ts).
  const audio = await payload.create({
    collection: 'media',
    data: { title: nom, alt: '' },
    file: {
      data,
      mimetype: 'audio/mpeg',
      name: nom,
      size: data.byteLength,
    },
    overrideAccess: true,
  });
  console.log(`audio créé : #${audio.id} — ${audio.filename} (${audio.filesize} octets)`);

  const { docs } = await payload.find({
    collection: 'podcasts',
    where: publicId ? { publicId: { equals: publicId } } : {},
    sort: '-publishedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const episode = docs[0];
  if (!episode) {
    console.error('[seed-podcast-audio] aucun épisode trouvé.');
    process.exit(1);
  }

  const duree = dureeArg ? Number.parseInt(dureeArg, 10) : undefined;
  await payload.update({
    collection: 'podcasts',
    id: episode.id,
    data: {
      audio: audio.id,
      ...(Number.isFinite(duree) ? { durationSeconds: duree } : {}),
    },
    overrideAccess: true,
  });
  console.log(`rattaché à l'épisode #${episode.id} (${episode.publicId}) — ${episode.title}`);
}

void main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
