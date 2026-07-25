/**
 * Résout l'instance Drizzle à utiliser pour du SQL brut depuis un hook.
 *
 * Pourquoi ce helper existe : `req.payload.db.drizzle` est le **pool**,
 * pas la transaction de la requête en cours. Payload ouvre une
 * transaction par opération et range son instance Drizzle transactionnelle
 * dans `payload.db.sessions[req.transactionID].db`.
 *
 * Conséquence si on tape le pool depuis un hook `afterChange` : la
 * transaction du save n'est pas encore commitée, donc une ligne
 * fraîchement créée n'est **pas visible** depuis la connexion du pool.
 * Un `UPDATE … WHERE id = <nouvelle ligne>` matche zéro ligne, sans
 * erreur — l'écriture est silencieusement perdue. C'est exactement ce
 * qui arrivait à `posts.search_vector` à la création (cf.
 * hooks/update-post-search-vector.ts).
 *
 * Repli sur le pool quand il n'y a pas de transaction en cours
 * (`req.transactionID` absent) : c'est le cas des appels hors requête
 * (scripts, migrations, jobs), où le pool est le bon choix.
 *
 * Pour de la **lecture seule** hors transaction (ex. endpoints de
 * recherche), taper le pool directement reste correct — ce helper ne
 * sert que quand on écrit, ou qu'on doit voir les écritures en cours.
 */

import type { PayloadRequest } from 'payload';

// `sessions` est déclaré sur BasePostgresAdapter (@payloadcms/drizzle),
// mais l'interface DatabaseAdapter augmentée côté Payload ne le
// re-expose pas toujours selon la version. On décrit localement la
// forme dont on dépend plutôt que d'importer un type interne instable.
type DrizzleLike = {
  execute: (query: unknown) => Promise<unknown>;
};

type AdapterWithSessions = {
  drizzle: DrizzleLike;
  sessions?: Record<string | number, { db: DrizzleLike } | undefined>;
};

export function txDrizzle(req: Pick<PayloadRequest, 'payload' | 'transactionID'>): DrizzleLike {
  const adapter = req.payload.db as unknown as AdapterWithSessions;
  const id = req.transactionID;
  if (id != null) {
    const session = adapter.sessions?.[id as string | number];
    if (session?.db) return session.db;
  }
  return adapter.drizzle;
}
