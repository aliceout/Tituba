/**
 * L'image de couverture d'un billet : ce qu'on en montre, et à qui on
 * la doit.
 *
 * Sorti de `PublicationArticle.astro`, où ces quarante lignes de calcul
 * voisinaient avec le lecteur audio, la bibliographie et le texte de
 * citation — sans rapport entre eux, et impossibles à éprouver
 * autrement qu'en ouvrant une page.
 */

import { uploadedImageUrl } from '../payload';

/**
 * Zone retenue dans l'admin, en POURCENTAGES de l'image (0 → 100).
 *
 * L'unité est dite parce qu'elle ne se devine pas : une zone
 * `{ w: 50 }` couvre la moitié de l'image, pas la moitié d'un pour
 * cent. Rien dans les valeurs ne le signale, et s'y tromper donne un
 * agrandissement de vingt mille pour cent.
 */
export type Zone = {
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
};

type ImageChamp =
  | {
      filename?: string;
      alt?: string;
      crop?: Zone | null;
      unsplash?: {
        photographerName?: string;
        photographerProfileUrl?: string;
      } | null;
    }
  | string
  | number
  | null
  | undefined;

export type Credit = {
  name: string;
  profileUrl: string | null;
  unsplashUrl: string;
};

export type Couverture = {
  /** L'image de l'épisode ou du billet. */
  url: string | null;
  alt: string;
  /** L'image de la série, en fond du hero d'un épisode. */
  fondUrl: string | null;
  /** Style à poser sur l'image quand une zone a été choisie. */
  cadrage: string | null;
  credit: Credit | null;
};

/**
 * Crédit obligatoire — conditions d'utilisation d'Unsplash.
 *
 * Absent d'un dépôt manuel : le champ `unsplash` n'est rempli qu'à
 * l'import. Les deux liens portent l'UTM qu'Unsplash exige.
 */
const UTM = 'utm_source=tituba&utm_medium=referral';

/**
 * Traduit la zone choisie en agrandissement + décalage.
 *
 * Le hero montre l'image dans un carré : d'une photo qui n'en est pas
 * un, il n'en montre qu'une partie, et la zone choisie dans l'admin dit
 * laquelle.
 *
 * Un agrandissement plutôt qu'un `object-position` : la zone est
 * redimensionnable, il y a donc un facteur d'échelle à appliquer, ce
 * qu'un point focal ne sait pas exprimer. Montrer une zone large de
 * `w` fois l'image revient à afficher celle-ci à `1 / w` de la taille
 * du cadre.
 *
 * Sans zone enregistrée, rien : `object-fit: cover` fait son cadrage
 * centré habituel, comme pour toutes les images d'avant l'option.
 */
export function cadrageDeZone(zone: Zone | null | undefined): string | null {
  if (!zone) return null;
  const { w, h } = zone;
  if (typeof w !== 'number' || w <= 0 || typeof h !== 'number' || h <= 0) return null;
  const x = zone.x ?? 0;
  const y = zone.y ?? 0;
  return (
    `width:${(100 / w) * 100}%;height:${(100 / h) * 100}%;` +
    `left:${(-x / w) * 100}%;top:${(-y / h) * 100}%;`
  );
}

export function lireCouverture(image: ImageChamp, imageDeSerie?: ImageChamp): Couverture {
  const objet = typeof image === 'object' && image ? image : null;
  const photographe = objet?.unsplash?.photographerName;

  return {
    url: uploadedImageUrl(image),
    alt: objet?.alt || '',
    fondUrl: uploadedImageUrl(imageDeSerie ?? null),
    cadrage: cadrageDeZone(objet?.crop),
    credit: photographe
      ? {
          name: photographe,
          profileUrl: objet?.unsplash?.photographerProfileUrl
            ? `${objet.unsplash.photographerProfileUrl}?${UTM}`
            : null,
          unsplashUrl: `https://unsplash.com/?${UTM}`,
        }
      : null,
  };
}
