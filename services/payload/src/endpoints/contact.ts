/**
 * Formulaire de contact public — émission du défi et envoi du message.
 *
 *   GET  /cms/api/contact-challenge  → { jeton, sel, cible, max }
 *   POST /cms/api/contact            → envoie le message par mail
 *
 * Les messages ne sont PAS stockés : ils partent par mail vers l'adresse
 * configurée dans Identité → « Adresse de réception ». Rien à purger,
 * rien à sécuriser au repos, et pas de boîte de réception de plus à
 * relever.
 *
 * ─── Le dispositif anti-robots, et ce qu'il vaut ────────────────────
 *
 * Cinq couches, sans service tiers ni captcha :
 *
 *  1. POT DE MIEL — un champ que seuls les robots remplissent.
 *  2. PIÈGE TEMPOREL — un envoi moins de 4 s après l'émission du défi
 *     n'a pas été écrit par quelqu'un.
 *  3. JETON SIGNÉ — le formulaire porte un défi HMAC à durée de vie
 *     courte. Sans lui, impossible de poster directement sur cet
 *     endpoint : il faut d'abord charger la page.
 *  4. LIMITATION DE DÉBIT — par IP, plus un coupe-circuit global.
 *  5. PREUVE DE TRAVAIL — le navigateur cherche un nombre dont le
 *     haché correspond à une cible. Coûte ~300 ms au visiteur, un seul
 *     haché au serveur.
 *
 * CE QUE ÇA N'ARRÊTE PAS, et il faut le savoir : un adversaire qui lit
 * ce fichier — il est public — réimplémente la preuve de travail en
 * natif et la résout en 2 ms au lieu de 300. Le rapport est d'environ
 * 150 en sa faveur, et c'est la limite indépassable de toute preuve de
 * travail écrite en JavaScript. Ce dispositif élimine les robots qui
 * n'exécutent pas JavaScript — c'est-à-dire l'écrasante majorité du
 * volume, les kits qui moissonnent un <form> et postent — et rien de
 * plus. Face à quelqu'un de déterminé, la seule barrière est le
 * coupe-circuit global, doublé d'une alerte dans les journaux.
 *
 * L'ORDRE DES VÉRIFICATIONS EST VOULU. Le pot de miel est contrôlé en
 * dernier, après le jeton et la preuve : court-circuiter plus tôt
 * rendrait la réponse « pot rempli » mesurablement plus rapide qu'un
 * envoi normal, et un robot identifierait le champ piégé au
 * chronomètre. Vérifier la preuve coûte un seul haché — la dépenser
 * pour un robot ne coûte rien et rend les deux chemins indiscernables.
 */
import type { Endpoint } from 'payload';
import { createHash, randomBytes, randomInt } from 'crypto';

import { signCookie, verifyCookie } from '../auth/cookies';
import { errorResponse, jsonResponse } from '../auth/helpers';
import { safeEqualHex } from '../auth/crypto';
import { clientIpFromHeaders, consume, RATE_PROFILES } from '../auth/rate-limit';

/** Durée de validité d'un défi. Assez long pour rédiger, assez court
 *  pour que le rejeu ne soit pas une carrière. */
const TTL_MS = 30 * 60 * 1000;

/** En deçà, personne n'a lu la page ni écrit quoi que ce soit. Volontairement
 *  bas : à 8 ou 10 s on pénaliserait le cas « je colle un texte déjà
 *  rédigé ailleurs », qui est un usage légitime et fréquent ici. */
const DELAI_MIN_MS = 4000;

/**
 * Espace de recherche de la preuve de travail.
 *
 * Recherche bornée plutôt que « n zéros en tête » : avec les zéros, le
 * temps de résolution suit une loi géométrique sans plafond — calibrer
 * à 300 ms de moyenne condamnerait quelques visiteur·euses à plusieurs
 * secondes, sans borne. Ici le pire cas est connu et fini : `max`
 * hachés, jamais plus. Sur un formulaire de contact, où l'on ne peut
 * pas se permettre de perdre quelqu'un, la prévisibilité vaut mieux
 * que l'élégance.
 *
 * 50 000 tirages, soit 25 000 en moyenne : de l'ordre de 300 ms sur un
 * portable médian, ~1,3 s sur un téléphone d'entrée de gamme. Réglable
 * sans redéploiement par CONTACT_POW_MAX.
 */
