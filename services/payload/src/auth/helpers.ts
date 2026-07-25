// Helpers communs aux endpoints auth.

import type { PayloadRequest } from 'payload';

import { AUTH_CONFIG, COOKIE_NAMES } from './config';
import { buildCookie, clearCookie, isSecureRequest, readCookie, signCookie, verifyCookie } from './cookies';
import { generateNumericCode, hashToken, safeEqualHex } from './crypto';
import { getSiteName, twoFactorCodeEmail } from './email-templates';
import { clientIpFromHeaders } from './rate-limit';

export type ApiUser = {
  id: number | string;
  email: string;
  role?: 'root' | 'admin' | 'editor';
  status?: 'pending' | 'active' | 'disabled';
  displayName?: string;
};

export function jsonResponse(body: unknown, init: ResponseInit = {}, extraSetCookies: string[] = []): Response {
  const headers = new Headers(init.headers ?? {});
  headers.set('content-type', 'application/json');
  for (const c of extraSetCookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({ error: message, code }, { status });
}

export async function readJsonBody<T = Record<string, unknown>>(req: PayloadRequest): Promise<T | null> {
  try {
    if (typeof (req as unknown as { json?: () => Promise<T> }).json === 'function') {
      return await (req as unknown as { json: () => Promise<T> }).json();
    }
  } catch {
    return null;
  }
  return null;
}

export function requireUser(req: PayloadRequest): ApiUser | null {
  if (!req.user) return null;
  return req.user as unknown as ApiUser;
}

// ─── Trusted device cookie ──────────────────────────────────────────

type TrustedDeviceCookie = {
  uid: string | number;
  did: string;
  fp: string; // fingerprint plaintext (utilisé pour recalculer le hash)
};

export function readTrustedDeviceCookie(req: PayloadRequest): TrustedDeviceCookie | null {
  const raw = readCookie(req.headers, COOKIE_NAMES.trustedDevice);
  return verifyCookie<TrustedDeviceCookie>(raw);
}

export function buildTrustedDeviceCookie(payload: TrustedDeviceCookie): string {
  return buildCookie(COOKIE_NAMES.trustedDevice, signCookie(payload), {
    maxAgeSec: AUTH_CONFIG.trustedDeviceTtlDays * 24 * 60 * 60,
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: 'Lax',
  });
}

export function clearTrustedDeviceCookie(): string {
  return clearCookie(COOKIE_NAMES.trustedDevice);
}

// ─── Pending 2FA cookie ─────────────────────────────────────────────

export function buildPendingTwoFactorCookie(sessionId: string): string {
  return buildCookie(COOKIE_NAMES.pendingTwoFactor, signCookie({ s: sessionId }), {
    maxAgeSec: 15 * 60,
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: 'Lax',
  });
}

export function readPendingTwoFactorCookie(req: PayloadRequest): string | null {
  const raw = readCookie(req.headers, COOKIE_NAMES.pendingTwoFactor);
  const decoded = verifyCookie<{ s: string }>(raw);
  return decoded?.s ?? null;
}

export function clearPendingTwoFactorCookie(): string {
  return clearCookie(COOKIE_NAMES.pendingTwoFactor);
}

// ─── Payload-token cookie (compat avec le cookie natif Payload) ─────
// Payload pose son cookie via `Set-Cookie: payload-token=...; HttpOnly`.
// Quand on émet manuellement un JWT (post-2FA), on doit poser le même
// cookie pour que les requêtes suivantes soient authentifiées.

export function buildPayloadTokenCookie(token: string): string {
  return buildCookie('payload-token', token, {
    maxAgeSec: AUTH_CONFIG.sessionInactiveHours * 60 * 60,
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: 'Lax',
  });
}

// ─── Email OTP : envoi + vérif ──────────────────────────────────────

export async function generateAndSendEmailOtp(
  req: PayloadRequest,
  user: { id: number | string; email: string },
): Promise<void> {
  const code = generateNumericCode(AUTH_CONFIG.otpDigits);
  const expiresAt = new Date(Date.now() + AUTH_CONFIG.otpTtlMinutes * 60 * 1000).toISOString();

  await req.payload.update({
    collection: 'users',
    id: user.id,
    overrideAccess: true,
    req,
    data: {
      twoFactor: {
        emailCodeHash: hashToken(code),
        emailCodeExpiresAt: expiresAt,
        emailCodeAttempts: 0,
      },
    },
  });

  const ip = clientIpFromHeaders(req.headers);
  const ua = req.headers.get('user-agent') ?? undefined;
  const siteName = await getSiteName(req.payload);
  const tpl = twoFactorCodeEmail({ code, ip, userAgent: ua, siteName });

  if (req.payload.email && typeof req.payload.sendEmail === 'function') {
    await req.payload.sendEmail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
  }
}

export async function verifyEmailOtp(
  req: PayloadRequest,
  userId: number | string,
  code: string,
): Promise<boolean> {
  const user = await req.payload.findByID({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    req,
    depth: 0,
  });
  const tf = (user as { twoFactor?: { emailCodeHash?: string | null; emailCodeExpiresAt?: string | null; emailCodeAttempts?: number | null } }).twoFactor;
  if (!tf?.emailCodeHash || !tf?.emailCodeExpiresAt) return false;
  if (new Date(tf.emailCodeExpiresAt).getTime() < Date.now()) {
    await clearEmailOtp(req, userId);
    return false;
  }
  if ((tf.emailCodeAttempts ?? 0) >= AUTH_CONFIG.otpMaxAttemptsPerCode) {
    await clearEmailOtp(req, userId);
    return false;
  }
  const ok = safeEqualHex(hashToken(code.replace(/\s/g, '')), tf.emailCodeHash);
  if (!ok) {
    await req.payload.update({
      collection: 'users',
      id: userId,
      overrideAccess: true,
      req,
      data: { twoFactor: { emailCodeAttempts: (tf.emailCodeAttempts ?? 0) + 1 } },
    });
    return false;
  }
  await clearEmailOtp(req, userId);
  return true;
}

export async function clearEmailOtp(req: PayloadRequest, userId: number | string): Promise<void> {
  await req.payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    req,
    data: {
      twoFactor: {
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        emailCodeAttempts: 0,
      },
    },
  });
}

// ─── Trusted device check ───────────────────────────────────────────

export async function isCurrentDeviceTrusted(
  req: PayloadRequest,
  userId: number | string,
): Promise<boolean> {
  const cookie = readTrustedDeviceCookie(req);
  // Comparaison en string : Postgres rend les IDs en number alors que les
  // cookies sérialisés JSON peuvent les conserver en number aussi, mais
  // avec un cast TS sur `number | string` on ne sait jamais. Sécurité
  // par cohérence du type comparé.
  if (!cookie || String(cookie.uid) !== String(userId)) return false;
  const user = await req.payload.findByID({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    req,
    depth: 0,
  });
  const devices = (user as { trustedDevices?: Array<{ deviceId: string; fingerprintHash: string; expiresAt: string }> }).trustedDevices ?? [];
  const match = devices.find((d) => d.deviceId === cookie.did);
  if (!match) return false;
  if (new Date(match.expiresAt).getTime() < Date.now()) return false;
  return safeEqualHex(hashToken(cookie.fp), match.fingerprintHash);
}
