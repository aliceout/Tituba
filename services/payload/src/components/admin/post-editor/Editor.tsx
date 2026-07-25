'use client';

// Lexical editor custom — sans aucune chrome Payload (pas de field-type
// wrapper, pas de toolbar Payload, pas de label, pas d'aide Payload).
// Theme et nodes décorateur entièrement maison, slash menu maison.
//
// Format de stockage : Lexical JSON standard (root.children…). Compatible
// avec ce que Payload BlocksFeature génère pour les posts existants —
// on enregistre des decorator nodes pour les types `block` et
// `inlineBlock` afin de round-tripper sans erreur les blocks existants
// (Footnote, CitationBloc, BiblioInline, Figure). L'édition fine des
// fields des blocks (ex : le textarea d'une note, le picker biblio)
// se fait via une popover inline que ce module rend lui-même.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { LinkNode } from '@lexical/link';
import { ListNode, ListItemNode } from '@lexical/list';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  FORMAT_TEXT_COMMAND,
  $insertNodes,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type SerializedLexicalNode,
} from 'lexical';

import {
  CarnetBlockNode,
  $createCarnetBlockNode,
  CarnetInlineBlockNode,
  $createCarnetInlineBlockNode,
  $isCarnetInlineBlockNode,
  DraftContainerNode,
  $createDraftContainerNode,
  $isDraftContainerNode,
  $unwrapDraftContainer,
  type CarnetBlockData,
  type CarnetInlineBlockData,
} from './nodes';
import {
  BiblioOptionsContext,
  type BibEntry,
  MediaOptionsContext,
  type MediaEntry,
} from './context';

// ─── Types publics ────────────────────────────────────────────────

export type LexicalState = {
  root: {
    type: 'root';
    children: SerializedLexicalNode[];
    direction: 'ltr' | 'rtl' | null;
    format: '' | 'left' | 'center' | 'right' | 'justify' | 'start' | 'end';
    indent: number;
    version: number;
  };
};

export type { BibEntry } from './context';

// ─── Theme ────────────────────────────────────────────────────────
// Classes CSS appliquées par Lexical aux nodes natifs. Toutes scoped
// sous .ed-body — cf custom.scss (.carnet-postedit .ed-body …).

const carnetTheme = {
  paragraph: 'ed-p',
  heading: { h2: 'ed-h2', h3: 'ed-h3' },
  quote: 'ed-quote',
  text: {
    bold: 'ed-bold',
    italic: 'ed-italic',
    underline: 'ed-underline',
    strikethrough: 'ed-strike',
    code: 'ed-code',
  },
  link: 'ed-link',
  list: { ul: 'ed-ul', ol: 'ed-ol', listitem: 'ed-li' },
};

// ─── Helpers ──────────────────────────────────────────────────────

const EMPTY_STATE: LexicalState = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [],
      } as unknown as SerializedLexicalNode,
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
};

function safeInitialState(value: LexicalState | null): string {
  try {
    if (!value || !value.root) return JSON.stringify(EMPTY_STATE);
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(EMPTY_STATE);
  }
}

// Walke le JSON pour extraire les Footnote dans l'ordre d'apparition.
// Renvoie [{ key, index, content }]. La numérotation [1], [2] … est
// dérivée de l'ordre, pas stockée — comme côté frontend Astro.
export function extractFootnotes(
  body: LexicalState | null | undefined,
): Array<{ key: string; index: number; content: string }> {
  const out: Array<{ key: string; index: number; content: string }> = [];
  if (!body?.root) return out;
  let i = 1;
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const type = n.type as string | undefined;
    const fields = (n.fields ?? {}) as Record<string, unknown>;
    if (
      (type === 'inlineBlock' || type === 'block') &&
      (fields.blockType === 'footnote' || (n as { blockType?: string }).blockType === 'footnote')
    ) {
      out.push({
        key: String(n.key ?? `fn-${out.length}`),
        index: i++,
        content: String(fields.content ?? ''),
      });
    }
    const children = n.children;
    if (Array.isArray(children)) for (const c of children) walk(c);
  }
  walk(body.root);
  return out;
}

