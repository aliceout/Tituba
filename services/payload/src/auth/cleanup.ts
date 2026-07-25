// Job de nettoyage périodique. Lancé via setInterval au boot du process
// Next.js (cf payload.config onInit). Acceptable pour ce volume — si on
// passait en multi-instance il faudrait un vrai scheduler (BullMQ ou
// pg_cron).
//
// Ce qu'il fait :
//  1. Supprime les comptes status=pending dont l'invitation a expiré.
//  2. Purge les trustedDevices expirés sur tous les users.
//  3. Force un logout des users inactifs > sessionInactiveHours :
//     vide leurs trustedDevices et supprime leurs sessions Payload
//     natives (si la collection les expose).
//  4. Vide les codes OTP email expirés.

import type { Payload } from 'payload';

import { AUTH_CONFIG } from './config';

const ONE_HOUR_MS = 60 * 60 * 1000;

let started = false;

export function startCleanupJob(payload: Payload): void {
  if (started) return;
  started = true;
  // Premier run au boot, puis toutes les heures.
  void runCleanup(payload).catch((err) => payload.logger.error({ err }, 'auth_cleanup_failed'));
  const handle = setInterval(() => {
    void runCleanup(payload).catch((err) => payload.logger.error({ err }, 'auth_cleanup_failed'));
  }, ONE_HOUR_MS);
  handle.unref?.();
}

async function runCleanup(payload: Payload): Promise<void> {
  const now = new Date();
  const stats = { invitations: 0, trustedDevices: 0, inactiveUsers: 0, expiredOtps: 0 };

  // 1. Comptes pending expirés.
  const expiredInvits = await payload.find({
    collection: 'users',
    where: {
      and: [
        { status: { equals: 'pending' } },
        { 'invitation.expiresAt': { less_than: now.toISOString() } },
      ],
    },
    limit: 100,
    overrideAccess: true,
    pagination: false,
  });
  for (const u of expiredInvits.docs as Array<{ id: number | string; role?: string }>) {
    if (u.role === 'root') continue; // safety net
    try {
      await payload.delete({ collection: 'users', id: u.id, overrideAccess: true });
      stats.invitations++;
    } catch (err) {
      payload.logger.error({ err, id: u.id }, 'cleanup_delete_pending_failed');
    }
  }

  // 2 & 3 : un seul scan des users actifs.
  const inactiveCutoff = new Date(now.getTime() - AUTH_CONFIG.sessionInactiveHours * ONE_HOUR_MS);
  const users = await payload.find({
    collection: 'users',
    where: { status: { equals: 'active' } },
    limit: 500,
    overrideAccess: true,
    pagination: false,
    depth: 0,
  });

  for (const u of users.docs as Array<{
    id: number | string;
    lastActivityAt?: string | null;
    trustedDevices?: Array<{ deviceId: string; expiresAt: string; fingerprintHash: string; createdAt: string; label?: string; userAgent?: string; ip?: string }>;
    twoFactor?: {
      emailCodeHash?: string | null;
      emailCodeExpiresAt?: string | null;
      emailCodeAttempts?: number | null;
    } | null;
  }>) {
    const updates: Record<string, unknown> = {};

    // Trusted devices expirés (purge).
    const liveDevices = (u.trustedDevices ?? []).filter(
      (d) => new Date(d.expiresAt).getTime() > now.getTime(),
    );
    if (liveDevices.length !== (u.trustedDevices ?? []).length) {
      stats.trustedDevices += (u.trustedDevices ?? []).length - liveDevices.length;
      updates.trustedDevices = liveDevices;
    }

    // OTP email expirés (purge).
    if (
      u.twoFactor?.emailCodeExpiresAt &&
      new Date(u.twoFactor.emailCodeExpiresAt).getTime() < now.getTime()
    ) {
      updates.twoFactor = {
        ...u.twoFactor,
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        emailCodeAttempts: 0,
      };
      stats.expiredOtps++;
    }

    // Logout forcé si inactif > 48h (supprime tous les trusted devices,
    // ce qui force un nouveau 2FA + login à la prochaine ouverture).
    // Note : les sessions Payload natives ont aussi leur expiry via
    // tokenExpiration, donc on ne les touche pas ici.
    if (
      u.lastActivityAt &&
      new Date(u.lastActivityAt).getTime() < inactiveCutoff.getTime() &&
      liveDevices.length > 0
    ) {
      updates.trustedDevices = [];
      stats.inactiveUsers++;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await payload.update({
          collection: 'users',
          id: u.id,
          overrideAccess: true,
          data: updates,
        });
      } catch (err) {
        payload.logger.error({ err, id: u.id }, 'cleanup_update_user_failed');
      }
    }
  }

  payload.logger.info(stats, 'auth_cleanup_complete');
}
