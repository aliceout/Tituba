// Sous-ensemble du JSON renvoyé par l'API Web Zotero v3 — uniquement
// les champs qu'on utilise pour mapper vers la collection Bibliography
// du Carnet. Cf https://www.zotero.org/support/dev/web_api/v3/types_and_fields
//
// La forme réelle de Zotero a beaucoup plus de champs (date access, tags,
// collections, relations, notes…) qu'on ignore volontairement pour l'instant.

export type ZoteroCreator = {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  /** Nom unique pour les auteurs corporatifs (UNESCO…). */
  name?: string;
};

export type ZoteroItemData = {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  creators?: ZoteroCreator[];
  /** Format libre — souvent juste "2017" mais parfois "March 2017" ou "2017-03-14". */
  date?: string;
  publisher?: string;
  place?: string;
  /** Pour les articles de revue. */
  publicationTitle?: string;
  /** Volume/numéro. */
  volume?: string;
  issue?: string;
  /** "43-82", "chap. 3"… */
  pages?: string;
  url?: string;
  DOI?: string;
  /** Pour les notes/annotations Zotero — on ignore. */
  abstractNote?: string;
};

/**
 * Forme renvoyée par /items?format=json — wrapper avec key/version
 * dupliqués au top-level + data imbriqué.
 */
export type ZoteroItem = {
  key: string;
  version: number;
  data: ZoteroItemData;
};

export type ZoteroSyncResult = {
  added: number;
  updated: number;
  /** Refs supprimées côté Zotero ET pas citées dans des billets — effacées du Carnet. */
  deleted: number;
  /**
   * Refs supprimées côté Zotero MAIS encore citées dans des billets : on
   * les garde côté Carnet pour ne pas casser les citations existantes.
   * L'autrice doit retirer la citation du billet (ou supprimer la ref
   * manuellement) si elle veut s'en débarrasser.
   */
  keptCited: Array<{
    key: string;
    title: string;
    /** Numéros des billets qui citent encore cette ref. */
    postNumeros: number[];
  }>;
  errors: Array<{
    key: string;
    /** Titre Zotero (s'il existe) — sert à identifier la ref côté UI. */
    title: string | null;
    /** Raison précise pour laquelle l'item est ignoré (champ manquant, format invalide…). */
    reason: string;
  }>;
  /** Version Zotero la plus récente vue durant ce sync — sert de pivot pour le suivant. */
  newVersion: number;
};
