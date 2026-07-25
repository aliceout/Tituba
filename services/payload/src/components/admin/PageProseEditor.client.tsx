'use client';

// PageProseEditor — Lexical minimal pour les blocs `prose` des pages
// éditoriales (À propos, Colophon…). Pas de blocs custom (footnotes,
// biblio_inline, figure inline) : ces pages sont du texte éditorial
// simple. Toolbar haut sobre avec paragraphe / h2 / h3 / gras / italique
// / liste / blockquote / lien.
//
// Le format de stockage matche celui de PostBodyEditor (Lexical JSON
// standard root.children) — si demain on veut migrer une page vers un
// post ou inversement, le contenu reste compatible. Le theme partage
// les classes ed-* déjà stylées dans custom.scss (cf .ed-body …).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type ElementNode,
  type LexicalNode,
  type SerializedLexicalNode,
} from 'lexical';
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
} from '@lexical/rich-text';
import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  ListNode,
  ListItemNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';

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

const proseTheme = {
  paragraph: 'ed-p',
  heading: { h2: 'ed-h2', h3: 'ed-h3' },
  quote: 'ed-quote',
  text: {
    bold: 'ed-bold',
    italic: 'ed-italic',
    underline: 'ed-underline',
    strikethrough: 'ed-strike',
  },
  link: 'ed-link',
  list: { ul: 'ed-ul', ol: 'ed-ol', listitem: 'ed-li' },
};

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

function safeInitialState(value: LexicalState | null | undefined): string {
  try {
    if (!value || !value.root) return JSON.stringify(EMPTY_STATE);
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(EMPTY_STATE);
  }
}

// ─── Toolbar ──────────────────────────────────────────────────────

function Toolbar(): React.ReactElement {
  const [editor] = useLexicalComposerContext();

  // État de la modale d'insertion de lien (remplace window.prompt).
  // On capture la sélection courante au clic sur le bouton Lien, et on
  // la restaure avant d'appliquer la commande — sinon le focus passe
  // sur l'input de la modale et la sélection éditeur est perdue.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Convertit chaque bloc top-level couvert par la sélection vers le
  // type demandé (paragraphe, heading h2/h3, blockquote) en préservant
  // ses enfants. Équivalent maison de `$setBlocksType` (@lexical/selection),
  // qu'on évite pour ne pas ajouter de dépendance directe.
  function setBlock(kind: 'paragraph' | 'h2' | 'h3' | 'quote') {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;

      // Récupère les blocs top-level (parents directs du root) qui
      // couvrent la sélection. Set évite les doublons quand plusieurs
      // descendants pointent vers le même parent.
      const blocks = new Set<ElementNode>();
      for (const n of sel.getNodes()) {
        let cur: LexicalNode | null = n;
        while (cur && !$isRootNode(cur.getParent())) {
          cur = cur.getParent();
        }
        if (cur && $isElementNode(cur)) blocks.add(cur);
      }

      for (const block of blocks) {
        const fresh =
          kind === 'paragraph'
            ? $createParagraphNode()
            : kind === 'h2'
              ? $createHeadingNode('h2')
              : kind === 'h3'
                ? $createHeadingNode('h3')
                : $createQuoteNode();
        const children = block.getChildren();
        block.replace(fresh);
        for (const c of children) fresh.append(c);
      }
    });
  }

  function format(kind: 'bold' | 'italic') {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
  }

  function bullet() {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  }
  function numbered() {
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  }
  function unlist() {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
  }

  function openLinkModal() {
    setLinkUrl('');
    setLinkOpen(true);
  }

  function applyLink(url: string | null) {
    // Re-focus l'éditeur pour rétablir la sélection avant de
    // dispatcher la commande. Sans ça, la sélection est sur
    // l'input de la modale et la commande ne s'applique pas.
    editor.focus();
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    setLinkOpen(false);
  }

  return (
    <div className="page-prose-toolbar" role="toolbar">
      <button type="button" onClick={() => setBlock('paragraph')} title="Paragraphe">
        ¶
      </button>
      <button type="button" onClick={() => setBlock('h2')} title="Titre 2">
        H2
      </button>
      <button type="button" onClick={() => setBlock('h3')} title="Titre 3">
        H3
      </button>
      <span className="sep" aria-hidden="true" />
      <button type="button" onClick={() => format('bold')} title="Gras">
        <strong>B</strong>
      </button>
      <button type="button" onClick={() => format('italic')} title="Italique">
        <em>I</em>
      </button>
      <span className="sep" aria-hidden="true" />
      <button type="button" onClick={bullet} title="Liste à puces">
        •
      </button>
      <button type="button" onClick={numbered} title="Liste numérotée">
        1.
      </button>
      <button type="button" onClick={unlist} title="Retirer la liste">
        ⊘
      </button>
      <span className="sep" aria-hidden="true" />
      <button type="button" onClick={() => setBlock('quote')} title="Citation">
        “
      </button>
      <button type="button" onClick={openLinkModal} title="Lien">
        ⌘
      </button>

      {linkOpen && (
        <div
          className="carnet-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLinkOpen(false);
          }}
        >
          <form
            className="carnet-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={(e) => {
              e.preventDefault();
              const v = linkUrl.trim();
              if (!v) return;
              applyLink(v);
            }}
          >
            <header className="carnet-modal__header">
              <h2>Insérer un lien</h2>
              <button
                type="button"
                className="carnet-modal__close"
                onClick={() => setLinkOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <div className="carnet-modal__body">
              <label className="carnet-editview__field">
                <span className="lbl">URL</span>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  autoFocus
                />
                <span className="hint">
                  Le lien sera appliqué au texte actuellement sélectionné.
                </span>
              </label>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={() => applyLink(null)}
                title="Retirer le lien de la sélection"
              >
                Retirer le lien
              </button>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={() => setLinkOpen(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="carnet-btn carnet-btn--accent"
                disabled={!linkUrl.trim()}
              >
                Appliquer
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────

export default function PageProseEditor({
  value,
  onChange,
}: {
  value: LexicalState | null | undefined;
  onChange: (v: LexicalState) => void;
}): React.ReactElement {
  const initialJsonRef = useRef<string>(safeInitialState(value));

  const initialConfig = useMemo(
    () => ({
      namespace: 'CarnetPageProse',
      theme: proseTheme,
      onError: (err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[CarnetPageProse]', err);
      },
      nodes: [HeadingNode, QuoteNode, LinkNode, ListNode, ListItemNode],
      editorState: initialJsonRef.current,
    }),
    // initialJsonRef capté une fois — pas de remount à chaque frappe.
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

  return (
    <div className="page-prose-editor">
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <div className="ed-body">
          <RichTextPlugin
            contentEditable={<ContentEditable className="ed-content" spellCheck />}
            placeholder={<div className="ed-placeholder">Tapez le texte de la section…</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <OnChangePlugin onChange={handleChange} />
        </div>
      </LexicalComposer>
    </div>
  );
}
