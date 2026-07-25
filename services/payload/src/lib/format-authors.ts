/**
 * Helpers de formatage des auteur·ice·s d'une référence bibliographique
 * (style Chicago author-date — celui retenu pour le Carnet).
 *
 * Source de vérité : un array `authors[]` avec `lastName` + `firstName?`
 * + `role` (author / editor / translator).
 *
 * Côté frontend Astro, un fichier jumeau (`src/lib/format-authors.ts`)
 * réplique ces helpers — duplication assumée parce que les deux packages
 * ont des aliases TS différents et le code est petit.
 */

export type BibAuthor = {
  firstName?: string | null;
  lastName: string;
  role?: 'author' | 'editor' | 'translator';
};

/**
 * Forme courte pour citation inline en corps de texte (« Butler 1990 »,
 * « Butler and Spivak 1990 », « Butler et al. 1990 »). Pas d'année ici
 * — l'appelant l'ajoute (Bibliography.year vit ailleurs).
 */
export function formatAuthorsShort(authors: BibAuthor[] | null | undefined): string {
  const list = (authors ?? []).filter(
    (a) => a?.role === 'author' || a?.role === undefined,
  );
  const names = list.map((a) => (a.lastName ?? '').trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

/**
 * Forme longue pour la bibliographie en pied de billet, style Chicago :
 *
 *   1 auteur   : « Butler, Judith »
 *   2 auteurs  : « Butler, Judith, and Gayatri Spivak »
 *   3 auteurs  : « Butler, Judith, Joan Scott, and Gayatri Spivak »
 *   4+ auteurs : on garde la liste complète (Chicago accepte jusqu'à 10
 *                avant le « et al. » en biblio ; pour le Carnet on liste
 *                tout, c'est plus honnête).
 *
 * Si seul·e·s des éditeur·ice·s (role=editor) sont présent·e·s, le label
 * se termine par `, eds.` (ou `, ed.` au singulier). Les traducteur·ice·s
 * sont listés séparément en fin via `formatTranslators` — pas inclus ici.
 */
export function formatAuthorsChicago(authors: BibAuthor[] | null | undefined): string {
  const all = (authors ?? []).filter((a) => a && (a.lastName ?? '').trim().length > 0);
  if (all.length === 0) return '';

  const main = all.filter((a) => a.role === 'author' || a.role === undefined);
  const editors = all.filter((a) => a.role === 'editor');

  // Si pas d'auteurs mais des éditeurs, on rend la liste d'éditeurs
  // avec le suffixe « ed. » / « eds. » (cas typique d'un recueil).
  const list = main.length > 0 ? main : editors;
  if (list.length === 0) return '';

  const formatted = list.map((a, idx) => {
    const last = a.lastName.trim();
    const first = (a.firstName ?? '').trim();
    if (!first) return last;
    // 1er auteur = « Nom, Prénom » ; suivants = « Prénom Nom »
    return idx === 0 ? `${last}, ${first}` : `${first} ${last}`;
  });

  let result: string;
  if (formatted.length === 1) {
    result = formatted[0];
  } else if (formatted.length === 2) {
    result = `${formatted[0]}, and ${formatted[1]}`;
  } else {
    const head = formatted.slice(0, -1).join(', ');
    const tail = formatted[formatted.length - 1];
    result = `${head}, and ${tail}`;
  }

  // Suffixe éditeur·ice·s si on a basculé sur la liste d'éditeurs.
  if (main.length === 0 && editors.length > 0) {
    result += editors.length > 1 ? ', eds.' : ', ed.';
  }
  return result;
}

/**
 * Liste des traducteur·ice·s formatée pour insertion après le titre,
 * style Chicago : « Translated by Prénom Nom » (ou « Translated by
 * Prénom Nom and Prénom Nom »). Vide si aucun traducteur.
 */
export function formatTranslators(authors: BibAuthor[] | null | undefined): string {
  const list = (authors ?? []).filter((a) => a?.role === 'translator');
  if (list.length === 0) return '';
  const names = list.map((a) => {
    const last = (a.lastName ?? '').trim();
    const first = (a.firstName ?? '').trim();
    return first ? `${first} ${last}` : last;
  });
  if (names.length === 1) return `Translated by ${names[0]}`;
  if (names.length === 2) return `Translated by ${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `Translated by ${head}, and ${tail}`;
}

/**
 * Extrait le `lastName` du 1er auteur (role='author' ou non précisé).
 * Utilisé pour la citation inline courte côté frontend (Astro) et pour
 * le tri par auteur dans la liste admin.
 */
export function getFirstAuthorLastName(authors: BibAuthor[] | null | undefined): string {
  const list = (authors ?? []).filter(
    (a) => a?.role === 'author' || a?.role === undefined,
  );
  if (list.length === 0) return '';
  return (list[0].lastName ?? '').trim();
}
