/**
 * Helpers de formatage des auteur·ice·s — jumeau côté frontend Astro
 * du fichier `services/payload/src/lib/format-authors.ts`. Garder les
 * deux fichiers synchronisés (la duplication est assumée parce que les
 * deux packages ont des aliases TS différents et que le code est petit).
 *
 * Convention : style Chicago author-date.
 */

export type BibAuthor = {
  firstName?: string | null;
  lastName: string;
  role?: 'author' | 'editor' | 'translator';
};

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

export function formatAuthorsChicago(authors: BibAuthor[] | null | undefined): string {
  const all = (authors ?? []).filter((a) => a && (a.lastName ?? '').trim().length > 0);
  if (all.length === 0) return '';

  const main = all.filter((a) => a.role === 'author' || a.role === undefined);
  const editors = all.filter((a) => a.role === 'editor');

  const list = main.length > 0 ? main : editors;
  if (list.length === 0) return '';

  const formatted = list.map((a, idx) => {
    const last = a.lastName.trim();
    const first = (a.firstName ?? '').trim();
    if (!first) return last;
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

  if (main.length === 0 && editors.length > 0) {
    result += editors.length > 1 ? ', eds.' : ', ed.';
  }
  return result;
}

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

export function getFirstAuthorLastName(authors: BibAuthor[] | null | undefined): string {
  const list = (authors ?? []).filter(
    (a) => a?.role === 'author' || a?.role === undefined,
  );
  if (list.length === 0) return '';
  return (list[0].lastName ?? '').trim();
}
