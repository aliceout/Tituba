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
 * SANS JAVASCRIPT, la mesure 5 ne peut pas tourner : `crypto.subtle`
 * n'existe pas. Le message n'est alors pas transmis directement — il
 * attend qu'on ait cliqué sur un lien envoyé à l'adresse saisie. Le
 * repli n'est donc pas une version allégée du chemin normal, ce qui en
 * ferait l'autoroute à robots : il échange la preuve de travail contre
 * la possession vérifiée d'une boîte mail, qui coûte structurellement
 * plus cher qu'un calcul de 300 ms — et rend le spam traçable et
 * auto-limitant, l'adresse finissant par se faire bloquer.
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

/**
 * Messages en attente de confirmation — chemin sans JavaScript.
 *
 * En mémoire, comme le limiteur de débit et l'anti-rejeu ci-dessus :
 * un seul process Payload aujourd'hui. Ce n'est PAS une entorse à la
 * décision « aucun stockage des messages » — celle-ci porte sur leur
 * conservation, pas sur un tampon de trente minutes qui disparaît au
 * redémarrage.
 *
 * Corollaire assumé, et c'est pourquoi le mail de confirmation reprend
 * le message en entier : si le conteneur redémarre pendant l'attente,
 * la confirmation échoue — la personne a au moins ses propres mots
 * sous les yeux, et la page le lui dit.
 */
type MessageEnAttente = {
  nom: string;
  email: string;
  objet: string;
  message: string;
  exp: number;
};
const enAttente = new Map<string, MessageEnAttente>();

/** Plafond dur : au-delà, on refuse plutôt que de laisser enfler. */
const MAX_EN_ATTENTE = 200;

function purgerAttente(): void {
  const now = Date.now();
  for (const [id, m] of enAttente) if (m.exp < now) enAttente.delete(id);
}

