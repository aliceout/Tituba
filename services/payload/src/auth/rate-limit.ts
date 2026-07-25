// Rate limiter en mémoire, fenêtre glissante.
//
// Stocke par clé (IP ou email) un compteur + timestamp de début de
// fenêtre. Suffisant tant qu'on a un seul process Next ; si on passe
// en multi-instance il faudra un Redis. Les fenêtres expirées sont
// nettoyées périodiquement pour ne pas faire grossir la Map.
//
// Trois profils prédéfinis :
//  - login   : 10 essais / 15 min par IP (anti credential stuffing)
//  - otp     : 5 essais / 10 min par user (anti brute force OTP)
//  - send    : 3 envois / 10 min par user (anti spam mail)

type Bucket = { count: number; windowStart: number };

export type RateProfile = {
  name: string;
  max: number;
  windowMs: number;
};

export const RATE_PROFILES = {
  login: { name: 'login', max: 10, windowMs: 15 * 60 * 1000 },
  otp: { name: 'otp', max: 5, windowMs: 10 * 60 * 1000 },
  send: { name: 'send', max: 3, windowMs: 10 * 60 * 1000 },
  invite: { name: 'invite', max: 20, windowMs: 60 * 60 * 1000 },
  // Inscription publique aux alertes mail : 5 essais / 15 min par IP.
  // Anti-flood du formulaire /abonnement/ sans bloquer l'utilisatrice
  // qui ressaisit une typo dans son email.
  subscribe: { name: 'subscribe', max: 5, windowMs: 15 * 60 * 1000 },
} as const satisfies Record<string, RateProfile>;

const buckets = new Map<string, Bucket>();

export function consume(profile: RateProfile, key: string): { ok: boolean; retryAfterSec?: number } {
  const fullKey = `${profile.name}:${key}`;
  const now = Date.now();
  const entry = buckets.get(fullKey);
  if (!entry || now - entry.windowStart > profile.windowMs) {
    buckets.set(fullKey, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (entry.count >= profile.max) {
    const retryAfterSec = Math.ceil((profile.windowMs - (now - entry.windowStart)) / 1000);
    return { ok: false, retryAfterSec };
  }
  entry.count++;
  return { ok: true };
}

export function reset(profile: RateProfile, key: string): void {
  buckets.delete(`${profile.name}:${key}`);
}

// Cleanup périodique : toutes les 10 min, on supprime les buckets dont
// la fenêtre est terminée.
let cleanupHandle: ReturnType<typeof setInterval> | null = null;
export function startRateLimitCleanup(): void {
  if (cleanupHandle) return;
  cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      const profileName = key.split(':', 1)[0];
      const profile = (RATE_PROFILES as Record<string, RateProfile>)[profileName];
      const ttl = profile?.windowMs ?? 60 * 60 * 1000;
      if (now - entry.windowStart > ttl) buckets.delete(key);
    }
  }, 10 * 60 * 1000);
  cleanupHandle.unref?.();
}

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
