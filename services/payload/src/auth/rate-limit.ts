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
  // Inscription publique aux alertes mail. Trois plafonds, qui ne
  // bornent pas la même chose :
  //  - subscribe      : par IP. Cinq essais par quart d'heure — assez
  //                     pour ressaisir une adresse mal tapée, pas assez
  //                     pour arroser.
  //  - subscribeFlood : coupe-circuit, clé fixe. Le seul plafond qu'une
  //                     rotation d'IP ne contourne pas, donc le seul qui
  //                     borne ce que le site peut émettre au total.
  //  - subscribeEmail : par adresse VISÉE, pas par appelant. Les deux
  //                     autres bornent l'émission ; celui-ci borne la
  //                     réception — ce qu'une même personne peut se voir
  //                     infliger depuis n'importe où. Trois mails par
  //                     jour vers une boîte donnée, c'est déjà large
  //                     pour une inscription qui se confirme en un clic.
  subscribe: { name: 'subscribe', max: 5, windowMs: 15 * 60 * 1000 },
  subscribeFlood: { name: 'subscribeFlood', max: 60, windowMs: 60 * 60 * 1000 },
  subscribeEmail: { name: 'subscribeEmail', max: 3, windowMs: 24 * 60 * 60 * 1000 },
  // Formulaire de contact public. Trois profils, qui ne protègent pas
  // la même chose :
  //  - contact      : envois aboutis, par IP. Trois messages par heure
  //                   depuis une même adresse suffisent largement à
  //                   quelqu'un de bonne foi.
  //  - contactDefi  : tirages de défi, par IP. Plus haut, parce qu'un
  //                   défi est tiré à chaque affichage de la page et à
  //                   chaque renouvellement, sans qu'un message soit
  //                   forcément envoyé.
  //  - contactFlood : coupe-circuit, clé fixe. C'est le SEUL plafond
  //                   qu'une inondation ne contourne pas en changeant
  //                   d'IP, donc la seule barrière réellement dure du
  //                   dispositif. Le reste filtre le volume ordinaire.
  contact: { name: 'contact', max: 3, windowMs: 60 * 60 * 1000 },
  contactDefi: { name: 'contactDefi', max: 30, windowMs: 10 * 60 * 1000 },
  contactFlood: { name: 'contactFlood', max: 30, windowMs: 60 * 60 * 1000 },
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
