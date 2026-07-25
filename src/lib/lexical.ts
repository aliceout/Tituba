/**
 * Mini-renderer Lexical → HTML pour Astro SSR.
 *
 * Couvre les nodes utilisés dans le seed et les billets standards :
 * paragraph, heading (h2/h3), quote, list/listitem, link, et les nodes
 * texte avec format (bold=1, italic=2, strikethrough=4, underline=8, code=16).
 *
 * Les blocks Lexical custom (Footnote, CitationBloc, BiblioInline, Figure)
 * sont rendus via renderLexicalWithFootnotes — qui retourne en plus la
 * liste des notes de bas de page, à afficher en pied d'article.
 *
 * Helpers :
 *  - renderLexical : node → HTML string (sans collect des footnotes —
 *    convient pour le contenu Pages.sections.prose qui n'a pas de notes)
 *  - renderLexicalWithFootnotes : node → { bodyHtml, footnotesHtml }
 *  - extractToc : node → liste { id, text, level } pour le sommaire
 *  - slugify : chaîne → identifiant URL-safe (utilisé pour les ids de h2)
 */

import { mediaUrl } from './payload';

type LexicalNode = {
  type?: string;
  tag?: string;
  text?: string;
  format?: number;
  fields?: {
    url?: string;
    newTab?: boolean;
    blockType?: string;
    blockName?: string;
    id?: string;
    // Footnote
    content?: string;
    // CitationBloc
    text?: string;
    source?: string;
    // BiblioInline
    entry?:
      | {
          id?: number | string;
          slug?: string;
          authors?: Array<{
            firstName?: string | null;
            lastName: string;
            role?: 'author' | 'editor' | 'translator';
          }> | null;
          authorLabel?: string | null;
          year?: number;
        }
      | number
      | string
      | null;
    prefix?: string;
    /** Page(s) citée(s) dans ce passage (rendu « , p. 47 » dans la citation). */
    pages?: string;
    suffix?: string;
    // Figure
    image?: { filename?: string; alt?: string } | number | string | null;
    legende?: string;
    credit?: string;
    align?: 'left' | 'center' | 'wide';
  };
  listType?: 'number' | 'bullet';
  children?: LexicalNode[];
};

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_UNDERLINE = 8;
const FORMAT_CODE = 16;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

type RenderContext = {
  /** Notes de bas de page collectées pendant le walk, dans l'ordre d'apparition. */
  footnotes: Array<{ n: number; html: string }>;
};

function newContext(): RenderContext {
  return { footnotes: [] };
}

function renderText(node: LexicalNode): string {
  if (typeof node.text !== 'string') return '';
  let html = escapeHtml(node.text);
  const fmt = node.format ?? 0;
  if (fmt & FORMAT_CODE) html = `<code>${html}</code>`;
  if (fmt & FORMAT_BOLD) html = `<strong>${html}</strong>`;
  if (fmt & FORMAT_ITALIC) html = `<em>${html}</em>`;
  if (fmt & FORMAT_STRIKETHROUGH) html = `<s>${html}</s>`;
  if (fmt & FORMAT_UNDERLINE) html = `<u>${html}</u>`;
  return html;
}

function renderChildren(children: LexicalNode[] | undefined, ctx: RenderContext): string {
  if (!children) return '';
  return children.map((c) => renderNode(c, ctx)).join('');
}

