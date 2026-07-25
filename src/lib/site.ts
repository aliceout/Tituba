/**
 * Helpers utilitaires côté Astro — formatage de dates, slugs, citations,
 * calcul du temps de lecture, etc. Stub pour l'instant, à enrichir au fur
 * et à mesure que le design est porté.
 */

/** Mois français pleins (pas d'abréviations dans le carnet). */
const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/**
 * Formate une date ISO en chaîne lisible française : "14 avril 2026".
 * Utilisé dans les méta des billets (publication, mise à jour).
 */
export function formatDateFr(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format ISO court "YYYY-MM-DD" pour les pages archives (colonne date
 * mono).
 */
export function formatDateIso(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Calcule le temps de lecture en minutes — base 220 mots/min, arrondi
 * sup. Le champ existe aussi en BDD (set au save côté Payload), mais on
 * peut le re-calculer côté Astro pour les fragments dérivés.
 */
export function readingTimeMin(text: string, wpm = 220): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / wpm));
}

/**
 * Numéro de billet formaté "n° 042" (zero-padding sur 3 chiffres).
 */
export function formatNumero(n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  if (Number.isNaN(num)) return '';
  return `n° ${String(num).padStart(3, '0')}`;
}

/**
 * ID d'archivage "carnet:2026-042" — combine l'année de publication et
 * le numéro de billet, format figé.
 */
export function formatIdCarnet(year: number | string, n: number | string): string {
  const num = typeof n === 'string' ? parseInt(n, 10) : n;
  return `carnet:${year}-${String(num).padStart(3, '0')}`;
}

/**
 * Échappe le HTML pour empêcher toute injection depuis l'admin Payload.
 * À combiner avec formatHeroTitle / formatHeroLede ci-dessous selon le
 * contexte d'usage.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formate un titre de hero pour le composant <Hero/> : échappe le HTML,
 * puis transforme les portions entourées de `*` en `<em>`. Les `<em>`
 * sont stylés en accent par le composant Hero.
 *   formatHeroTitle('Notes en *études de genre*.')
 *     → 'Notes en <em>études de genre</em>.'
 */
export function formatHeroTitle(s: string): string {
  return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/**
 * Formate un lede de hero : échappe le HTML, puis convertit les retours
 * ligne saisis dans Payload en `<br />` pour que l'autrice contrôle le
 * wrap visuel.
 */
export function formatHeroLede(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br />');
}

/**
 * Liste d'auteur·ices d'un billet (cf issue #2). Chaque entrée est soit
 * un user du Carnet (kind=user, user populé avec displayName), soit
 * une personne externe (kind=external, name + affiliation libres).
 */
export type PostAuthorEntry = {
  kind?: 'user' | 'external';
  user?:
    | { displayName?: string; email?: string; citationFormat?: string | null }
    | number
    | string
    | null;
  name?: string;
  citationFormat?: string | null;
  affiliation?: string;
};

/**
 * Renvoie le nom affichable d'une entrée auteur·ice, sans rattachement.
 * - kind=user : displayName si dispo, sinon email, sinon vide.
 * - kind=external : name brut.
 */
function authorDisplayName(a: PostAuthorEntry): string {
  if ((a.kind ?? 'user') === 'user') {
    if (a.user && typeof a.user === 'object') {
      return a.user.displayName?.trim() || a.user.email?.trim() || '';
    }
    return '';
  }
  return (a.name ?? '').trim();
}

/**
 * Byline lisible pour le bandeau sous le titre :
 *   1 auteur·ice  → « Marie Lacoste »
 *   2            → « Marie Lacoste et Aïcha Touré »
 *   3+           → « Marie Lacoste, Aïcha Touré et Marie Dupont »
 *   externe avec rattachement → « Aïcha Touré (LATTS) »
 *
 * Filtre les entrées vides (user non sélectionné, name vide).
 */
export function formatPostByline(authors: PostAuthorEntry[] | null | undefined): string {
  if (!authors || authors.length === 0) return '';
  const parts = authors
    .map((a) => {
      const name = authorDisplayName(a);
      if (!name) return '';
      const aff = a.kind === 'external' && a.affiliation?.trim();
      return aff ? `${name} (${aff.trim()})` : name;
    })
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} et ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

/**
 * Renvoie le format Chicago surchargé pour une entrée auteur·ice si
 * elle en a un — soit posé sur l'entrée elle-même (kind=external) soit
 * sur le user populé (kind=user). Sinon undefined.
 */
function authorCitationOverride(a: PostAuthorEntry): string | undefined {
  if ((a.kind ?? 'user') === 'user') {
    if (a.user && typeof a.user === 'object') {
      const cf = a.user.citationFormat?.trim();
      return cf || undefined;
    }
    return undefined;
  }
  const cf = a.citationFormat?.trim();
  return cf || undefined;
}

/**
 * Format Chicago author-date pour le bloc « Pour citer cet article ».
 * Pour chaque auteur·ice : on prend `citationFormat` s'il est défini sur
 * son profil (cas particules, pseudonymes…), sinon on dérive « Nom, P. »
 * depuis le displayName (heuristique : dernier mot = nom).
 *
 *   « Rodriguez, A. & Touré, A. »  (2 auteur·ices)
 *   « Rodriguez, A., Touré, A. & Dupont, M. »  (3+)
 */
export function formatPostCitationChicago(
  authors: PostAuthorEntry[] | null | undefined,
): string {
  if (!authors || authors.length === 0) return '';
  const parts = authors
    .map((a) => {
      const override = authorCitationOverride(a);
      if (override) return override;
      const full = authorDisplayName(a);
      if (!full) return '';
      // Heuristique : dernier mot = nom, mots précédents = prénoms initialés.
      const tokens = full.split(/\s+/).filter(Boolean);
      if (tokens.length === 1) return tokens[0];
      const last = tokens[tokens.length - 1];
      const initials = tokens
        .slice(0, -1)
        .map((t) => t[0]?.toUpperCase() + '.')
        .join(' ');
      return `${last}, ${initials}`;
    })
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}
