'use client';

// PageEditView (client) — vue Édition custom d'une page éditoriale
// (Pages éditoriales : À propos, Colophon, Mentions légales…). Layout
// aligné sur BibliographyEditView :
//
//   CarnetTopbar : crumbs Tituba / Pages / [slug] +
//                  Supprimer + Sauvegarder
//   tituba-editview__hero : h1 « Page éditoriale » + « clé : <slug> »
//   section Identification : Titre · Slug
//   section SEO            : Description · noindex
//   section En-tête        : Sur-titre (kicker) · Chapô (lede)
//   section Sections       : éditeur de blocs Prose / Figure / Citation.
//                            Cards collapsibles avec ajout / suppression
//                            / déplacement haut-bas. Le contenu Prose
//                            passe par PageProseEditor (Lexical
//                            minimal — paragraphe / h2 / h3 / gras /
//                            italique / listes / blockquote / lien).
//
// Fetch / save via /cms/api/pages/[id] (cookies de session).

import React, { useEffect, useState } from 'react';

import CarnetPage from './CarnetPage';
import PageProseEditor, { type LexicalState } from './PageProseEditor.client';

const API_PAGES = '/cms/api/pages';

// Blocs typés qu'on sait éditer dans cette vue.
type ProseBlock = {
  blockType: 'prose';
  id?: string;
  titre?: string;
  content?: LexicalState | null;
};
type FigureBlock = {
  blockType: 'figure';
  id?: string;
  image?: number | string | null;
  legende?: string;
  credit?: string;
  align?: 'left' | 'center' | 'wide';
};
type CitationBlock = {
  blockType: 'citation_bloc';
  id?: string;
  text?: string;
  source?: string;
};

// Bloc inconnu (résilience future ou bloc legacy) — on le préserve
// tel quel au save sans tenter de l'éditer.
type UnknownBlock = { blockType: string; id?: string; [k: string]: unknown };

type AnyBlock = ProseBlock | FigureBlock | CitationBlock | UnknownBlock;

type Page = {
  id?: number | string;
  title: string;
  slug: string;
  /**
   * « libre » — page composée ici, créable et supprimable.
   * « fixe »  — en-tête d'une route du site (accueil, archives, thèmes,
   *   abonnement) : ni slug modifiable, ni suppression, ni sections.
   */
  kind?: 'libre' | 'fixe';
  /** Affichage au menu — n'a de sens que pour une page fixe. */
  enabled?: boolean;
  description?: string;
  noindex?: boolean;
  eyebrow?: string;
  lede?: string;
  sections?: AnyBlock[];
};

const EMPTY: Page = {
  title: '',
  slug: '',
  kind: 'libre',
  enabled: true,
  description: '',
  noindex: false,
  eyebrow: '',
  lede: '',
  sections: [],
};

const BLOCK_LABEL: Record<string, string> = {
  prose: 'Texte (prose)',
  figure: 'Figure',
  citation_bloc: 'Citation longue',
};

const FIGURE_ALIGN_LABEL: Record<NonNullable<FigureBlock['align']>, string> = {
  left: 'Gauche',
  center: 'Centré',
  wide: 'Pleine largeur',
};

function makeProse(): ProseBlock {
  return { blockType: 'prose', titre: '', content: null };
}
function makeFigure(): FigureBlock {
  return {
    blockType: 'figure',
    image: null,
    legende: '',
    credit: '',
    align: 'left',
  };
}
function makeCitation(): CitationBlock {
  return { blockType: 'citation_bloc', text: '', source: '' };
}

// Aperçu compact 1 ligne pour l'en-tête de carte quand elle est
// repliée. « Untitled » si rien à afficher.
function previewOf(b: AnyBlock): string {
  if (b.blockType === 'prose') {
    const p = b as ProseBlock;
    if (p.titre && p.titre.trim()) return p.titre.trim();
    return 'Untitled';
  }
  if (b.blockType === 'figure') {
    const f = b as FigureBlock;
    if (f.legende && f.legende.trim()) return f.legende.trim();
    if (f.image != null) return `Image #${String(f.image)}`;
    return 'Untitled';
  }
  if (b.blockType === 'citation_bloc') {
    const c = b as CitationBlock;
    const t = (c.text ?? '').trim();
    if (t) return t.length > 80 ? `${t.slice(0, 80)}…` : t;
    return 'Untitled';
  }
  return 'Untitled';
}

