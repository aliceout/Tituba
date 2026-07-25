/**
 * Flux RSS du Carnet — /rss.xml
 *
 * Liste des billets non-draft, triés par date décroissante. Limite : 50.
 * Description = lede du billet (chapô). Catégories = thèmes (slugs).
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { fetchCollection, fetchIdentity, fetchSubscriptions, filterPublished } from '../lib/payload';

type IdentityGlobal = { siteName?: string };
type SubscriptionsGlobal = { rssEnabled?: boolean };

type Theme = { id: number | string; slug: string; name: string };

type Post = {
  id: number | string;
  numero: number;
  slug: string;
  title: string;
  themes?: Theme[] | null;
  publishedAt: string;
  lede: string;
  draft?: boolean;
};

export const GET: APIRoute = async (context) => {
  // Flux RSS pilotable depuis Payload (Abonnements → Flux RSS activé).
  // Si décoché côté admin, on renvoie 404 — même URL, plus de contenu.
  try {
    const subs = await fetchSubscriptions<SubscriptionsGlobal>();
    if (subs.rssEnabled === false) {
      return new Response('Not found', { status: 404 });
    }
  } catch (err) {
    console.warn('[rss] fetchSubscriptions failed, flux servi par défaut:', (err as Error).message);
  }

  let posts: Post[] = [];
  let siteName = 'Carnet';
  try {
    const raw = await fetchCollection<Post>('posts', {
      sort: '-publishedAt',
      limit: 50,
      depth: 1,
    });
    posts = filterPublished(raw);
  } catch (err) {
    console.warn('[rss] fetch failed:', (err as Error).message);
  }
  try {
    const identity = await fetchIdentity<IdentityGlobal>();
    siteName = identity.siteName?.trim() || siteName;
  } catch (err) {
    console.warn('[rss] fetchIdentity failed:', (err as Error).message);
  }

  if (!context.site) {
    throw new Error(
      "rss.xml.ts: context.site est undefined — vérifie que `site` est défini dans astro.config.mjs.",
    );
  }
  return rss({
    title: `${siteName} — notes de recherche`,
    description: `${siteName} — carnet de recherche. Auto-hébergé. Sans pisteur.`,
    site: context.site,
    items: posts.map((p) => {
      const themes = (p.themes ?? []).filter(
        (t): t is Theme => typeof t === 'object' && t !== null && 'slug' in t,
      );
      return {
        title: p.title,
        link: `/billets/${p.slug}/`,
        pubDate: new Date(p.publishedAt),
        description: p.lede,
        categories: themes.map((t) => t.slug),
      };
    }),
    customData: '<language>fr-FR</language>',
    stylesheet: false,
  });
};
