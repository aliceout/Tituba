'use client';

// Decorator nodes Lexical pour les 4 blocks Carnet :
//   - footnote        (inline) : note de bas de page
//   - biblio_inline   (inline) : référence biblio « (Auteur, an) »
//   - citation_bloc   (block)  : citation longue avec source
//   - figure          (block)  : image + légende + crédit
//
// Plus un container ElementNode :
//   - draft_container (block, container) : zone brouillon — encapsule
//     des paragraphes/headings/etc. encore inachevés. Visible dans le
//     billet publié avec un bandeau « brouillon ». Édition normale en
//     dedans, pas de champ raison (cf issue #1).
//
// Format JSON aligné sur celui généré par Payload BlocksFeature
// (`type: 'block'` ou `'inlineBlock'`, `fields.blockType`, `fields.*`),
// pour que les posts existants se chargent sans migration et que le
// frontend Astro continue à les lire avec `renderLexicalWithFootnotes`.
//
// Edition : chaque block rend un petit form inline (textareas + selects)
// dans son propre DOM — pas de drawer Payload, pas de modal.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { $getNodeByKey, DecoratorNode, ElementNode } from 'lexical';
import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

import { formatAuthorsShort } from '@/lib/format-authors';
import { useBiblioOptions, useMediaOptions, type MediaEntry } from './context';

// ─── Types ────────────────────────────────────────────────────────

export type FootnoteFields = { content: string };
export type BiblioInlineFields = {
  entry: number | string | null;
  prefix?: string;
  pages?: string;
  suffix?: string;
};
export type CitationBlocFields = { text: string; source?: string };
export type FigureFields = {
  image: number | string | null;
  legende?: string;
  credit?: string;
  // Valeurs alignées sur le schema Payload (cf. blocks/_shared.ts) et
  // le rendu Astro (PageRenderer). Ne PAS utiliser corps/centre/pleine
  // (ancien naming qui faisait planter la validation Payload au save).
  align?: 'left' | 'center' | 'wide';
};

export type CarnetBlockData =
  | { blockType: 'citation_bloc'; fields: CitationBlocFields }
  | { blockType: 'figure'; fields: FigureFields };

export type CarnetInlineBlockData =
  | { blockType: 'footnote'; fields: FootnoteFields }
  | { blockType: 'biblio_inline'; fields: BiblioInlineFields };

type SerializedBlock = Spread<
  {
    type: 'block';
    version: 1;
    fields: { blockType: string } & Record<string, unknown>;
  },
  SerializedLexicalNode
>;

type SerializedInlineBlock = Spread<
  {
    type: 'inlineBlock';
    version: 1;
    fields: { blockType: string } & Record<string, unknown>;
  },
  SerializedLexicalNode
>;

// ─── Helpers UI ───────────────────────────────────────────────────

function useNodeFields<F extends Record<string, unknown>>(
  nodeKey: NodeKey,
  initial: F,
): [F, (patch: Partial<F>) => void] {
  const [editor] = useLexicalComposerContext();
  const [local, setLocal] = useState<F>(initial);

  // Patch -> editor update (utilise $getNodeByKey, pas l'accès direct
  // au nodeMap qui est une internal API).
  function patch(p: Partial<F>) {
    setLocal((cur) => {
      const next = { ...cur, ...p };
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (
          node &&
          (node instanceof CarnetBlockNode || node instanceof CarnetInlineBlockNode)
        ) {
          // getWritable() pour respecter le mécanisme de copy-on-write
          // de Lexical (un node `decorate()` retourne un read-only).
          const writable = node.getWritable() as CarnetBlockNode | CarnetInlineBlockNode;
          writable.__fields = { ...writable.__fields, ...(p as Record<string, unknown>) };
        }
      });
      return next;
    });
  }

  return [local, patch];
}

// ─── React renderers par blockType ────────────────────────────────

