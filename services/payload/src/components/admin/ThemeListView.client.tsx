'use client';

// ThemeListView (client) — vue Liste custom Thèmes : tableau slug+nom
// +description+compteur d'usages, recherche, pagination compacte.
//
// Pas de filtres autres que la recherche (le modèle Themes est simple :
// nom, slug, description). Le compteur d'usages est calculé via un find
// sur posts avec where[themes.slug][equals]=<slug>.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type Theme = {
  id: number | string;
  slug: string;
  name: string;
  description?: string | null;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

export default function ThemeListViewClient(): React.ReactElement {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
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
    params.set('sort', 'name');
    params.set('depth', '0');
    if (search.trim()) params.append('where[name][like]', search.trim());

    fetch(`/cms/api/themes?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: FetchResult<Theme>) => {
        setThemes(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);

        // Compteurs d'usages : un fetch par thème (parallèle).
        const countsMap = new Map<string, number>();
        await Promise.all(
          (data.docs ?? []).map(async (t) => {
            try {
              const r = await fetch(
                `/cms/api/posts?where[themes.slug][equals]=${encodeURIComponent(t.slug)}&limit=1&depth=0`,
                { credentials: 'include' },
              );
              if (r.ok) {
                const d = await r.json();
                countsMap.set(t.slug, d.totalDocs ?? 0);
              } else {
                countsMap.set(t.slug, 0);
              }
            } catch {
              countsMap.set(t.slug, 0);
            }
          }),
        );
        setCounts(countsMap);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setThemes([]);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => setPage(1), [search]);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="themes"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Thèmes' }]}
      topbarActions={
        <Link
          href="/cms/admin/collections/themes/create"
          className="carnet-btn carnet-btn--accent"
        >
          Nouveau thème
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
            placeholder={`Rechercher dans ${totalDocs} thème${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Nom</div>
          <div role="columnheader">Description</div>
          <div role="columnheader">Billets</div>
        </div>

        {loading && themes.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : themes.length === 0 ? (
          <div className="carnet-listview__empty">Aucun thème.</div>
        ) : (
          themes.map((t) => (
            <Link
              key={t.id}
              href={`/cms/admin/collections/themes/${t.id}`}
              className="carnet-listview__row"
              role="row"
            >
              <div role="cell" className="title">
                {t.name}
              </div>
              <div role="cell" className="desc">
                {t.description || '—'}
              </div>
              <div role="cell" className="count">
                {counts.get(t.slug) ?? '—'}
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
