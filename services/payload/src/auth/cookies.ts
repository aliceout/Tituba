// Helpers cookies signés HMAC-SHA256.
//
// On utilise nos propres cookies pour stocker des états transitoires
// d'auth (pending 2FA, step-up password, trusted device) sans toucher
// au cookie payload-token natif (géré par Payload).
//
// Format : `<base64url(payload)>.<hexHmac>`
// Le payload est un JSON sérialisé. La signature est HMAC-SHA256(PAYLOAD_SECRET).

import { createHmac, timingSafeEqual } from 'node:crypto';

function hmac(value: string): string {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error('PAYLOAD_SECRET manquant');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function signCookie<T>(payload: T): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  return `${b64}.${hmac(b64)}`;
}

export function verifyCookie<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const b64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmac(b64);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export type CookieOptions = {
  maxAgeSec?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export function buildCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.maxAgeSec !== undefined) parts.push(`Max-Age=${opts.maxAgeSec}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function clearCookie(name: string, opts: Pick<CookieOptions, 'path'> = {}): string {
  return `${name}=; Path=${opts.path ?? '/'}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function readCookie(headers: Headers, name: string): string | null {
  const header = headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return null;
}

// Détecte si on est en HTTPS (pour le flag Secure). En dev local on laisse
// Secure=true quand même — les browsers tolèrent Secure sur localhost
// en HTTP depuis Chrome 89.
export function isSecureRequest(): boolean {
  // Toujours true par défaut, override possible via env si besoin de
  // débugger en HTTP non-localhost.
  return process.env.PAYLOAD_INSECURE_COOKIES !== 'true';
}
