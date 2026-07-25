// Endpoints de gestion du profil utilisateur (devices, touch, logout).
// Le 2FA est uniquement par email — pas de switch de méthode, pas
// d'enrôlement TOTP, pas de codes de secours.
//
//   GET    /users/me/trusted-devices
//   DELETE /users/me/trusted-devices/:deviceId
//   POST   /users/me/touch
//   POST   /users/me/logout

import type { Endpoint } from 'payload';

import {
  errorResponse,
  jsonResponse,
  requireUser,
} from '../helpers';

// ─── GET /users/me/trusted-devices ────────────────────────────────

const listDevicesEndpoint: Endpoint = {
  path: '/me/trusted-devices',
  method: 'get',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);
    const user = await req.payload.findByID({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      depth: 0,
    });
    const devices = ((user as { trustedDevices?: Array<{ deviceId: string; label?: string; userAgent?: string; ip?: string; createdAt: string; expiresAt: string }> }).trustedDevices ?? [])
      .filter((d) => new Date(d.expiresAt).getTime() > Date.now())
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label,
        userAgent: d.userAgent,
        ip: d.ip,
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
      }));
    return jsonResponse({ devices });
  },
};

// ─── DELETE /users/me/trusted-devices/:deviceId ───────────────────

const revokeDeviceEndpoint: Endpoint = {
  path: '/me/trusted-devices/:deviceId',
  method: 'delete',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);
    const deviceId = (req.routeParams as { deviceId?: string } | undefined)?.deviceId;
    if (!deviceId) return errorResponse('deviceId manquant', 400);

    const user = await req.payload.findByID({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      depth: 0,
    });
    const remaining = ((user as { trustedDevices?: Array<{ deviceId: string; fingerprintHash: string; expiresAt: string; createdAt: string; label?: string; userAgent?: string; ip?: string }> }).trustedDevices ?? [])
      .filter((d) => d.deviceId !== deviceId);
    await req.payload.update({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      data: { trustedDevices: remaining },
    });
    return jsonResponse({ ok: true });
  },
};

// ─── POST /users/me/touch ─────────────────────────────────────────
// Pingé périodiquement par l'admin tant que l'onglet est ouvert.
// Met à jour lastActivityAt → permet au cleanup cron de distinguer un
// onglet ouvert mais inactif d'un user vraiment parti.

const touchEndpoint: Endpoint = {
  path: '/me/touch',
  method: 'post',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return errorResponse('Non authentifié', 401);
    await req.payload.update({
      collection: 'users',
      id: actor.id,
      overrideAccess: true,
      req,
      data: { lastActivityAt: new Date().toISOString() },
    });
    return jsonResponse({ ok: true });
  },
};

// ─── POST /users/me/logout ────────────────────────────────────────

const logoutEndpoint: Endpoint = {
  path: '/me/logout',
  method: 'post',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor) return jsonResponse({ ok: true });
    return jsonResponse({ ok: true }, { status: 200 });
  },
};

export const profileEndpoints: Endpoint[] = [
  listDevicesEndpoint,
  revokeDeviceEndpoint,
  touchEndpoint,
  logoutEndpoint,
];
