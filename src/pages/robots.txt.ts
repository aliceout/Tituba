/**
 * robots.txt — /robots.txt
 *
 * Il n'y en avait aucun : rien n'indiquait où trouver le plan du site,
 * et rien n'écartait l'administration.
 *
 * Route servie plutôt que fichier statique dans `public/` : la ligne
 * `Sitemap:` exige une adresse absolue, qui diffère entre le
 * développement et la production. Un fichier figé aurait porté l'une
 * des deux, donc été faux quelque part.
 *
 * Ce que l'on écarte, et pourquoi :
 *  - `/cms/` — l'administration et l'API. Aucune raison d'y envoyer un
 *    robot, et la faire indexer exposerait des chemins internes.
 *  - `/api/` — les proxys du site (contact, abonnement). Ce ne sont pas
 *    des pages.
 *  - les pages de confirmation, qui portent un jeton à usage unique
 *    dans leur adresse. Elles sont déjà en `noindex` ; l'écrire ici
 *    évite en plus qu'un robot les *visite*, ce qui consommerait le
 *    jeton de quelqu'un.
 *
 * `Disallow` n'est pas une protection : c'est une consigne, que les
 * robots honnêtes suivent. Ce qui protège vraiment reste le contrôle
 * d'accès côté Payload.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = (context) => {
  if (!context.site) {
    throw new Error('robots.txt.ts : context.site est undefined — vérifier `site` dans astro.config.mjs.');
  }
  const base = context.site.toString().replace(/\/$/, '');

  const corps = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Administration et API — rien à indexer, et des chemins internes',
    '# qu’il n’y a aucune raison d’exposer.',
    'Disallow: /cms/',
    'Disallow: /api/',
    '',
    '# Pages de confirmation : leur adresse porte un jeton à usage',
    '# unique. Les visiter consommerait celui de quelqu’un.',
    'Disallow: /contact/confirmer',
    'Disallow: /abonnement/confirmer',
    'Disallow: /abonnement/desabonner',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(corps, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
