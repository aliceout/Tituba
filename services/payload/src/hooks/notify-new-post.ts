/**
 * Hook afterChange sur la collection `posts` qui envoie un mail
 * d'alerte aux abonné·es actif·ves à la première publication d'un
 * billet.
 *
 * Idempotence : on ne déclenche qu'une fois par billet, garde portée
 * par le champ `notificationsSentAt`. Conditions cumulatives pour
 * déclencher l'envoi :
 *  - le billet n'est pas en draft (`doc.draft === false`)
 *  - `publishedAt` est défini et déjà passé (vs futur)
 *  - `notificationsSentAt` n'est pas déjà set
 *  - le toggle global `Subscriptions.emailEnabled` est activé
 *
 * Flow :
 *  1. Vérifie les conditions, sort tôt si une ne tient pas
 *  2. Set `notificationsSentAt` immédiatement (garde anti-rejeu)
 *  3. Lance le dispatch des mails en arrière-plan (fire-and-forget) —
 *     le hook n'attend pas la fin de l'envoi pour rendre la main à
 *     l'admin. Pour 100 abonné·es à ~200 ms/mail, l'envoi prend ~20 s
 *     côté worker mail.
 *
 * Limites v1 : pas de queue persistante. Si le process meurt pendant
 * le dispatch, les abonné·es non encore servi·es ne reçoivent rien
 * (mais `notificationsSentAt` est set, on ne retrigger pas au reboot).
 * V2 : externaliser dans une queue Redis/PG avec retries.
 */

import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload';

import { getSiteName, newPostEmail } from '../auth/email-templates';
import { buildUnsubUrl } from '../endpoints/subscribers';

// Plafond par envoi SMTP. Si Mailpit ou le SMTP de prod ne répond pas,
// on coupe l'attente plutôt que de hang indéfiniment et bloquer la
// boucle de dispatch (qui sinon bloquerait la connexion DB et plus
// largement le process Payload — observable au reboot).
const SMTP_TIMEOUT_MS = 10_000;

function sendWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`SMTP timeout after ${ms}ms`)), ms);
    t.unref?.();
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

type PostDoc = {
  id: number | string;
  slug?: string | null;
  title?: string | null;
  lede?: string | null;
  draft?: boolean;
  publishedAt?: string | null;
  notificationsSentAt?: string | null;
  type?: 'analyse' | 'note' | 'fiche' | null;
};

// Subset des relations de Post utilisé pour formater le mail. On
// rebuild depuis le doc rafraîchi (depth=2) côté dispatch.
type PostRelations = {
  themes?: Array<{ name?: string | null; slug?: string | null }> | null;
  authors?: Array<PostAuthorEntry> | null;
};

type PostAuthorEntry = {
  kind?: 'user' | 'external';
  user?:
    | { displayName?: string | null; email?: string | null }
    | number
    | string
    | null;
  name?: string | null;
  affiliation?: string | null;
};

const TYPE_LABEL: Record<NonNullable<PostDoc['type']>, string> = {
  analyse: 'Analyse',
  note: 'Note de lecture',
  fiche: 'Fiche thématique',
};

// Inlined depuis Astro (src/lib/site.ts → formatPostByline). On
// duplique côté Payload pour ne pas créer un import cross-package
// (Astro vit dans src/, Payload dans services/payload/src/).
function authorDisplayName(a: PostAuthorEntry): string {
  if ((a.kind ?? 'user') === 'user') {
    if (a.user && typeof a.user === 'object') {
      return a.user.displayName?.trim() || a.user.email?.trim() || '';
    }
    return '';
  }
  return (a.name ?? '').trim();
}