// Walke le JSON pour extraire les références biblio citées inline
// dans le corps (`biblio_inline` blocks avec entry défini). Renvoie
// la node key Lexical en plus de l'entry pour pouvoir supprimer la
// citation depuis le panneau pied (× sur .b-row → editor.update +
// $getNodeByKey + node.remove()).
export function extractBiblioInlines(
  body: LexicalState | null | undefined,
): Array<{ key: string; entry: number | string }> {
  const out: Array<{ key: string; entry: number | string }> = [];
  if (!body?.root) return out;
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const type = n.type as string | undefined;
    const fields = (n.fields ?? {}) as Record<string, unknown>;
    const blockType =
      (fields.blockType as string | undefined) ?? (n.blockType as string | undefined);
    if (
      (type === 'inlineBlock' || type === 'block') &&
      blockType === 'biblio_inline'
    ) {
      const entry = fields.entry;
      if (entry !== null && entry !== undefined && entry !== '') {
        out.push({
          key: String(n.key ?? `bi-${out.length}`),
          entry: typeof entry === 'number' ? entry : (entry as string),
        });
      }
    }
    const children = n.children;
    if (Array.isArray(children)) for (const c of children) walk(c);
  }
  walk(body.root);
  return out;
}

// Liste dédupliquée des IDs cités inline. Utilisée pour calculer
// l'union explicite/inline dans le panneau Bibliographie liée.
export function extractBiblioInlineIds(
  body: LexicalState | null | undefined,
): Array<number | string> {
  const seen = new Set<string>();
  const out: Array<number | string> = [];
  for (const ref of extractBiblioInlines(body)) {
    const k = String(ref.entry);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ref.entry);
    }
  }
  return out;
}

// Walke l'arbre LIVE de l'éditeur Lexical (pas le JSON sérialisé)
// pour appeler `cb` sur chaque node. À utiliser à l'intérieur d'un
// editor.update ou editor.read.
function $walkLiveTree(cb: (node: LexicalNode) => void): void {
  function walk(node: LexicalNode) {
    cb(node);
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) walk(child);
    }
  }
  walk($getRoot());
}

// Supprime la i-ème footnote (1-based) du corps. La key sérialisée
// du JSON ne matche pas la key live de Lexical — on doit donc
// walker l'arbre vivant et compter dans l'ordre d'apparition pour
// retrouver le bon node.
export function deleteFootnoteByIndex(editor: LexicalEditor, index: number): void {
  editor.update(() => {
    let i = 0;
    // Cast à `LexicalNode | null` (et non LexicalNode | null directement)
    // : TS narrowe agressivement target vers `null` après la passe initiale
    // car les réassignations dans la callback de $walkLiveTree ne sont pas
    // suivies par le control-flow analysis. On widen explicitement.
    let target = null as LexicalNode | null;
    $walkLiveTree((node) => {
      if (target) return;
      if ($isCarnetInlineBlockNode(node) && node.__blockType === 'footnote') {
        i++;
        if (i === index) target = node;
      }
    });
    (target as LexicalNode | null)?.remove();
  });
}

// Supprime toutes les citations inline qui pointent sur cet entry
// bibliographique. Un même ouvrage peut être cité plusieurs fois
// dans le corps — on les enlève toutes en un seul update.
export function deleteBiblioInlinesByEntry(
  editor: LexicalEditor,
  entryId: number | string,
): void {
  editor.update(() => {
    const targets: LexicalNode[] = [];
    $walkLiveTree((node) => {
      if (
        $isCarnetInlineBlockNode(node) &&
        node.__blockType === 'biblio_inline' &&
        String((node.__fields as { entry?: unknown }).entry) === String(entryId)
      ) {
        targets.push(node);
      }
    });
    for (const n of targets) n.remove();
  });
}

// ─── Slash menu ───────────────────────────────────────────────────
// Trigger : touche `/` en début de paragraphe ou après un espace.
// Affiché en popover sous le curseur. Items : structure (H2/H3/quote)
// + blocks Carnet (Note de bas de page, Citation longue, Biblio inline,
// Figure).

type SlashItem = {
  id: string;
  group: 'Blocs Carnet' | 'Mise en forme';
  ic: string;
  label: string;
  desc?: string;
  kbd?: string;
  // doInsert : appelé À L'INTÉRIEUR d'un editor.update existant. Ne
  // doit PAS appeler editor.update lui-même. La sélection est déjà
  // ajustée pour couvrir `/filter` — $insertNodes remplace donc
  // proprement le slash + filter par le nouveau node.
  doInsert: () => void;
};

