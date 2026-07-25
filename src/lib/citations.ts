/**
 * Formatteurs de citation d'un billet du Carnet vers les formats
 * d'export académiques standards (BibTeX et RIS).
 *
 * Utilisés par :
 *  - les routes Astro `/billets/[slug].bib` et `[slug].ris` pour
 *    servir un fichier téléchargeable
 *  - éventuellement les balises Highwire `<meta>` dans <head> pour
 *    que l'extension Zotero détecte automatiquement la citation
 *
 * Le bouton « Copier » du bloc « Pour citer cet article » reste géré
 * directement dans la page article (citation Chicago en clair, copiée
 * via navigator.clipboard).
 *
 * Référence des formats :
 *  - BibTeX : https://en.wikipedia.org/wiki/BibTeX (entrée @misc pour
 *    une publication en ligne sans éditeur formel ; @article pour
 *    journal, mais Carnet n'est pas un journal au sens strict)
 *  - RIS    : https://en.wikipedia.org/wiki/RIS_(file_format) (TY=GEN
 *    pour generic, ce qui est le bon usage pour un billet de carnet
 *    de recherche)
 */

import type { PostAuthorEntry } from './site';

// ─── Types publics ────────────────────────────────────────────────

export type CitationPost = {
  slug: string;
  numero: number | string;
  title: string;
  publishedAt: string;
  idCarnet?: string | null;
  authors?: PostAuthorEntry[] | null;
  themes?: Array<{ slug?: string; name?: string }> | null;
  doi?: string | null;
};