const POW_MAX = Number.parseInt(process.env.CONTACT_POW_MAX || '50000', 10) || 50000;

/** Longueurs maximales. Généreuses : un formulaire de contact reçoit
 *  parfois de longs messages, et tronquer serait pire que refuser. */
const MAX = { nom: 120, email: 254, objet: 200, message: 5000 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type DefiContact = {
  /** Séparation de domaine : ce format signé est le même que celui des
   *  cookies d'authentification, et rien d'autre n'empêcherait de
   *  présenter l'un à la place de l'autre. Contrôlé au retour. */
  typ: 'contact.v1';
  /** Identifiant du défi — clé de l'anti-rejeu. */
  jti: string;
  /** Émission, en ms. Porte le piège temporel. Signé, donc infalsifiable. */
  iat: number;
  exp: number;
  /** Sel de la preuve de travail. */
  sel: string;
  /** Haché à retrouver. */
  cible: string;
  /** Borne de la recherche. */
  max: number;
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/**
 * Défis déjà consommés, pour empêcher le rejeu.
 *
 * Un jeton signé sans état est rejouable par construction : sans ce
 * registre, un robot résout UNE preuve de travail et poste le même
 * corps dix mille fois pendant trente minutes. C'est le trou qui
 * viderait le dispositif de sa substance — bien plus que la difficulté
 * de la preuve elle-même.
 *
 * En mémoire, comme le limiteur de débit et le registre des connexions
 * en attente : un seul process Payload aujourd'hui. En cas de passage
 * à plusieurs instances, ceci et le limiteur devront migrer ensemble
 * vers un stockage partagé.
 */
const consommes = new Map<string, number>();
let purge: ReturnType<typeof setInterval> | null = null;

function demarrerPurge(): void {
  if (purge) return;
  purge = setInterval(
    () => {
      const now = Date.now();
      for (const [jti, exp] of consommes) if (exp < now) consommes.delete(jti);
    },
    5 * 60 * 1000,
  );
  // Ne retient pas le process à l'arrêt.
  purge.unref?.();
}

/** Vrai si le défi avait déjà servi. Consomme au passage. */
function consommer(jti: string, exp: number): boolean {
  demarrerPurge();
  if (consommes.has(jti)) return true;
  consommes.set(jti, exp);
  return false;
}

/**
 * Refuse les appels qui n'ont pas transité par le proxy Astro.
 *
 * Nécessaire parce que nginx expose `/cms/*` directement : sans ce
 * contrôle, on peut poster sur cet endpoint sans passer par le site et
 * en forgeant soi-même l'en-tête d'IP, ce qui réduit la limitation par
 * IP à néant.
 *
 * Ne s'active que si INTERNAL_PROXY_SECRET est défini. Le choix est
 * délibéré : rendre le secret obligatoire ferait échouer tout envoi sur
 * un déploiement existant qui ne l'a pas encore, et un formulaire qui
 * répond 403 en silence est pire qu'un formulaire un peu moins gardé.
 * L'absence est signalée au démarrage du premier appel.
 */
let secretSignale = false;
function proxyLegitime(headers: Headers): boolean {
  const attendu = process.env.INTERNAL_PROXY_SECRET;
  if (!attendu) {
    if (!secretSignale) {
      secretSignale = true;
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'contact_proxy_secret_absent',
          message:
            'INTERNAL_PROXY_SECRET non défini : /cms/api/contact est joignable sans passer par le site, la limitation par IP est contournable.',
        }),
      );
    }
    return true;
  }
  return safeEqualHex(headers.get('x-tituba-proxy'), attendu);
}