const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'fn',
    group: 'Blocs Carnet',
    ic: 'fn',
    label: 'Note de bas de page',
    desc: 'Note numérotée, retour automatique',
    kbd: 'F',
    doInsert: () => {
      $insertNodes([
        $createCarnetInlineBlockNode({
          blockType: 'footnote',
          fields: { content: '' },
        }),
      ]);
    },
  },
  {
    id: 'bi',
    group: 'Blocs Carnet',
    ic: '@',
    label: 'Bibliographie inline',
    desc: 'Insère une référence par sa clé',
    kbd: 'B',
    doInsert: () => {
      $insertNodes([
        $createCarnetInlineBlockNode({
          blockType: 'biblio_inline',
          fields: { entry: null, prefix: '', suffix: '' },
        }),
      ]);
    },
  },
  {
    id: 'fig',
    group: 'Blocs Carnet',
    ic: '▢',
    label: 'Figure',
    desc: 'Image + légende',
    kbd: 'I',
    doInsert: () => {
      $insertNodes([
        $createCarnetBlockNode({
          blockType: 'figure',
          fields: { image: null, legende: '', credit: '', align: 'left' },
        }),
      ]);
    },
  },
  {
    id: 'draft',
    group: 'Blocs Carnet',
    ic: '⚠',
    label: 'Zone brouillon',
    desc: 'Marque une zone du billet comme inachevée',
    doInsert: () => {
      // Container vide avec un paragraphe enfant pour pouvoir taper
      // dedans tout de suite. Sans children, le node serait dégénéré
      // et Lexical le re-supprimerait au prochain reconciliate.
      const draft = $createDraftContainerNode();
      draft.append($createParagraphNode());
      $insertNodes([draft]);
    },
  },
  {
    id: 'h2',
    group: 'Mise en forme',
    ic: 'H2',
    label: 'Titre de section',
    kbd: '⌥1',
    doInsert: () => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      sel.insertNodes([$createHeadingNode('h2')]);
    },
  },
  {
    id: 'h3',
    group: 'Mise en forme',
    ic: 'H3',
    label: 'Sous-titre',
    kbd: '⌥2',
    doInsert: () => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      sel.insertNodes([$createHeadingNode('h3')]);
    },
  },
  {
    id: 'quote',
    group: 'Mise en forme',
    ic: '”',
    label: 'Citation simple',
    doInsert: () => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      sel.insertNodes([$createQuoteNode()]);
    },
  },
];

// Étend la sélection courante pour couvrir le `/filter` typé, en
// remontant du curseur jusqu'à l'index du dernier `/` qui le précède.
// Ainsi, l'insertion ($insertNodes) qui suit remplace la sélection —
// le slash et le filtre disparaissent, le texte AUTOUR (avant le /
// et après le curseur) est préservé. À appeler à l'intérieur d'un
// editor.update.
function $consumeSlashFilter(): boolean {
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) return false;
  const node = sel.anchor.getNode();
  if (!$isTextNode(node)) return false;
  const offset = sel.anchor.offset;
  const text = node.getTextContent();
  // Le `/` est nécessairement avant le curseur (l'utilisateur a tapé
  // /filtre, le curseur est à la fin du filtre).
  const slashIdx = text.lastIndexOf('/', offset - 1);
  if (slashIdx < 0) return false;
  const key = node.getKey();
  sel.anchor.set(key, slashIdx, 'text');
  sel.focus.set(key, offset, 'text');
  return true;
}

