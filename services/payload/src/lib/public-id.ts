/**
 * Identifiant public court d'une publication — celui qui figure dans
 * l'URL (`/analyses/k7m2xp/`).
 *
 * Distinct de la clé primaire `id` : celle-ci reste l'identité en base
 * et n'est jamais exposée. Un id séquentiel dans l'URL publierait trois
 * choses qu'on ne souhaite pas : le nombre de publications, leur ordre
 * de création, et de quoi énumérer le catalogue — brouillons devinables
 * compris.
 *
 * ─── Choix de l'alphabet ──────────────────────────────────────────────
 *
 * Consonnes et chiffres, **sans voyelle**. C'est le garde-fou contre le
 * mot involontaire : un tirage aléatoire sur un alphabet complet finit
 * statistiquement par produire une grossièreté ou une insulte dans une
 * URL. Sans voyelle, le cas ne peut structurellement pas se présenter.
 *
 * Sont également écartés les caractères ambigus à l'oral comme à la
 * saisie : `0`/`O`, `1`/`l`/`I`. Restent 27 signes.
 *
 * ─── Longueur ─────────────────────────────────────────────────────────
 *
 * 6 caractères, soit 27^6 ≈ 387 millions de combinaisons. Le risque de
 * collision suit le paradoxe des anniversaires, pas l'intuition : à
 * 1 000 publications il avoisine 0,1 %. Faible, mais non nul — d'où
 * l'index unique en base **et** les tentatives successives à la
 * génération. La contrainte Postgres reste le dernier mot : elle
 * rattrape même la course entre deux créations simultanées, que la
 * vérification applicative seule laisserait passer.
 */

import { randomInt } from 'crypto';

/** Consonnes + chiffres, sans voyelle ni caractère ambigu. */
const ALPHABET = 'bcdfghjkmnpqrstvwxyz23456789';

export const PUBLIC_ID_LENGTH = 6;

/**
 * Tire un identifiant. `randomInt` plutôt que `Math.random` : la
 * distribution est uniforme (pas de biais de modulo) et la source
 * cryptographique évite qu'on puisse prédire l'identifiant suivant à
 * partir des précédents — ce qui rendrait l'énumération possible, donc
 * annulerait l'intérêt de la manœuvre.
 */
export function generatePublicId(): string {
  let out = '';
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Forme attendue d'un identifiant public, pour valider une URL. */
export const PUBLIC_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);

export function isPublicId(v: unknown): v is string {
  return typeof v === 'string' && PUBLIC_ID_PATTERN.test(v);
}
