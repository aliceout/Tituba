/**
 * Endpoint Astro — sert un fichier BibTeX (.bib) téléchargeable pour
 * une publication du format « articles ».
 *
 *   GET /articles/<code>.bib
 *
 * Le bouton « BibTeX » du bloc « Pour citer cet article » pointe ici
 * via un `<a href="/articles/<code>.bib" download>`. Content-Disposition
 * = attachment force le téléchargement (au lieu d'afficher le contenu
 * dans le navigateur).
 *
 * Cf src/lib/citations.ts pour le formatteur. Si l'identifiant ne
 * aucun billet (ou si le billet est en draft), on retourne 404.
 */

import type { APIRoute } from 'astro';

import { fetchByPublicId, fetchIdentity } from '../../lib/payload';
import { toBibTeX, type CitationPost } from '../../lib/citations';
import type { PostAuthorEntry } from '../../lib/site';

type IdentityGlobal = { siteName?: string };

type Post = CitationPost & {
  draft?: boolean;
  authors?: PostAuthorEntry[] | null;
};

export const GET: APIRoute = async ({ params, url }) => {
  const publicId = params.publicId;
  if (!publicId) {
    return new Response('Not found', { status: 404 });
  }
  const post = await fetchByPublicId<Post>('articles', publicId);
  if (!post || post.draft) {
    return new Response('Not found', { status: 404 });
  }

  const articleUrl = new URL(`/articles/${post.publicId}/`, url).toString();
  const accessedAt = new Date().toISOString().slice(0, 10);
  let siteName: string | undefined;
  try {
    const identity = await fetchIdentity<IdentityGlobal>();
    siteName = identity.siteName?.trim() || undefined;
  } catch {
    /* fallback côté toBibTeX */
  }
  const body = toBibTeX(post, { articleUrl, accessedAt, siteName, collection: 'articles' });

  return new Response(body, {
    status: 200,
    headers: {
      // application/x-bibtex est le mime non-officiel le plus utilisé.
      // text/x-bibtex existe aussi — peu importe, les navigateurs
      // se basent sur l'extension dans Content-Disposition.
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': `attachment; filename="articles-${post.publicId}.bib"`,
      // Cache 5 min côté client pour ne pas pilonner Payload si
      // l'utilisatrice clique plusieurs fois.
      'Cache-Control': 'public, max-age=300',
    },
  });
};
