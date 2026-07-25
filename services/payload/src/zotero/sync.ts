// Logique de sync Zotero → Bibliography. Service pur (pas de HTTP).
// Appelé depuis l'endpoint `/users/me/zotero-sync` (cf endpoints.ts).
//
// Le sync :
//   1. Lit les credentials chiffrés du user, déchiffre la clé.
//   2. Pagine sur Zotero (since = lastSyncVersion).
//   3. Pour chaque item :
//      - Map vers le shape Bibliography (skip si data manquante)
//      - Upsert : query bibliography où zoteroKey=item.key, owner=user
//        - Si trouvé → update (avec req.context.zoteroSync = true pour
//          bypass le hook qui verrouille les refs zotero)
//        - Sinon → create
//   4. Update user.zotero.lastSync* avec les compteurs.

import type { Payload, PayloadRequest } from 'payload';

import { decrypt } from '../lib/crypto';
import { fetchAllItems, type ZoteroCreds, type ZoteroLibraryType } from './api';
import { mapItem, makeSlug } from './mapping';
import type { ZoteroSyncResult } from './types';

type UserDoc = {
  id: string | number;
  zotero?: {
    apiKey?: string | null;
    libraryId?: string | null;
    libraryType?: ZoteroLibraryType | null;
    lastSyncVersion?: number | null;
  };
};

/**
 * Lit le user en bypassant l'access read (sinon afterRead masque la
 * clé, qu'on a besoin de déchiffrer). Renvoie les credentials prêts
 * à l'emploi ou lève une erreur explicite si la config est incomplète.
 */
async function loadCreds(
  payload: Payload,
  userId: string | number,
  baseReq?: PayloadRequest,
): Promise<{ creds: ZoteroCreds; lastSyncVersion: number }> {
  // overrideAccess: true → on lit la clé chiffrée en bypassant
  // l'access.read: () => false posé sur le champ `apiKey`. C'est sûr
  // ici parce qu'on est côté serveur dans un endpoint qui a déjà
  // vérifié que c'est le user lui-même qui demande son sync.
  const raw = (await payload.findByID({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    depth: 0,
    req: baseReq,
  })) as UserDoc;

  const z = raw.zotero;
  if (!z?.apiKey) {
    throw new Error('Aucune clé API Zotero configurée pour ce compte.');
  }
  if (!z.libraryId) {
    throw new Error('Aucun ID utilisateur Zotero configuré.');
  }
  const libType: ZoteroLibraryType = z.libraryType === 'group' ? 'group' : 'user';

  let apiKey: string;
  try {
    apiKey = decrypt(z.apiKey);
  } catch {
    throw new Error('Impossible de déchiffrer la clé API. Re-saisis-la et réessaie.');
  }

  return {
    creds: {
      apiKey,
      libraryId: String(z.libraryId),
      libraryType: libType,
    },
    lastSyncVersion: typeof z.lastSyncVersion === 'number' ? z.lastSyncVersion : 0,
  };
}

/**
 * Cherche une ref Bibliography déjà importée pour ce user et cette
 * clé Zotero. Renvoie `null` si elle n'existe pas (à créer), ou
 * `{ id, zoteroVersion }` si elle existe (la version stockée sert à
 * skip les refs déjà à jour côté Carnet).
 */
