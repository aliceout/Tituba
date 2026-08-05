/**
 * Flux podcast — /podcasts/rss.xml
 *
 * Distinct du flux général /rss.xml, et pas seulement par son filtre :
 * un flux podcast est un format à part, que les applications d'écoute
 * lisent au travers de l'extension `itunes:` d'Apple. Trois exigences
 * le séparent d'un flux RSS ordinaire, et aucune n'est facultative :
 *
 *  - `<enclosure>` porte l'URL du fichier, **sa taille en octets et son
 *    type MIME**. Les applications s'en servent pour annoncer le poids
 *    d'un téléchargement avant de le lancer ; un flux qui les omet est
 *    rejeté. Les deux viennent du fichier déposé, donc sans saisie.
 *  - `<itunes:image>`, `<itunes:category>` et `<itunes:explicit>` sont
 *    obligatoires au dépôt chez Apple et Spotify. Ils se règlent dans
 *    Abonnements → Flux podcast.
 *  - `<guid isPermaLink="false">` identifie l'épisode pour toujours. On
 *    y met l'identifiant public, jamais l'URL : une adresse qui change
 *    ferait réapparaître tous les épisodes comme neufs chez les
 *    abonné·es.
 *
 * Le flux est écrit à la main plutôt que confié à @astrojs/rss : les
 * balises `itunes:` d'un item n'y passent que par `customData`, si bien
 * qu'on écrirait de toute façon l'essentiel du XML soi-même, avec en
 * prime une couche à contourner.
 *
 * Piloté par le même interrupteur que le flux général (Abonnements →
 * Flux RSS activé) : décoché, la route renvoie 404.
 */
import type { APIRoute } from 'astro';

import {
  audioFileUrl,
  fetchCollection,
  fetchIdentity,
  fetchSubscriptions,
  mediaUrl,
  publishedOnly,
} from '../../lib/payload';
import { publicationHref, type PublicationPost } from '../../lib/publications';

type IdentityGlobal = { siteName?: string; authorName?: string; baseline?: string };
type SubscriptionsGlobal = {
  rssEnabled?: boolean;
  podcastCover?: { filename?: string } | number | string | null;
  podcastExplicit?: boolean;
  podcastOwnerEmail?: string;
};

/** Échappe le texte destiné à un nœud ou un attribut XML. */
function xml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** « 46:02 » — forme attendue par <itunes:duration>. */
function chrono(secondes: number | null | undefined): string | null {
  if (typeof secondes !== 'number' || !Number.isFinite(secondes) || secondes <= 0) return null;
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = Math.floor(secondes % 60);
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

export const GET: APIRoute = async (context) => {
  try {
    const subs = await fetchSubscriptions<SubscriptionsGlobal>(1);
    if (subs.rssEnabled === false) {
      return new Response('Not found', { status: 404 });
    }
    if (!context.site) {
      throw new Error(
        'podcasts/rss.xml.ts : context.site est undefined — vérifier `site` dans astro.config.mjs.',
      );
    }
    const base = context.site.toString().replace(/\/$/, '');

    let siteName = 'Tituba';
    let authorName = '';
    let baseline = '';
    try {
      const identity = await fetchIdentity<IdentityGlobal>();
      siteName = identity.siteName?.trim() || siteName;
      authorName = identity.authorName?.trim() || '';
      baseline = identity.baseline?.trim() || '';
    } catch (err) {
      console.warn('[podcast-rss] fetchIdentity a échoué :', (err as Error).message);
    }

    const episodes = await fetchCollection<PublicationPost>('podcasts', {
      where: publishedOnly(),
      limit: 200,
      sort: '-publishedAt',
      depth: 1,
      // `audio` doit figurer ici pour être peuplé, même avec depth > 0
      // (cf fetchCollection). Sans lui, plus d'enclosure, donc plus de
      // flux valide — et l'échec serait silencieux.
      select: ['publicId', 'title', 'lede', 'publishedAt', 'durationSeconds', 'audio', 'draft'],
    });

    const auteur = authorName || siteName;
    const coverObj =
      subs.podcastCover && typeof subs.podcastCover === 'object' ? subs.podcastCover : null;
    const coverUrl = mediaUrl(coverObj?.filename);
    // Rubrique iTunes figée pour tout le site : Tituba ne publie que
    // des émissions de société et culture, et un sélecteur ne posait
    // qu'une question dont la réponse était connue d'avance. Les
    // intitulés sont ceux d'Apple, qui ne les accepte qu'en anglais.
    const categorie = 'Society & Culture';
    const explicite = subs.podcastExplicit === true ? 'true' : 'false';

    const items = episodes
      // Un épisode sans fichier n'a rien à faire dans un flux podcast :
      // l'application d'écoute n'aurait rien à télécharger. Il reste
      // lisible sur le site, il n'est simplement pas diffusé.
      .filter((e) => typeof e.audio === 'object' && e.audio && e.audio.filename)
      .map((e) => {
        const audio = e.audio as { filename?: string; filesize?: number | null; mimeType?: string | null };
        const url = audioFileUrl(audio.filename);
        const duree = chrono(e.durationSeconds);
        const lien = `${base}${publicationHref('podcasts', e.publicId)}`;
        return [
          '    <item>',
          `      <title>${xml(e.title)}</title>`,
          `      <link>${xml(lien)}</link>`,
          `      <guid isPermaLink="false">${xml(e.publicId)}</guid>`,
          `      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>`,
          `      <description>${xml(e.lede)}</description>`,
          `      <itunes:summary>${xml(e.lede)}</itunes:summary>`,
          `      <itunes:author>${xml(auteur)}</itunes:author>`,
          `      <itunes:explicit>${explicite}</itunes:explicit>`,
          duree ? `      <itunes:duration>${duree}</itunes:duration>` : null,
          `      <enclosure url="${xml(url)}" length="${audio.filesize ?? 0}" type="${xml(
            audio.mimeType || 'audio/mpeg',
          )}"/>`,
          '    </item>',
        ]
          .filter(Boolean)
          .join('\n');
      });

    const description = baseline || `${siteName} — épisodes audio.`;

    const flux = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${xml(siteName)}</title>`,
      `    <link>${xml(`${base}/podcasts/`)}</link>`,
      `    <description>${xml(description)}</description>`,
      '    <language>fr-FR</language>',
      `    <atom:link href="${xml(`${base}/podcasts/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
      `    <itunes:author>${xml(auteur)}</itunes:author>`,
      `    <itunes:summary>${xml(description)}</itunes:summary>`,
      '    <itunes:type>episodic</itunes:type>',
      `    <itunes:explicit>${explicite}</itunes:explicit>`,
      `    <itunes:category text="${xml(categorie)}"/>`,
      coverUrl ? `    <itunes:image href="${xml(coverUrl)}"/>` : null,
      subs.podcastOwnerEmail
        ? [
            '    <itunes:owner>',
            `      <itunes:name>${xml(auteur)}</itunes:name>`,
            `      <itunes:email>${xml(subs.podcastOwnerEmail)}</itunes:email>`,
            '    </itunes:owner>',
          ].join('\n')
        : null,
      ...items,
      '  </channel>',
      '</rss>',
    ]
      .filter(Boolean)
      .join('\n');

    return new Response(flux, {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  } catch (err) {
    console.error('[podcast-rss] échec :', (err as Error).message);
    return new Response('Erreur lors de la génération du flux.', { status: 500 });
  }
};
