// Endpoints publics pour les alertes mail (collection Subscribers).
//
// Pattern double opt-in :
//  - POST /api/subscribers/subscribe { email }
//     → crée/réactive un doc en status `pending`, envoie le mail de
//       confirmation. Toujours 200 (générique) pour éviter
//       l'énumération d'adresses.
//  - POST /api/subscribers/confirm { token }
//     → valide le hash, flip `pending` → `active`, efface le confirm
//       token.
//  - POST /api/subscribers/unsubscribe { id, sig }
//     → vérifie la signature HMAC(id, PAYLOAD_SECRET), flip
//       `active` → `unsubscribed`.
//
// Rate-limit IP : RATE_PROFILES.subscribe (5 / 15 min) sur subscribe.
// Confirm + unsubscribe ne sont pas rate-limités (tokens difficiles
// à deviner ; brute force inutile).

import type { Endpoint, PayloadRequest } from 'payload';

import { clientIpFromHeaders, consume, RATE_PROFILES } from '../auth/rate-limit';
import {
  generateUrlSafeToken,
  hashToken,
  hmacHex,
  safeEqualHex,
} from '../auth/crypto';
import { getSiteName, subscribeConfirmEmail } from '../auth/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_DAYS = 7;

// URL publique du site Astro — la valeur d'ADDRESS est généralement le
// domaine sans schème (convention Infisical). On préfixe https:// si
// manquant, sauf en dev local (localhost / 127.0.0.1) où on garde http.
function publicBase(): string {
  const raw = process.env.ADDRESS || 'http://localhost:4321';
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  return `https://${raw}`.replace(/\/$/, '');
}

function buildConfirmUrl(token: string): string {
  return `${publicBase()}/abonnement/confirmer/?token=${encodeURIComponent(token)}`;
}

/**
 * Lit le toggle global emailEnabled (Subscriptions). Quand décoché côté
 * admin, on bloque les inscriptions ET les envois. Best-effort : si la
 * lecture du global échoue, on considère activé (le toggle est une
 * sécurité supplémentaire, pas le mécanisme primaire).
 */