export default function PageEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const [data, setData] = useState<Page>(EMPTY);
  const [initial, setInitial] = useState<string>(JSON.stringify(EMPTY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Modale de confirmation de suppression. Réutilise le pattern
  // .tituba-modal* déjà en place côté admin.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sections actuellement repliées par index. Au mount d'une page
  // existante on replie toutes les sections par défaut (la liste peut
  // être longue — À propos, Colophon…) ; les nouvelles sections
  // ajoutées via les boutons sont automatiquement dépliées.
  const [collapsedIdx, setCollapsedIdx] = useState<Set<number>>(new Set());

  // Modale de confirmation pour supprimer une section. Null = fermée,
  // sinon l'index de la section ciblée.
  const [deleteSectionIdx, setDeleteSectionIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setInitial(JSON.stringify(EMPTY));
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API_PAGES}/${encodeURIComponent(docId)}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: Partial<Page>) => {
        const sections = Array.isArray(doc.sections) ? (doc.sections as AnyBlock[]) : [];
        const norm: Page = {
          ...EMPTY,
          ...doc,
          title: doc.title ?? '',
          slug: doc.slug ?? '',
          description: doc.description ?? '',
          noindex: !!doc.noindex,
          eyebrow: doc.eyebrow ?? '',
          lede: doc.lede ?? '',
          sections,
          id: doc.id,
        };
        setData(norm);
        setInitial(JSON.stringify(norm));
        // Replie toutes les sections existantes au chargement.
        setCollapsedIdx(new Set(sections.map((_, i) => i)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));
  }, [docId]);

  const dirty = JSON.stringify(data) !== initial;
  /**
   * Page fixe : elle titre une route du site plutôt que d'en composer
   * une. Trois choses s'en déduisent — slug verrouillé, pas de
   * suppression, pas d'éditeur de sections — et la collection fait
   * respecter les trois côté API (cf Pages.ts), ce qu'on ne fait ici
   * que rendre visible.
   */
  const estFixe = data.kind === 'fixe';

  function patch<K extends keyof Page>(key: K, value: Page[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  // ─── Sections ───────────────────────────────────────────────────

  function toggleCollapsed(idx: number) {
    setCollapsedIdx((cur) => {
      const next = new Set(cur);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function addSection(kind: 'prose' | 'figure' | 'citation_bloc') {
    setData((d) => {
      const newBlock: AnyBlock =
        kind === 'prose' ? makeProse() : kind === 'figure' ? makeFigure() : makeCitation();
      const sections = [...(d.sections ?? []), newBlock];
      return { ...d, sections };
    });
    // La nouvelle section est ajoutée à la fin et reste dépliée
    // (donc PAS d'ajout dans collapsedIdx). Les anciens index gardent
    // leur état parce qu'on n'a pas réordonné — on a juste ajouté à la
    // fin.
  }

  function removeSection(idx: number) {
    setData((d) => {
      const sections = (d.sections ?? []).filter((_, i) => i !== idx);
      return { ...d, sections };
    });
    // Décale les flags collapsed > idx d'un cran vers la gauche.
    setCollapsedIdx((cur) => {
      const next = new Set<number>();
      for (const i of cur) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
        // i === idx → supprimé, on n'ajoute pas
      }
      return next;
    });
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    setData((d) => {
      const sections = [...(d.sections ?? [])];
      if (j < 0 || j >= sections.length) return d;
      [sections[idx], sections[j]] = [sections[j], sections[idx]];
      return { ...d, sections };
    });
    // Échange les flags collapsed entre idx et j pour que l'état
    // suive la section, pas l'index.
    setCollapsedIdx((cur) => {
      const hasIdx = cur.has(idx);
      const hasJ = cur.has(j);
      const next = new Set(cur);
      if (hasIdx) next.add(j);
      else next.delete(j);
      if (hasJ) next.add(idx);
      else next.delete(idx);
      return next;
    });
  }

  function patchSection<B extends AnyBlock>(idx: number, partial: Partial<B>) {
    setData((d) => {
      const sections = (d.sections ?? []).map((s, i) =>
        i === idx ? ({ ...(s as B), ...partial } as AnyBlock) : s,
      );
      return { ...d, sections };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url =
        data.id != null && data.id !== ''
          ? `${API_PAGES}/${encodeURIComponent(String(data.id))}`
          : API_PAGES;
      const method = data.id != null && data.id !== '' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: Page } | Page;
      const fresh: Page = (json as { doc?: Page }).doc ?? (json as Page);
      const norm: Page = {
        ...EMPTY,
        ...fresh,
        sections: Array.isArray(fresh.sections) ? (fresh.sections as AnyBlock[]) : [],
      };
      setData(norm);
      setInitial(JSON.stringify(norm));
      setSavedAt(Date.now());
      if (!docId && fresh.id != null) {
        const path = `/cms/admin/collections/pages/${fresh.id}`;
        if (typeof window !== 'undefined') window.history.replaceState(null, '', path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  async function deletePage() {
    if (data.id == null) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_PAGES}/${encodeURIComponent(String(data.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (typeof window !== 'undefined') {
        window.location.href = '/cms/admin/collections/pages';
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erreur inconnue');
      setDeleteSubmitting(false);
    }
  }

  // Raccourci ⌘S / Ctrl+S
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, saving, data]);

  return (
    <CarnetPage
      variant="editview"
      modifier="page"
      crumbs={[
        { href: '/cms/admin', label: 'Tituba' },
        { href: '/cms/admin/collections/pages', label: 'Pages' },
        { label: data.slug || (docId ? '—' : 'nouvelle') },
      ]}
      suppressHydrationWarningOnActions
      topbarActions={
        <>
          {dirty && (
            <span className="tituba-editview__dirty" aria-live="polite">
              Modifications non enregistrées
            </span>
          )}
          {!dirty && savedAt && (
            <span className="tituba-editview__saved" aria-live="polite">
              Enregistré
            </span>
          )}
          <button
            type="button"
            className="tituba-btn tituba-btn--accent"
            onClick={() => void save()}
            disabled={!dirty || saving || loading}
            title="Sauvegarder"
            suppressHydrationWarning
          >
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </>
      }
    >
      {error && <div className="tituba-editview__error">Erreur : {error}</div>}

      {loading ? (
        <div className="tituba-editview__loading">Chargement…</div>
      ) : (
        <form
          className="tituba-editview__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="tituba-editview__hero">
            <h1 className="tituba-h1">{estFixe ? 'Page fixe du site' : 'Page éditoriale'}</h1>
            {data.slug && (
              <p className="tituba-editview__hero-key">
                clé : <span className="mono">{data.slug}</span>
              </p>
            )}
          </div>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Identification</h2>

            {estFixe && (
              <p className="tituba-editview__section-help">
                Cette page titre une route qui existe déjà dans le site — son écran est composé
                par le code, pas ici. Vous en réglez le titre, le chapô et l’affichage au menu.
                Elle ne peut être ni renommée ni supprimée.
              </p>
            )}

            <label className="tituba-editview__field">
              <span className="lbl">Titre de la page</span>
              <input
                type="text"
                value={data.title}
                onChange={(e) => patch('title', e.target.value)}
                required
              />
              {estFixe && (
                <span className="hint">
                  Les *astérisques* surlignent un mot dans le hero, comme sur un titre de billet.
                </span>
              )}
            </label>

            <label className="tituba-editview__field">
              <span className="lbl">Slug</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => patch('slug', e.target.value)}
                required
                // Verrouillé sur une page fixe : le slug est ce qui la
                // relie à sa route. La collection refuse d'ailleurs de
                // le changer côté API — le champ grisé ne fait que le
                // rendre visible.
                disabled={estFixe}
              />
              <span className="hint">
                {estFixe
                  ? 'Fixé par la route du site. Non modifiable.'
                  : 'URL-safe, ex : « about », « colophon », « mentions-legales ». Sert de match de route Astro.'}
              </span>
            </label>

            {estFixe && (
              <label className="tituba-editview__field tituba-editview__field--toggle">
                <input
                  type="checkbox"
                  checked={data.enabled !== false}
                  onChange={(e) => patch('enabled', e.target.checked)}
                />
                <span className="lbl">Affichée au menu</span>
                <span className="hint">
                  Décochée, la page disparaît du menu du site. Sa route continue d’exister — c’est
                  le lien qui s’en va, pas la page.
                </span>
              </label>
            )}
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">SEO</h2>

            <label className="tituba-editview__field">
              <span className="lbl">Description</span>
              <textarea
                rows={3}
                value={data.description ?? ''}
                onChange={(e) => patch('description', e.target.value)}
              />
              <span className="hint">~150 caractères, affichée dans Google.</span>
            </label>

            <label className="tituba-editview__field tituba-editview__field--inline tituba-editview__field--check">
              <input
                type="checkbox"
                checked={!!data.noindex}
                onChange={(e) => patch('noindex', e.target.checked)}
              />
              <span className="lbl">
                noindex — demander aux moteurs de ne pas indexer cette page
              </span>
            </label>
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">En-tête éditorial</h2>

            <label className="tituba-editview__field">
              <span className="lbl">Sur-titre (kicker)</span>
              <input
                type="text"
                value={data.eyebrow ?? ''}
                onChange={(e) => patch('eyebrow', e.target.value)}
              />
              <span className="hint">
                Ex&nbsp;: « À propos », « Colophon ». Apparaît au-dessus du titre, en
                accent.
              </span>
            </label>

            <label className="tituba-editview__field">
              <span className="lbl">Chapô (lede)</span>
              <textarea
                rows={3}
                value={data.lede ?? ''}
                onChange={(e) => patch('lede', e.target.value)}
              />
              <span className="hint">1 phrase, affichée en gros sous le titre.</span>
            </label>
          </section>

          {/* Pas de corps sur une page fixe : son écran est composé par
              le site — une liste d'archives, une grille de thématiques.
              Laisser l'éditeur visible aurait promis un contenu que rien
              n'affiche. */}
          {!estFixe && (
          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Sections de la page</h2>
            <p className="tituba-editview__section-help">
              Empilez des sections Prose (texte rich), Figure (image)
              ou Citation. Les sections sont rendues dans l'ordre côté
              frontend ; utilisez ↑ / ↓ pour réordonner.
            </p>

            <div className="page-sections">
              {(data.sections ?? []).length === 0 && (
                <div className="page-sections__empty">
                  Aucune section pour l'instant. Ajoutez-en une avec les
                  boutons ci-dessous.
                </div>
              )}

              {(data.sections ?? []).map((s, i) => {
                const collapsed = collapsedIdx.has(i);
                const known = s.blockType in BLOCK_LABEL;
                return (
                  <article
                    key={i}
                    className={`page-section${collapsed ? ' page-section--collapsed' : ''}${
                      known ? '' : ' page-section--unknown'
                    }`}
                  >
                    <header className="page-section__head">
                      <span className="page-section__index">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="page-section__kind">
                        {BLOCK_LABEL[s.blockType] ?? s.blockType}
                      </span>
                      <span
                        className="page-section__preview"
                        title={previewOf(s)}
                      >
                        {previewOf(s)}
                      </span>
                      <div className="page-section__actions">
                        <button
                          type="button"
                          onClick={() => moveSection(i, -1)}
                          disabled={i === 0}
                          aria-label="Déplacer vers le haut"
                          title="Monter"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(i, 1)}
                          disabled={i === (data.sections ?? []).length - 1}
                          aria-label="Déplacer vers le bas"
                          title="Descendre"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCollapsed(i)}
                          aria-label={collapsed ? 'Déplier' : 'Replier'}
                          title={collapsed ? 'Déplier' : 'Replier'}
                        >
                          {collapsed ? '▸' : '▾'}
                        </button>
                        <button
                          type="button"
                          className="page-section__del"
                          onClick={() => setDeleteSectionIdx(i)}
                          aria-label="Supprimer cette section"
                          title="Supprimer"
                        >
                          ×
                        </button>
                      </div>
                    </header>

                    {!collapsed && (
                      <div className="page-section__body">
                        {s.blockType === 'prose' && (
                          <ProseFields
                            value={s as ProseBlock}
                            onPatch={(p) => patchSection<ProseBlock>(i, p)}
                          />
                        )}
                        {s.blockType === 'figure' && (
                          <FigureFields
                            value={s as FigureBlock}
                            onPatch={(p) => patchSection<FigureBlock>(i, p)}
                          />
                        )}
                        {s.blockType === 'citation_bloc' && (
                          <CitationFields
                            value={s as CitationBlock}
                            onPatch={(p) => patchSection<CitationBlock>(i, p)}
                          />
                        )}
                        {!known && (
                          <div className="page-section__unknown">
                            Type de bloc inconnu (« {s.blockType} »). Le
                            contenu est préservé tel quel à la sauvegarde
                            mais n'est pas éditable depuis cette vue.
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              <div className="page-sections__add">
                <span className="lbl">Ajouter une section&nbsp;:</span>
                <button
                  type="button"
                  className="tituba-btn tituba-btn--ghost"
                  onClick={() => addSection('prose')}
                >
                  + Prose
                </button>
                <button
                  type="button"
                  className="tituba-btn tituba-btn--ghost"
                  onClick={() => addSection('figure')}
                >
                  + Figure
                </button>
                <button
                  type="button"
                  className="tituba-btn tituba-btn--ghost"
                  onClick={() => addSection('citation_bloc')}
                >
                  + Citation
                </button>
              </div>
            </div>
          </section>
          )}

          {data.id != null && !estFixe && (
            <section className="tituba-editview__section tituba-editview__section--danger">
              <button
                type="button"
                className="tituba-postedit__delete"
                onClick={() => {
                  setDeleteOpen(true);
                  setDeleteError(null);
                }}
              >
                Supprimer cette page
              </button>
            </section>
          )}
        </form>
      )}

      {deleteSectionIdx != null && (
        <div
          className="tituba-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteSectionIdx(null);
          }}
        >
          <div className="tituba-modal" role="dialog" aria-modal="true">
            <header className="tituba-modal__header">
              <h2>Supprimer cette section&nbsp;?</h2>
              <button
                type="button"
                className="tituba-modal__close"
                onClick={() => setDeleteSectionIdx(null)}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <div className="tituba-modal__body">
              {(() => {
                const target = (data.sections ?? [])[deleteSectionIdx];
                const kind = target ? BLOCK_LABEL[target.blockType] ?? target.blockType : '';
                return (
                  <p>
                    La section <strong>{String(deleteSectionIdx + 1).padStart(2, '0')}</strong>
                    {kind ? ` (${kind})` : ''} sera retirée de la page. Le
                    retrait n'est définitif qu'après la sauvegarde de la
                    page — vous pouvez l'annuler en rechargeant tant que
                    vous n'avez pas cliqué sur Sauvegarder.
                  </p>
                );
              })()}
            </div>

            <footer className="tituba-modal__footer">
              <button
                type="button"
                className="tituba-btn tituba-btn--ghost"
                onClick={() => setDeleteSectionIdx(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="tituba-btn tituba-btn--danger"
                onClick={() => {
                  removeSection(deleteSectionIdx);
                  setDeleteSectionIdx(null);
                }}
              >
                Retirer
              </button>
            </footer>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="tituba-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSubmitting) {
              setDeleteOpen(false);
              setDeleteError(null);
            }
          }}
        >
          <div className="tituba-modal" role="dialog" aria-modal="true">
            <header className="tituba-modal__header">
              <h2>Supprimer cette page&nbsp;?</h2>
              <button
                type="button"
                className="tituba-modal__close"
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteOpen(false);
                  setDeleteError(null);
                }}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {deleteError && (
              <div className="tituba-modal__error">Erreur&nbsp;: {deleteError}</div>
            )}

            <div className="tituba-modal__body">
              <p>
                «&nbsp;{data.title || data.slug || 'Sans titre'}&nbsp;» sera définitivement
                supprimée. Cette action est irréversible.
              </p>
            </div>

            <footer className="tituba-modal__footer">
              <button
                type="button"
                className="tituba-btn tituba-btn--ghost"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteError(null);
                }}
                disabled={deleteSubmitting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="tituba-btn tituba-btn--danger"
                onClick={() => void deletePage()}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? 'Suppression…' : 'Supprimer'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </CarnetPage>
  );
}

// ─── Field-sets par type de bloc ────────────────────────────────

function ProseFields({
  value,
  onPatch,
}: {
  value: ProseBlock;
  onPatch: (p: Partial<ProseBlock>) => void;
}): React.ReactElement {
  return (
    <>
      <label className="tituba-editview__field">
        <span className="lbl">Titre de section (optionnel)</span>
        <input
          type="text"
          value={value.titre ?? ''}
          onChange={(e) => onPatch({ titre: e.target.value })}
        />
        <span className="hint">
          Apparaît en h2 si présent. Laisser vide pour pas de titre.
        </span>
      </label>

      <div className="tituba-editview__field">
        <span className="lbl">Contenu</span>
        <PageProseEditor
          value={value.content ?? null}
          onChange={(v) => onPatch({ content: v })}
        />
      </div>
    </>
  );
}

function FigureFields({
  value,
  onPatch,
}: {
  value: FigureBlock;
  onPatch: (p: Partial<FigureBlock>) => void;
}): React.ReactElement {
  return (
    <>
      <label className="tituba-editview__field">
        <span className="lbl">ID média</span>
        <input
          type="number"
          value={value.image == null ? '' : String(value.image)}
          onChange={(e) => {
            const v = e.target.value;
            onPatch({ image: v === '' ? null : Number(v) });
          }}
        />
        <span className="hint">
          ID numérique du média à afficher (collection Médias).
        </span>
      </label>

      <label className="tituba-editview__field">
        <span className="lbl">Légende</span>
        <textarea
          rows={2}
          value={value.legende ?? ''}
          onChange={(e) => onPatch({ legende: e.target.value })}
        />
      </label>

      <label className="tituba-editview__field">
        <span className="lbl">Crédit / source</span>
        <input
          type="text"
          value={value.credit ?? ''}
          onChange={(e) => onPatch({ credit: e.target.value })}
        />
        <span className="hint">
          Ex&nbsp;: « Photo : Michel Rose, Paris, 2017 ».
        </span>
      </label>

      <label className="tituba-editview__field">
        <span className="lbl">Alignement</span>
        <select
          value={value.align ?? 'left'}
          onChange={(e) => onPatch({ align: e.target.value as FigureBlock['align'] })}
        >
          {(Object.keys(FIGURE_ALIGN_LABEL) as Array<keyof typeof FIGURE_ALIGN_LABEL>).map(
            (k) => (
              <option key={k} value={k}>
                {FIGURE_ALIGN_LABEL[k]}
              </option>
            ),
          )}
        </select>
      </label>
    </>
  );
}

function CitationFields({
  value,
  onPatch,
}: {
  value: CitationBlock;
  onPatch: (p: Partial<CitationBlock>) => void;
}): React.ReactElement {
  return (
    <>
      <label className="tituba-editview__field">
        <span className="lbl">Texte de la citation</span>
        <textarea
          rows={4}
          value={value.text ?? ''}
          onChange={(e) => onPatch({ text: e.target.value })}
          required
        />
      </label>

      <label className="tituba-editview__field">
        <span className="lbl">Source / attribution</span>
        <input
          type="text"
          value={value.source ?? ''}
          onChange={(e) => onPatch({ source: e.target.value })}
        />
        <span className="hint">
          Ex&nbsp;: « Puar (2007), p. 23 ». Affichée en petits caractères.
        </span>
      </label>
    </>
  );
}
