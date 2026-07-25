// Endpoints d'invitation d'utilisateurs.
//
//   POST /users/invite
//     Body: { email, role: 'admin'|'editor', displayName? }
//     Auth: admin/root requis
//     Crée un compte status=pending, génère un token, envoie le mail.
//
//   GET /users/invitation/:token
//     Public. Renvoie { email, role } si le token est valide, 404 sinon.
//
//   POST /users/invitation/:token/accept
//     Body: { password }
//     Public. Active le compte, marque le device courant comme trusted
//     (évite un OTP juste après l'activation), pose le cookie payload-token
//     et renvoie l'utilisateur logué.

import type { Endpoint, PayloadRequest } from 'payload';

import { AUTH_CONFIG } from '../config';
import { generateUrlSafeToken, hashToken } from '../crypto';
import { getSiteName, invitationEmail, welcomeEmail } from '../email-templates';
import {
  buildPayloadTokenCookie,
  buildTrustedDeviceCookie,
  errorResponse,
  jsonResponse,
  readJsonBody,
  requireUser,
} from '../helpers';
import { clientIpFromHeaders, consume, RATE_PROFILES } from '../rate-limit';
import { randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// URL publique du site — convention Infisical : la valeur d'ADDRESS
// est juste le domaine (sans schème). On préfixe https:// si manquant
// avant de construire les URLs d'invitation et de login.
function publicBase(): string {
  const raw = process.env.ADDRESS || 'http://localhost:3001';
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, '');
}

function buildAcceptUrl(token: string): string {
  return `${publicBase()}/cms/admin/invitation/${token}`;
}

function buildLoginUrl(): string {
  return `${publicBase()}/cms/admin/login`;
}

// ─── POST /users/invite ────────────────────────────────────────────

const inviteEndpoint: Endpoint = {
  path: '/invite',
  method: 'post',
  handler: async (req) => {
    const actor = requireUser(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'root')) {
      return errorResponse('Non autorisé', 403);
    }
    const ip = clientIpFromHeaders(req.headers);
    const rl = consume(RATE_PROFILES.invite, `${actor.id}:${ip}`);
    if (!rl.ok) return errorResponse('Trop d\'invitations envoyées, réessayez plus tard.', 429);

    const body = await readJsonBody<{ email?: string; role?: string; displayName?: string }>(req);
    const email = body?.email?.trim().toLowerCase();
    const role = body?.role;
    const displayName = body?.displayName?.trim() || undefined;

    if (!email || !EMAIL_RE.test(email)) return errorResponse('Email invalide', 400);
    if (role !== 'admin' && role !== 'editor') return errorResponse('Rôle invalide (admin ou editor)', 400);
    // Un admin ne peut pas inviter un autre admin (seul le root peut).
    if (role === 'admin' && actor.role !== 'root') {
      return errorResponse('Seul le compte root peut inviter un admin', 403);
    }

    // Vérifier qu'un user actif n'existe pas déjà avec cet email.
    const existing = await req.payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
      req,
    });

    const token = generateUrlSafeToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.invitationTtlDays * 24 * 60 * 60 * 1000).toISOString();
    const invitedAt = new Date().toISOString();

    if (existing.totalDocs > 0) {
      const u = existing.docs[0] as { id: number | string; status?: string };
      if (u.status !== 'pending') {
        return errorResponse('Un compte actif existe déjà avec cet email', 409);
      }
      // Régénération du token pour un compte déjà pending.
      await req.payload.update({
        collection: 'users',
        id: u.id,
        overrideAccess: true,
        req,
        data: {
          displayName,
          role,
          invitation: {
            tokenHash,
            expiresAt,
            invitedAt,
            invitedBy: Number(actor.id),
          },
        },
      });
    } else {
      // Création initiale. On met un mot de passe random temporaire :
      // il sera écrasé à l'acceptation. Payload exige un password à la
      // création d'un user en mode auth.
      const tmpPassword = randomBytes(32).toString('base64url');
      await req.payload.create({
        collection: 'users',
        overrideAccess: true,
        req,
        data: {
          email,
          password: tmpPassword,
          role,
          status: 'pending',
          displayName,
          invitation: {
            tokenHash,
            expiresAt,
            invitedAt,
            invitedBy: Number(actor.id),
          },
        },
      });
    }

    const acceptUrl = buildAcceptUrl(token);
    const siteName = await getSiteName(req.payload);
    const tpl = invitationEmail({
      inviteeEmail: email,
      inviterName: actor.displayName || actor.email,
      acceptUrl,
      siteName,
    });

    try {
      await req.payload.sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      req.payload.logger.error({ err, email }, 'invite_email_failed');
      // On n'expose pas le token dans l'erreur, on demande de réessayer.
      return errorResponse('Compte créé mais envoi du mail impossible. Réessayez ou vérifiez la configuration SMTP.', 500);
    }

    return jsonResponse({ ok: true, email, expiresAt });
  },
};