function FootnoteRenderer({
  nodeKey,
  fields,
}: {
  nodeKey: NodeKey;
  fields: FootnoteFields;
}) {
  const [local, patch] = useNodeFields<FootnoteFields>(nodeKey, fields);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  // Position verticale du popover en mobile : on ancre le popover sous
  // le trigger en utilisant getBoundingClientRect (le parent inline ne
  // permet pas un calcul fiable via CSS). Voir custom.scss .ed-fn__pop.
  const [popoverTop, setPopoverTop] = useState<number | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggleOpen() {
    if (!open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPopoverTop(rect.bottom + 4);
    }
    setOpen((o) => !o);
  }

  // Le × du popover ferme juste l'éditeur — la note reste dans le
  // document. Pour supprimer la note, il faut effacer le tag [fn]
  // dans le texte (Backspace) ou cliquer × dans le panneau Notes
  // de bas de page en pied de billet.
  function closePopover() {
    setOpen(false);
  }

  return (
    <span ref={ref} className="ed-fn">
      <span
        ref={anchorRef}
        className="ed-fn__anchor"
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        [fn]
      </span>
      {open && (
        <span
          className="ed-fn__pop"
          style={
            popoverTop !== null
              ? ({ '--popover-top': `${popoverTop}px` } as React.CSSProperties)
              : undefined
          }
        >
          <span className="ed-fn__pop-h">
            <span className="lbl">Note de bas de page</span>
            <button
              type="button"
              className="ed-fn__close"
              onClick={closePopover}
              aria-label="Fermer"
              title="Fermer"
            >
              ×
            </button>
          </span>
          <textarea
            rows={3}
            value={local.content ?? ''}
            placeholder="Texte de la note…"
            onChange={(e) => patch({ content: e.target.value })}
          />
        </span>
      )}
    </span>
  );
}

