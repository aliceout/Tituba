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
// Confirm + unsubscribe ne sont pas rate-limités (tokens difficiles
// à deviner ; brute force inutile).
//
// ─── Ce qui garde /subscribe, et pourquoi ───────────────────────────
//
// Le tort possible ici n'est pas l'inscription de quelqu'un à son insu —
// le double opt-in l'empêche — c'est le mail lui-même : l'endpoint fait
// partir un message signé du site vers une adresse quelconque, choisie
// par l'appelant. Non gardé, il transforme le site en distributeur de
// courrier, et son domaine en domaine à bloquer.
//
//  1. GARDE D'ACCÈS DIRECT — nginx expose /cms/* à côté du site. Sans
//     elle, on appelle Payload sans passer par Astro en écrivant soi-
//     même `x-real-ip`, et la limitation « par IP » ne limite rien.
//  2. COUPE-CIRCUIT GLOBAL — à clé fixe, 60 par heure. C'est le seul
//     plafond qu'une rotation d'adresses IP ne contourne pas, donc le
//     seul qui borne vraiment ce que le site peut émettre.
//  3. LIMITATION PAR IP — 5 par quart d'heure. Filtre le volume
//     ordinaire.
//  4. PLAFOND PAR ADRESSE VISÉE — 3 par 24 h. Les trois autres bornent
//     l'émission totale ; celui-ci borne ce qu'une même personne peut
//     recevoir. C'est la mesure qui empêche de se servir du site pour
//     inonder quelqu'un en particulier.
//  5. DÉLAI DE RENVOI — une inscription encore en attente et confirmée
//     il y a moins de dix minutes ne redéclenche pas de mail. Durable,
//     lui : il est lu dans la base, il survit au redémarrage.
//  6. POT DE MIEL — le champ `site` du formulaire, que personne ne voit
//     et que les robots remplissent.
//
// Pas de preuve de travail, contrairement au contact : elle exige
// `crypto.subtle`, donc JavaScript, et le formulaire d'abonnement
// fonctionne sans — la page /abonnement/ traite la soumission native.
// L'échanger contre une porte fermée aux navigateurs sans JavaScript
// coûterait plus que ce qu'elle rapporte face au coupe-circuit.
//
// Les compteurs 2, 3 et 4 sont en mémoire : ils repartent à zéro au
// redémarrage. Le 5 ne bouge pas.

import type { Endpoint, PayloadRequest } from 'payload';

import { proxyLegitime } from '../auth/proxy';
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

/**
 * Délai avant qu'une même adresse encore en attente puisse redéclencher
 * un mail de confirmation.
 *
 * Dix minutes : au-delà, quelqu'un qui n'a rien reçu et regarde ses
 * indésirables a le droit de réessayer. En deçà, c'est soit un double
 * clic, soit quelqu'un qui vise une boîte qui n'est pas la sienne.
 *
 * Contrairement aux compteurs de débit, celui-ci se lit dans la base :
 * il tient au travers des redémarrages.
 */
const RENVOI_MIN_MS = 10 * 60 * 1000;

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
  /** Date de la dernière demande — donc du dernier mail parti. */
  subscribedAt?: string | null;
};

const subscribeEndpoint: Endpoint = {
  path: '/subscribe',
  method: 'post',
  handler: async (req) => {
    if (!proxyLegitime(req.headers, '/cms/api/subscribers/subscribe')) {
      return jsonResponse({ ok: false, code: 'direct_access' }, 403);
    }

    // Le coupe-circuit avant tout le reste : quand il saute, plus rien
    // ne part, pas même la lecture du corps.
    if (!consume(RATE_PROFILES.subscribeFlood, 'all').ok) {
      req.payload.logger.warn(
        { event: 'subscribe_flood' },
        "Coupe-circuit de l'inscription aux alertes",
      );
      return jsonResponse({ ok: false, code: 'saturated' }, 503);
    }

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
    let potDeMiel = '';
    try {
      const data = req.json ? await req.json() : null;
      email = String((data as { email?: unknown })?.email ?? '').trim().toLowerCase();
      potDeMiel = String((data as { site?: unknown })?.site ?? '').trim();
    } catch {
      /* invalid JSON → email reste vide */
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return jsonResponse({ ok: false, code: 'invalid_email' }, 400);
    }

    // Le pot de miel après la validation d'adresse, pour que la réponse
    // arrive au même moment qu'un succès : un robot qui reçoit son refus
    // plus vite qu'un envoi normal apprend au chronomètre quel champ
    // éviter. Réponse identique à celle d'un succès, à l'octet près.
    if (potDeMiel) {
      req.payload.logger.info({ event: 'subscribe_honeypot', ip }, 'Pot de miel rempli');
      return jsonResponse({ ok: true });
    }

    // Plafond de ce qu'une même adresse peut recevoir, indépendant de
    // qui le demande. Réponse générique, comme partout ici : dire
    // « trop de demandes pour cette adresse » renseignerait sur une
    // boîte qu'on ne possède pas.
    if (!consume(RATE_PROFILES.subscribeEmail, email).ok) {
      req.payload.logger.warn(
        { event: 'subscribe_email_cap', ip },
        "Plafond d'envois atteint pour une adresse",
      );
      return jsonResponse({ ok: true });
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

    // Demande déjà en cours et toute fraîche : le mail est parti, il
    // n'y a rien à renvoyer. Sans ce garde-fou, on peut faire tomber un
    // message dans la même boîte à chaque appel — le plafond par adresse
    // au-dessus n'y suffirait pas, il est en mémoire et repart à zéro à
    // chaque redémarrage. Celui-ci se lit dans la base.
    if (existing?.status === 'pending' && existing.subscribedAt) {
      const depuis = Date.now() - new Date(existing.subscribedAt).getTime();
      if (depuis >= 0 && depuis < RENVOI_MIN_MS) {
        return jsonResponse({ ok: true });
      }
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