async function findExistingRef(
  payload: Payload,
  userId: string | number,
  zoteroKey: string,
): Promise<{ id: string | number; zoteroVersion?: number | null } | null> {
  const slug = makeSlug(userId, zoteroKey);
  const res = await payload.find({
    collection: 'bibliography',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = res.docs[0] as
    | { id?: string | number; zoteroVersion?: number | null }
    | undefined;
  if (doc?.id == null) return null;
  return { id: doc.id, zoteroVersion: doc.zoteroVersion ?? null };
}

/**
 * Sync principal. Appelé par l'endpoint POST `/users/me/zotero-sync`.
 *
 * Note : on ne fait PAS de diff incrémental via `since=<lastSyncVersion>`
 * — ça raterait les refs supprimées localement au Carnet (Zotero ne
 * sait pas qu'on les a viées, donc elles n'apparaissent pas dans son
 * diff). À la place, on scanne toute la biblio à chaque sync. L'upsert
 * gère les 3 cas naturellement : ref absente du Carnet → create ; ref
 * existante avec version Zotero plus récente → update ; ref à jour →
 * skip silencieux. Coût : un scan complet par sync, OK jusqu'à
 * quelques milliers de refs.
 */
export async function syncZoteroForUser(opts: {
  payload: Payload;
  userId: string | number;
  req?: PayloadRequest;
}): Promise<ZoteroSyncResult> {
  const { payload, userId, req } = opts;
  const { creds, lastSyncVersion } = await loadCreds(payload, userId, req);

  const result: ZoteroSyncResult = {
    added: 0,
    updated: 0,
    deleted: 0,
    keptCited: [],
    errors: [],
    newVersion: lastSyncVersion,
  };

  // Set des clés Zotero vues durant ce scan — sert ensuite à détecter
  // les refs présentes en DB mais disparues côté Zotero (= supprimées).
  // Toutes les clés rencontrées sont ajoutées, même si l'item est
  // ignoré pour data manquante, parce qu'il existe TOUJOURS côté
  // Zotero — on ne veut pas le considérer comme supprimé.
  const seenKeys = new Set<string>();

  const { newVersion } = await fetchAllItems(creds, 0, async (items) => {
    for (const item of items) {
      seenKeys.add(item.key);
      try {
        const result_ = mapItem(item);
        if (!result_.ok) {
          // Item inutilisable (manque titre / année / auteurs). On
          // logge la raison précise + le titre Zotero (s'il existe)
          // pour que l'autrice puisse identifier l'entrée à corriger
          // dans Zotero sans avoir à chercher par clé.
          result.errors.push({
            key: item.key,
            title: result_.title ?? null,
            reason: result_.reason,
          });
          continue;
        }
        const mapped = result_.mapped;
        const existing = await findExistingRef(payload, userId, item.key);
        // Skip silencieux si la ref existe déjà avec la même version
        // Zotero — évite de gonfler le compteur "updated" sur un scan
        // complet où la majorité des items n'a pas bougé.
        if (existing && existing.zoteroVersion === item.version) {
          continue;
        }
        const data = {
          ...mapped,
          slug: makeSlug(userId, item.key),
          // Payload's Postgres adapter type owner: number | { id, ... }.
          // Notre signature accepte string | number — on coerce vers number.
          owner: typeof userId === 'number' ? userId : Number(userId),
        };
        // `req.context.zoteroSync = true` est le flag que le hook
        // beforeChange de Bibliography reconnaît pour bypass le
        // verrouillage des refs source='zotero'. Indispensable pour
        // un update.
        const context = { ...(req?.context ?? {}), zoteroSync: true };

        if (existing) {
          await payload.update({
            collection: 'bibliography',
            id: existing.id,
            data,
            overrideAccess: true,
            req: req ? { ...req, context } : undefined,
            context,
          });
          result.updated += 1;
        } else {
          await payload.create({
            collection: 'bibliography',
            data,
            overrideAccess: true,
            req: req ? { ...req, context } : undefined,
            context,
          });
          result.added += 1;
        }
      } catch (err) {
        const itemTitle =
          (item.data?.title ?? (item as unknown as { title?: string }).title ?? '').trim() || null;
        result.errors.push({
          key: item.key,
          title: itemTitle,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  result.newVersion = newVersion;

  // ─── Détection des suppressions Zotero ──────────────────────────
  // Les refs présentes en DB pour ce user mais absentes du scan ont été
  // supprimées côté Zotero. On les efface du Carnet — sauf si elles
  // sont encore citées dans un billet, auquel cas on les garde et on
  // signale à l'autrice de retirer la citation d'abord.
  const dbRefs = await payload.find({
    collection: 'bibliography',
    where: {
      and: [
        { source: { equals: 'zotero' } },
        { owner: { equals: userId } },
      ],
    },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  });

  for (const doc of dbRefs.docs) {
    const ref = doc as {
      id: string | number;
      zoteroKey?: string | null;
      title?: string | null;
    };
    const key = ref.zoteroKey ?? '';
    if (!key || seenKeys.has(key)) continue;

    // Cette ref est en DB mais disparue côté Zotero. Cherche les
    // billets qui la citent.
    let cited: { totalDocs: number; docs: Array<{ numero?: number }> } = {
      totalDocs: 0,
      docs: [],
    };
    try {
      const r = await payload.find({
        collection: 'posts',
        where: { bibliography: { in: [ref.id] } },
        limit: 50,
        depth: 0,
        overrideAccess: true,
      });
      cited = { totalDocs: r.totalDocs, docs: r.docs as Array<{ numero?: number }> };
    } catch {
      // Lecture des billets impossible — par prudence on conserve
      // la ref (mieux vaut un faux positif "gardé" qu'une suppression
      // qui casserait des citations).
      cited = { totalDocs: 1, docs: [] };
    }

    if (cited.totalDocs > 0) {
      const postNumeros = cited.docs
        .map((p) => p.numero)
        .filter((n): n is number => typeof n === 'number')
        .sort((a, b) => a - b);
      result.keptCited.push({
        key,
        title: (ref.title ?? '').trim() || '(sans titre)',
        postNumeros,
      });
      continue;
    }

    // Pas citée → suppression côté Carnet.
    try {
      await payload.delete({
        collection: 'bibliography',
        id: ref.id,
        overrideAccess: true,
      });
      result.deleted += 1;
    } catch (err) {
      result.errors.push({
        key,
        title: (ref.title ?? '').trim() || null,
        reason: `Échec suppression : ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Compose un résumé d'erreur pour le champ lastSyncError côté user
  // (visible sur la page Compte). Mentionne aussi les refs gardées
  // citées, parce que c'est une info actionnable.
  const errorSummary: string[] = [];
  if (result.errors.length > 0) {
    errorSummary.push(`${result.errors.length} item(s) ignoré(s)`);
  }
  if (result.keptCited.length > 0) {
    errorSummary.push(
      `${result.keptCited.length} ref(s) supprimée(s) côté Zotero mais conservée(s) (citée(s) dans des billets)`,
    );
  }

  // Persiste l'état de sync sur le user. Les champs lastSync* ont
  // access.update: false côté collection, donc overrideAccess obligatoire.
  await payload.update({
    collection: 'users',
    id: userId,
    overrideAccess: true,
    data: {
      zotero: {
        lastSyncAt: new Date().toISOString(),
        lastSyncVersion: newVersion,
        lastSyncAdded: result.added,
        lastSyncUpdated: result.updated,
        lastSyncError: errorSummary.join(' ; '),
      },
    },
  });

  return result;
}