function BiblioInlineRenderer({
  nodeKey,
  fields,
}: {
  nodeKey: NodeKey;
  fields: BiblioInlineFields;
}) {
  const [local, patch] = useNodeFields<BiblioInlineFields>(nodeKey, fields);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  // Position verticale du popover en mobile (cf. FootnoteRenderer).
  const [popoverTop, setPopoverTop] = useState<number | null>(null);
  const biblioOptions = useBiblioOptions();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggleOpen() {
    if (!open && tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      setPopoverTop(rect.bottom + 4);
    }
    setOpen((o) => !o);
  }

  // Affichage : (auteur, année) si la référence est trouvée, sinon
  // « (réf. à choisir) ».
  const selected = local.entry
    ? biblioOptions.find((b) => String(b.id) === String(local.entry))
    : null;
  const shortAuthors = selected ? formatAuthorsShort(selected.authors) : '';
  const label = selected
    ? `(${shortAuthors || '—'}${selected.year ? `, ${selected.year}` : ''})`
    : '(réf. à choisir)';

  // Liste filtrée par la recherche : substring match insensible à la
  // casse sur authorLabel, year, title. Cap à 30 résultats pour éviter
  // un dropdown gigantesque. Tant que la requête est vide, on n'affiche
  // rien — pas d'avalanche au clic d'ouverture du popover.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return biblioOptions
      .filter((b) => {
        const hay = `${b.authorLabel ?? ''} ${b.year ?? ''} ${b.title ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [biblioOptions, search]);

  function pickEntry(id: number | string) {
    patch({ entry: id });
    setSearch('');
  }

  function clearEntry() {
    patch({ entry: null });
    setSearch('');
  }

  // Le × du popover ferme juste l'éditeur — la citation reste dans
  // le document. Pour la supprimer, effacer le tag (Auteur, an) dans
  // le texte (Backspace).
  function closePopover() {
    setOpen(false);
  }

  return (
    <span ref={ref} className="ed-bi">
      <span
        ref={tagRef}
        className="ed-bi__tag"
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        {label}
      </span>
      {open && (
        <span
          className="ed-bi__pop"
          style={
            popoverTop !== null
              ? ({ '--popover-top': `${popoverTop}px` } as React.CSSProperties)
              : undefined
          }
        >
          <span className="ed-bi__pop-h">
            <span className="lbl">Référence bibliographique</span>
            <button
              type="button"
              className="ed-bi__close"
              onClick={closePopover}
              aria-label="Fermer"
              title="Fermer"
            >
              ×
            </button>
          </span>
          {selected ? (
            <span className="ed-bi__selected">
              <span className="ed-bi__selected-label">
                {selected.authorLabel || '—'}
                {selected.year ? ` (${selected.year})` : ''}
                {selected.title ? ` · ${selected.title}` : ''}
              </span>
              <button
                type="button"
                className="ed-bi__selected-clear"
                onClick={clearEntry}
                aria-label="Retirer la référence"
                title="Retirer"
              >
                ×
              </button>
            </span>
          ) : (
            <>
              <input
                type="text"
                className="ed-bi__search"
                value={search}
                placeholder="Rechercher (auteur, année, titre)…"
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search.trim() && (
                <span className="ed-bi__results">
                  {filtered.length === 0 ? (
                    <span className="ed-bi__empty">Aucune référence trouvée.</span>
                  ) : (
                    filtered.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="ed-bi__result"
                        onClick={() => pickEntry(b.id)}
                      >
                        <span className="author">{b.authorLabel || '—'}</span>
                        {b.year ? <span className="year"> ({b.year})</span> : null}
                        {b.title ? <span className="title"> · {b.title}</span> : null}
                      </button>
                    ))
                  )}
                </span>
              )}
            </>
          )}

          <span className="ed-bi__row">
            <span className="ed-bi__col">
              <span className="lbl">Préfixe</span>
              <input
                type="text"
                value={local.prefix ?? ''}
                placeholder="cf., voir…"
                onChange={(e) => patch({ prefix: e.target.value })}
              />
            </span>
            <span className="ed-bi__col">
              <span className="lbl">Page(s)</span>
              <input
                type="text"
                value={local.pages ?? ''}
                placeholder="47, 47-52…"
                onChange={(e) => patch({ pages: e.target.value })}
              />
            </span>
          </span>

          <span className="lbl">Suffixe</span>
          <input
            type="text"
            value={local.suffix ?? ''}
            placeholder="chap. 3, tableau 4…"
            onChange={(e) => patch({ suffix: e.target.value })}
          />
        </span>
      )}
    </span>
  );
}

function CitationBlocRenderer({
  nodeKey,
  fields,
}: {
  nodeKey: NodeKey;
  fields: CitationBlocFields;
}) {
  const [local, patch] = useNodeFields<CitationBlocFields>(nodeKey, fields);
  return (
    <div className="ed-cit" contentEditable={false}>
      <textarea
        className="ed-cit__text"
        rows={3}
        value={local.text ?? ''}
        placeholder="Texte de la citation…"
        onChange={(e) => patch({ text: e.target.value })}
      />
      <input
        className="ed-cit__src"
        type="text"
        value={local.source ?? ''}
        placeholder="Source — ex : Puar (2007), p. 23"
        onChange={(e) => patch({ source: e.target.value })}
      />
    </div>
  );
}

// Format human-readable d'une taille fichier (octets → ko/Mo/Go).
// Bornée à 1 décimale, suffixe court (Ko/Mo/Go) sans espace insécable
// pour garder le label compact dans la liste de résultats du picker.
function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} Go`;
}

// Métadonnées affichées sous le titre dans le picker média : dimensions
// si dispo (« 1920 × 1080 »), sinon taille du fichier (« 245 ko »),
// sinon mime type, sinon vide.
function formatMediaMeta(m: MediaEntry): string {
  if (m.width && m.height) return `${m.width} × ${m.height}`;
  const size = formatFileSize(m.filesize);
  if (size) return size;
  return m.mimeType ?? '';
}

// Label primaire affiché dans le picker : title du média, sinon alt
// (qui est obligatoire côté schema), sinon filename en fallback.
function mediaPrimaryLabel(m: MediaEntry): string {
  if (m.title?.trim()) return m.title.trim();
  if (m.alt?.trim()) return m.alt.trim();
  return m.filename ?? '—';
}

function FigureRenderer({
  nodeKey,
  fields,
}: {
  nodeKey: NodeKey;
  fields: FigureFields;
}) {
  const [local, patch] = useNodeFields<FigureFields>(nodeKey, fields);
  const mediaOptions = useMediaOptions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLElement>(null);

  const selected = local.image
    ? mediaOptions.find((m) => String(m.id) === String(local.image))
    : null;

  // Click outside ferme le popover (idem ed-fn / ed-bi).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Filtrage live sur filename + alt + title (insensible à la casse).
  // Cap à 30 résultats pour ne pas dérouler à l'infini quand la
  // bibliothèque média est grosse.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return mediaOptions
      .filter((m) => {
        const hay = `${m.filename ?? ''} ${m.alt ?? ''} ${m.title ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [mediaOptions, search]);

  function pickMedia(id: number | string) {
    patch({ image: id });
    setSearch('');
  }

  function clearMedia() {
    patch({ image: null });
    setSearch('');
  }

  function closePopover() {
    setOpen(false);
  }

  return (
    <figure ref={ref} className="ed-fig" contentEditable={false}>
      {/* Tag compact, même style que .ed-fn__anchor / .ed-bi__tag :
          fond accent-tint, mono, petit. Click → ouvre le popover.
          Affichage du title (ou alt/filename en fallback) si un média
          est sélectionné, sinon « (figure à choisir) ». */}
      <button
        type="button"
        className="ed-fig__tag"
        onClick={() => setOpen((o) => !o)}
        aria-label={selected ? 'Modifier la figure' : 'Choisir un média'}
      >
        {selected
          ? `(figure : ${mediaPrimaryLabel(selected)})`
          : '(figure à choisir)'}
      </button>

      {open && (
        <div className="ed-fig__pop">
          <div className="ed-fig__pop-h">
            <span className="lbl">Figure</span>
            <button
              type="button"
              className="ed-fig__close"
              onClick={closePopover}
              aria-label="Fermer"
              title="Fermer"
            >
              ×
            </button>
          </div>

          {/* Picker média : sélectionné = chip avec ×, sinon search */}
          {selected ? (
            <div className="ed-fig__selected">
              <img
                className="ed-fig__selected-thumb"
                src={selected.thumbnailURL || selected.url || `/cms/api/media/${selected.id}`}
                alt={selected.alt ?? ''}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="ed-fig__selected-meta">
                <span className="ed-fig__selected-name">{mediaPrimaryLabel(selected)}</span>
                {formatMediaMeta(selected) && (
                  <span className="ed-fig__selected-alt">{formatMediaMeta(selected)}</span>
                )}
              </span>
              <button
                type="button"
                className="ed-fig__selected-clear"
                onClick={clearMedia}
                aria-label="Retirer le média"
                title="Retirer"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="ed-fig__search"
                value={search}
                placeholder="Rechercher un média (titre, alt, nom)…"
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.trim() && (
                <div className="ed-fig__results">
                  {filtered.length === 0 ? (
                    <span className="ed-fig__empty">Aucun média trouvé.</span>
                  ) : (
                    filtered.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="ed-fig__result"
                        onClick={() => pickMedia(m.id)}
                      >
                        <img
                          className="ed-fig__result-thumb"
                          src={m.thumbnailURL || m.url || `/cms/api/media/${m.id}`}
                          alt={m.alt ?? ''}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="ed-fig__result-meta">
                          <span className="ed-fig__result-name">{mediaPrimaryLabel(m)}</span>
                          {formatMediaMeta(m) && (
                            <span className="ed-fig__result-alt">{formatMediaMeta(m)}</span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          <textarea
            className="ed-fig__cap"
            rows={2}
            value={local.legende ?? ''}
            placeholder="Légende…"
            onChange={(e) => patch({ legende: e.target.value })}
          />
          <input
            className="ed-fig__credit"
            type="text"
            value={local.credit ?? ''}
            placeholder="Crédit / source"
            onChange={(e) => patch({ credit: e.target.value })}
          />
          <select
            className="ed-fig__align"
            value={local.align ?? 'left'}
            onChange={(e) => patch({ align: e.target.value as FigureFields['align'] })}
          >
            <option value="left">Largeur du corps</option>
            <option value="center">Centré</option>
            <option value="wide">Pleine largeur</option>
          </select>
        </div>
      )}
    </figure>
  );
}

// ─── Block-level decorator ────────────────────────────────────────

export class CarnetBlockNode extends DecoratorNode<React.ReactElement> {
  __blockType: string;
  __fields: Record<string, unknown>;

  static getType(): string {
    return 'block';
  }
  static clone(node: CarnetBlockNode): CarnetBlockNode {
    return new CarnetBlockNode(node.__blockType, { ...node.__fields }, node.__key);
  }

  constructor(blockType: string, fields: Record<string, unknown>, key?: NodeKey) {
    super(key);
    this.__blockType = blockType;
    this.__fields = fields;
  }

  static importJSON(json: SerializedBlock): CarnetBlockNode {
    const f = json.fields ?? {};
    const { blockType, ...rest } = f;
    return new CarnetBlockNode(String(blockType ?? 'unknown'), rest as Record<string, unknown>);
  }

  exportJSON(): SerializedBlock {
    return {
      type: 'block',
      version: 1,
      fields: { blockType: this.__blockType, ...this.__fields },
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ed-block';
    el.setAttribute('data-block-type', this.__blockType);
    return el;
  }
  updateDOM(): false {
    return false;
  }

  decorate(_editor: LexicalEditor): React.ReactElement {
    const fields = { ...this.__fields } as Record<string, unknown>;
    const key = this.__key;
    if (this.__blockType === 'citation_bloc') {
      return (
        <CitationBlocRenderer
          nodeKey={key}
          fields={{
            text: String(fields.text ?? ''),
            source: String(fields.source ?? ''),
          }}
        />
      );
    }
    if (this.__blockType === 'figure') {
      return (
        <FigureRenderer
          nodeKey={key}
          fields={{
            image: (fields.image as number | string | null) ?? null,
            legende: String(fields.legende ?? ''),
            credit: String(fields.credit ?? ''),
            align: (fields.align as FigureFields['align']) ?? 'left',
          }}
        />
      );
    }
    return (
      <div className="ed-block-unknown">
        Bloc non reconnu : <code>{this.__blockType}</code>
      </div>
    );
  }
}

export function $createCarnetBlockNode(data: CarnetBlockData): CarnetBlockNode {
  return new CarnetBlockNode(data.blockType, data.fields as Record<string, unknown>);
}

export function $isCarnetBlockNode(node: LexicalNode | null | undefined): node is CarnetBlockNode {
  return node instanceof CarnetBlockNode;
}

// ─── Inline decorator ─────────────────────────────────────────────

export class CarnetInlineBlockNode extends DecoratorNode<React.ReactElement> {
  __blockType: string;
  __fields: Record<string, unknown>;

  static getType(): string {
    return 'inlineBlock';
  }
  static clone(node: CarnetInlineBlockNode): CarnetInlineBlockNode {
    return new CarnetInlineBlockNode(node.__blockType, { ...node.__fields }, node.__key);
  }

  constructor(blockType: string, fields: Record<string, unknown>, key?: NodeKey) {
    super(key);
    this.__blockType = blockType;
    this.__fields = fields;
  }

  isInline(): true {
    return true;
  }

  static importJSON(json: SerializedInlineBlock): CarnetInlineBlockNode {
    const f = json.fields ?? {};
    const { blockType, ...rest } = f;
    return new CarnetInlineBlockNode(
      String(blockType ?? 'unknown'),
      rest as Record<string, unknown>,
    );
  }

  exportJSON(): SerializedInlineBlock {
    return {
      type: 'inlineBlock',
      version: 1,
      fields: { blockType: this.__blockType, ...this.__fields },
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('span');
    el.className = 'ed-inline';
    el.setAttribute('data-block-type', this.__blockType);
    return el;
  }
  updateDOM(): false {
    return false;
  }

  decorate(_editor: LexicalEditor): React.ReactElement {
    const fields = { ...this.__fields } as Record<string, unknown>;
    const key = this.__key;
    if (this.__blockType === 'footnote') {
      return (
        <FootnoteRenderer
          nodeKey={key}
          fields={{ content: String(fields.content ?? '') }}
        />
      );
    }
    if (this.__blockType === 'biblio_inline') {
      return (
        <BiblioInlineRenderer
          nodeKey={key}
          fields={{
            entry: (fields.entry as number | string | null) ?? null,
            prefix: String(fields.prefix ?? ''),
            pages: String(fields.pages ?? ''),
            suffix: String(fields.suffix ?? ''),
          }}
        />
      );
    }
    return <span className="ed-inline-unknown">[{this.__blockType}]</span>;
  }
}

export function $createCarnetInlineBlockNode(
  data: CarnetInlineBlockData,
): CarnetInlineBlockNode {
  return new CarnetInlineBlockNode(data.blockType, data.fields as Record<string, unknown>);
}

export function $isCarnetInlineBlockNode(
  node: LexicalNode | null | undefined,
): node is CarnetInlineBlockNode {
  return node instanceof CarnetInlineBlockNode;
}

// ─── Draft container ──────────────────────────────────────────────
//
// Zone brouillon : un ElementNode qui wrappe N children Lexical
// (paragraphes, headings, citations…) en gardant l'édition fluide
// dans le flux principal. Round-trip JSON via `type: 'draft_container'`,
// pas de Block Payload (pas de migration pgsql à faire — body est
// déjà jsonb). Le rendu admin (createDOM) pose une className `ed-draft`
// sur un <div>, le bandeau visuel est en CSS pseudo-element. Pas de
// champ `reason` (cf issue #1, drop décidé en cours d'implé).

type SerializedDraftContainerNode = Spread<
  {
    type: 'draft_container';
    version: 1;
  },
  SerializedElementNode
>;

export class DraftContainerNode extends ElementNode {
  static getType(): string {
    return 'draft_container';
  }

  static clone(node: DraftContainerNode): DraftContainerNode {
    return new DraftContainerNode(node.__key);
  }

  static importJSON(_json: SerializedDraftContainerNode): DraftContainerNode {
    return $createDraftContainerNode();
  }

  exportJSON(): SerializedDraftContainerNode {
    return {
      ...super.exportJSON(),
      type: 'draft_container',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ed-draft';

    // Bouton « valider la zone » : retire les marqueurs en gardant le
    // contenu (cf $unwrapDraftContainer). Non éditable (Lexical
    // ignore les enfants `contenteditable=false` non-Lexical), absolute-
    // positionné hors flux. Click → custom event bubble jusqu'au
    // document, où DraftValidatePlugin (Editor.tsx) le capte et lance
    // l'unwrap dans editor.update() — on ne peut pas appeler
    // directement editor.update ici, createDOM n'a pas l'editor.
    const btn = document.createElement('button');
    btn.className = 'ed-draft__validate';
    btn.type = 'button';
    btn.contentEditable = 'false';
    btn.setAttribute('aria-label', 'Publier la zone — sortir du brouillon');
    btn.title = 'Publier la zone — sortir du brouillon';
    btn.textContent = '✓ publier';
    const nodeKey = this.__key;
    btn.addEventListener('mousedown', (e) => {
      // mousedown (et pas click) pour ne pas perdre le focus de
      // l'éditeur entre l'event et l'update — l'unwrap doit pouvoir
      // remonter le node depuis sa key sans que la sélection ait dérivé.
      e.preventDefault();
      e.stopPropagation();
      btn.dispatchEvent(
        new CustomEvent('carnet:validate-draft', {
          detail: { nodeKey },
          bubbles: true,
        }),
      );
    });
    el.appendChild(btn);

    return el;
  }

  updateDOM(): false {
    return false;
  }
}

export function $createDraftContainerNode(): DraftContainerNode {
  return new DraftContainerNode();
}

export function $isDraftContainerNode(
  node: LexicalNode | null | undefined,
): node is DraftContainerNode {
  return node instanceof DraftContainerNode;
}

/**
 * Retire un DraftContainerNode en remontant ses children comme frères
 * directs du parent — l'utilisatrice valide la zone, le contenu reste
 * mais les marqueurs disparaissent. À appeler dans un editor.update().
 */
export function $unwrapDraftContainer(node: DraftContainerNode): void {
  const children = [...node.getChildren()];
  let cursor: LexicalNode = node;
  for (const child of children) {
    cursor.insertAfter(child);
    cursor = child;
  }
  node.remove();
}