function renderBlock(node: LexicalNode, ctx: RenderContext): string {
  const fields = node.fields;
  if (!fields) return '';
  const blockType = fields.blockType;

  switch (blockType) {
    case 'footnote': {
      const n = ctx.footnotes.length + 1;
      const noteHtml = escapeHtml(fields.content ?? '');
      ctx.footnotes.push({ n, html: noteHtml });
      return `<sup id="fnref-${n}" class="fn-mark"><a href="#fn-${n}">${n}</a></sup>`;
    }

    case 'citation_bloc': {
      const text = escapeHtml(fields.text ?? '');
      const source = fields.source
        ? `<cite class="citation-source">— ${escapeHtml(fields.source)}</cite>`
        : '';
      return `<blockquote class="block-citation"><p>${text}</p>${source}</blockquote>`;
    }

    case 'biblio_inline': {
      const entry = fields.entry;
      const prefix = fields.prefix ? escapeHtml(fields.prefix) + ' ' : '';
      // Page(s) citée(s) dans ce passage — distinct de la pagination de
      // l'ouvrage en biblio. Préfixé « , p. » devant la valeur saisie.
      const pagesRaw = typeof fields.pages === 'string' ? fields.pages.trim() : '';
      const pagesPart = pagesRaw ? `, p.&nbsp;${escapeHtml(pagesRaw)}` : '';
      const suffix = fields.suffix ? `, ${escapeHtml(fields.suffix)}` : '';
      if (!entry || typeof entry !== 'object' || !entry.slug) {
        // Référence non populated — fallback minimal.
        return `<span class="biblio-inline-empty">(réf.)</span>`;
      }
      // Format Chicago author-date court : « (Butler 2017, p. 47) ». On
      // utilise `authorLabel` calculé serveur-side (« Butler », « Butler
      // & Spivak », « Butler et al. »).
      const shortAuthors = (entry.authorLabel ?? '').trim();
      const yearPart = entry.year ? `, ${entry.year}` : '';
      const inner = `${prefix}${escapeHtml(shortAuthors || '—')}${yearPart}${pagesPart}${suffix}`;
      return `<a class="biblio-inline" href="#bib-${escapeHtml(entry.slug)}">(${inner})</a>`;
    }

    case 'figure': {
      const image = fields.image;
      const url =
        image && typeof image === 'object' && image.filename
          ? mediaUrl(image.filename) ?? ''
          : '';
      if (!url) return '';
      const alt = (image && typeof image === 'object' && image.alt) || '';
      const legende = fields.legende
        ? `<span class="legende">${escapeHtml(fields.legende)}</span>`
        : '';
      const credit = fields.credit
        ? `<span class="credit">${escapeHtml(fields.credit)}</span>`
        : '';
      const align = fields.align ?? 'left';
      const caption =
        legende || credit
          ? `<figcaption>${legende}${credit}</figcaption>`
          : '';
      return `<figure class="block-figure align-${align}"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />${caption}</figure>`;
    }

    default:
      return '';
  }
}

function renderNode(node: LexicalNode | unknown, ctx: RenderContext): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as LexicalNode & { root?: LexicalNode };
  // Wrapper { root: {...} } : descend dans root
  if ('root' in n && n.root) return renderChildren(n.root.children, ctx);
  if (typeof n.text === 'string') return renderText(n);

  if (n.type === 'block' || n.type === 'inlineBlock') return renderBlock(n, ctx);

  const inner = renderChildren(n.children, ctx);

  switch (n.type) {
    case 'root':
      return inner;
    case 'draft_container':
      // Zone brouillon : on n'émet RIEN côté lecteur. Le contenu reste
      // dans le JSON Lexical (donc visible dans l'admin), mais le
      // rendu public le saute. C'est la sémantique « brouillon = pas
      // publié » côté lecteur, et le filtre admin permet à l'autrice
      // de retrouver les billets qui en contiennent encore. Cf issue #1.
      return '';
    case 'paragraph':
      return `<p>${inner}</p>`;
    case 'heading': {
      const tag = n.tag === 'h3' ? 'h3' : 'h2';
      const text = (n.children ?? [])
        .map((c) => (typeof c.text === 'string' ? c.text : ''))
        .join('');
      const id = slugify(text);
      return `<${tag} id="${id}">${inner}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${inner}</blockquote>`;
    case 'list': {
      const tag = n.listType === 'number' ? 'ol' : 'ul';
      return `<${tag}>${inner}</${tag}>`;
    }
    case 'listitem':
      return `<li>${inner}</li>`;
    case 'link': {
      const url = n.fields?.url || '#';
      const safe = escapeHtml(url);
      const isExternal = /^https?:\/\//.test(url);
      const cls = isExternal ? 'ext' : 'int';
      const rel = isExternal ? ' rel="noopener"' : '';
      return `<a href="${safe}" class="${cls}"${rel}>${inner}</a>`;
    }
    case 'linebreak':
      return '<br />';
    default:
      return inner;
  }
}

/**
 * Rend un body Lexical en HTML, sans collecter les footnotes (les blocks
 * Footnote rencontrés sont quand même rendus avec leur ancre `<sup>`,
 * mais la liste en pied n'est pas générée). Convient pour les contenus
 * Pages.sections.prose qui n'ont pas de notes.
 */
export function renderLexical(node: LexicalNode | unknown): string {
  return renderNode(node, newContext());
}

