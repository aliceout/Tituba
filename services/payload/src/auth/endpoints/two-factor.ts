// Endpoints du flux 2FA email à la connexion.
//
//   POST /users/login-2fa
//     Body: { email, password }
//     Public. Vérifie email/password via payload.login(). Si trusted
//     device → renvoie le cookie payload-token directement. Sinon →
//     déclenche l'envoi du code email et pose un cookie pl_pending_2fa.
//
//   POST /users/two-factor/verify
//     Body: { code, rememberDevice? }
//     Public mais nécessite le cookie pl_pending_2fa. Vérifie le code
//     OTP email. Si OK → installe le cookie payload-token, et si
//     rememberDevice=true → ajoute un trusted device 7j.
//
//   POST /users/two-factor/resend-email
//     Public mais nécessite le cookie pl_pending_2fa. Re-génère et
//     ré-envoie un OTP email (rate-limité fortement).

import type { Endpoint } from 'payload';

import { AUTH_CONFIG } from '../config';
import { generateUrlSafeToken, hashToken } from '../crypto';
import {
  buildPayloadTokenCookie,
  buildPendingTwoFactorCookie,
  buildTrustedDeviceCookie,
  clearPendingTwoFactorCookie,
  errorResponse,
  generateAndSendEmailOtp,
  isCurrentDeviceTrusted,
  jsonResponse,
  readJsonBody,
  readPendingTwoFactorCookie,
  verifyEmailOtp,
} from '../helpers';
import { consumePendingLogin, createPendingLogin, peekPendingLogin } from '../pending-store';
import { clientIpFromHeaders, consume, RATE_PROFILES } from '../rate-limit';

const PENDING_LOGIN_TTL_MS = 15 * 60 * 1000;

// ─── POST /users/login-2fa ─────────────────────────────────────────

const loginEndpoint: Endpoint = {
  path: '/login-2fa',
  method: 'post',
  handler: async (req) => {
    const ip = clientIpFromHeaders(req.headers);
    const rl = consume(RATE_PROFILES.login, ip);
    if (!rl.ok) return errorResponse('Trop de tentatives, réessayez plus tard.', 429);

    const body = await readJsonBody<{ email?: string; password?: string }>(req);
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;
    if (!email || !password) return errorResponse('Email et mot de passe requis', 400);

    let loginResult: Awaited<ReturnType<typeof req.payload.login>>;
    try {
      loginResult = await req.payload.login({
        collection: 'users',
        data: { email, password },
        req,
      });
    } catch {
      // Pas de fuite d'info : message identique pour user inconnu / mdp faux.
      return errorResponse('Identifiants invalides', 401);
    }

    const user = loginResult.user as {
      id: number | string;
      email: string;
      status?: string;
    };

    if (user.status === 'pending') {
      return errorResponse('Compte en attente d\'activation. Vérifiez vos mails.', 403);
    }
    if (user.status === 'disabled') {
      return errorResponse('Ce compte a été désactivé.', 403);
    }

    // Trusted device présent et valide → on saute le 2FA.
    if (await isCurrentDeviceTrusted(req, user.id)) {
      const cookies = [buildPayloadTokenCookie(loginResult.token!)];
      await req.payload.update({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
        req,
        data: { lastLoginAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() },
      });
      return jsonResponse({ status: 'logged_in', user }, { status: 200 }, cookies);
    }

    // Sinon : on retient la session pending et on déclenche le 2FA.
    const sessionId = createPendingLogin({
      userId: user.id,
      email: user.email,
      token: loginResult.token!,
      ttlMs: PENDING_LOGIN_TTL_MS,
    });

    const otpRl = consume(RATE_PROFILES.send, String(user.id));
    if (!otpRl.ok) {
      return errorResponse('Trop de codes envoyés, réessayez dans quelques minutes.', 429);
    }
    try {
      await generateAndSendEmailOtp(req, { id: user.id, email: user.email });
    } catch (err) {
      req.payload.logger.error({ err }, 'otp_email_send_failed');
      return errorResponse('Envoi du code impossible. Réessayez.', 500);
    }

    const setCookies = [buildPendingTwoFactorCookie(sessionId)];
    return jsonResponse(
      {
        status: 'needs_two_factor',
        email: user.email,
      },
      { status: 200 },
      setCookies,
    );
  },
};

// ─── POST /users/two-factor/verify ────────────────────────────────

