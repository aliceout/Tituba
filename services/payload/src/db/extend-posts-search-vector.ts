/**
 * Hook `afterSchemaInit` pour le postgres adapter de Payload — déclare
 * la colonne `posts.search_vector` (tsvector) + son index GIN au
 * niveau du schéma Drizzle.
 *
 * Sans cette déclaration, `push: true` (mode dev) voit la colonne
 * comme « inconnue » à chaque boot et propose de la DROP avec un
 * warning de perte de données. Idem pour l'index. Avec ce hook,
 * Drizzle considère la colonne comme attendue et ne la touche plus.
 *
 * En prod (push: false), c'est la migration
 * 20260510_170000_posts_search_vector qui crée la colonne et l'index
 * via SQL natif au boot du container ; le hook ici est sans effet
 * mais reste cohérent avec le schéma déclaré.
 */

// Imports via les subpaths officiels que `@payloadcms/db-postgres`
// re-export (cf. son package.json). Évite d'avoir à déclarer
// drizzle-orm comme dépendance directe.
import { customType, index } from '@payloadcms/db-postgres/drizzle/pg-core';
import type { PostgresAdapterArgs } from '@payloadcms/db-postgres';

// Drizzle n'a pas de type tsvector natif — on en crée un custom.
// Le `data` correspond au type TS public (string en lecture/écriture
// brute si besoin) ; côté DB c'est le type Postgres tsvector.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// Le type exact de PostgresSchemaHook n'est pas exporté directement
// via le subpath public de db-postgres. On l'extrait via les Args du
// postgresAdapter — strictement équivalent.
type SchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number];

export const extendPostsSearchVector: SchemaHook = ({
  schema,
  extendTable,
}) => {
  const posts = (schema.tables as Record<string, unknown>).posts;
  if (!posts) return schema;

  extendTable({
    table: posts as never,
    columns: {
      search_vector: tsvector('search_vector'),
    },
    extraConfig: (table) => ({
      // Index GIN sur la colonne tsvector — opérateur `@@` ultra rapide
      // même à plusieurs dizaines de milliers de billets.
      posts_search_vector_idx: index('posts_search_vector_idx').using(
        'gin',
        table.search_vector as never,
      ),
    }),
  });

  return schema;
};
