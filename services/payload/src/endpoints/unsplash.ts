// Endpoints custom pour le picker « Rechercher sur Unsplash » (cf.
// components/admin/publications/UnsplashImagePicker.client.tsx),
// montés sous /cms/api/unsplash/*.
//
//   GET  /unsplash/search  — proxy la recherche Unsplash, clé API
//        gardée côté serveur (jamais exposée au navigateur).
//   POST /unsplash/import  — télécharge la photo choisie et crée un
//        doc `media` auto-hébergé, avec l'attribution requise.
//
// Conditions d'utilisation Unsplash (non négociables, pas juste de
// bonnes pratiques) : (1) auto-héberger la photo choisie plutôt que
// hotlink permanent vers leurs serveurs, (2) appeler leur endpoint
// `download_location` au moment de l'usage réel — c'est leur mesure de
// popularité des photos, (3) créditer le·a photographe + Unsplash
// partout où la photo apparaît (géré ici en stockant l'attribution sur
// le doc media ; l'affichage public est dans PublicationArticle.astro).

import type { Endpoint, PayloadRequest } from 'payload';

import { errorResponse, jsonResponse, readJsonBody } from '../auth/helpers';

const UNSPLASH_API = 'https://api.unsplash.com';

// requireUser() (auth/helpers.ts) lit req.user, que Payload ne peuple
// que pour les endpoints montés sur une collection (ex. zoteroEndpoints
// sous Users) — pas pour les endpoints globaux déclarés dans
// buildConfig({ endpoints: [...] }), notre cas ici. Il faut résoudre
// l'utilisateur soi-même via payload.auth(), comme components/admin/Nav.tsx.
async function requireGlobalUser(req: PayloadRequest) {
  const { user } = await req.payload.auth({ headers: req.headers });
  return user ?? null;
}

function accessKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  return key && key.trim() ? key.trim() : null;
}

function authHeaders(key: string): HeadersInit {
  return { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' };
}

type UnsplashUser = { name?: string; links?: { html?: string } };
type UnsplashUrls = { thumb?: string; small?: string; regular?: string; full?: string };
type UnsplashLinks = { html?: string; download_location?: string };
type UnsplashPhoto = {
  id: string;
  width?: number;
  height?: number;
  alt_description?: string | null;
  description?: string | null;
  urls?: UnsplashUrls;
  links?: UnsplashLinks;
  user?: UnsplashUser;
};

// Un échec côté Unsplash remontait en « HTTP 502 » nu côté admin, ce qui
// ne dit pas quoi corriger — or la cause de loin la plus fréquente est
// une clé absente ou erronée. On traduit donc les statuts connus.
function upstreamError(status: number) {
  if (status === 401) {
    return errorResponse(
      "Unsplash refuse la clé (401). Vérifiez UNSPLASH_ACCESS_KEY : c'est l'« Access Key » de l'application Unsplash, pas la Secret Key.",
      502,
    );
  }
  if (status === 403) {
    return errorResponse(
      'Quota Unsplash dépassé (403) — 50 requêtes/heure pour une application en mode démo. Réessayez plus tard.',
      502,
    );
  }
  return errorResponse(`Unsplash a répondu ${status}.`, 502);
}

function summarize(p: UnsplashPhoto) {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    altDescription: p.alt_description || p.description || '',
    thumbUrl: p.urls?.thumb ?? p.urls?.small ?? '',
    photographerName: p.user?.name ?? '',
    photographerProfileUrl: p.user?.links?.html ?? '',
  };
}

// ─── GET /unsplash/search ─────────────────────────────────────────────

const unsplashSearchEndpoint: Endpoint = {
  path: '/unsplash/search',
  method: 'get',
  handler: async (req) => {
    const actor = await requireGlobalUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    const key = accessKey();
    if (!key) return errorResponse('UNSPLASH_ACCESS_KEY absente côté serveur.', 500);

    const url = new URL(req.url ?? '', 'http://placeholder');
    const query = (url.searchParams.get('query') ?? '').trim();
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    if (!query) return jsonResponse({ results: [], totalPages: 0 });

    const upstream = await fetch(
      `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=20`,
      { headers: authHeaders(key) },
    );
    if (!upstream.ok) return upstreamError(upstream.status);
    const body = (await upstream.json()) as { results?: UnsplashPhoto[]; total_pages?: number };
    return jsonResponse({
      results: (body.results ?? []).map(summarize),
      totalPages: body.total_pages ?? 0,
    });
  },
};

// ─── POST /unsplash/import ────────────────────────────────────────────

const unsplashImportEndpoint: Endpoint = {
  path: '/unsplash/import',
  method: 'post',
  handler: async (req) => {
    const actor = await requireGlobalUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    const key = accessKey();
    if (!key) return errorResponse('UNSPLASH_ACCESS_KEY absente côté serveur.', 500);

    const body = await readJsonBody<{ photoId?: string }>(req);
    const photoId = body?.photoId?.trim();
    if (!photoId) return errorResponse('photoId manquant.', 400);

    // Re-fetch les détails côté serveur plutôt que de faire confiance à
    // des métadonnées envoyées par le client — on ne stocke que ce
    // qu'Unsplash renvoie réellement pour cet id.
    const detailRes = await fetch(`${UNSPLASH_API}/photos/${encodeURIComponent(photoId)}`, {
      headers: authHeaders(key),
    });
    if (!detailRes.ok) return upstreamError(detailRes.status);
    const photo = (await detailRes.json()) as UnsplashPhoto;
    const imageUrl = photo.urls?.regular ?? photo.urls?.full;
    if (!imageUrl) return errorResponse('Aucune URL exploitable pour cette photo.', 502);

    // Tracking obligatoire : signale à Unsplash qu'on utilise réellement
    // cette photo (distinct d'une simple vue dans les résultats de
    // recherche). Best-effort — un échec ici ne doit pas bloquer
    // l'import, mais on le journalise.
    if (photo.links?.download_location) {
      try {
        await fetch(photo.links.download_location, { headers: authHeaders(key) });
      } catch (err) {
        console.warn('[unsplash] download tracking failed:', (err as Error).message);
      }
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return errorResponse(`Téléchargement de l'image échoué (${imgRes.status}).`, 502);
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const mimetype = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const photographerName = photo.user?.name ?? 'Unsplash';
    const alt = photo.alt_description || photo.description || `Photo par ${photographerName} sur Unsplash`;

    const created = await req.payload.create({
      collection: 'media',
      data: {
        title: `Unsplash — ${photographerName}`,
        alt,
        unsplash: {
          photoId: photo.id,
          photographerName,
          photographerProfileUrl: photo.user?.links?.html ?? '',
          photoPageUrl: photo.links?.html ?? '',
        },
      },
      file: {
        data,
        mimetype,
        name: `unsplash-${photo.id}.jpg`,
        size: data.byteLength,
      },
      overrideAccess: true,
      req,
    });

    return jsonResponse({ doc: created });
  },
};

export const unsplashEndpoints: Endpoint[] = [unsplashSearchEndpoint, unsplashImportEndpoint];