// ─── GET /users/invitation/:token ──────────────────────────────────

const lookupInvitationEndpoint: Endpoint = {
  path: '/invitation/:token',
  method: 'get',
  handler: async (req) => {
    const token = (req.routeParams as { token?: string } | undefined)?.token;
    if (!token) return errorResponse('Token manquant', 400);
    const tokenHash = hashToken(token);
    const found = await req.payload.find({
      collection: 'users',
      where: {
        and: [
          { 'invitation.tokenHash': { equals: tokenHash } },
          { status: { equals: 'pending' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      req,
    });
    if (found.totalDocs === 0) return errorResponse('Invitation introuvable ou déjà utilisée', 404);
    const u = found.docs[0] as {
      email: string;
      role?: string;
      invitation?: { expiresAt?: string };
    };
    if (!u.invitation?.expiresAt || new Date(u.invitation.expiresAt).getTime() < Date.now()) {
      return errorResponse('Invitation expirée', 410);
    }
    return jsonResponse({ email: u.email, role: u.role, expiresAt: u.invitation.expiresAt });
  },
};

// ─── POST /users/invitation/:token/accept ──────────────────────────

const acceptInvitationEndpoint: Endpoint = {
  path: '/invitation/:token/accept',
  method: 'post',
  handler: async (req) => {
    const token = (req.routeParams as { token?: string } | undefined)?.token;
    if (!token) return errorResponse('Token manquant', 400);

    const ip = clientIpFromHeaders(req.headers);
    const rl = consume(RATE_PROFILES.login, ip);
    if (!rl.ok) return errorResponse('Trop de tentatives, réessayez plus tard.', 429);

    const body = await readJsonBody<{ password?: string; displayName?: string }>(req);
    const password = body?.password;
    const displayName = body?.displayName?.trim();
    if (!displayName) {
      return errorResponse('Le prénom est obligatoire.', 400);
    }
    if (!password || password.length < 12) {
      return errorResponse('Le mot de passe doit faire au moins 12 caractères.', 400);
    }

    const tokenHash = hashToken(token);
    const found = await req.payload.find({
      collection: 'users',
      where: {
        and: [
          { 'invitation.tokenHash': { equals: tokenHash } },
          { status: { equals: 'pending' } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      req,
    });
    if (found.totalDocs === 0) return errorResponse('Invitation introuvable ou déjà utilisée', 404);
    const u = found.docs[0] as { id: number | string; email: string; invitation?: { expiresAt?: string } };
    if (!u.invitation?.expiresAt || new Date(u.invitation.expiresAt).getTime() < Date.now()) {
      return errorResponse('Invitation expirée', 410);
    }

    // Active le compte, vide les champs d'invitation, set le mdp.
    await req.payload.update({
      collection: 'users',
      id: u.id,
      overrideAccess: true,
      req,
      data: {
        password,
        displayName,
        status: 'active',
        invitation: {
          tokenHash: null,
          expiresAt: null,
          invitedAt: null,
          invitedBy: null,
        },
      },
    });

    // Connexion immédiate (l'email vient d'être prouvé en cliquant le lien
    // → on saute le 2FA cette fois et on marque le device comme trusted
    // pour la durée standard).
    const loginResult = await req.payload.login({
      collection: 'users',
      data: { email: u.email, password },
      req,
    });

    const setCookies: string[] = [];
    if (loginResult.token) {
      setCookies.push(buildPayloadTokenCookie(loginResult.token));
    }

    // Trusted device de confiance d'office.
    const deviceId = generateUrlSafeToken();
    const fingerprint = generateUrlSafeToken();
    const fingerprintHash = hashToken(fingerprint);
    const ttlMs = AUTH_CONFIG.trustedDeviceTtlDays * 24 * 60 * 60 * 1000;
    await req.payload.update({
      collection: 'users',
      id: u.id,
      overrideAccess: true,
      req,
      data: {
        trustedDevices: [
          {
            deviceId,
            fingerprintHash,
            label: 'Activation initiale',
            userAgent: req.headers.get('user-agent') ?? undefined,
            ip,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
          },
        ],
        lastLoginAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      },
    });
    setCookies.push(buildTrustedDeviceCookie({ uid: u.id, did: deviceId, fp: fingerprint }));

    // Mail de bienvenue (best-effort)
    try {
      const siteName = await getSiteName(req.payload);
      const tpl = welcomeEmail({ email: u.email, loginUrl: buildLoginUrl(), siteName });
      await req.payload.sendEmail({
        to: u.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      req.payload.logger.warn({ err }, 'welcome_email_failed');
    }

    return jsonResponse({ ok: true, user: loginResult.user }, { status: 200 }, setCookies);
  },
};

export const invitationEndpoints: Endpoint[] = [
  inviteEndpoint,
  lookupInvitationEndpoint,
  acceptInvitationEndpoint,
];
