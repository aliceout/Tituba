/**
 * Flux RSS de Tituba — /rss.xml
 *
 * Liste des billets non-draft, triés par date décroissante. Limite : 50.
 * Description = lede du billet (chapô). Catégories = thèmes (slugs).
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { fetchIdentity, fetchSubscriptions, type FeedDoc } from '../lib/payload';
import { fetchFeed, publicationHref } from '../lib/publications';

type IdentityGlobal = { siteName?: string };
type SubscriptionsGlobal = { rssEnabled?: boolean };


type Post = FeedDoc;

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
  let siteName = 'Tituba';
  try {
    const feed = await fetchFeed({ limit: 50 });
    posts = feed.docs;
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
    title: `${siteName} `,
    description: `${siteName} — publications de l’association. Auto-hébergé. Sans pisteur.`,
    site: context.site,
    items: posts.map((p) => {
      return {
        title: p.title ?? '',
        link: publicationHref(p.collection, p.slug ?? ''),
        pubDate: p.publishedAt ? new Date(p.publishedAt) : new Date(),
        description: p.lede ?? '',
        categories: p.themeSlugs ?? [],
      };
    }),
    customData: '<language>fr-FR</language>',
    stylesheet: false,
  });
};
