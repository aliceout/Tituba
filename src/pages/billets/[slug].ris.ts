/**
 * Endpoint Astro — sert un fichier RIS (.ris) téléchargeable pour un
 * billet du Carnet.
 *
 *   GET /billets/<slug>.ris
 *
 * Utilisé par les boutons « RIS » et « Zotero » du bloc « Pour citer
 * cet article ». Zotero importe RIS nativement via son translator
 * intégré — pas besoin d'endpoint dédié pour Zotero.
 *
 * Cf src/lib/citations.ts pour le formatteur.
 */

import type { APIRoute } from 'astro';

import { fetchBySlug, fetchIdentity } from '../../lib/payload';
import { toRIS, type CitationPost } from '../../lib/citations';
import type { PostAuthorEntry } from '../../lib/site';

type IdentityGlobal = { siteName?: string };

type Post = CitationPost & {
  draft?: boolean;
  authors?: PostAuthorEntry[] | null;
};

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('Not found', { status: 404 });
  }
  const post = await fetchBySlug<Post>('posts', slug);
  if (!post || post.draft) {
    return new Response('Not found', { status: 404 });
  }

  const articleUrl = new URL(`/billets/${post.slug}/`, url).toString();
  const accessedAt = new Date().toISOString().slice(0, 10);
  let siteName: string | undefined;
  try {
    const identity = await fetchIdentity<IdentityGlobal>();
    siteName = identity.siteName?.trim() || undefined;
  } catch {
    /* fallback côté toRIS */
  }
  const body = toRIS(post, { articleUrl, accessedAt, siteName });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-research-info-systems; charset=utf-8',
      'Content-Disposition': `attachment; filename="${post.slug}.ris"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
};
