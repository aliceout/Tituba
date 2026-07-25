'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type Page = {
  id: number | string;
  title: string;
  slug: string;
  updatedAt: string;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

function isoDate(d: string): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

export default function PagesListViewClient(): React.ReactElement {
  const [pages, setPages] = useState<Page[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', '-updatedAt');
    params.set('depth', '0');
    if (search.trim()) params.append('where[title][like]', search.trim());

    fetch(`/cms/api/pages?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<Page>) => {
        setPages(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setPages([]);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => setPage(1), [search]);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="pages"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Pages éditoriales' }]}
      topbarActions={
        <Link
          href="/cms/admin/collections/pages/create"
          className="carnet-btn carnet-btn--accent"
        >
          Nouvelle page
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
            placeholder={`Rechercher dans ${totalDocs} page${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Titre</div>
          <div role="columnheader">Slug</div>
          <div role="columnheader">Mise à jour</div>
        </div>

        {loading && pages.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : pages.length === 0 ? (
          <div className="carnet-listview__empty">Aucune page.</div>
        ) : (
          pages.map((p) => (
            <Link
              key={p.id}
              href={`/cms/admin/collections/pages/${p.id}`}
              className="carnet-listview__row"
              role="row"
            >
              <div role="cell" className="title">
                {p.title}
              </div>
              <div role="cell" className="slug">
                {p.slug}
              </div>
              <div role="cell" className="date">
                {isoDate(p.updatedAt)}
              </div>
            </Link>
          ))
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
    </CarnetPage>
  );
}
