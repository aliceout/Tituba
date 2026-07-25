'use client';

// BibliographyEditView (client) — vue Édition custom d'une référence
// bibliographique. Layout :
//
//   CarnetTopbar : crumbs Carnet / Bibliographie / [slug] + Supprimer
//                  + Sauvegarder
//   .carnet-editview__hero : h1 « Référence bibliographique » +
//                            « clé : <slug> » mono
//   section Identification : Type / Auteur·ice(s) / Année · Titre
//   section Publication    : Éditeur ou Revue · Lieu · Volume ·
//                            Collection · Pages · URL · DOI
//   section Notes          : Annotation personnelle (textarea)
//   .biblio-preview        : aperçu Chicago author-date live
//   used-in                : billets qui utilisent cette référence
//
// Fetch / save via /cms/api/bibliography/[id] (cookies de session).

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';
import {
  type BibAuthor,
  formatAuthorsChicago,
  formatTranslators,
} from '@/lib/format-authors';

const API_BIBLIO = '/cms/api/bibliography';
const API_POSTS = '/cms/api/posts';

type BibType = 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';
type BibRole = 'author' | 'editor' | 'translator';

const TYPE_LABEL: Record<BibType, string> = {
  book: 'Livre',
  chapter: 'Chapitre',
  article: 'Article',
  paper: 'Document de travail',
  web: 'Web',
  other: 'Autre',
};

const ROLE_LABEL: Record<BibRole, string> = {
  author: 'Auteur·ice',
  editor: 'Direction (dir.)',
  translator: 'Traduction (trad.)',
};

type BibAuthorRow = {
  lastName: string;
  firstName: string;
  role: BibRole;
};

type Bib = {
  id?: number | string;
  slug: string;
  type: BibType;
  authors: BibAuthorRow[];
  year: number | string;
  title: string;
  publisher?: string;
  place?: string;
  volume?: string;
  journal?: string;
  pages?: string;
  url?: string;
  doi?: string;
  annotation?: string;
  source?: 'manual' | 'zotero';
  zoteroKey?: string;
  zoteroVersion?: number;
};

type UsedInPost = { id: number | string; numero?: number; title?: string };

const EMPTY: Bib = {
  slug: '',
  type: 'book',
  authors: [{ lastName: '', firstName: '', role: 'author' }],
  year: '',
  title: '',
  publisher: '',
  place: '',
  volume: '',
  journal: '',
  pages: '',
  url: '',
  doi: '',
  annotation: '',
  source: 'manual',
};

function formatChicago(b: Bib): string {
  const parts: string[] = [];
  const authorsLine = formatAuthorsChicago(b.authors as BibAuthor[]);
  if (authorsLine) parts.push(authorsLine);
  if (b.year !== undefined && b.year !== '') parts.push(`(${b.year})`);
  if (b.title) parts.push(b.title);
  const translators = formatTranslators(b.authors as BibAuthor[]);
  if (translators) parts.push(translators);
  if (b.journal) parts.push(b.journal);
  if (b.volume) parts.push(b.volume);
  if (b.publisher) {
    parts.push(b.place ? `${b.place}, ${b.publisher}` : b.publisher);
  } else if (b.place) {
    parts.push(b.place);
  }
  if (b.pages) parts.push(`p. ${b.pages}`);
  return parts.filter(Boolean).join(', ') + '.';
}

function pad3(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return String(n).padStart(3, '0');
}