async function isEmailFeatureEnabled(req: PayloadRequest): Promise<boolean> {
  try {
    const subs = await req.payload.findGlobal({ slug: 'subscriptions' });
    return (subs as { emailEnabled?: boolean }).emailEnabled !== false;
  } catch {
    return true;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Signature HMAC pour le lien de désabonnement. Pas de stockage : on
// recalcule au moment du clic.
function buildUnsubSig(subscriberId: string | number): string {
  const secret = process.env.PAYLOAD_SECRET || '';
  return hmacHex(secret, `unsub:${String(subscriberId)}`);
}

export function buildUnsubUrl(subscriberId: string | number): string {
  const sig = buildUnsubSig(subscriberId);
  const id = encodeURIComponent(String(subscriberId));
  return `${publicBase()}/abonnement/desabonner/?id=${id}&sig=${sig}`;
}

// ─── POST /subscribe ────────────────────────────────────────────────

type SubscriberDoc = {
  id: number | string;
  email: string;
  status: 'pending' | 'active' | 'unsubscribed';
  confirmTokenHash?: string | null;
  confirmTokenExpiresAt?: string | null;
};

const subscribeEndpoint: Endpoint = {
  path: '/subscribe',
  method: 'post',
  handler: async (req) => {
    const ip = clientIpFromHeaders(req.headers);
    const rate = consume(RATE_PROFILES.subscribe, ip);
    if (!rate.ok) {
      return jsonResponse(
        { ok: false, code: 'rate_limited', retryAfterSec: rate.retryAfterSec },
        429,
      );
    }

    if (!(await isEmailFeatureEnabled(req))) {
      return jsonResponse({ ok: false, code: 'disabled' }, 403);
    }

    let email = '';
    try {
      const data = req.json ? await req.json() : null;
      email = String((data as { email?: unknown })?.email ?? '').trim().toLowerCase();
    } catch {
      /* invalid JSON → email reste vide */
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return jsonResponse({ ok: false, code: 'invalid_email' }, 400);
    }

    const token = generateUrlSafeToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + CONFIRM_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const now = new Date().toISOString();

    // Cherche un doc existant pour cet email.
    const found = await req.payload.find({
      collection: 'subscribers',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const existing = (found.docs[0] as SubscriberDoc | undefined) ?? null;

    if (existing?.status === 'active') {
      // Email déjà actif : on renvoie générique (pas de mail, pas d'info
      // de fuite). L'utilisatrice qui voit « inscription confirmée »
      // côté front saura qu'elle est déjà inscrite.
      return jsonResponse({ ok: true });
    }

    if (existing) {
      // pending ou unsubscribed → on remet en pending avec nouveau token.
      await req.payload.update({
        collection: 'subscribers',
        id: existing.id,
        overrideAccess: true,
        data: {
          status: 'pending',
          confirmTokenHash: tokenHash,
          confirmTokenExpiresAt: expiresAt,
          subscribedAt: now,
          confirmedAt: null,
          unsubscribedAt: null,
        },
      });
    } else {
      await req.payload.create({
        collection: 'subscribers',
        overrideAccess: true,
        data: {
          email,
          status: 'pending',
          confirmTokenHash: tokenHash,
          confirmTokenExpiresAt: expiresAt,
          subscribedAt: now,
        },
      });
    }

    // Envoi du mail de confirmation — best-effort. Si le SMTP est
    // indisponible, on log mais on renvoie quand même 200 pour ne pas
    // exposer l'état interne (et permettre une retry manuelle).
    try {
      const siteName = await getSiteName(req.payload);
      const confirmUrl = buildConfirmUrl(token);
      const tpl = subscribeConfirmEmail({
        email,
        confirmUrl,
        ttlDays: CONFIRM_TTL_DAYS,
        siteName,
      });
      await req.payload.sendEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      req.payload.logger.error({ err, email }, 'subscribe_email_failed');
    }

    return jsonResponse({ ok: true });
  },
};

// ─── POST /confirm ──────────────────────────────────────────────────

const confirmEndpoint: Endpoint = {
  path: '/confirm',
  method: 'post',
  handler: async (req) => {
    let token = '';
    try {
      const data = req.json ? await req.json() : null;
      token = String((data as { token?: unknown })?.token ?? '').trim();
    } catch {
      /* invalid JSON */
    }
    if (!token) {
      return jsonResponse({ ok: false, code: 'invalid_token' }, 400);
    }
    const tokenHash = hashToken(token);

    const found = await req.payload.find({
      collection: 'subscribers',
      where: { confirmTokenHash: { equals: tokenHash } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const sub = (found.docs[0] as SubscriberDoc | undefined) ?? null;
    if (!sub) {
      return jsonResponse({ ok: false, code: 'invalid_token' }, 400);
    }

    const expiresAt = sub.confirmTokenExpiresAt
      ? new Date(sub.confirmTokenExpiresAt).getTime()
      : 0;
    if (!expiresAt || expiresAt < Date.now()) {
      return jsonResponse({ ok: false, code: 'expired' }, 400);
    }

    await req.payload.update({
      collection: 'subscribers',
      id: sub.id,
      overrideAccess: true,
      data: {
        status: 'active',
        confirmedAt: new Date().toISOString(),
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
      },
    });

    return jsonResponse({ ok: true, email: sub.email });
  },
};

// ─── POST /unsubscribe ──────────────────────────────────────────────

const unsubscribeEndpoint: Endpoint = {
  path: '/unsubscribe',
  method: 'post',
  handler: async (req) => {
    let id = '';
    let sig = '';
    try {
      const data = req.json ? await req.json() : null;
      id = String((data as { id?: unknown })?.id ?? '').trim();
      sig = String((data as { sig?: unknown })?.sig ?? '').trim();
    } catch {
      /* invalid JSON */
    }
    if (!id || !sig) {
      return jsonResponse({ ok: false, code: 'invalid_signature' }, 400);
    }

    const expected = buildUnsubSig(id);
    if (!safeEqualHex(expected, sig)) {
      return jsonResponse({ ok: false, code: 'invalid_signature' }, 400);
    }

    // Coerce id pour matcher le type du PK (number pour Postgres, string
    // pour Mongo). Try number d'abord, fallback string.
    let sub: SubscriberDoc | null = null;
    try {
      const asNum = Number(id);
      const idVal = Number.isFinite(asNum) ? asNum : id;
      sub = (await req.payload.findByID({
        collection: 'subscribers',
        id: idVal,
        depth: 0,
        overrideAccess: true,
      })) as unknown as SubscriberDoc;
    } catch {
      return jsonResponse({ ok: false, code: 'not_found' }, 404);
    }
    if (!sub) {
      return jsonResponse({ ok: false, code: 'not_found' }, 404);
    }

    // Idempotent : on flip vers unsubscribed quoi qu'il arrive (déjà
    // unsubscribed → reste unsubscribed, pas d'erreur).
    if (sub.status !== 'unsubscribed') {
      await req.payload.update({
        collection: 'subscribers',
        id: sub.id,
        overrideAccess: true,
        data: {
          status: 'unsubscribed',
          unsubscribedAt: new Date().toISOString(),
        },
      });
    }

    return jsonResponse({ ok: true, email: sub.email });
  },
};

export const subscribersEndpoints: Endpoint[] = [
  subscribeEndpoint,
  confirmEndpoint,
  unsubscribeEndpoint,
];