/**
 * Rend un body Lexical en HTML et retourne aussi la liste HTML des
 * footnotes collectées dans l'ordre d'apparition. Le caller insère
 * `footnotesHtml` après `bodyHtml` dans la page article.
 *
 * Format des notes : `<ol class="footnotes-classic"><li id="fn-N">…
 * <a href="#fnref-N" class="fn-back">↩</a></li></ol>`.
 */
export function renderLexicalWithFootnotes(
  node: LexicalNode | unknown,
): { bodyHtml: string; footnotesHtml: string } {
  const ctx = newContext();
  const bodyHtml = renderNode(node, ctx);
  if (ctx.footnotes.length === 0) return { bodyHtml, footnotesHtml: '' };
  const items = ctx.footnotes
    .map(
      ({ n, html }) =>
        `<li id="fn-${n}">${html} <a href="#fnref-${n}" class="fn-back" aria-label="Retour au texte">↩</a></li>`,
    )
    .join('');
  const footnotesHtml = `<section class="footnotes-classic" aria-labelledby="footnotes-heading"><h3 id="footnotes-heading">Notes</h3><ol>${items}</ol></section>`;
  return { bodyHtml, footnotesHtml };
}

/**
 * Mode sidenotes (cf issue #6). Walk les enfants directs du root et
 * émet, après chaque bloc, les `<aside class="marg">` correspondant
 * aux footnotes rencontrées dans ce bloc. Le `<sup>` reste inline
 * dans le texte pour que le lecteur retrouve l'appel ; la note se
 * place dans la colonne droite via CSS Grid (cf [slug].astro).
 *
 * Style « Tufte » — chaque note est positionnée en regard du
 * paragraphe qui l'appelle, plutôt qu'empilée en pied d'article.
 */
export function renderLexicalSidenotes(node: LexicalNode | unknown): string {
  if (!node || typeof node !== 'object') return '';
  const x = node as LexicalNode & { root?: LexicalNode };
  // Trouve le root.children — body Lexical = { root: { children: [...] } }
  let rootNode: LexicalNode | null = null;
  if ('root' in x && x.root) rootNode = x.root;
  else if (x.type === 'root') rootNode = x;
  if (!rootNode || !rootNode.children) {
    // Fallback : pas de root, on rend en mode classique sans collecte
    return renderNode(node, newContext());
  }

  const ctx = newContext();
  const out: string[] = [];
  let collected = 0;
  for (const child of rootNode.children) {
    const blockHtml = renderNode(child, ctx);
    out.push(blockHtml);
    // Émet les asides pour les nouvelles footnotes collectées dans ce
    // bloc — `slice(collected)` capture seulement celles qui n'avaient
    // pas encore été émises.
    const newNotes = ctx.footnotes.slice(collected);
    for (const { n, html } of newNotes) {
      out.push(
        `<aside class="marg" id="fn-${n}"><sup class="marg-num">${n}</sup>${html}<a href="#fnref-${n}" class="fn-back" aria-label="Retour au texte">↩</a></aside>`,
      );
    }
    collected = ctx.footnotes.length;
  }
  return out.join('');
}

export type TocEntry = { id: string; text: string; level: 2 | 3 };

export function extractToc(node: LexicalNode | unknown): TocEntry[] {
  const out: TocEntry[] = [];
  function walk(n: LexicalNode | unknown) {
    if (!n || typeof n !== 'object') return;
    const x = n as LexicalNode & { root?: LexicalNode };
    if ('root' in x && x.root) return walk(x.root);
    // Skip draft zones : leur rendu public est vide donc leurs headings
    // n'apparaissent pas dans le billet → pas dans le TOC non plus.
    if (x.type === 'draft_container') return;
    if (x.type === 'heading') {
      const text = (x.children ?? [])
        .map((c) => (typeof c.text === 'string' ? c.text : ''))
        .join('');
      const level = x.tag === 'h3' ? 3 : 2;
      out.push({ id: slugify(text), text, level });
    }
    if (x.children) for (const c of x.children) walk(c);
  }
  walk(node);
  return out;
}

/**
 * Extrait le texte brut d'un body Lexical — utile pour le calcul du
 * temps de lecture côté frontend si on veut le recalculer (sinon le
 * champ readingTime est déjà persisté côté Payload).
 */
export function extractText(node: LexicalNode | unknown): string {
  if (!node || typeof node !== 'object') return '';
  const x = node as LexicalNode & { root?: LexicalNode };
  if ('root' in x && x.root) return extractText(x.root);
  if (typeof x.text === 'string') return x.text + ' ';
  return (x.children ?? []).map(extractText).join('');
}
