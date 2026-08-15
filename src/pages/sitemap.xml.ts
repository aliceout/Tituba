/**
 * Plan du site — /sitemap.xml
 *
 * Écrit à la main et servi à la demande, plutôt que produit au build
 * par @astrojs/sitemap. C'est le choix qu'impose la nature du site :
 *
 *  - En rendu serveur, l'intégration ne connaît que les routes
 *    statiques. Elle listait donc dix-huit pages fixes et **aucune
 *    publication** — pas un article, pas un épisode, pas une
 *    thématique. Sur un site dont l'objet est de publier, le contenu
 *    n'était déclaré nulle part.
 *  - Un plan figé au build vieillit dès la parution suivante, alors que
 *    rien ici ne se reconstruit quand on publie. Calculé à la demande,
 *    il est juste en permanence.
 *
 * Les pages transactionnelles (confirmation d'abonnement, de
 * désabonnement, de message) en sont absentes : elles portent déjà
 * `noindex`, et les annoncer tout en demandant de les ignorer était
 * une contradiction que l'ancien plan servait aux moteurs.
 *
 * En cas de panne de Payload, on sert au moins les pages fixes plutôt
 * qu'une erreur : un plan partiel vaut mieux qu'un plan absent.
 */
import type { APIRoute } from 'astro';

import { adresseSite } from '../lib/adresse';
import { lirePreparation } from '../lib/preparation';
import { fetchAuthorsList, fetchCollection } from '../lib/payload';
import { fetchFeed, publicationHref } from '../lib/publications';

/** Routes servies par un fichier, sans contenu à interroger. */
const PAGES_FIXES = [
  '/',
  '/articles/',
  '/analyses/',
  '/actus/',
  '/podcasts/',
  '/outils/',
  '/formats/',
  '/themes/',
  '/tags/',
  '/archives/',
  '/auteurices/',
  '/abonnement/',
  '/recherche/',
  '/contact/',
  '/accessibilite/',
];

type Entree = { chemin: string; modifie?: string | null };

function xml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET: APIRoute = async () => {
  // Lue à l'exécution plutôt que figée à la construction : le plan d'un
  // site doit porter le domaine sur lequel il est servi, pas celui qu'on
  // connaissait en fabriquant l'image (cf. lib/adresse.ts).
  const base = adresseSite();

  // « Ne pas indexer » coché : un plan de site est une invitation à
  // parcourir, et l'offrir tout en demandant de ne rien indexer serait
  // se contredire. On répond 404 — la ressource n'existe pas tant que le
  // site n'est pas ouvert.
  const { noindex } = await lirePreparation();
  if (noindex) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const entrees: Entree[] = PAGES_FIXES.map((chemin) => ({ chemin }));

  /** Chaque source échoue seule : une collection injoignable ne doit
   *  pas emporter tout le plan. */
  async function ajouter(nom: string, charger: () => Promise<Entree[]>): Promise<void> {
    try {
      entrees.push(...(await charger()));
    } catch (err) {
      console.warn(`[sitemap] ${nom} indisponible :`, (err as Error).message);
    }
  }

  // Les cinq formats, en une requête.
  await ajouter('publications', async () => {
    const feed = await fetchFeed({ limit: 1000 });
    return feed.docs.map((d) => ({
      chemin: publicationHref(d.collection, d.publicId),
      modifie: d.publishedAt,
    }));
  });

  await ajouter('thématiques', async () => {
    const docs = await fetchCollection<{ slug?: string }>('themes', { depth: 0, limit: 200 });
    return docs.filter((t) => t.slug).map((t) => ({ chemin: `/theme/${t.slug}/` }));
  });

  await ajouter('tags', async () => {
    const docs = await fetchCollection<{ slug?: string }>('tags', { depth: 0, limit: 500 });
    return docs.filter((t) => t.slug).map((t) => ({ chemin: `/tag/${t.slug}/` }));
  });

  await ajouter('séries', async () => {
    const docs = await fetchCollection<{ slug?: string }>('series', {
      depth: 0,
      limit: 200,
      where: [{ field: 'draft', operator: 'not_equals', value: true }],
    });
    return docs.filter((s) => s.slug).map((s) => ({ chemin: `/series/${s.slug}/` }));
  });

  // Seules les personnes ayant signé une publication ont une fiche.
  await ajouter('auteur·ices', async () => {
    const auteurs = await fetchAuthorsList();
    return auteurs.map((a) => ({ chemin: `/auteurice/${a.id}/` }));
  });

  // Pages éditoriales libres et publiées — « L'association », etc. Les
  // pages fixes sont déjà dans la liste ci-dessus, avec leur route.
  await ajouter('pages éditoriales', async () => {
    const docs = await fetchCollection<{ slug?: string; draft?: boolean; updatedAt?: string }>(
      'pages',
      {
        depth: 0,
        limit: 200,
        where: [
          { field: 'kind', value: 'libre' },
          { field: 'draft', operator: 'not_equals', value: true },
        ],
      },
    );
    return docs
      .filter((p) => p.slug)
      .map((p) => ({ chemin: `/${p.slug}/`, modifie: p.updatedAt }));
  });

  // Dédoublonnage : une page éditoriale peut porter le slug d'une route
  // déjà listée, et un plan qui répète une adresse est un plan fautif.
  const vues = new Set<string>();
  const uniques = entrees.filter((e) => {
    if (vues.has(e.chemin)) return false;
    vues.add(e.chemin);
    return true;
  });

  const corps = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniques.map((e) =>
      [
        '  <url>',
        `    <loc>${xml(base + e.chemin)}</loc>`,
        e.modifie ? `    <lastmod>${xml(new Date(e.modifie).toISOString())}</lastmod>` : null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    '</urlset>',
  ].join('\n');

  return new Response(corps, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Un quart d'heure : assez pour absorber le passage d'un robot,
      // assez court pour qu'une parution soit annoncée le jour même.
      'Cache-Control': 'public, max-age=900',
    },
  });
};
