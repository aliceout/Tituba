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

import { adresseSite } from '../lib/adresse';
import { lirePreparation } from '../lib/preparation';

export const GET: APIRoute = async () => {
  // Lue à l'exécution, pas figée à la construction : la même image
  // doit pouvoir servir n'importe quel domaine (cf. lib/adresse.ts).
  const base = adresseSite();

  // « Ne pas indexer » coché dans les Options : on interdit tout, et on
  // ne renvoie pas au plan du site — l'y laisser reviendrait à tendre la
  // liste des pages qu'on demande d'ignorer.
  const { noindex } = await lirePreparation();
  if (noindex) {
    return new Response(['User-agent: *', 'Disallow: /', ''].join('\n'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

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
