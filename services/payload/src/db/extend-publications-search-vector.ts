/**
 * Hook `afterSchemaInit` — déclare la colonne `search_vector` (tsvector)
 * et son index GIN sur chacune des cinq tables de publication.
 *
 * Sans cette déclaration, `push: true` (mode dev) voit la colonne comme
 * inconnue à chaque boot et propose de la DROP, avec un avertissement
 * de perte de données. Avec elle, Drizzle la considère comme attendue
 * et n'y touche plus.
 *
 * En prod (`push: false`), ce sont les migrations SQL qui créent la
 * colonne et l'index ; le hook reste sans effet mais garde le schéma
 * déclaré cohérent entre les deux modes.
 */

// Imports via les subpaths officiels que `@payloadcms/db-postgres`
// re-exporte (cf. son package.json). Évite d'avoir à déclarer
// drizzle-orm comme dépendance directe.
import { customType, index } from '@payloadcms/db-postgres/drizzle/pg-core';
import type { PostgresAdapterArgs } from '@payloadcms/db-postgres';

import { PUBLICATION_TABLES } from './publications-union';

// Drizzle n'a pas de type tsvector natif — on en crée un custom.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// Le type exact de PostgresSchemaHook n'est pas exporté par le subpath
// public de db-postgres. On l'extrait des Args du postgresAdapter —
// strictement équivalent.
type SchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number];

export const extendPublicationsSearchVector: SchemaHook = ({ schema, extendTable }) => {
  const tables = schema.tables as Record<string, unknown>;

  for (const name of PUBLICATION_TABLES) {
    const table = tables[name];
    // Table absente : cas normal au tout premier boot, avant que
    // Drizzle n'ait créé le schéma. On passe plutôt que d'échouer.
    if (!table) continue;

    extendTable({
      table: table as never,
      columns: {
        search_vector: tsvector('search_vector'),
      },
      extraConfig: (t) => ({
        // Index GIN sur la colonne tsvector — l'opérateur `@@` reste
        // rapide même à plusieurs dizaines de milliers de publications.
        [`${name}_search_vector_idx`]: index(`${name}_search_vector_idx`).using(
          'gin',
          t.search_vector as never,
        ),
      }),
    });
  }

  return schema;
};