const verifyEndpoint: Endpoint = {
  path: '/two-factor/verify',
  method: 'post',
  handler: async (req) => {
    const ip = clientIpFromHeaders(req.headers);
    const sessionId = readPendingTwoFactorCookie(req);
    if (!sessionId) return errorResponse('Aucune session de connexion en attente.', 400);

    const pending = peekPendingLogin(sessionId);
    if (!pending) {
      return jsonResponse({ error: 'Session expirée, recommencez la connexion.' }, { status: 410 }, [
        clearPendingTwoFactorCookie(),
      ]);
    }

    const otpRl = consume(RATE_PROFILES.otp, String(pending.userId));
    if (!otpRl.ok) return errorResponse('Trop de tentatives, réessayez plus tard.', 429);

    const body = await readJsonBody<{ code?: string; rememberDevice?: boolean }>(req);
    const code = body?.code?.trim();
    const rememberDevice = body?.rememberDevice !== false;
    if (!code) return errorResponse('Code requis', 400);

    const user = await req.payload.findByID({
      collection: 'users',
      id: pending.userId,
      overrideAccess: true,
      req,
      depth: 0,
    });
    const u = user as { id: number | string; email: string };

    const verified = await verifyEmailOtp(req, u.id, code);
    if (!verified) return errorResponse('Code invalide ou expiré', 401);

    // Code OK → consume la session pending et finalise la connexion.
    consumePendingLogin(sessionId);

    const setCookies: string[] = [
      clearPendingTwoFactorCookie(),
      buildPayloadTokenCookie(pending.token),
    ];

    await req.payload.update({
      collection: 'users',
      id: u.id,
      overrideAccess: true,
      req,
      data: { lastLoginAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() },
    });

    if (rememberDevice) {
      const deviceId = generateUrlSafeToken();
      const fingerprint = generateUrlSafeToken();
      const fingerprintHash = hashToken(fingerprint);
      const ttlMs = AUTH_CONFIG.trustedDeviceTtlDays * 24 * 60 * 60 * 1000;
      const userAgent = req.headers.get('user-agent') ?? undefined;

      const userFresh = await req.payload.findByID({
        collection: 'users',
        id: u.id,
        overrideAccess: true,
        req,
        depth: 0,
      });
      const existingDevices = ((userFresh as { trustedDevices?: Array<{ deviceId: string; fingerprintHash: string; expiresAt: string; createdAt: string; label?: string; userAgent?: string; ip?: string }> }).trustedDevices ?? []).filter(
        (d) => new Date(d.expiresAt).getTime() > Date.now(),
      );
      const newDevice = {
        deviceId,
        fingerprintHash,
        label: userAgent ? guessDeviceLabel(userAgent) : 'Appareil',
        userAgent,
        ip,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      };
      await req.payload.update({
        collection: 'users',
        id: u.id,
        overrideAccess: true,
        req,
        data: {
          trustedDevices: [...existingDevices, newDevice],
        },
      });
      setCookies.push(buildTrustedDeviceCookie({ uid: u.id, did: deviceId, fp: fingerprint }));
    }

    return jsonResponse({ status: 'logged_in', user: u }, { status: 200 }, setCookies);
  },
};

// ─── POST /users/two-factor/resend-email ──────────────────────────

const resendEndpoint: Endpoint = {
  path: '/two-factor/resend-email',
  method: 'post',
  handler: async (req) => {
    const sessionId = readPendingTwoFactorCookie(req);
    if (!sessionId) return errorResponse('Aucune session en attente.', 400);
    const pending = peekPendingLogin(sessionId);
    if (!pending) return errorResponse('Session expirée.', 410);

    const rl = consume(RATE_PROFILES.send, String(pending.userId));
    if (!rl.ok) return errorResponse('Trop de codes envoyés, réessayez plus tard.', 429);

    try {
      await generateAndSendEmailOtp(req, { id: pending.userId, email: pending.email });
    } catch (err) {
      req.payload.logger.error({ err }, 'otp_email_resend_failed');
      return errorResponse('Envoi du code impossible.', 500);
    }
    return jsonResponse({ ok: true });
  },
};

function guessDeviceLabel(ua: string): string {
  const u = ua.toLowerCase();
  let os = 'Inconnu';
  if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac os')) os = 'macOS';
  else if (u.includes('iphone')) os = 'iPhone';
  else if (u.includes('ipad')) os = 'iPad';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('linux')) os = 'Linux';
  let browser = '';
  if (u.includes('firefox')) browser = 'Firefox';
  else if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome')) browser = 'Chrome';
  else if (u.includes('safari')) browser = 'Safari';
  return browser ? `${browser} sur ${os}` : os;
}

export const twoFactorLoginEndpoints: Endpoint[] = [loginEndpoint, verifyEndpoint, resendEndpoint];
