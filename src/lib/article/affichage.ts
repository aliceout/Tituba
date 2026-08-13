/**
 * Ce que la page d'un billet montre, et ce qu'elle tait.
 *
 * Ces décisions étaient prises au fil du script de la page, chacune à
 * côté du calcul qui la précédait. Réunies ici, on voit enfin qu'elles
 * dépendent toutes des trois mêmes choses : le format, ce que le billet
 * porte, et la place que cela demande.
 */

export type Contexte = {
  collection: string;
  /** Le format propose-t-il une citation d'article ? (cf table des formats) */
  citable: boolean;
  nbEntreesSommaire: number;
  aUneDuree: boolean;
  aDesNotes: boolean;
  nbReferences: number;
  aUnBrief: boolean;
  lecteurDansHero: boolean;
};

/**
 * Un billet d'actu est un format chaud, « volontairement bref, sans
 * appareil » — ce sont les mots de sa propre collection. Il n'a donc ni
 * sommaire, ni bouton « Citer cet article », ni export PDF : proposer
 * de citer un rebond d'actualité d'une minute offre un geste qui n'a
 * pas lieu d'être, et un sommaire d'une entrée n'aide personne.
 *
 * Conséquence à ne pas manquer : sans colonne latérale, le texte hérite
 * de toute la largeur du gabarit. Les autres formats sont sauvés malgré
 * eux — leur colonne prend 300 px et ramène le texte à une largeur
 * lisible. L'actu doit donc se resserrer elle-même (cf `.shell--actu`).
 */
export function afficherSommaire(c: Contexte): boolean {
  if (c.collection === 'actus') return false;
  return (
    c.nbEntreesSommaire > 0 || c.aUneDuree || c.aDesNotes || c.nbReferences > 0 || c.citable
  );
}

/**
 * Le rappel des faits occupe la colonne latérale d'un billet d'actu, à
 * la place du sommaire. Il ne s'affiche que s'il a été rédigé : sans
 * lui, le billet reprend toute la largeur et la colonne ne se monte
 * pas.
 */
export function afficherBrief(c: Contexte): boolean {
  return c.collection === 'actus' && c.aUnBrief;
}

/**
 * Où vit la date de publication : dans la colonne latérale pour les
 * formats qui en ont toujours une, dans le bandeau sinon.
 *
 * Calculé une fois et partagé par les deux composants — sans quoi un
 * format dont la colonne ne se monte pas (un outil sans sommaire ni
 * bibliographie) perdrait sa date sans que rien ne le signale.
 */
export function dateDansColonne(c: Contexte): boolean {
  return (
    afficherSommaire(c) &&
    (c.lecteurDansHero || c.collection === 'analyses' || c.collection === 'articles')
  );
}
