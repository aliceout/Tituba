/**
 * Les trois réglages d'avant l'ouverture, lus depuis Payload.
 *
 * Ils vivent dans le global `Site`, groupe `preparation`, et pilotent :
 *
 *   noindex         un en-tête et une balise « ne pas indexer », un
 *                   robots.txt qui interdit tout, un plan de site vide
 *   accesRestreint  le site répond « en préparation », sauf à qui
 *                   présente la clé d'aperçu
 *   demoChargee     géré côté Payload — le jeu de démonstration est
 *                   posé ou retiré de la base, le site n'a rien à
 *                   filtrer
 *
 * ─── La clé n'est jamais transmise en clair ─────────────────────────
 *
 * Le global est lisible sans authentification : ce que le site lit ici,
 * n'importe qui peut le lire aussi. Payload n'en conserve donc que le
 * condensat, et c'est lui qu'on compare — la clé du visiteur est hachée
 * de ce côté-ci avant comparaison. Personne ne peut la retrouver depuis
 * l'API.
 *
 * ─── Pourquoi une mémoire de quelques secondes ──────────────────────
 *
 * Ces réglages sont consultés à chaque requête, y compris pour les
 * fichiers. Sans mémoire, chaque image d'une page déclencherait un appel
 * à Payload. Dix secondes suffisent à absorber une visite entière, et
 * restent assez courtes pour qu'un changement dans l'admin se voie
 * presque tout de suite.
 */
import { createHash } from 'node:crypto';

import { fetchSite } from './payload';

export type Preparation = {
  noindex: boolean;
  accesRestreint: boolean;
  clefApercuHash: string | null;
};

const AUCUNE: Preparation = { noindex: false, accesRestreint: false, clefApercuHash: null };
const DUREE_MEMOIRE_MS = 10_000;

let memoire: { valeur: Preparation; expire: number } | null = null;

export async function lirePreparation(): Promise<Preparation> {
  if (memoire && memoire.expire > Date.now()) return memoire.valeur;

  let valeur = AUCUNE;
  try {
    const site = await fetchSite<{ preparation?: Partial<Preparation> }>(0);
    const p = site?.preparation ?? {};
    valeur = {
      noindex: p.noindex === true,
      accesRestreint: p.accesRestreint === true,
      clefApercuHash: p.clefApercuHash ?? null,
    };
  } catch {
    // Payload injoignable : on n'invente pas de restriction. Fermer le
    // site parce que le CMS ne répond pas transformerait une panne du
    // CMS en panne totale — alors que les pages savent se rendre sans
    // lui, avec leurs valeurs de repli.
    valeur = AUCUNE;
  }

  memoire = { valeur, expire: Date.now() + DUREE_MEMOIRE_MS };
  return valeur;
}

/** À appeler quand on sait que les réglages viennent de changer. */
export function oublierPreparation(): void {
  memoire = null;
}

export function hacherClef(clef: string): string {
  return createHash('sha256').update(clef.trim(), 'utf8').digest('hex');
}