export type CitationContext = {
  /** URL canonique de l'article — `https://example.com/billets/<slug>/`. */
  articleUrl: string;
  /** Date de génération du fichier d'export (ISO court yyyy-mm-dd). Sert de
   *  date d'accès dans les formats qui le portent (BibTeX urldate, RIS Y2). */
  accessedAt?: string;
  /** Nom du carnet (depuis Site global → identity.siteName). Sert pour les
   *  champs « publisher »/« howpublished »/« journal_title » des exports. */
  siteName?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Sépare un nom complet en `family` (nom de famille) et `given` (prénom·s).
 * Heuristique simple alignée sur formatPostCitationChicago — dernier
 * mot = nom, mots précédents = prénoms. Préserve les particules attachées
 * (ex. « De Mendoza ») si l'autrice·eur a typé son nom complet sans
 * espace inhabituel ; pour les cas exotiques, le champ user.citationFormat
 * existe mais est utilisé seulement par la version Chicago — on prend
 * ici la forme « brute » du displayName pour rester proche de l'état civil.
 */
function splitName(full: string): { family: string; given: string } {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { family: '', given: '' };
  if (tokens.length === 1) return { family: tokens[0], given: '' };
  return {
    family: tokens[tokens.length - 1],
    given: tokens.slice(0, -1).join(' '),
  };
}

/**
 * Extrait la liste des auteur·ices d'un billet sous forme normalisée
 * { family, given } prête à formater. Filtre les entrées vides.
 */
export function extractCitationAuthors(
  authors: PostAuthorEntry[] | null | undefined,
): Array<{ family: string; given: string }> {
  if (!authors || authors.length === 0) return [];
  return authors
    .map((a) => {
      let displayName = '';
      if ((a.kind ?? 'user') === 'user') {
        if (a.user && typeof a.user === 'object') {
          displayName = a.user.displayName?.trim() || a.user.email?.trim() || '';
        }
      } else {
        displayName = (a.name ?? '').trim();
      }
      if (!displayName) return null;
      return splitName(displayName);
    })
    .filter((x): x is { family: string; given: string } => x !== null);
}

/** ISO court yyyy-mm-dd depuis une date ISO complète. */
function toIsoDate(s: string): string {
  return new Date(s).toISOString().slice(0, 10);
}

/** Format de l'année extrait d'une date ISO. */
function toYear(s: string): string {
  return new Date(s).getUTCFullYear().toString();
}

/** Slug + numero pour un identifiant BibTeX stable et lisible.
 *  Ex. : `carnet-042-spivak-agency`. */
function bibKey(post: CitationPost): string {
  const num = String(post.numero ?? '').padStart(3, '0');
  return `carnet-${num}-${post.slug}`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-');
}

// ─── BibTeX ───────────────────────────────────────────────────────

/**
 * Échappe les caractères spéciaux BibTeX dans une valeur de field.
 * Les valeurs sont entourées de `{}` pour préserver la casse — il
 * faut malgré tout échapper `{`, `}` et `\` à l'intérieur.
 */
function bibTexEscape(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, (m) => `\\${m}`)
    .replace(/[#$%&_]/g, (m) => `\\${m}`)
    .replace(/~/g, '\\~{}')
    .replace(/\^/g, '\\^{}')
    // Caractères Unicode courants qui peuvent gêner certains LaTeX
    // anciens — laissés tels quels par défaut, BibTeX moderne les gère.
    ;
}

/** Joint des auteur·ices au format BibTeX (`Last, First and Last, First`). */
function bibTexAuthors(authors: Array<{ family: string; given: string }>): string {
  return authors
    .map((a) => (a.given ? `${a.family}, ${a.given}` : a.family))
    .join(' and ');
}

/**
 * Génère une entrée BibTeX `@misc{…}` pour un billet du Carnet.
 *
 * Pourquoi @misc et non @article : Carnet n'est pas un journal
 * peer-reviewed au sens académique strict. @misc avec howpublished
 * = « Carnet — notes de recherche » est l'usage standard pour les
 * blogs académiques. Les outils de citation (Zotero, Mendeley)
 * comprennent @misc et le mappent correctement.
 */
export function toBibTeX(post: CitationPost, ctx: CitationContext): string {
  const authors = extractCitationAuthors(post.authors);
  const lines: string[] = [];
  const push = (key: string, value: string) => {
    if (value) lines.push(`  ${key} = {${bibTexEscape(value)}},`);
  };

  const siteName = ctx.siteName?.trim() || 'Carnet';
  lines.push(`@misc{${bibKey(post)},`);
  if (authors.length > 0) push('author', bibTexAuthors(authors));
  push('title', post.title);
  push('howpublished', `${siteName} — notes de recherche`);
  push('year', toYear(post.publishedAt));
  push('month', new Date(post.publishedAt).toLocaleString('en-US', { month: 'short' }).toLowerCase());
  push('url', ctx.articleUrl);
  push('urldate', ctx.accessedAt ?? toIsoDate(new Date().toISOString()));
  if (post.idCarnet) push('note', post.idCarnet);
  if (post.doi) push('doi', post.doi);
  // Trailing comma déjà sur la dernière ligne — BibTeX moderne l'accepte ;
  // certains parsers stricts non. On enlève la virgule du dernier item.
  const last = lines[lines.length - 1];
  lines[lines.length - 1] = last.replace(/,$/, '');
  lines.push('}');
  return lines.join('\n') + '\n';
}

// ─── RIS ──────────────────────────────────────────────────────────

/** Échappe les caractères qui casseraient une ligne RIS (CR/LF). */
function risEscape(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Génère un fichier RIS pour un billet. Format :
 *   TY  - GEN
 *   TI  - Title
 *   AU  - Last, First         (une ligne par auteur·ice)
 *   PY  - 2026
 *   DA  - 2026/05/10           (RIS attend yyyy/mm/dd)
 *   UR  - https://…
 *   PB  - Carnet
 *   ER  -
 *
 * TY=GEN (generic) plutôt que JOUR (journal) pour la même raison
 * que BibTeX @misc : Carnet n'est pas un journal peer-reviewed strict.
 *
 * Zotero importe RIS nativement via son translator « RIS » — c'est
 * pour ça que le bouton « Zotero » du bloc citation pointe sur le
 * même endpoint que RIS.
 */
export function toRIS(post: CitationPost, ctx: CitationContext): string {
  const authors = extractCitationAuthors(post.authors);
  const lines: string[] = ['TY  - GEN'];
  const push = (tag: string, value: string) => {
    if (value) lines.push(`${tag.padEnd(2)}  - ${risEscape(value)}`);
  };

  push('TI', post.title);
  for (const a of authors) {
    push('AU', a.given ? `${a.family}, ${a.given}` : a.family);
  }
  push('PY', toYear(post.publishedAt));
  // RIS DA = yyyy/mm/dd
  push('DA', toIsoDate(post.publishedAt).replace(/-/g, '/'));
  push('PB', ctx.siteName?.trim() || 'Carnet');
  push('UR', ctx.articleUrl);
  if (ctx.accessedAt) push('Y2', ctx.accessedAt.replace(/-/g, '/'));
  if (post.idCarnet) push('AN', post.idCarnet);
  if (post.doi) push('DO', post.doi);
  lines.push('ER  - ');
  // RIS attend des fins de ligne CRLF pour la portabilité Windows.
  return lines.join('\r\n') + '\r\n';
}

// ─── Highwire <meta> tags pour Zotero ──────────────────────────────

/**
 * Génère la liste de balises `<meta>` Highwire/Google Scholar à
 * inclure dans le `<head>` de la page article. Permet à l'extension
 * Zotero de détecter automatiquement la citation quand l'utilisatrice
 * visite la page (icône qui apparaît dans la barre d'extensions).
 *
 * Référence : https://www.zotero.org/support/dev/exposing_metadata
 *
 * Renvoie un array d'objets { name, content } à mapper en JSX/Astro.
 */
export function highwireMeta(post: CitationPost, ctx: CitationContext): Array<{ name: string; content: string }> {
  const authors = extractCitationAuthors(post.authors);
  const tags: Array<{ name: string; content: string }> = [];
  const push = (name: string, content: string) => {
    if (content) tags.push({ name, content });
  };

  push('citation_title', post.title);
  for (const a of authors) {
    // Highwire attend « Last, First ».
    push('citation_author', a.given ? `${a.family}, ${a.given}` : a.family);
  }
  push('citation_publication_date', toIsoDate(post.publishedAt).replace(/-/g, '/'));
  push('citation_journal_title', ctx.siteName?.trim() || 'Carnet');
  push('citation_public_url', ctx.articleUrl);
  if (post.doi) push('citation_doi', post.doi);
  return tags;
}
