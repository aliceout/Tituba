/**
 * La porte d'entrée du site, avant l'ouverture.
 *
 * Deux réglages passent par ici, tous deux pilotés depuis les Options de
 * l'administration (cf. `lib/preparation.ts`) :
 *
 *   1. « Ne pas indexer » pose `X-Robots-Tag` sur TOUTES les réponses.
 *      L'en-tête plutôt que la seule balise `<meta>` : il couvre aussi
 *      les images, les PDF et les flux, qui n'ont pas de `<head>` où
 *      loger une balise. La balise est posée en plus, dans le gabarit.
 *
 *   2. « Fermer le site » répond « en préparation » à qui n'a pas la
 *      clé d'aperçu.
 *
 * ─── Ce qui passe malgré la fermeture ───────────────────────────────
 *
 * Les fichiers de rendu — feuilles de style, scripts, polices, images.
 * Sans eux la page « en préparation » s'afficherait nue, et surtout la
 * page servie à qui A la clé n'aurait pas ses styles : le navigateur
 * demande ces fichiers sans le paramètre d'URL, et le cookie ne suffit
 * pas toujours au premier chargement.
 *
 * Ce n'est pas une fuite : ces fichiers ne portent aucun contenu
 * éditorial. Les pages, elles, sont bien fermées.
 */
import { defineMiddleware } from 'astro:middleware';

import { hacherClef, lirePreparation } from './lib/preparation';

/** Nom du cookie qui retient la clé d'aperçu d'une visite à l'autre. */
const COOKIE = 'tituba_apercu';

/** Paramètre d'URL qui ouvre la porte : `?apercu=<clé>`. */
const PARAM = 'apercu';

/** Chemins servis quoi qu'il arrive — rendu, et rien d'éditorial. */
const TOUJOURS_SERVIS = [/^\/_astro\//, /^\/favicon/, /^\/fonts?\//, /^\/_image/];

export const onRequest = defineMiddleware(async (context, next) => {
  const prep = await lirePreparation();
  const chemin = context.url.pathname;

  // ─── La porte ──────────────────────────────────────────────────
  if (prep.accesRestreint && !TOUJOURS_SERVIS.some((re) => re.test(chemin))) {
    const fournie = context.url.searchParams.get(PARAM);
    const enCookie = context.cookies.get(COOKIE)?.value ?? null;
    const attendu = prep.clefApercuHash;

    const bonneClef = (c: string | null): boolean =>
      Boolean(attendu && c && hacherClef(c) === attendu);

    if (bonneClef(fournie)) {
      // On retient la clé, puis on renvoie vers la même page sans le
      // paramètre : sans cette redirection, il resterait dans la barre
      // d'adresse et se retrouverait recopié dans un partage, un
      // signet ou un journal de serveur.
      context.cookies.set(COOKIE, fournie as string, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: context.url.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 30,
      });
      const propre = new URL(context.url);
      propre.searchParams.delete(PARAM);
      return context.redirect(propre.pathname + propre.search, 302);
    }

    if (!bonneClef(enCookie)) {
      return new Response(pageEnPreparation(), {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          // 503 et non 403 : le site n'est pas interdit, il n'est pas
          // encore ouvert. Un moteur qui passe reviendra plus tard au
          // lieu de retenir une page d'erreur.
          'Retry-After': '86400',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
  }

  const reponse = await next();

  // ─── L'indexation ──────────────────────────────────────────────
  if (prep.noindex) {
    reponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return reponse;
});

/**
 * La page servie à qui n'a pas la clé.
 *
 * Écrite à la main, sans dépendre d'un gabarit : elle doit s'afficher
 * même si Payload ne répond pas, et ne rien révéler du site — ni son
 * contenu, ni sa mise en page, ni le fait qu'un aperçu existe.
 */
function pageEnPreparation(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>En préparation</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f6f5f1; color: #1a1d28;
    font-family: Georgia, 'Times New Roman', serif;
    padding: 2rem;
  }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; font-weight: normal; margin: 0 0 0.75rem; }
  p { margin: 0; line-height: 1.6; color: #5e6373; font-size: 0.95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161c; color: #e8e6e0; }
    p { color: #9aa0ad; }
  }
</style>
</head>
<body>
<main>
  <h1>Ce site est en préparation.</h1>
  <p>Il ouvrira bientôt. Merci de repasser.</p>
</main>
</body>
</html>`;
}