export default function BibliographyEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const [data, setData] = useState<Bib>(EMPTY);
  const [initial, setInitial] = useState<string>(JSON.stringify(EMPTY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Modale de confirmation de suppression (remplace window.confirm).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [usedIn, setUsedIn] = useState<UsedInPost[]>([]);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setInitial(JSON.stringify(EMPTY));
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API_BIBLIO}/${encodeURIComponent(docId)}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: Partial<Bib> & { authors?: Array<Partial<BibAuthorRow>> }) => {
        const authorsRaw = Array.isArray(doc.authors) ? doc.authors : [];
        const authors: BibAuthorRow[] = authorsRaw.map((a) => ({
          lastName: a?.lastName ?? '',
          firstName: a?.firstName ?? '',
          role: (a?.role as BibRole) ?? 'author',
        }));
        const norm: Bib = {
          ...EMPTY,
          ...doc,
          // Normalise les undefined en chaînes vides pour les inputs
          slug: doc.slug ?? '',
          authors: authors.length > 0 ? authors : [{ lastName: '', firstName: '', role: 'author' }],
          title: doc.title ?? '',
          year: doc.year ?? '',
          publisher: doc.publisher ?? '',
          place: doc.place ?? '',
          volume: doc.volume ?? '',
          journal: doc.journal ?? '',
          pages: doc.pages ?? '',
          url: doc.url ?? '',
          doi: doc.doi ?? '',
          annotation: doc.annotation ?? '',
          type: (doc.type as BibType) ?? 'book',
          id: doc.id,
        };
        setData(norm);
        setInitial(JSON.stringify(norm));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));

    // Fetch used-in posts
    fetch(
      `${API_POSTS}?where[bibliography][in]=${encodeURIComponent(docId)}&limit=50&depth=0&sort=-publishedAt`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: UsedInPost[] }) => setUsedIn(res.docs ?? []))
      .catch(() => setUsedIn([]));
  }, [docId]);

  const dirty = JSON.stringify(data) !== initial;

  function patch<K extends keyof Bib>(key: K, value: Bib[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function patchAuthor(idx: number, field: keyof BibAuthorRow, value: string) {
    setData((d) => {
      const next = d.authors.map((a, i) => (i === idx ? { ...a, [field]: value } : a));
      return { ...d, authors: next };
    });
  }

  function addAuthor() {
    setData((d) => ({
      ...d,
      authors: [...d.authors, { lastName: '', firstName: '', role: 'author' }],
    }));
  }

  function removeAuthor(idx: number) {
    setData((d) => {
      const next = d.authors.filter((_, i) => i !== idx);
      // Garder au moins une ligne (vide) pour ne pas casser le formulaire.
      if (next.length === 0) next.push({ lastName: '', firstName: '', role: 'author' });
      return { ...d, authors: next };
    });
  }

  function moveAuthor(idx: number, dir: -1 | 1) {
    setData((d) => {
      const j = idx + dir;
      if (j < 0 || j >= d.authors.length) return d;
      const next = [...d.authors];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...d, authors: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { ...data };
      const url =
        data.id != null && data.id !== ''
          ? `${API_BIBLIO}/${encodeURIComponent(String(data.id))}`
          : API_BIBLIO;
      const method = data.id != null && data.id !== '' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: Bib } | Bib;
      const fresh: Bib = (json as { doc?: Bib }).doc ?? (json as Bib);
      const norm: Bib = { ...EMPTY, ...fresh };
      setData(norm);
      setInitial(JSON.stringify(norm));
      setSavedAt(Date.now());
      if (!docId && fresh.id != null) {
        const path = `/cms/admin/collections/bibliography/${fresh.id}`;
        if (typeof window !== 'undefined') window.history.replaceState(null, '', path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!data.id) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BIBLIO}/${encodeURIComponent(String(data.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/cms/admin/collections/bibliography';
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

  // Pour articles / papers : « Numéro » à la place de « Collection »
  const isJournalLike = data.type === 'article' || data.type === 'paper';
  const middleFieldLabel = isJournalLike ? 'Numéro' : 'Collection';

  // Refs venues du sync Zotero — verrouillées en édition côté Carnet
  // (les modifs se font dans Zotero puis un nouveau sync les remonte).
  // La suppression reste possible : l'autrice peut décider de retirer
  // une ref du Carnet sans toucher Zotero.
  const isZoteroRef = data.source === 'zotero';

  return (
    <CarnetPage
      variant="editview"
      modifier="biblio"
      crumbs={[
        { href: '/cms/admin', label: 'Carnet' },
        { href: '/cms/admin/collections/bibliography', label: 'Bibliographie' },
        { label: data.slug || (docId ? '—' : 'nouvelle') },
      ]}
      suppressHydrationWarningOnActions
      topbarActions={
        <>
          {dirty && (
            <span className="carnet-editview__dirty" aria-live="polite">
              Modifications non enregistrées
            </span>
          )}
          {!dirty && savedAt && (
            <span className="carnet-editview__saved" aria-live="polite">
              Enregistré
            </span>
          )}
          {data.id != null && (
            <button
              type="button"
              className="carnet-btn carnet-btn--ghost"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteError(null);
              }}
              disabled={saving}
              suppressHydrationWarning
            >
              Supprimer
            </button>
          )}
          {!isZoteroRef && (
            <button
              type="button"
              className="carnet-btn carnet-btn--accent"
              onClick={() => void save()}
              disabled={!dirty || saving || loading}
              title="Sauvegarder"
              suppressHydrationWarning
            >
              {saving ? 'Enregistrement…' : 'Sauvegarder'}
            </button>
          )}
        </>
      }
    >
      {error && <div className="carnet-editview__error">Erreur : {error}</div>}

      {loading ? (
        <div className="carnet-editview__loading">Chargement…</div>
      ) : (
        <form
          className="carnet-editview__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="carnet-editview__hero">
            <h1 className="carnet-h1">Référence bibliographique</h1>
            {data.slug && (
              <p className="carnet-editview__hero-key">
                clé : <span className="mono">{data.slug}</span>
              </p>
            )}
          </div>

          {isZoteroRef && (
            <div className="carnet-zotero-banner">
              Cette référence est importée depuis Zotero. Pour la modifier,
              éditez-la dans Zotero puis lancez un nouveau sync depuis votre
              page Compte. La suppression reste disponible si vous voulez la
              retirer du Carnet sans toucher à Zotero.
            </div>
          )}

          <fieldset className="carnet-editview__fieldset" disabled={isZoteroRef}>
          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Identification</h2>

            <div className="carnet-editview__row carnet-editview__row--2">
              <label className="carnet-editview__field">
                <span className="lbl">Type</span>
                <select
                  value={data.type}
                  onChange={(e) => patch('type', e.target.value as BibType)}
                >
                  {(Object.keys(TYPE_LABEL) as BibType[]).map((k) => (
                    <option key={k} value={k}>
                      {TYPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">Année</span>
                <input
                  type="number"
                  value={data.year === '' ? '' : data.year}
                  min={1700}
                  max={3000}
                  onChange={(e) =>
                    patch('year', e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </label>
            </div>

            <div className="carnet-editview__authors">
              <div className="carnet-editview__authors-head">
                <span className="lbl">Auteur·ice·s</span>
                <span className="hint">
                  La 1<sup>ère</sup> ligne = auteur·ice principal·e (utilisé pour la
                  citation courte et le tri). Laissez « Prénom » vide pour les auteurs
                  corporatifs (UNESCO…).
                </span>
              </div>
              {data.authors.map((a, idx) => (
                <div key={idx} className="carnet-editview__authors-row">
                  <input
                    type="text"
                    className="lastname"
                    placeholder="Nom"
                    value={a.lastName}
                    onChange={(e) => patchAuthor(idx, 'lastName', e.target.value)}
                  />
                  <input
                    type="text"
                    className="firstname"
                    placeholder="Prénom (optionnel)"
                    value={a.firstName}
                    onChange={(e) => patchAuthor(idx, 'firstName', e.target.value)}
                  />
                  <select
                    className="role"
                    value={a.role}
                    onChange={(e) => patchAuthor(idx, 'role', e.target.value)}
                  >
                    {(Object.keys(ROLE_LABEL) as BibRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <div className="actions">
                    <button
                      type="button"
                      className="carnet-editview__authors-act"
                      onClick={() => moveAuthor(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Monter"
                      title="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="carnet-editview__authors-act"
                      onClick={() => moveAuthor(idx, 1)}
                      disabled={idx === data.authors.length - 1}
                      aria-label="Descendre"
                      title="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="carnet-editview__authors-act carnet-editview__authors-act--del"
                      onClick={() => removeAuthor(idx)}
                      disabled={data.authors.length <= 1 && !a.lastName && !a.firstName}
                      aria-label="Retirer cette personne"
                      title="Retirer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="carnet-editview__authors-add"
                onClick={addAuthor}
              >
                + Ajouter une personne
              </button>
            </div>

            <label className="carnet-editview__field">
              <span className="lbl">Titre</span>
              <input
                type="text"
                value={data.title}
                onChange={(e) => patch('title', e.target.value)}
              />
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Slug</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => patch('slug', e.target.value)}
                placeholder="farris-2017"
              />
              <span className="hint">
                Clé courte, sert d’ancre <span className="mono">#bib-…</span> côté article.
              </span>
            </label>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Publication</h2>

            <div className="carnet-editview__row carnet-editview__row--2">
              <label className="carnet-editview__field">
                <span className="lbl">Éditeur / Revue</span>
                <input
                  type="text"
                  value={data.publisher ?? ''}
                  onChange={(e) => patch('publisher', e.target.value)}
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">Lieu</span>
                <input
                  type="text"
                  value={data.place ?? ''}
                  onChange={(e) => patch('place', e.target.value)}
                />
              </label>
            </div>

            <div className="carnet-editview__row carnet-editview__row--3">
              <label className="carnet-editview__field">
                <span className="lbl">Volume</span>
                <input
                  type="text"
                  value={data.volume ?? ''}
                  onChange={(e) => patch('volume', e.target.value)}
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">{middleFieldLabel}</span>
                <input
                  type="text"
                  value={data.journal ?? ''}
                  onChange={(e) => patch('journal', e.target.value)}
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">Pages</span>
                <input
                  type="text"
                  value={data.pages ?? ''}
                  onChange={(e) => patch('pages', e.target.value)}
                  placeholder="43-82"
                />
              </label>
            </div>

            <div className="carnet-editview__row carnet-editview__row--2">
              <label className="carnet-editview__field">
                <span className="lbl">URL</span>
                <input
                  type="url"
                  value={data.url ?? ''}
                  onChange={(e) => patch('url', e.target.value)}
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">DOI</span>
                <input
                  type="text"
                  value={data.doi ?? ''}
                  onChange={(e) => patch('doi', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Notes</h2>

            <label className="carnet-editview__field">
              <span className="lbl">Annotation personnelle</span>
              <textarea
                rows={4}
                value={data.annotation ?? ''}
                onChange={(e) => patch('annotation', e.target.value)}
              />
              <span className="hint">
                Optionnel — note de lecture, raison de l’inclusion, mémo de contexte.
                Non publié.
              </span>
            </label>
          </section>

          <div className="carnet-biblio-preview">
            <div className="carnet-biblio-preview__lbl">Aperçu (style biblio)</div>
            <div className="carnet-biblio-preview__body">{formatChicago(data)}</div>
          </div>
          </fieldset>

          {data.id != null && (
            <div className="carnet-biblio-usedin">
              {usedIn.length === 0 ? (
                <span>Cette référence n’est utilisée dans aucun billet pour l’instant.</span>
              ) : (
                <>
                  Utilisée dans {usedIn.length} billet{usedIn.length > 1 ? 's' : ''} :{' '}
                  {usedIn.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && ', '}
                      <Link href={`/cms/admin/collections/posts/${p.id}`}>
                        n°&nbsp;{pad3(p.numero)}
                      </Link>
                    </React.Fragment>
                  ))}
                </>
              )}
            </div>
          )}
        </form>
      )}

      {deleteOpen && (
        <div
          className="carnet-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSubmitting) {
              setDeleteOpen(false);
              setDeleteError(null);
            }
          }}
        >
          <div className="carnet-modal" role="dialog" aria-modal="true">
            <header className="carnet-modal__header">
              <h2>Supprimer cette référence&nbsp;?</h2>
              <button
                type="button"
                className="carnet-modal__close"
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
              <div className="carnet-modal__error">Erreur&nbsp;: {deleteError}</div>
            )}

            <div className="carnet-modal__body">
              <p>
                «&nbsp;{data.slug || data.title || data.id}&nbsp;» sera
                définitivement supprimée. Les billets qui la citent perdront
                la référence à la sauvegarde de cette modification.
              </p>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
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
                className="carnet-btn carnet-btn--danger"
                onClick={() => void confirmDelete()}
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
