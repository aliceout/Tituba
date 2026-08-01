/**
 * Endpoint Astro — sert un fichier RIS (.ris) téléchargeable pour un
 * billet de Tituba.
 *
 *   GET /actus/<code>.ris
 *
 * Utilisé par les boutons « RIS » et « Zotero » du bloc « Pour citer
 * cet article ». Zotero importe RIS nativement via son translator
 * intégré — pas besoin d'endpoint dédié pour Zotero.
 *
 * Cf src/lib/citations.ts pour le formatteur.
 */

import type { APIRoute } from 'astro';

import { fetchByPublicId, fetchIdentity } from '../../lib/payload';
import { toRIS, type CitationPost } from '../../lib/citations';
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
  const post = await fetchByPublicId<Post>('actus', publicId);
  if (!post || post.draft) {
    return new Response('Not found', { status: 404 });
  }

  const articleUrl = new URL(`/actus/${post.publicId}/`, url).toString();
  const accessedAt = new Date().toISOString().slice(0, 10);
  let siteName: string | undefined;
  try {
    const identity = await fetchIdentity<IdentityGlobal>();
    siteName = identity.siteName?.trim() || undefined;
  } catch {
    /* fallback côté toRIS */
  }
  const body = toRIS(post, { articleUrl, accessedAt, siteName, collection: 'actus' });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-research-info-systems; charset=utf-8',
      'Content-Disposition': `attachment; filename="actus-${post.publicId}.ris"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