/** URL publique du site — même convention que subscribers.ts. */
function basePublique(): string {
  const raw = process.env.ADDRESS || 'http://localhost:4321';
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  return `https://${raw}`.replace(/\/$/, '');
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

/** Échappe pour un corps de mail en HTML. */
function ech(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Adresse de réception : le champ « Adresse de réception » d'Identité,
 * et rien d'autre.
 *
 * Il y avait un repli sur `SMTP_FROM`, censé garantir qu'un message ne
 * se perde jamais faute de réglage. Il garantissait l'inverse :
 * `SMTP_FROM` est l'adresse *d'envoi* du site, un `noreply@` que
 * personne ne relève. Les messages y seraient tombés en silence, et le
 * formulaire aurait paru fonctionner.
 *
 * Sans adresse configurée, on refuse donc l'envoi et on le dit — à la
 * personne qui écrit comme dans les journaux. Une panne visible vaut
 * mieux qu'une perte invisible.
 */
async function destinataireDe(req: Parameters<NonNullable<Endpoint['handler']>>[0]): Promise<string> {
  try {
    const identity = (await req.payload.findGlobal({
      slug: 'identity',
      depth: 0,
      overrideAccess: true,
    })) as { contactEmail?: string | null };
    return identity?.contactEmail?.trim() ?? '';
  } catch (err) {
    req.payload.logger.error(
      { err: (err as Error).message },
      'Identité illisible : impossible de connaître l’adresse de réception',
    );
    return '';
  }
}

/**
 * Remet le message au collectif. Partagé par les deux chemins — envoi
 * direct après preuve de travail, ou après confirmation par mail —
 * plutôt que recopié : deux copies auraient fini par ne plus produire
 * le même courrier.
 */
async function livrer(
  req: Parameters<NonNullable<Endpoint['handler']>>[0],
  m: { nom: string; email: string; objet: string; message: string },
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const destinataire = await destinataireDe(req);
  if (!destinataire) {
    req.payload.logger.error({ event: 'contact_sans_destinataire' }, 'Aucune adresse de réception');
    return { ok: false, code: 'no_recipient', status: 500 };
  }

  const sujet = m.objet ? `[Contact] ${m.objet}` : `[Contact] Message de ${m.nom}`;
  const corpsTexte = [
    `De : ${m.nom} <${m.email}>`,
    m.objet ? `Objet : ${m.objet}` : null,
    '',
    m.message,
    '',
    '—',
    'Envoyé depuis le formulaire de contact du site.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  try {
    await req.payload.sendEmail({
      to: destinataire,
      // L'expéditeur reste le domaine du site : mettre l'adresse saisie
      // ferait échouer SPF et DKIM, et le message finirait en
      // indésirable. C'est `replyTo` qui permet de répondre.
      replyTo: `${m.nom} <${m.email}>`,
      subject: sujet,
      text: corpsTexte,
      html: [
        `<p><strong>De :</strong> ${ech(m.nom)} &lt;${ech(m.email)}&gt;</p>`,
        m.objet ? `<p><strong>Objet :</strong> ${ech(m.objet)}</p>` : '',
        `<div style="white-space:pre-wrap">${ech(m.message)}</div>`,
        '<hr />',
        '<p style="color:#666;font-size:12px">Envoyé depuis le formulaire de contact du site.</p>',
      ].join('\n'),
    });
  } catch (err) {
    // Un échec d'envoi ne doit JAMAIS passer pour un succès : la
    // personne repartirait en croyant son message parti, et personne ne
    // saurait qu'il s'est perdu.
    req.payload.logger.error(
      { event: 'contact_send_failed', err: (err as Error).message },
      'Envoi du message de contact impossible',
    );
    return { ok: false, code: 'send_failed', status: 502 };
  }
  return { ok: true };
}

/** Jeton du lien de confirmation — chemin sans JavaScript. */
type JetonConfirmation = { typ: 'contact-confirm.v1'; pid: string; exp: number };

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

    // 2. La preuve de travail. Absente = navigateur sans JavaScript, ou
    //    sans crypto.subtle : le message part alors en confirmation par
    //    mail plutôt qu'en livraison directe (cf. plus bas). Fournie
    //    mais fausse : refusée sans indulgence — c'est un robot qui a
    //    tenté sa chance, pas un navigateur en difficulté.
    const avecPreuve = solution !== null && solution !== undefined && solution !== '';
    if (avecPreuve) {
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

    // ── Livraison, ou mise en attente ─────────────────────────────
    //
    // Sans preuve de travail — donc sans JavaScript — le message
    // n'est pas transmis tout de suite : il attend un clic sur un
    // lien envoyé à l'adresse saisie. Ce chemin échange la mesure 5
    // contre la possession vérifiée d'une boîte mail, qui coûte plus
    // cher à un robot qu'un calcul de 300 ms.
    if (!avecPreuve) {
      // L'adresse de réception est vérifiée AVANT d'envoyer la demande
      // de confirmation : sans elle, on ferait cliquer quelqu'un pour
      // un message qu'on ne saurait pas livrer, et l'échec
      // n'apparaîtrait qu'au bout du parcours.
      if (!(await destinataireDe(req))) {
        req.payload.logger.error(
          { event: 'contact_sans_destinataire' },
          'Aucune adresse de réception configurée (Identité → Adresse de réception)',
        );
        return jsonResponse({ ok: false, code: 'no_recipient' }, { status: 500 });
      }
      purgerAttente();
      if (enAttente.size >= MAX_EN_ATTENTE) {
        req.payload.logger.warn({ event: 'contact_attente_saturee' }, 'File de confirmation pleine');
        return jsonResponse({ ok: false, code: 'saturated' }, { status: 503 });
      }
      const pid = randomBytes(16).toString('hex');
      const exp = Date.now() + TTL_MS;
      enAttente.set(pid, { nom, email, objet, message, exp });
      const lien =
        `${basePublique()}/contact/confirmer/?t=` +
        encodeURIComponent(signCookie<JetonConfirmation>({ typ: 'contact-confirm.v1', pid, exp }));
      try {
        await req.payload.sendEmail({
          to: email,
          subject: 'Confirmez votre message à Tituba',
          text: [
            `Bonjour ${nom},`,
            '',
            'Vous venez de nous écrire depuis le site. Pour que votre message',
            'nous parvienne, ouvrez ce lien :',
            '',
            lien,
            '',
            'Le lien est valable trente minutes. Sans clic, le message est',
            'abandonné et rien ne nous parvient.',
            '',
            'Votre message, pour mémoire :',
            '',
            message,
          ].join('\n'),
          html: [
            `<p>Bonjour ${ech(nom)},</p>`,
            '<p>Vous venez de nous écrire depuis le site. Pour que votre message nous parvienne, ouvrez ce lien :</p>',
            `<p><a href="${ech(lien)}">Confirmer mon message</a></p>`,
            '<p style="color:#666;font-size:12px">Le lien est valable trente minutes. Sans clic, le message est abandonné et rien ne nous parvient.</p>',
            '<hr />',
            '<p style="color:#666;font-size:12px">Votre message, pour mémoire :</p>',
            `<div style="white-space:pre-wrap">${ech(message)}</div>`,
          ].join('\n'),
        });
      } catch (err) {
        enAttente.delete(pid);
        req.payload.logger.error(
          { event: 'contact_confirm_send_failed', err: (err as Error).message },
          'Envoi du lien de confirmation impossible',
        );
        return jsonResponse({ ok: false, code: 'send_failed' }, { status: 502 });
      }
      return jsonResponse({ ok: true, mode: 'confirmation' }, { status: 200 });
    }

    const livraison = await livrer(req, { nom, email, objet, message });
    if (!livraison.ok) {
      return jsonResponse({ ok: false, code: livraison.code }, { status: livraison.status });
    }
    return jsonResponse({ ok: true, mode: 'direct' }, { status: 200 });
  },
};

// ─── Confirmation d'un message déposé sans JavaScript ────────────────

const confirmEndpoint: Endpoint = {
  path: '/contact-confirm',
  method: 'post',
  handler: async (req) => {
    if (!proxyLegitime(req.headers)) {
      return errorResponse('Accès direct refusé.', 403, 'direct_access');
    }

    let data: Record<string, unknown> = {};
    try {
      data = ((req.json ? await req.json() : null) ?? {}) as Record<string, unknown>;
    } catch {
      return errorResponse('Requête illisible.', 400, 'invalid_body');
    }

    const jeton = verifyCookie<JetonConfirmation>(String(data.jeton ?? '') || null);
    if (!jeton || jeton.typ !== 'contact-confirm.v1') {
      return errorResponse('Lien invalide.', 400, 'invalid_token');
    }
    if (Date.now() > jeton.exp) return errorResponse('Lien expiré.', 400, 'expired_token');

    purgerAttente();
    const message = enAttente.get(jeton.pid);
    if (!message) {
      /**
       * Deux causes, indiscernables ici et volontairement traitées de
       * même : le lien a déjà servi, ou le service a redémarré pendant
       * l'attente. Les clients mail préchargent les liens qu'ils
       * reçoivent — un second appel doit donc rester silencieux et non
       * produire une erreur, sans quoi une confirmation réussie
       * s'afficherait comme un échec au moment où la personne clique
       * réellement.
       */
      return jsonResponse({ ok: true, code: 'already_used' }, { status: 200 });
    }

    // Retiré avant l'envoi : un lien ne vaut qu'une fois, même si la
    // remise échoue ensuite.
    enAttente.delete(jeton.pid);

    const livraison = await livrer(req, message);
    if (!livraison.ok) {
      return jsonResponse({ ok: false, code: livraison.code }, { status: livraison.status });
    }
    return jsonResponse({ ok: true }, { status: 200 });
  },
};

export const contactEndpoints: Endpoint[] = [
  challengeEndpoint,
  contactEndpoint,
  confirmEndpoint,
];
