'use client';

// Vue Liste custom pour la collection Subscribers — abonné·es aux
// alertes mail des nouveaux billets.
//
// Layout standard Carnet : crumbs, toolbar (search + filtre statut),
// table 4 colonnes (email · statut · inscription · confirmation),
// pagination. Le clic sur une ligne ouvre la vue Édition native
// Payload (où admin/root peut supprimer manuellement). Pas de bouton
// d'ajout : l'inscription se fait uniquement via le formulaire public
// sur /abonnement/ (la collection a create: () => false côté schéma).

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';

type Subscriber = {
  id: number | string;
  email: string;
  status: SubscriberStatus;
  subscribedAt?: string | null;
  confirmedAt?: string | null;
  unsubscribedAt?: string | null;
  updatedAt: string;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

type FilterStatus = 'all' | SubscriberStatus;

const STATUS_LABEL: Record<SubscriberStatus, string> = {
  pending: 'En attente',
  active: 'Actif·ve',
  unsubscribed: 'Désabonné·e',
};

function isoDate(d?: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

export default function SubscribersListViewClient(): React.ReactElement {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FilterStatus>('all');

  // Fetch principal — page, search, filtre statut.
  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', '-subscribedAt');
    params.set('depth', '0');
    if (search.trim()) params.append('where[email][like]', search.trim());
    if (status !== 'all') params.append('where[status][equals]', status);

    fetch(`/cms/api/subscribers?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<Subscriber>) => {
        setSubs(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setSubs([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => setPage(1), [search, status]);

  // Compteur d'actif·ves affiché dans la topbar — total indépendant
  // des filtres en cours (sinon la métrique change quand on filtre,
  // pas utile).
  useEffect(() => {
    const p = new URLSearchParams();
    p.set('limit', '1');
    p.set('depth', '0');
    p.append('where[status][equals]', 'active');
    fetch(`/cms/api/subscribers?${p.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FetchResult<Subscriber> | null) => {
        if (data) setActiveCount(data.totalDocs ?? 0);
      })
      .catch(() => {
        /* compteur best-effort */
      });
  }, []);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="subscribers"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Abonné·es' }]}
      topbarActions={
        activeCount !== null ? (
          <span className="carnet-listview__count">
            {activeCount} actif·ve{activeCount > 1 ? 's' : ''}
          </span>
        ) : null
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
            placeholder={`Rechercher dans ${totalDocs} abonné·e${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
        <label className="carnet-listview__filter">
          <span className="lbl">Statut :</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FilterStatus)}
          >
            <option value="all">tous</option>
            <option value="pending">En attente</option>
            <option value="active">Actif·ve</option>
            <option value="unsubscribed">Désabonné·e</option>
          </select>
        </label>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Email</div>
          <div role="columnheader">Statut</div>
          <div role="columnheader">Inscription</div>
          <div role="columnheader">Confirmation</div>
        </div>

        {loading && subs.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : subs.length === 0 ? (
          <div className="carnet-listview__empty">Aucun·e abonné·e.</div>
        ) : (
          subs.map((s) => (
            <Link
              key={s.id}
              href={`/cms/admin/collections/subscribers/${s.id}`}
              className="carnet-listview__row"
              role="row"
            >
              <div role="cell" className="email">
                {s.email}
              </div>
              <div role="cell" className="status-cell">
                <span className={`carnet-status carnet-status--${s.status}`}>
                  <span className="carnet-status__dot" aria-hidden="true" />
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <div role="cell" className="date">
                {isoDate(s.subscribedAt)}
              </div>
              <div role="cell" className="date">
                {isoDate(s.confirmedAt)}
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
