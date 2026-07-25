/**
 * Script one-shot — backfill de la colonne `posts.search_vector`
 * pour le dev DB.
 *
 * Pourquoi : en dev `push: true` crée la colonne via le hook
 * afterSchemaInit (Drizzle), mais aucune migration ne tourne — donc
 * pas de backfill automatique des billets pré-existants. Sans
 * backfill, leur tsvector reste NULL et ils n'apparaissent jamais
 * dans la recherche.
 *
 * Le script appelle directement la fonction `up` de la migration
 * de backfill, qui parcourt tous les billets via la local API et
 * écrit leur tsvector. Idempotent — sûr à relancer.
 *
 * En prod, ce script n'est PAS nécessaire : la migration tourne
 * automatiquement au boot du container via `payload migrate`.
 *
 * Usage : pnpm apply:search-vector
 */

import 'dotenv/config';
import { getPayload } from 'payload';

import config from '../src/payload.config';
import { up } from '../src/migrations/20260510_180000_posts_search_vector_backfill';

async function main(): Promise<void> {
  const payload = await getPayload({ config });
  // Le type MigrateUpArgs attend { db, payload, req }. Le `req` n'est
  // utilisé que pour passer aux `payload.find` du backfill — un objet
  // minimal suffit.
  await up({
    db: payload.db.drizzle as never,
    payload,
    req: { payload } as never,
  });
  // eslint-disable-next-line no-console
  console.log('✓ search_vector column + index + backfill appliqués.');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ Échec apply-search-vector:', err);
  process.exit(1);
});
