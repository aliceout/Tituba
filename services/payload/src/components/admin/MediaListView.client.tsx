'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type MediaDoc = {
  id: number | string;
  filename?: string;
  mimeType?: string;
  filesize?: number;
  width?: number;
  height?: number;
  alt?: string;
  url?: string;
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

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortMime(mimeType?: string): string {
  if (!mimeType) return '—';
  // image/jpeg → jpeg, application/pdf → pdf
  return mimeType.split('/').pop() || mimeType;
}

export default function MediaListViewClient(): React.ReactElement {
  const [media, setMedia] = useState<MediaDoc[]>([]);
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
    if (search.trim()) params.append('where[filename][like]', search.trim());

    fetch(`/cms/api/media?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<MediaDoc>) => {
        setMedia(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setMedia([]);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => setPage(1), [search]);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="media"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Médias' }]}
      topbarActions={
        <Link
          href="/cms/admin/collections/media/create"
          className="carnet-btn carnet-btn--accent"
        >
          Nouveau média
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
            placeholder={`Rechercher dans ${totalDocs} média${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Aperçu</div>
          <div role="columnheader">Fichier</div>
          <div role="columnheader">Type</div>
          <div role="columnheader">Taille</div>
          <div role="columnheader">Mise à jour</div>
        </div>

        {loading && media.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : media.length === 0 ? (
          <div className="carnet-listview__empty">Aucun média.</div>
        ) : (
          media.map((m) => {
            const thumbUrl =
              m.url ||
              (m.filename ? `/cms/api/media/file/${encodeURIComponent(m.filename)}` : null);
            const isImage = (m.mimeType ?? '').startsWith('image/');
            return (
              <Link
                key={m.id}
                href={`/cms/admin/collections/media/${m.id}`}
                className="carnet-listview__row"
                role="row"
              >
                <div role="cell" className="thumb">
                  {isImage && thumbUrl ? (
                    <img src={thumbUrl} alt={m.alt ?? m.filename ?? ''} loading="lazy" />
                  ) : (
                    <span className="thumb-fallback" aria-hidden="true">
                      ▢
                    </span>
                  )}
                </div>
                <div role="cell" className="filename">
                  {m.filename ?? '—'}
                </div>
                <div role="cell" className="type-cell">
                  {shortMime(m.mimeType)}
                </div>
                <div role="cell" className="size">
                  {formatSize(m.filesize)}
                </div>
                <div role="cell" className="date">
                  {isoDate(m.updatedAt)}
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
    </CarnetPage>
  );
}
