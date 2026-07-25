'use client';

// BibliographyListView (client) — vue Liste custom Bibliographie :
// recherche par auteur, filtre par type + provenance, bouton × par
// ligne pour supprimer (avec modale de confirmation). Les refs Zotero
// supprimées reviennent au prochain sync — l'autrice peut donc nettoyer
// sans crainte côté Carnet.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;
const API_BIBLIO = '/cms/api/bibliography';

type BiblioEntry = {
  id: number | string;
  slug: string;
  authorLabel?: string | null;
  authors?: Array<{ firstName?: string | null; lastName?: string | null }>;
  year: number;
  title: string;
  type: string;
  publisher?: string;
  journal?: string;
  source?: 'manual' | 'zotero';
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

type FilterType = 'all' | 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';
type FilterSource = 'all' | 'manual' | 'zotero';

const TYPE_LABEL: Record<Exclude<FilterType, 'all'>, string> = {
  book: 'Livre',
  chapter: 'Chapitre',
  article: 'Article',
  paper: 'Working paper',
  web: 'Web',
  other: 'Autre',
};

export default function BibliographyListViewClient(): React.ReactElement {
  const [entries, setEntries] = useState<BiblioEntry[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<FilterType>('all');
  const [source, setSource] = useState<FilterSource>('all');
  const [reloadKey, setReloadKey] = useState(0);

  // Modale de confirmation de suppression (target = ref à supprimer ;
  // null = fermée). Pattern aligné sur TagListView.
  const [deleteTarget, setDeleteTarget] = useState<BiblioEntry | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', 'authorLabel');
    params.set('depth', '0');
    if (search.trim()) params.append('where[authorLabel][like]', search.trim());
    if (type !== 'all') params.append('where[type][equals]', type);
    if (source !== 'all') params.append('where[source][equals]', source);

    fetch(`${API_BIBLIO}?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<BiblioEntry>) => {
        setEntries(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, type, source, reloadKey]);

  useEffect(() => setPage(1), [search, type, source]);

  function openDelete(entry: BiblioEntry) {
    setDeleteTarget(entry);
    setDeleteError(null);
  }

  function closeDelete() {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BIBLIO}/${encodeURIComponent(String(deleteTarget.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="biblio"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Bibliographie' }]}
      topbarActions={
        <Link
          href="/cms/admin/collections/bibliography/create"
          className="carnet-btn carnet-btn--accent"
        >
          Nouvelle référence
        </Link>
      }
    >
      <div className="carnet-listview__toolbar">
        <div className="carnet-listview__search">
          <span className="ic" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher par auteur dans ${totalDocs} référence${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
        <label className="carnet-listview__filter">
          <span className="lbl">Type :</span>
          <select value={type} onChange={(e) => setType(e.target.value as FilterType)}>
            <option value="all">tous</option>
            <option value="book">Livre</option>
            <option value="chapter">Chapitre</option>
            <option value="article">Article</option>
            <option value="paper">Working paper</option>
            <option value="web">Web</option>
            <option value="other">Autre</option>
          </select>
        </label>
        <label className="carnet-listview__filter">
          <span className="lbl">Provenance :</span>
          <select value={source} onChange={(e) => setSource(e.target.value as FilterSource)}>
            <option value="all">toutes</option>
            <option value="manual">Saisie manuelle</option>
            <option value="zotero">Zotero</option>
          </select>
        </label>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Prénom</div>
          <div role="columnheader">Nom</div>
          <div role="columnheader">Année</div>
          <div role="columnheader">Titre</div>
          <div role="columnheader">Éditeur / Revue</div>
          <div role="columnheader">Type</div>
          <div role="columnheader" aria-label="Actions" />
        </div>

        {loading && entries.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : entries.length === 0 ? (
          <div className="carnet-listview__empty">Aucune référence.</div>
        ) : (
          entries.map((b) => {
            const first = b.authors?.[0];
            const hasMore = (b.authors?.length ?? 0) > 1;
            return (
              <Link
                key={b.id}
                href={`/cms/admin/collections/bibliography/${b.id}`}
                className="carnet-listview__row"
                role="row"
              >
                <div role="cell" className="firstname">
                  {first?.firstName || '—'}
                </div>
                <div role="cell" className="lastname">
                  {first?.lastName || '—'}
                  {hasMore && <span className="lastname__etal"> et al.</span>}
                </div>
                <div role="cell" className="year">
                  {b.year}
                </div>
                <div role="cell" className="title">
                  {b.title}
                </div>
                <div role="cell" className="venue">
                  {b.publisher || b.journal || '—'}
                </div>
                <div role="cell" className="type-cell">
                  {TYPE_LABEL[b.type as Exclude<FilterType, 'all'>] ?? b.type}
                </div>
                <div role="cell">
                  <button
                    type="button"
                    className="row-delete"
                    aria-label={`Supprimer ${b.title}`}
                    title="Supprimer cette référence"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDelete(b);
                    }}
                  >
                    ×
                  </button>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="carnet-listview__pagination">
        <span className="carnet-listview__pagination-info">
          {totalDocs === 0
            ? 'Aucun résultat'
            : `Affichage ${startIdx}–${endIdx} sur ${totalDocs} · ${PER_PAGE} par page`}
        </span>
        {totalPages > 1 && (
          <div className="carnet-listview__pagination-pages">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Page précédente"
            >
              ←
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === page ? 'on' : ''}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Page suivante"
            >
              →
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div
          className="carnet-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDelete();
          }}
        >
          <div className="carnet-modal" role="dialog" aria-modal="true">
            <header className="carnet-modal__header">
              <h2>Supprimer cette référence ?</h2>
              <button
                type="button"
                className="carnet-modal__close"
                onClick={closeDelete}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {deleteError && (
              <div className="carnet-modal__error">Erreur : {deleteError}</div>
            )}

            <div className="carnet-modal__body">
              <p>
                «&nbsp;{deleteTarget.title}&nbsp;» sera supprimée du Carnet.
                {deleteTarget.source === 'zotero' && (
                  <>
                    {' '}Cette référence vient de Zotero — elle sera
                    réimportée au prochain sync.
                  </>
                )}
              </p>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={closeDelete}
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