function SlashMenuPlugin({ biblioOptions }: { biblioOptions: BibEntry[] }) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<{ start: number; end: number } | null>(null);

  // Filtre les items par query
  const items = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q) ||
        (it.desc ?? '').toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  // Ouvre le menu quand on tape `/` au début d'un noeud / ligne
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (open) {
            if (event.key === 'Escape') {
              setOpen(false);
              return true;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIdx((i) => Math.min(items.length - 1, i + 1));
              return true;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              const it = items[activeIdx];
              if (it) {
                editor.update(() => {
                  // Étend la sélection sur /filter, puis insère —
                  // $insertNodes remplace la sélection donc préserve
                  // le texte autour.
                  $consumeSlashFilter();
                  it.doInsert();
                });
                setOpen(false);
                setQuery('');
              }
              return true;
            }
          }
          if (event.key === '/') {
            // Délai d'un tick pour que le `/` soit dans le doc avant
            // calcul pos. Coords document (scrollY/X inclus) car le
            // menu est rendu via portal dans <body> avec
            // position: absolute → il suit le scroll comme le texte.
            setTimeout(() => {
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0) return;
              const range = sel.getRangeAt(0);
              let rect = range.getBoundingClientRect();
              // Fallback : un range collapsed sur un noeud vide / sur
              // une frontière de bloc retourne parfois un rect dégénéré
              // (top=0 left=0 width=0 height=0). Sans ce garde, le menu
              // s'affiche en haut-gauche du document — bug rare mais
              // observé. On retombe sur le rect de l'élément DOM qui
              // contient la sélection, ce qui donne au moins un point
              // proche de la zone d'édition.
              if (rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0) {
                let node: Node | null = sel.focusNode;
                if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                if (node && node instanceof Element) {
                  rect = node.getBoundingClientRect();
                }
              }
              setPos({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
              });
              setOpen(true);
              setQuery('');
              triggerRef.current = { start: 0, end: 0 };
            }, 0);
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, open, items, activeIdx, biblioOptions]);

  // Met à jour la query selon ce qui est tapé après le `/`
  useEffect(() => {
    if (!open) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const node = sel.anchor.getNode();
        const text = node.getTextContent();
        const slashIdx = text.lastIndexOf('/');
        if (slashIdx < 0) {
          setOpen(false);
          return;
        }
        const after = text.slice(slashIdx + 1);
        if (after.length > 30 || /\n/.test(after)) {
          setOpen(false);
          return;
        }
        setQuery(after);
        triggerRef.current = { start: slashIdx, end: slashIdx + after.length + 1 };
      });
    });
  }, [editor, open]);

  if (!open || !pos || items.length === 0) return null;

  // Group items
  const groups: Record<string, SlashItem[]> = {};
  items.forEach((it) => {
    if (!groups[it.group]) groups[it.group] = [];
    groups[it.group].push(it);
  });

  // Rendu via portal dans <body> pour échapper aux parents positionnés
  // (.ed-body / .ed-card / .carnet-postedit__center qui ont des
  // overflow et des transforms qui clipperaient le menu). Avec
  // position: absolute + coords document, le menu reste accroché au
  // point où on a tapé `/` et suit le scroll comme le texte.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="ed-slash"
      style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 50 }}
      role="listbox"
    >
      {Object.entries(groups).map(([g, list]) => (
        <React.Fragment key={g}>
          <div className="ed-slash__lbl">{g}</div>
          {list.map((it) => {
            const idx = items.indexOf(it);
            return (
              <button
                key={it.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={`ed-slash__opt${idx === activeIdx ? ' on' : ''}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  // mouseDown plutôt que click pour ne pas perdre le focus du contenteditable
                  e.preventDefault();
                  editor.update(() => {
                    $consumeSlashFilter();
                    it.doInsert();
                  });
                  setOpen(false);
                  setQuery('');
                }}
              >
                <span className="ic">{it.ic}</span>
                <span className="lab">
                  {it.label}
                  {it.desc && <span className="desc">{it.desc}</span>}
                </span>
                {it.kbd && <span className="kbd">{it.kbd}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
}

// ─── Raccourcis clavier (Cmd+B / Cmd+I, Alt+1 → H2, Alt+2 → H3) ──

function KeyboardPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            return true;
          }
          if (meta && event.key.toLowerCase() === 'i') {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            return true;
          }
          if (event.altKey && event.key === '1') {
            event.preventDefault();
            editor.update(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              sel.insertNodes([$createHeadingNode('h2')]);
            });
            return true;
          }
          if (event.altKey && event.key === '2') {
            event.preventDefault();
            editor.update(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              sel.insertNodes([$createHeadingNode('h3')]);
            });
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);
  return null;
}

// ─── Plugin pour exposer l'éditeur au parent ─────────────────────
// PostEditView a besoin d'une référence à l'éditeur Lexical pour
// pouvoir supprimer un node par sa key (× sur les rangées du
// .fn-block / .bib-block). On l'expose via une callback prop dans
// un Plugin qui vit à l'intérieur de <LexicalComposer> (donc a
// accès à useLexicalComposerContext).

function EditorRefPlugin({ onMount }: { onMount: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onMount(editor);
  }, [editor, onMount]);
  return null;
}

// ─── Plugin : validation d'une zone brouillon ────────────────────
// Le bouton « ✓ valider » rendu par DraftContainerNode.createDOM
// dispatch un CustomEvent `carnet:validate-draft` qui bubble jusqu'au
// document. Ce plugin l'écoute et lance l'unwrap dans editor.update().
// Pourquoi pas un click direct dans createDOM : createDOM n'a pas
// accès à l'editor, et le click sortirait du contexte Lexical.

function DraftValidatePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<{ nodeKey?: string }>;
      const nodeKey = ce.detail?.nodeKey;
      if (!nodeKey) return;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node && $isDraftContainerNode(node)) {
          $unwrapDraftContainer(node);
        }
      });
    }
    document.addEventListener('carnet:validate-draft', handler as EventListener);
    return () => document.removeEventListener('carnet:validate-draft', handler as EventListener);
  }, [editor]);
  return null;
}

// ─── Editor principal ────────────────────────────────────────────

export default function PostBodyEditor({
  value,
  onChange,
  biblioOptions,
  mediaOptions,
  onEditor,
}: {
  value: LexicalState | null;
  onChange: (v: LexicalState) => void;
  biblioOptions: BibEntry[];
  mediaOptions: MediaEntry[];
  onEditor?: (editor: LexicalEditor) => void;
}): React.ReactElement {
  const initialJsonRef = useRef<string>(safeInitialState(value));

  const initialConfig = useMemo(
    () => ({
      namespace: 'CarnetPostBody',
      theme: carnetTheme,
      onError: (err: Error) => {
        // Affiche l'erreur sans casser tout l'éditeur
        // eslint-disable-next-line no-console
        console.error('[CarnetPostBody]', err);
      },
      nodes: [
        HeadingNode,
        QuoteNode,
        LinkNode,
        ListNode,
        ListItemNode,
        CarnetBlockNode,
        CarnetInlineBlockNode,
        DraftContainerNode,
      ],
      editorState: initialJsonRef.current,
    }),
    // initialJsonRef.current capturé une fois — on ne ré-instancie pas
    // l'éditeur quand `value` change, sinon on perd le focus à chaque
    // frappe (chaque parent re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = useCallback(
    (state: EditorState) => {
      const json = state.toJSON();
      onChange(json as unknown as LexicalState);
    },
    [onChange],
  );

  // Note : pas de mécanisme de re-load externe. PostEditView ne monte
  // ce composant qu'après le fetch initial (loading=false), donc value
  // est déjà bon au mount. Les changements de value viennent de notre
  // propre onChange — on ne veut pas re-injecter (sinon on perd le
  // focus à chaque frappe).

  return (
    <BiblioOptionsContext.Provider value={biblioOptions}>
      <MediaOptionsContext.Provider value={mediaOptions}>
      <div className="ed-body">
        <LexicalComposer initialConfig={initialConfig}>
          <RichTextPlugin
            contentEditable={<ContentEditable className="ed-body__ce" spellCheck />}
            placeholder={
              <div className="ed-body__placeholder">
                Commencez à écrire votre billet. Tapez{' '}
                <kbd>/</kbd> pour ouvrir le menu d’insertion (note de bas de
                page, citation, référence bibliographique, figure, titre de
                section…).
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleChange} />
          <KeyboardPlugin />
          <SlashMenuPlugin biblioOptions={biblioOptions} />
          <DraftValidatePlugin />
          {onEditor && <EditorRefPlugin onMount={onEditor} />}
        </LexicalComposer>
      </div>
      </MediaOptionsContext.Provider>
    </BiblioOptionsContext.Provider>
  );
}

// ─── Re-exports utiles ───────────────────────────────────────────

export type { CarnetBlockData, CarnetInlineBlockData };
