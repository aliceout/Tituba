// Client minimal pour l'API Web Zotero v3.
// https://www.zotero.org/support/dev/web_api/v3/start
//
// On pagine via les params `start` + `limit` (max 100). Le header
// `Last-Modified-Version` de la 1ère réponse donne la version Zotero
// la plus récente vue — on la stocke comme `lastSyncVersion` pour le
// diff incrémental du prochain sync (param `since`).
//
// Pas de retry/backoff sophistiqué ici : si Zotero renvoie 429, on
// remonte l'erreur — l'utilisatrice peut réessayer dans quelques minutes.

import type { ZoteroItem } from './types';

const BASE_URL = 'https://api.zotero.org';
const PAGE_LIMIT = 100;

export type ZoteroLibraryType = 'user' | 'group';

export type ZoteroCreds = {
  apiKey: string;
  libraryId: string;
  libraryType: ZoteroLibraryType;
};

function libraryPath(creds: ZoteroCreds): string {
  const segment = creds.libraryType === 'group' ? 'groups' : 'users';
  return `${BASE_URL}/${segment}/${encodeURIComponent(creds.libraryId)}`;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    'Zotero-API-Key': apiKey,
    'Zotero-API-Version': '3',
    Accept: 'application/json',
  };
}

/**
 * Test léger de la connexion : appelle `/items/top?limit=1` et regarde
 * si Zotero répond OK. On utilise `/items/top` (et non `/items`) parce
 * qu'on ne s'intéresse qu'aux items bibliographiques racines — pas aux
 * pièces jointes (PDF, snapshots) ni aux notes attachées, qui n'ont
 * pas de titre ni d'auteur exploitable côté Carnet.
 *
 * Renvoie `{ ok: true, itemCount }` si tout va bien, sinon
 * `{ ok: false, error: '...' }`.
 */
export async function testConnection(creds: ZoteroCreds): Promise<{
  ok: boolean;
  error?: string;
  itemCount?: number;
}> {
  try {
    const url = `${libraryPath(creds)}/items/top?limit=1&format=json`;
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(creds.apiKey),
    });
    if (res.status === 403) {
      return {
        ok: false,
        error: 'Clé API refusée. Vérifie qu’elle a accès à cette bibliothèque.',
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        error: 'Bibliothèque introuvable. Vérifie l’ID et le type (user/group).',
      };
    }
    if (!res.ok) {
      return { ok: false, error: `Zotero a répondu HTTP ${res.status}.` };
    }
    const totalHeader = res.headers.get('Total-Results');
    const itemCount = totalHeader ? parseInt(totalHeader, 10) : undefined;
    return { ok: true, itemCount };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Erreur réseau : ${err.message}`
          : 'Erreur réseau inconnue.',
    };
  }
}

/**
 * Itère sur tous les items modifiés depuis `since` (version Zotero).
 * Si `since` est 0 / undefined, ramène tout. Pagine en interne — appelle
 * le callback `onPage` pour chaque page.
 *
 * Renvoie la version Zotero la plus récente vue (header
 * `Last-Modified-Version` de la 1ère réponse).
 */
export async function fetchAllItems(
  creds: ZoteroCreds,
  since: number,
  onPage: (items: ZoteroItem[]) => Promise<void> | void,
): Promise<{ newVersion: number; total: number }> {
  let start = 0;
  let total = 0;
  let newVersion = since;
  let firstResponse = true;

  while (true) {
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      start: String(start),
      format: 'json',
    });
    if (since > 0) params.set('since', String(since));

    // /items/top → seulement les items racines (livres, articles…),
    // pas les pièces jointes ni les notes attachées.
    const url = `${libraryPath(creds)}/items/top?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(creds.apiKey),
    });
    if (!res.ok) {
      throw new Error(`Zotero a répondu HTTP ${res.status} sur /items/top.`);
    }

    if (firstResponse) {
      const lmv = res.headers.get('Last-Modified-Version');
      if (lmv) newVersion = parseInt(lmv, 10) || newVersion;
      const totalHeader = res.headers.get('Total-Results');
      if (totalHeader) total = parseInt(totalHeader, 10) || 0;
      firstResponse = false;
    }

    const items = (await res.json()) as ZoteroItem[];
    if (!Array.isArray(items) || items.length === 0) break;
    await onPage(items);

    if (items.length < PAGE_LIMIT) break;
    start += items.length;

    // Garde-fou : ne pas paginer indéfiniment si le serveur renvoyait
    // toujours des pages pleines (cas anormal).
    if (start > 10000) break;
  }

  return { newVersion, total };
}
