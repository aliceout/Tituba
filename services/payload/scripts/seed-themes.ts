/**
 * Seed des thématiques de TITUBA — idempotent, exécutable en production.
 *
 *   pnpm --dir services/payload seed:themes
 *
 * Distinct de `seed-dev.ts`, qui pose un jeu de démonstration et refuse
 * de tourner en prod : les dix axes ci-dessous sont de vraies données
 * éditoriales, pas des exemples. Le script crée ce qui manque et met à
 * jour le nom et la description de ce qui existe déjà, en s'appuyant
 * sur le slug comme clé stable. Il ne supprime jamais rien : une
 * thématique retirée de cette liste reste en base, à charge de la
 * supprimer depuis l'admin après avoir vérifié qu'elle n'est plus
 * rattachée à aucune publication.
 */

import 'dotenv/config';
import { getPayload } from 'payload';

import config from '../src/payload.config';

const THEMES = [
  {
    slug: 'genre-ri',
    name: 'Genre et RI',
    description: 'Le genre comme opérateur des relations internationales — et inversement.',
  },
  {
    slug: 'genre-solidarite-internationale',
    name: 'Genre & solidarité internationale',
    description: "Angles morts de l'aide, du développement et de l'action humanitaire.",
  },
  {
    slug: 'ecofeminismes',
    name: 'Écoféminismes',
    description: 'Croisements entre justice de genre et justice environnementale.',
  },
  {
    slug: 'genre-mer',
    name: 'Genre et mer',
    description: "Pêche, marine, littoraux, économie bleue : ce que le genre y joue.",
  },
  {
    slug: 'genre-dssr',
    name: 'Genre et DSSR',
    description: 'Droits et santé sexuels et reproductifs, ici et ailleurs.',
  },
  {
    slug: 'violences-sexistes-sexuelles',
    name: 'Violences sexistes et sexuelles',
    description: 'Prévention, prise en charge, responsabilité des institutions.',
  },
  {
    slug: 'genre-justice',
    name: 'Genre et justice',
    description: 'Justice pénale, justice transitionnelle, accès au droit.',
  },
  {
    slug: 'genre-exil',
    name: 'Genre et exil',
    description: 'Persécutions liées au genre, asile, statut de réfugié·e LGBTQI+.',
  },
  {
    slug: 'genre-tech',
    name: 'Genre et tech',
    description:
      'Technologies, données, plateformes : reproduction et contestation des rapports de genre.',
  },
  {
    slug: 'genre-politiques',
    name: 'Genre et politiques',
    description:
      "Politiques publiques d'égalité, mouvements anti-genre, rapports de force institutionnels.",
  },
];

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  let created = 0;
  let updated = 0;

  for (const theme of THEMES) {
    const existing = await payload.find({
      collection: 'themes',
      where: { slug: { equals: theme.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const found = existing.docs[0] as { id: number | string } | undefined;
    if (found) {
      await payload.update({
        collection: 'themes',
        id: found.id,
        data: { name: theme.name, description: theme.description },
        overrideAccess: true,
      });
      updated += 1;
      console.log(`[seed-themes] ~ ${theme.slug}`);
    } else {
      await payload.create({
        collection: 'themes',
        data: theme,
        overrideAccess: true,
      });
      created += 1;
      console.log(`[seed-themes] + ${theme.slug}`);
    }
  }

  console.log(`[seed-themes] terminé — ${created} créée(s), ${updated} mise(s) à jour.`);
  process.exit(0);
}

void main().catch((err) => {
  console.error('[seed-themes] échec :', err);
  process.exit(1);
});
