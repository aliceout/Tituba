/**
 * Crée un outil de démonstration, avec ses fichiers.
 *
 * Usage : `pnpm --dir services/payload tsx scripts/outil-demo.ts`
 *
 * Sert à avoir de quoi vérifier l'affichage du format « outils », qui
 * n'avait aucune entrée en base — donc aucune page à regarder. Les PDF
 * sont générés à part (scratchpad) et n'ont pas de contenu réel : ils
 * le disent eux-mêmes en première ligne.
 *
 * Écrit en brouillon : c'est de la donnée de démonstration, elle n'a
 * pas à se retrouver en ligne par accident.
 *
 * Idempotent : relancé, il met à jour l'outil existant plutôt que d'en
 * empiler des copies.
 */
import fs from 'node:fs';
import path from 'node:path';

import { getPayload } from 'payload';
import config from '../src/payload.config';

const DOSSIER_PDF =
  'C:/Users/Alyss/AppData/Local/Temp/claude/c--Users-Alyss-Documents-Github-Tituba/c2c1f913-92df-4020-82a5-74c5eb30e8a4/scratchpad/pdf';

const FICHIERS = [
  {
    nom: 'tituba-grille-relecture-inclusive.pdf',
    titre: 'Grille de relecture inclusive (démo)',
  },
  {
    nom: 'tituba-kit-animation-atelier.pdf',
    titre: 'Kit d’animation d’atelier (démo)',
  },
];

const TITRE = 'Grille de relecture inclusive';

async function main() {
  const payload = await getPayload({ config });

  // ─── Les fichiers ──────────────────────────────────────────────────
  const media: { id: number | string; filename: string }[] = [];
  for (const f of FICHIERS) {
    const chemin = path.join(DOSSIER_PDF, f.nom);
    if (!fs.existsSync(chemin)) {
      throw new Error(`PDF absent : ${chemin} — générer d’abord les fichiers.`);
    }

    const existant = await payload.find({
      collection: 'media',
      where: { filename: { equals: f.nom } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existant.docs[0]) {
      const doc = existant.docs[0] as { id: number | string; filename?: string };
      media.push({ id: doc.id, filename: doc.filename ?? f.nom });
      console.log(`[outil-demo] déjà en place : ${f.nom}`);
      continue;
    }

    const data = fs.readFileSync(chemin);
    const cree = (await payload.create({
      collection: 'media',
      // `alt` est obligatoire sur Media. Pour un document, il ne décrit
      // pas une image mais ce que le fichier est — c'est ce qu'un
      // lecteur d'écran annoncera du lien.
      data: { title: f.titre, alt: f.titre } as never,
      file: {
        data,
        mimetype: 'application/pdf',
        name: f.nom,
        size: data.length,
      },
      overrideAccess: true,
    })) as { id: number | string; filename?: string };
    media.push({ id: cree.id, filename: cree.filename ?? f.nom });
    console.log(`[outil-demo] téléversé : ${f.nom} (${data.length} octets)`);
  }

  // ─── Le billet ─────────────────────────────────────────────────────
  // Le document est désormais une relation vers la médiathèque, plus
  // une adresse : on passe donc son identifiant, et Payload garantit
  // que le fichier existe.

  const corps = {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [
            {
              type: 'text',
              text: 'Une grille en quatre points pour relire un texte avant publication : accords et désignations, présupposés, lisibilité, sources. Elle ne remplace pas une relecture par une personne concernée — elle sert à arriver devant elle avec un texte déjà propre.',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
        },
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [
            {
              type: 'text',
              text: 'Ce document est un fichier de démonstration : son contenu n’a pas vocation à être utilisé tel quel.',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
        },
      ],
    },
  };

  const existant = await payload.find({
    collection: 'outils',
    where: { title: { equals: TITRE } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const data = {
    title: TITRE,
    lede: 'Quatre points à vérifier avant de publier un texte : accords et désignations, présupposés, lisibilité, sources.',
    publishedAt: new Date().toISOString(),
    // Les deux documents : un outil en réunit souvent plusieurs.
    // L'intitulé affiché est le titre du média ; ici on ne pose que
    // la description propre à chaque entrée.
    resources: [
      {
        fichier: media[0].id,
        description:
          'Quatre points à vérifier, une page. À imprimer ou à remplir à deux, avant d’envoyer un texte en relecture.',
      },
      {
        fichier: media[1].id,
        description:
          'Un déroulé minuté pour une séance de deux heures, avec le temps d’accueil et les questions d’accessibilité à poser en amont.',
      },
    ],
    audience: 'militantes',
    body: corps,
    draft: true,
  };

  if (existant.docs[0]) {
    await payload.update({
      collection: 'outils',
      id: (existant.docs[0] as { id: number | string }).id,
      data: data as never,
      overrideAccess: true,
    });
    console.log('[outil-demo] outil mis à jour');
  } else {
    const cree = (await payload.create({
      collection: 'outils',
      data: data as never,
      overrideAccess: true,
    })) as { publicId?: string };
    console.log(`[outil-demo] outil créé — /outils/${cree.publicId ?? '?'}/`);
  }

  console.log('\nL’outil est en BROUILLON : visible avec SHOW_DRAFTS=1, ou à publier depuis l’admin.');
  process.exit(0);
}

void main();
