/**
 * Les fichiers d'un billet « outil ».
 *
 * Ce format existe pour transmettre un document ; son corps de texte
 * ne fait que le présenter. Le champ est obligatoire à la saisie mais
 * n'était lu nulle part, si bien que la page d'un outil ne donnait
 * aucun accès à ce qu'elle annonce.
 *
 * Toujours un fichier que nous hébergeons, jamais un lien vers
 * l'extérieur : le bouton dit donc « Télécharger » sans condition, et
 * il n'y a ni onglet à ouvrir ni domaine tiers à annoncer.
 */

import { mediaUrl } from '../payload';

type Entree = {
  fichier?:
    | { filename?: string; title?: string | null; filesize?: number | null; mimeType?: string | null }
    | string
    | number
    | null;
  description?: string | null;
} | null;

export type Ressource = {
  url: string;
  /** Le titre du média, saisi dans la médiathèque. */
  nom: string;
  description: string;
  format: string;
  poids: string;
};

/** « 1,4 Mo », « 320 Ko » — jamais « 0 Ko » faute de valeur. */
export function poidsLisible(octets: number | null | undefined): string {
  if (typeof octets !== 'number' || octets <= 0) return '';
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1).replace('.', ',')} Mo` : `${Math.round(octets / 1024)} Ko`;
}

export function lireRessources(entrees: Entree[] | null | undefined): Ressource[] {
  return (entrees ?? [])
    .map((entree) => {
      const doc = entree?.fichier && typeof entree.fichier === 'object' ? entree.fichier : null;
      return {
        url: mediaUrl(doc?.filename) ?? '',
        // « Grille de relecture » se lit mieux que « grille-v3-final.pdf »,
        // qui ne sert que de repli.
        nom: (doc?.title ?? '').trim() || doc?.filename || 'Document',
        description: (entree?.description ?? '').trim(),
        format: (doc?.filename ?? '').split('.').pop()?.toUpperCase() ?? '',
        poids: poidsLisible(doc?.filesize),
      };
    })
    .filter((r) => r.url);
}

const PUBLICS: Record<string, string> = {
  tous: 'Tous publics',
  militantes: 'Militant·es et collectifs',
  pros: 'Professionnel·les',
  structures: 'Structures et institutions',
};

export function libellePublic(audience: string | null | undefined): string {
  return PUBLICS[audience ?? ''] ?? '';
}
