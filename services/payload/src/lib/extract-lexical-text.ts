/**
 * Extracteur de texte plat depuis un arbre Lexical JSON tel que stocké
 * dans `posts.body` (jsonb). Walk récursif des `children`.
 *
 * Deux modes via `opts` :
 *  - includeBlocks : récupère aussi le texte des blocks custom (footnote,
 *                    citation_bloc, figure légende/crédit, biblio_inline
 *                    n'a pas de texte propre — c'est juste un pointeur).
 *                    Utile pour la recherche fulltext qui doit matcher
 *                    une phrase quel que soit le block où elle vit.
 *  - includeDraftZones : inclut le texte des `draft_container`. Par
 *                    défaut faux : les zones brouillon ne sont pas
 *                    rendues côté public, donc pas indexées non plus.
 *
 * Le résultat est un string normalisé (espaces collapsés, trim).
 */

export type ExtractLexicalTextOptions = {
  includeBlocks?: boolean;
  includeDraftZones?: boolean;
};

type LexicalNodeLike = {
  type?: string;
  text?: string;
  children?: unknown[];
  fields?: Record<string, unknown>;
  blockType?: string;
  root?: LexicalNodeLike;
};

/**
 * Extrait le texte d'un seul block custom selon son `blockType`. Les
 * fields qui contiennent du texte utilisateur sont concaténés avec un
 * espace ; les fields qui ne sont que des pointeurs (entry id, image
 * id, align) sont ignorés.
 */
function extractBlockText(blockType: string | undefined, fields: Record<string, unknown> | undefined): string {
  if (!blockType || !fields) return '';
  const get = (k: string): string => {
    const v = fields[k];
    return typeof v === 'string' ? v : '';
  };
  switch (blockType) {
    case 'footnote':
      // Note de bas de page — contenu intégral.
      return get('content');
    case 'citation_bloc':
      // Citation longue + source.
      return [get('text'), get('source')].filter(Boolean).join(' ');
    case 'figure':
      // Image + légende + crédit. L'image (id média) n'est pas du texte
      // mais on ramène la légende qui peut contenir des mots-clés
      // pertinents pour la recherche.
      return [get('legende'), get('credit')].filter(Boolean).join(' ');
    case 'biblio_inline':
      // Citation biblio inline — c'est un pointeur vers une entry, pas
      // de texte propre. On laisse vide ; la résolution se fait au
      // moment du build du tsvector via les noms d'auteur·ices.
      return '';
    default:
      // Block inconnu : on ne hasarde pas une extraction qui pourrait
      // mal interpréter des fields techniques.
      return '';
  }
}

export function extractLexicalText(
  node: unknown,
  opts: ExtractLexicalTextOptions = {},
): string {
  const out: string[] = [];

  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return;
    const obj = n as LexicalNodeLike;

    // Zones brouillon : on coupe l'arbre ici sauf si on demande
    // explicitement à les inclure.
    if (obj.type === 'draft_container' && !opts.includeDraftZones) return;

    // Texte direct (text node Lexical).
    if (typeof obj.text === 'string' && obj.text.length > 0) {
      out.push(obj.text);
    }

    // Blocks custom (decorator nodes Lexical) : type === 'block' ou
    // 'inlineBlock', avec un sous-objet fields qui porte le contenu.
    if (
      opts.includeBlocks &&
      (obj.type === 'block' || obj.type === 'inlineBlock')
    ) {
      const blockType =
        obj.blockType ??
        (obj.fields ? (obj.fields.blockType as string | undefined) : undefined);
      const text = extractBlockText(blockType, obj.fields);
      if (text) out.push(text);
    }

    // Children (récursion). Le root Lexical met les children sous
    // `root.children` ; les nodes intermédiaires sous `children`.
    const root = obj.root;
    const children = (root?.children ?? obj.children) as unknown[] | undefined;
    if (Array.isArray(children)) {
      for (const child of children) walk(child);
    }
  }

  walk(node);

  // Normalise les espaces : enlève les sauts de ligne / tabs et collapse
  // les runs d'espaces. tsvector se moque de la mise en forme mais ça
  // garde les logs / debug lisibles.
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
