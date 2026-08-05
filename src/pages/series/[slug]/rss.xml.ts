/**
 * Flux podcast d'une émission — /series/<slug>/rss.xml
 *
 * Pendant du flux global `/podcasts/rss.xml`, restreint aux épisodes
 * d'une émission. C'est ce qui permet de s'abonner à une seule d'entre
 * elles, plutôt que de recevoir toute la production audio du site — et
 * c'est le seul usage des deux champs du groupe « Flux podcast » de la
 * collection Séries, qui étaient jusqu'ici saisis sans être lus nulle
 * part.
 *
 * Réservé aux émissions, c'est-à-dire aux séries de format `podcasts` :
 * une série de textes n'a pas d'`<enclosure>` à annoncer, et un flux
 * `itunes:` sans fichier audio n'a pas de sens. Les autres formats
 * répondent 404.
 *
 * Les réglages se cumulent avec ceux du global Abonnements plutôt que
 * de les remplacer : une émission ne renseigne que ce qui lui est
 * propre (son adresse de contact, sa mention de contenu explicite), et
 * hérite du reste — la couverture, l'interrupteur général.
 *
 * Écrit à la main pour la même raison que le flux global : les balises
 * `itunes:` d'un item ne passent dans @astrojs/rss que par
 * `customData`, si bien qu'on écrirait de toute façon l'essentiel du
 * XML soi-même, avec une couche de plus à contourner.
 */
import type { APIRoute } from 'astro';

import { audioFileUrl, fetchIdentity, fetchSubscriptions, mediaUrl } from '../../../lib/payload';
import {
  fetchSerieBySlug,
  fetchSeriePosts,
  publicationHref,
  type PublicationPost,
} from '../../../lib/publications';

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
    const slug = context.params.slug;
    if (!slug) return new Response('Not found', { status: 404 });

    const subs = await fetchSubscriptions<SubscriptionsGlobal>(1);
    // Même interrupteur que les deux autres flux : couper les flux du
    // site doit couper ceux des émissions avec, sans quoi l'option ne
    // voudrait plus rien dire.
    if (subs.rssEnabled === false) return new Response('Not found', { status: 404 });

    const serie = await fetchSerieBySlug(slug);
    // Une émission en brouillon n'a pas de flux : elle n'existe pas
    // encore publiquement, et une application d'écoute qui l'aurait
    // trouvée la garderait en mémoire.
    if (!serie || serie.draft === true || serie.format !== 'podcasts') {
      return new Response('Not found', { status: 404 });
    }

    if (!context.site) {
      throw new Error(
        'series/[slug]/rss.xml.ts : context.site est undefined — vérifier `site` dans astro.config.mjs.',
      );
    }
    const base = context.site.toString().replace(/\/$/, '');

    let siteName = 'Tituba';
    let authorName = '';
    try {
      const identity = await fetchIdentity<IdentityGlobal>();
      siteName = identity.siteName?.trim() || siteName;
      authorName = identity.authorName?.trim() || '';
    } catch (err) {
      console.warn('[serie-rss] fetchIdentity a échoué :', (err as Error).message);
    }

    const episodes = (await fetchSeriePosts(serie)) as unknown as PublicationPost[];

    const auteur = authorName || siteName;
    // Couverture propre à l'émission si elle en a une, celle du site
    // sinon : un flux sans image est refusé au dépôt.
    const coverSerie = serie.image && typeof serie.image === 'object' ? serie.image : null;
    const coverGlobal =
      subs.podcastCover && typeof subs.podcastCover === 'object' ? subs.podcastCover : null;
    const coverUrl = mediaUrl(coverSerie?.filename) ?? mediaUrl(coverGlobal?.filename);
    // Rubrique figée pour tout le site, comme dans le flux global : les
    // intitulés sont ceux d'Apple, qui ne les accepte qu'en anglais.
    const categorie = 'Society & Culture';
    // La mention de l'émission l'emporte sur celle du site : c'est le
    // niveau le plus précis, et c'est bien pourquoi le champ existe.
    const explicite =
      serie.feed?.explicit === true || (serie.feed?.explicit == null && subs.podcastExplicit === true)
        ? 'true'
        : 'false';
    const contact = serie.feed?.ownerEmail?.trim() || subs.podcastOwnerEmail?.trim() || '';

    const items = episodes
      // Un épisode sans fichier n'a rien à faire dans un flux podcast :
      // l'application n'aurait rien à télécharger. Il reste lisible sur
      // le site, il n'est simplement pas diffusé.
      .filter((e) => typeof e.audio === 'object' && e.audio && e.audio.filename)
      .map((e) => {
        const audio = e.audio as {
          filename?: string;
          filesize?: number | null;
          mimeType?: string | null;
        };
        const url = audioFileUrl(audio.filename);
        const duree = chrono(e.durationSeconds);
        const lien = `${base}${publicationHref('podcasts', e.publicId)}`;
        return [
          '    <item>',
          `      <title>${xml(e.title)}</title>`,
          `      <link>${xml(lien)}</link>`,
          // L'identifiant public, jamais l'URL : une adresse qui change
          // ferait réapparaître tous les épisodes comme neufs.
          `      <guid isPermaLink="false">${xml(e.publicId)}</guid>`,
          `      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>`,
          `      <description>${xml(e.lede)}</description>`,
          `      <itunes:summary>${xml(e.lede)}</itunes:summary>`,
          `      <itunes:author>${xml(auteur)}</itunes:author>`,
          `      <itunes:explicit>${explicite}</itunes:explicit>`,
          // Le rang dans l'émission quand il est saisi : c'est ce qui
          // permet aux applications d'ordonner autrement que par date.
          typeof e.seriesNumber === 'number'
            ? `      <itunes:episode>${e.seriesNumber}</itunes:episode>`
            : null,
          duree ? `      <itunes:duration>${duree}</itunes:duration>` : null,
          `      <enclosure url="${xml(url)}" length="${audio.filesize ?? 0}" type="${xml(
            audio.mimeType || 'audio/mpeg',
          )}"/>`,
          '    </item>',
        ]
          .filter(Boolean)
          .join('\n');
      });

    const description = serie.lede?.trim() || `${serie.name} — une émission de ${siteName}.`;
    // Le nom du site accompagne celui de l'émission : dans une
    // application d'écoute, le flux est sorti de son contexte et
    // « Marées » tout court ne dit pas d'où ça vient.
    const titre = `${serie.name} — ${siteName}`;

    const flux = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${xml(titre)}</title>`,
      `    <link>${xml(`${base}/series/${serie.slug}/`)}</link>`,
      `    <description>${xml(description)}</description>`,
      '    <language>fr-FR</language>',
      `    <atom:link href="${xml(
        `${base}/series/${serie.slug}/rss.xml`,
      )}" rel="self" type="application/rss+xml"/>`,
      `    <itunes:author>${xml(auteur)}</itunes:author>`,
      `    <itunes:summary>${xml(description)}</itunes:summary>`,
      '    <itunes:type>episodic</itunes:type>',
      `    <itunes:explicit>${explicite}</itunes:explicit>`,
      `    <itunes:category text="${xml(categorie)}"/>`,
      coverUrl ? `    <itunes:image href="${xml(coverUrl)}"/>` : null,
      contact
        ? [
            '    <itunes:owner>',
            `      <itunes:name>${xml(auteur)}</itunes:name>`,
            `      <itunes:email>${xml(contact)}</itunes:email>`,
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
    console.error('[serie-rss] échec :', (err as Error).message);
    return new Response('Erreur lors de la génération du flux.', { status: 500 });
  }
};