function formatByline(authors: PostAuthorEntry[] | null | undefined): string {
  if (!authors || authors.length === 0) return '';
  const parts = authors
    .map((a) => {
      const name = authorDisplayName(a);
      if (!name) return '';
      const aff = a.kind === 'external' && a.affiliation?.trim();
      return aff ? `${name} (${aff.trim()})` : name;
    })
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `par ${parts[0]}`;
  if (parts.length === 2) return `par ${parts[0]} et ${parts[1]}`;
  return `par ${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

// Construction de l'URL publique du billet pour le lien dans le mail.
// Convention Infisical : ADDRESS contient le domaine sans schème.
function buildPostUrl(slug: string): string {
  const raw = process.env.ADDRESS || 'http://localhost:4321';
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return `${withScheme.replace(/\/$/, '')}/billets/${slug}/`;
}

async function isEmailFeatureEnabled(req: PayloadRequest): Promise<boolean> {
  try {
    const subs = await req.payload.findGlobal({ slug: 'subscriptions' });
    return (subs as { emailEnabled?: boolean }).emailEnabled !== false;
  } catch {
    return true;
  }
}

type Subscriber = {
  id: number | string;
  email: string;
};

// Ne prend pas `req` mais `payload` : la tâche s'exécute après le
// retour du hook (cf. setImmediate côté caller), il ne faut pas
// dépendre d'un objet de requête potentiellement nettoyé. L'instance
// `payload` est singleton et reste valide tant que le process tourne.
async function dispatchPostNotifications(payload: Payload, post: PostDoc): Promise<void> {
  if (!post.slug || !post.title) {
    payload.logger.warn({ postId: post.id }, 'notify_new_post: missing slug/title, skipping');
    return;
  }

  // Refetch avec depth=2 pour récupérer les thèmes et les auteur·ices
  // populés en objets (le doc reçu dans le hook a depth variable selon
  // l'opération). On a besoin des relations résolues pour formater
  // byline + thèmes dans le mail.
  let postFull: (PostDoc & PostRelations) = post;
  try {
    const fresh = (await payload.findByID({
      collection: 'posts',
      id: post.id,
      depth: 2,
      overrideAccess: true,
    })) as unknown as PostDoc & PostRelations;
    if (fresh) postFull = fresh;
  } catch (err) {
    payload.logger.warn(
      { err, postId: post.id },
      'notify_new_post: failed to refetch post, falling back to hook doc',
    );
  }

  // Paginate-friendly : on récupère par batch de 500 active subs. Pour
  // un Carnet typique on ne devrait pas dépasser quelques centaines de
  // subs. Si on dépasse, ajouter une boucle de pagination ici.
  const found = await payload.find({
    collection: 'subscribers',
    where: { status: { equals: 'active' } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  const subs = found.docs as unknown as Subscriber[];
  if (subs.length === 0) {
    payload.logger.info({ postId: post.id }, 'notify_new_post: no active subscribers');
    return;
  }

  const siteName = await getSiteName(payload);
  const postUrl = buildPostUrl(post.slug);
  const byline = formatByline(postFull.authors);
  const typeLabel = postFull.type ? TYPE_LABEL[postFull.type] : '';
  const themeNames = (postFull.themes ?? [])
    .map((t) => (t?.slug ?? t?.name ?? '').trim())
    .filter(Boolean);

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    if (!sub.email) continue;
    try {
      const unsubUrl = buildUnsubUrl(sub.id);
      const tpl = newPostEmail({
        siteName,
        postTitle: post.title,
        postLede: postFull.lede ?? post.lede ?? null,
        postUrl,
        unsubUrl,
        byline,
        typeLabel,
        themeNames,
      });
      // Guarded par un timeout — un SMTP qui ne répond pas (mailpit
      // déconnecté en dev, relay down en prod) ferait sinon hang la
      // boucle indéfiniment.
      await sendWithTimeout(
        payload.sendEmail({
          to: sub.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          // En-tête List-Unsubscribe pour les clients mail conformes
          // RFC 8058 (Gmail, Apple Mail, Thunderbird, …). Le lien
          // apparaît dans l'UI comme un bouton « se désabonner ».
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
        SMTP_TIMEOUT_MS,
      );
      sent++;
    } catch (err) {
      failed++;
      payload.logger.warn(
        { err, postId: post.id, email: sub.email },
        'notify_new_post: send failed for one subscriber',
      );
    }
  }
  payload.logger.info(
    { postId: post.id, sent, failed, total: subs.length },
    'notify_new_post: dispatch done',
  );
}

export const notifyNewPost: CollectionAfterChangeHook = async ({ doc, req }) => {
  const post = doc as PostDoc;

  // Garde d'idempotence : déjà notifié → exit
  if (post.notificationsSentAt) return doc;

  // Conditions de déclenchement
  if (post.draft) return doc;
  if (!post.publishedAt) return doc;
  const pubTs = new Date(post.publishedAt).getTime();
  if (!Number.isFinite(pubTs) || pubTs > Date.now()) return doc;

  // Toggle global Subscriptions.emailEnabled
  if (!(await isEmailFeatureEnabled(req))) return doc;

  // Marque comme « notifié » AVANT le dispatch. L'update déclenche un
  // afterChange récursif — mais celui-ci sort immédiatement sur la
  // garde d'idempotence ci-dessus (notificationsSentAt désormais set).
  //
  // On passe `req` à l'update pour réutiliser la transaction de la
  // requête courante. Sans ça, dans le cas d'une **création** de
  // billet (POST /cms/api/posts), la row n'est pas encore commitée
  // quand le hook tourne → lookup par id renvoie NotFound. Avec `req`,
  // l'update voit le row dans la même transaction.
  try {
    await req.payload.update({
      collection: 'posts',
      id: post.id,
      overrideAccess: true,
      req,
      data: { notificationsSentAt: new Date().toISOString() },
    });
  } catch (err) {
    req.payload.logger.error(
      { err, postId: post.id },
      'notify_new_post: failed to mark notificationsSentAt, aborting',
    );
    return doc;
  }

  // Dispatch détaché : `setImmediate` sort de la queue de tâches de la
  // requête courante (sinon Next.js / Payload peut considérer la
  // requête comme « en cours » tant que le dispatch tourne, ce qui
  // bloque les requêtes suivantes — observé en dev où un delete restait
  // hanged sur "Suppression…" après un publish + dispatch en cours).
  // On capture aussi `payload` (singleton) plutôt que `req` (cycle de
  // vie lié à la requête).
  const payload = req.payload;
  const postSnapshot = post;
  setImmediate(() => {
    dispatchPostNotifications(payload, postSnapshot).catch((err) => {
      payload.logger.error(
        { err, postId: postSnapshot.id },
        'notify_new_post: dispatch failed',
      );
    });
  });

  return doc;
};
