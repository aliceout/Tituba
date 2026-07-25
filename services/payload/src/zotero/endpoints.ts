// Endpoints HTTP custom branchés sous le slug `users` (donc accessibles
// sous /cms/api/users/me/zotero-*). Cf payload.config.ts → endpoints.
//
//   POST /users/me/zotero-test : teste la connexion (clé + libraryId)
//   POST /users/me/zotero-sync : déclenche un sync complet
//
// Tous deux requièrent une session authentifiée : c'est un sync « par
// soi-même », jamais entre comptes. L'admin ne peut pas synchroniser
// la bibliothèque Zotero d'un autre user (la clé est masquée à la
// lecture, et même si on la déchiffrait, ça serait un usage non-désiré).

import type { Endpoint } from 'payload';

import { errorResponse, jsonResponse, readJsonBody, requireUser } from '../auth/helpers';
import { decrypt, isEncrypted } from '../lib/crypto';
import { testConnection, type ZoteroLibraryType } from './api';
import { syncZoteroForUser } from './sync';

type UserZoteroDoc = {
  zotero?: {
    apiKey?: string | null;
    libraryId?: string | null;
    libraryType?: ZoteroLibraryType | null;
    lastSyncAt?: string | null;
    lastSyncVersion?: number | null;
    lastSyncAdded?: number | null;
    lastSyncUpdated?: number | null;
    lastSyncError?: string | null;
  };
};

// ─── GET /users/me/zotero-status ─────────────────────────────────────
// État sanitisé pour l'UI : confirme la présence de la clé sans la
// révéler. Renvoie `last4` (4 derniers caractères de la clé en clair)
// pour donner un indice visuel à l'utilisatrice. Le déchiffrement n'a
// lieu QUE côté serveur ici, jamais retourné brut.

const zoteroStatusEndpoint: Endpoint = {
  path: '/me/zotero-status',
  method: 'get',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    const userDoc = (await req.payload.findByID({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      depth: 0,
    })) as UserZoteroDoc;

    const z = userDoc.zotero ?? {};
    let configured = false;
    let last4: string | null = null;
    if (typeof z.apiKey === 'string' && isEncrypted(z.apiKey)) {
      try {
        const plain = decrypt(z.apiKey);
        configured = plain.length > 0;
        last4 = plain.length >= 4 ? plain.slice(-4) : plain;
      } catch {
        // Clé corrompue (mauvais PAYLOAD_SECRET ?). On signale comme
        // non configurée, l'utilisatrice devra re-saisir.
      }
    }

    return jsonResponse({
      configured,
      last4,
      libraryId: z.libraryId ?? '',
      libraryType: z.libraryType ?? 'user',
      lastSyncAt: z.lastSyncAt ?? null,
      lastSyncVersion: z.lastSyncVersion ?? null,
      lastSyncAdded: z.lastSyncAdded ?? null,
      lastSyncUpdated: z.lastSyncUpdated ?? null,
      lastSyncError: z.lastSyncError ?? null,
    });
  },
};

// ─── POST /users/me/zotero-test ──────────────────────────────────────
// Lit les credentials persistés du user courant et les teste contre
// l'API Zotero. Renvoie `{ ok: true, itemCount }` ou `{ ok: false, error }`.

const zoteroTestEndpoint: Endpoint = {
  path: '/me/zotero-test',
  method: 'post',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    const userDoc = (await req.payload.findByID({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      depth: 0,
    })) as UserZoteroDoc;

    const z = userDoc.zotero;
    if (!z?.apiKey || !z?.libraryId) {
      return errorResponse(
        'Clé API ou ID utilisateur Zotero non configuré.',
        400,
      );
    }
    let apiKey: string;
    try {
      apiKey = decrypt(z.apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(
        `Impossible de déchiffrer la clé API. Re-saisissez-la. (${msg})`,
        500,
      );
    }
    const result = await testConnection({
      apiKey,
      libraryId: String(z.libraryId),
      libraryType: z.libraryType === 'group' ? 'group' : 'user',
    });
    return jsonResponse(result);
  },
};

// ─── POST /users/me/zotero-sync ──────────────────────────────────────
// Déclenche un sync complet pour le user courant. Synchrone : la
// requête attend la fin (les biblios académiques font typiquement
// quelques centaines d'items, c'est < 30 s).

const zoteroSyncEndpoint: Endpoint = {
  path: '/me/zotero-sync',
  method: 'post',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    try {
      const result = await syncZoteroForUser({
        payload: req.payload,
        userId: actor.id,
        req,
      });
      return jsonResponse({
        ok: true,
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        keptCited: result.keptCited,
        errors: result.errors,
        newVersion: result.newVersion,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue.';
      return errorResponse(msg, 500);
    }
  },
};

// ─── DELETE /users/me/zotero ─────────────────────────────────────────
// Déconnecte Zotero : efface la clé + l'id + reset les flags. Les refs
// déjà importées en bibliography ne sont PAS supprimées (elles peuvent
// être citées dans des billets) — l'autrice peut les nettoyer à la
// main si elle le souhaite.

const zoteroDisconnectEndpoint: Endpoint = {
  path: '/me/zotero',
  method: 'delete',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    await req.payload.update({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      data: {
        zotero: {
          apiKey: null,
          libraryId: null,
          libraryType: 'user',
          lastSyncAt: null,
          lastSyncVersion: null,
          lastSyncAdded: null,
          lastSyncUpdated: null,
          lastSyncError: null,
        },
      },
    });

    return jsonResponse({ ok: true });
  },
};

// ─── PATCH /users/me/zotero ──────────────────────────────────────────
// Saisie/édition des credentials (clé API + libraryId + type). Le hook
// beforeChange du field chiffre la clé. Endpoint séparé du PATCH user
// natif pour éviter d'exposer la clé en clair via une réponse REST :
// ici on accepte seulement les 3 champs pertinents et on renvoie juste
// `{ ok: true }`.

const zoteroSaveEndpoint: Endpoint = {
  path: '/me/zotero',
  method: 'patch',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);

    const body = await readJsonBody<{
      apiKey?: string;
      libraryId?: string;
      libraryType?: 'user' | 'group';
    }>(req);
    if (!body) return errorResponse('Corps JSON invalide.', 400);

    const update: Record<string, unknown> = {};
    if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
      update.apiKey = body.apiKey;
    }
    if (typeof body.libraryId === 'string') {
      update.libraryId = body.libraryId.trim();
    }
    if (body.libraryType === 'user' || body.libraryType === 'group') {
      update.libraryType = body.libraryType;
    }
    if (Object.keys(update).length === 0) {
      return errorResponse('Aucun champ à mettre à jour.', 400);
    }

    await req.payload.update({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      data: { zotero: update },
    });

    return jsonResponse({ ok: true });
  },
};

export const zoteroEndpoints: Endpoint[] = [
  zoteroStatusEndpoint,
  zoteroTestEndpoint,
  zoteroSyncEndpoint,
  zoteroDisconnectEndpoint,
  zoteroSaveEndpoint,
];
