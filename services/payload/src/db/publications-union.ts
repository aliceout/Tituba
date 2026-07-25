/**
 * Constructeur SQL unifié sur les cinq tables de publication.
 *
 * Tituba publie dans cinq collections distinctes, mais le site les
 * présente ensemble : une seule barre de recherche, un seul flux, des
 * compteurs de thématiques qui additionnent les cinq. Côté Payload,
 * l'API REST interroge une collection à la fois ; fusionner côté
 * client imposerait cinq requêtes puis un tri en mémoire, ce qui ne
 * pagine pas correctement (obtenir la page N d'une fusion demande
 * N × pageSize documents de *chaque* source).
 *
 * D'où ce constructeur : une seule requête SQL en `UNION ALL`, avec une
 * colonne discriminante `collection` pour que l'appelant sache d'où
 * vient chaque ligne et puisse reconstruire l'URL publique.
 */

import { sql, type SQL } from '@payloadcms/db-postgres/drizzle';

/**
 * Tables de publication, dans l'ordre d'affichage par défaut.
 *
 * Le nom de table Postgres est le slug de collection : Payload dérive
 * l'un de l'autre. Cette liste est la source de vérité côté SQL brut —
 * elle doit rester alignée avec les collections déclarées dans
 * payload.config.ts.
 */
export const PUBLICATION_TABLES = [
  'articles',
  'analyses',
  'actus',
  'podcasts',
  'outils',
] as const;

export type PublicationTable = (typeof PUBLICATION_TABLES)[number];

/**
 * Colonnes projetées par chaque branche de l'union.
 *
 * Les cinq branches doivent exposer une liste de colonnes **identique**
 * en nombre et en type, sinon Postgres refuse l'UNION. Les champs
 * propres à un format (doi, audio_url, duration_seconds…) en sont donc
 * volontairement absents : une carte de résultat n'en a pas besoin, et
 * les inclure obligerait à caster des NULL typés dans les branches qui
 * ne les ont pas.
 */
const COMMON_COLUMNS = [
  'id',
  'numero',
  'slug',
  'title',
  'lede',
  'published_at',
  'id_carnet',
] as const;

export type PublicationRow = {
  collection: PublicationTable;
  id: number;
  numero: number | null;
  slug: string;
  title: string;
  lede: string | null;
  published_at: string;
  id_carnet: string | null;
};

/**
 * Union des cinq tables, restreinte aux publications réellement
 * publiques : ni brouillon, ni datée dans le futur.
 *
 * `extraSelect` ajoute une expression calculée à chaque branche (le
 * rang de pertinence pour la recherche, par exemple). Elle est évaluée
 * **par branche**, donc elle peut référencer l'alias `p`.
 */
export function publicationsUnion(opts: {
  /** Prédicat supplémentaire, appliqué dans chaque branche. */
  where?: (alias: string) => SQL;
  /** Expression additionnelle projetée par chaque branche, avec son alias. */
  extraSelect?: (alias: string) => SQL;
  /** Inclure brouillons et publications futures (usage admin). */
  includeUnpublished?: boolean;
}): SQL {
  const { where, extraSelect, includeUnpublished = false } = opts;

  const branches = PUBLICATION_TABLES.map((table) => {
    const cols = COMMON_COLUMNS.map((c) => sql.raw(`p.${c}`));
    const parts: SQL[] = [
      sql`SELECT ${sql.raw(`'${table}'`)}::text AS collection`,
      ...cols.map((c) => sql`, ${c}`),
    ];
    if (extraSelect) parts.push(sql`, ${extraSelect('p')}`);
    parts.push(sql` FROM ${sql.raw(`"${table}"`)} p`);

    const preds: SQL[] = [];
    if (!includeUnpublished) {
      preds.push(sql`p.draft IS NOT TRUE`);
      preds.push(sql`p.published_at <= now()`);
    }
    if (where) preds.push(where('p'));
    if (preds.length > 0) {
      parts.push(sql` WHERE `);
      preds.forEach((pred, i) => {
        if (i > 0) parts.push(sql` AND `);
        parts.push(pred);
      });
    }
    return sql.join(parts, sql``);
  });

  return sql.join(branches, sql` UNION ALL `);
}
