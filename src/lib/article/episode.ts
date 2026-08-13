/**
 * Ce qui ne concerne qu'un épisode de podcast : le fichier audio, les
 * personnes reçues, et l'endroit où se pose le lecteur.
 *
 * Ailleurs, `audio` et `guests` sont absents et ces valeurs restent
 * vides — les blocs correspondants ne se montent pas.
 */

import { audioFileUrl } from '../payload';

export type Episode = {
  audioSrc: string | null;
  /** « Untel, Unetelle et Unetel » — une phrase, pas une liste. */
  invitees: string;
  /**
   * Le lecteur monte dans le hero quand l'épisode a une couverture.
   *
   * L'image, plus haute que le cadre du titre, laisse sous celui-ci un
   * espace vide que le lecteur vient occuper : les deux colonnes se
   * terminent alors à la même ligne. Sans image, il n'y a pas de
   * colonne à remplir et le lecteur reste sous le bandeau de
   * métadonnées.
   */
  lecteurDansHero: boolean;
};

/** Dernière virgule remplacée par « et » : cela se lit, cela ne se dépouille pas. */
export function listerInvitees(guests: unknown[] | null | undefined): string {
  const noms = (guests ?? []).map((g) => String(g).trim()).filter(Boolean);
  if (noms.length === 0) return '';
  if (noms.length === 1) return noms[0];
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

export function lireEpisode(
  audio: { filename?: string } | string | number | null | undefined,
  guests: unknown[] | null | undefined,
  aUneCouverture: boolean,
): Episode {
  const objet = typeof audio === 'object' && audio ? audio : null;
  const audioSrc = audioFileUrl(objet?.filename);
  return {
    audioSrc,
    invitees: listerInvitees(guests),
    lecteurDansHero: Boolean(audioSrc) && aUneCouverture,
  };
}