// ─── Émission du défi ────────────────────────────────────────────────

const challengeEndpoint: Endpoint = {
  path: '/contact-challenge',
  method: 'get',
  handler: async (req) => {
    if (!proxyLegitime(req.headers)) {
      return errorResponse('Accès direct refusé.', 403, 'direct_access');
    }
    const ip = clientIpFromHeaders(req.headers);
    const rate = consume(RATE_PROFILES.contactDefi, ip);
    if (!rate.ok) {
      return jsonResponse({ ok: false, code: 'rate_limited', retryAfterSec: rate.retryAfterSec }, { status: 429 });
    }

    const sel = randomBytes(16).toString('hex');
    // Le nombre cherché est tiré au hasard dans tout l'espace : une
    // borne basse rendrait la recherche systématiquement courte.
    const secret = randomInt(0, POW_MAX);
    const iat = Date.now();
    const defi: DefiContact = {
      typ: 'contact.v1',
      jti: randomBytes(16).toString('hex'),
      iat,
      exp: iat + TTL_MS,
      sel,
      cible: sha256(sel + secret),
      max: POW_MAX,
    };

    return jsonResponse(
      { ok: true, jeton: signCookie(defi), sel, cible: defi.cible, max: POW_MAX },
      { status: 200 },
    );
  },
};

// ─── Envoi du message ────────────────────────────────────────────────

const contactEndpoint: Endpoint = {
  path: '/contact',
  method: 'post',
  handler: async (req) => {
    if (!proxyLegitime(req.headers)) {
      return errorResponse('Accès direct refusé.', 403, 'direct_access');
    }

    const ip = clientIpFromHeaders(req.headers);

    // Coupe-circuit d'abord : quand il saute, plus rien ne doit passer,
    // pas même la vérification d'un jeton.
    if (!consume(RATE_PROFILES.contactFlood, 'all').ok) {
      req.payload.logger.warn({ event: 'contact_flood' }, 'Coupe-circuit du formulaire de contact');
      return jsonResponse({ ok: false, code: 'saturated' }, { status: 503 });
    }
    const rate = consume(RATE_PROFILES.contact, ip);
    if (!rate.ok) {
      return jsonResponse({ ok: false, code: 'rate_limited', retryAfterSec: rate.retryAfterSec }, { status: 429 });
    }

    let data: Record<string, unknown> = {};
    try {
      data = ((req.json ? await req.json() : null) ?? {}) as Record<string, unknown>;
    } catch {
      return errorResponse('Requête illisible.', 400, 'invalid_body');
    }

    const txt = (v: unknown): string => String(v ?? '').trim();
    const nom = txt(data.nom);
    const email = txt(data.email).toLowerCase();
    const objet = txt(data.objet);
    const message = txt(data.message);
    const potDeMiel = txt(data.reference);
    const solution = data.solution;

    // 1. Le jeton, avant tout le reste : sans lui, rien ne prouve que
    //    la requête vient d'un formulaire que nous avons servi.
    const defi = verifyCookie<DefiContact>(txt(data.jeton) || null);
    if (!defi || defi.typ !== 'contact.v1') {
      return errorResponse('Formulaire invalide.', 400, 'invalid_token');
    }
    const now = Date.now();
    if (now > defi.exp) return errorResponse('Formulaire expiré.', 400, 'expired_token');
    if (now - defi.iat < DELAI_MIN_MS) {
      return errorResponse('Envoi trop rapide.', 400, 'too_fast');
    }
    // Consommé ici, avant toute décision de livraison : un robot qui
    // remplit le pot de miel brûle son défi comme les autres.
    if (consommer(defi.jti, defi.exp)) {
      return errorResponse('Formulaire déjà envoyé.', 409, 'already_used');
    }

    // 2. La preuve de travail. Absente = navigateur sans JavaScript,
    //    ou sans crypto.subtle : accepté, les quatre autres couches
    //    s'appliquent quand même.
    if (solution !== null && solution !== undefined && solution !== '') {
      const n = Number(solution);
      const valide =
        Number.isInteger(n) && n >= 0 && n <= defi.max && sha256(defi.sel + n) === defi.cible;
      if (!valide) return errorResponse('Vérification échouée.', 400, 'invalid_proof');
    }

    // 3. Les champs, une fois qu'on sait à qui l'on parle.
    if (!nom || nom.length > MAX.nom) return errorResponse('Nom invalide.', 400, 'invalid_nom');
    if (!email || !EMAIL_RE.test(email) || email.length > MAX.email) {
      return errorResponse('Adresse invalide.', 400, 'invalid_email');
    }
    if (objet.length > MAX.objet) return errorResponse('Objet trop long.', 400, 'invalid_objet');
    if (message.length < 10 || message.length > MAX.message) {
      return errorResponse('Message invalide.', 400, 'invalid_message');
    }

    // 4. Le pot de miel, en dernier — cf. l'en-tête de ce fichier. La
    //    réponse est identique à un succès, octet pour octet : un robot
    //    ne doit pas apprendre qu'il a été repéré.
    if (potDeMiel) {
      req.payload.logger.info({ event: 'contact_honeypot', ip }, 'Pot de miel du contact déclenché');
      return jsonResponse({ ok: true }, { status: 200 });
    }

    // Destinataire : le champ d'Identité, à défaut l'expéditeur SMTP —
    // ce qui garantit qu'un message ne se perd jamais faute de réglage.
    let destinataire = process.env.SMTP_FROM || '';
    try {
      const identity = (await req.payload.findGlobal({
        slug: 'identity',
        depth: 0,
        overrideAccess: true,
      })) as { contactEmail?: string | null };
      if (identity?.contactEmail?.trim()) destinataire = identity.contactEmail.trim();
    } catch (err) {
      req.payload.logger.warn(
        { err: (err as Error).message },
        'Identité illisible, repli sur SMTP_FROM',
      );
    }
    if (!destinataire) {
      req.payload.logger.error({ event: 'contact_sans_destinataire' }, 'Aucune adresse de réception');
      return jsonResponse({ ok: false, code: 'no_recipient' }, { status: 500 });
    }

    const ech = (s: string): string =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const sujet = objet ? `[Contact] ${objet}` : `[Contact] Message de ${nom}`;
    const corpsTexte = [
      `De : ${nom} <${email}>`,
      objet ? `Objet : ${objet}` : null,
      '',
      message,
      '',
      '—',
      'Envoyé depuis le formulaire de contact du site.',
    ]
      .filter((l) => l !== null)
      .join('\n');

    try {
      await req.payload.sendEmail({
        to: destinataire,
        // L'expéditeur reste le domaine du site : mettre l'adresse
        // saisie ferait échouer SPF et DKIM, et le message finirait en
        // indésirable. C'est `replyTo` qui permet de répondre.
        replyTo: `${nom} <${email}>`,
        subject: sujet,
        text: corpsTexte,
        html: [
          `<p><strong>De :</strong> ${ech(nom)} &lt;${ech(email)}&gt;</p>`,
          objet ? `<p><strong>Objet :</strong> ${ech(objet)}</p>` : '',
          `<div style="white-space:pre-wrap">${ech(message)}</div>`,
          '<hr />',
          '<p style="color:#666;font-size:12px">Envoyé depuis le formulaire de contact du site.</p>',
        ].join('\n'),
      });
    } catch (err) {
      // Un échec d'envoi ne doit JAMAIS passer pour un succès : la
      // personne repartirait en croyant son message parti, et personne
      // ne saurait qu'il s'est perdu.
      req.payload.logger.error(
        { event: 'contact_send_failed', err: (err as Error).message },
        'Envoi du message de contact impossible',
      );
      return jsonResponse({ ok: false, code: 'send_failed' }, { status: 502 });
    }

    return jsonResponse({ ok: true }, { status: 200 });
  },
};

export const contactEndpoints: Endpoint[] = [challengeEndpoint, contactEndpoint];
