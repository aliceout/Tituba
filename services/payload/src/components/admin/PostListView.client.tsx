'use client';

// PostListView (client) — vue Liste custom Posts qui matche le handoff
// admin (cf Design/design_handoff_admin/carnet-admin.html → ScreenList).
//
// Layout :
//   - Header : crumbs « Carnet / Billets », actions à droite (Exporter,
//     Nouveau billet ⌘N en accent)
//   - Titre h1 « Billets »
//   - Toolbar : recherche + 4 filtres dropdowns (Type / Pôle / Statut / Tri)
//   - Tableau custom (N° / Date / Type / Pôle / Titre / Statut chip)
//   - Pagination « Affichage 1-25 sur 47 · 25 par page » + flèches + pages
//
// Fetch via /cms/api/posts (cookies de session inclus). Filtres côté
// client, refetch à chaque changement.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type Theme = { id: number | string; slug: string; name: string };
type CarnetUser = { id: number | string; displayName?: string; email?: string };
type PostAuthor = {
  kind?: 'user' | 'external';
  user?: CarnetUser | number | string | null;
  name?: string | null;
};
type Post = {
  id: number | string;
  numero?: number;
  title: string;
  slug: string;
  type: 'analyse' | 'note' | 'fiche';
  themes?: Theme[] | null;
  authors?: PostAuthor[] | null;
  publishedAt: string;
  draft?: boolean;
  hasDraftZones?: boolean;
};

type FetchResult = {
  docs: Post[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

type FilterType = 'all' | 'analyse' | 'note' | 'fiche';
// Filtre Statut : 4 états de publication + 1 état orthogonal (zones
// brouillon dans le corps). Sélectionner « withDraftZones » remplace
// le filtre par état de publication — c'est mutuellement exclusif
// dans le dropdown.
type FilterStatut = 'all' | 'draft' | 'published' | 'scheduled' | 'withDraftZones';
type FilterScope = 'all' | 'mine';

const TYPE_LABELS: Record<Post['type'], string> = {
  analyse: 'Article',
  note: 'Note de lecture',
  fiche: 'Fiche',
};

function isoDate(d: string): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

function inferStatus(p: Post): 'draft' | 'scheduled' | 'published' {
  if (p.draft) return 'draft';
  if (p.publishedAt && new Date(p.publishedAt).getTime() > Date.now()) return 'scheduled';
  return 'published';
}

// Compose un label compact des auteur·ice·s pour la colonne Auteur·ice :
// 1 → « X », 2 → « X & Y », 3+ → « X et al. ». Pour les kind='user'
// peuplés (depth=1), on prend displayName puis email ; pour les
// externes (kind='external'), le champ name.
function formatAuthors(authors: Post['authors']): string {
  const list = (authors ?? [])
    .map((a) => {
      if (a.kind === 'external') return (a.name ?? '').trim();
      const u = a.user;
      if (u && typeof u === 'object') return (u.displayName || u.email || '').trim();
      return '';
    })
    .filter(Boolean);
  if (list.length === 0) return '—';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list[0]} et al.`;
}

const STATUS_LABEL: Record<'draft' | 'scheduled' | 'published', string> = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  published: 'Publié',
};

export default function PostListViewClient(): React.ReactElement {
  const [type, setType] = useState<FilterType>('all');
  const [pole, setPole] = useState<string>('all');
  const [statut, setStatut] = useState<FilterStatut>('all');
  // Défaut « Mes billets » : on filtre dès que /cms/api/users/me a
  // résolu currentUserId. Tant que c'est null, aucun filtre author
  // n'est appliqué (on tombe sur tous les billets le temps du load).
  const [scope, setScope] = useState<FilterScope>('mine');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [posts, setPosts] = useState<Post[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bump pour relancer le fetch après une suppression.
  const [refreshTick, setRefreshTick] = useState(0);

  // Modale de confirmation de suppression. `target` = le billet à
  // supprimer ; null = modale fermée.
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [themes, setThemes] = useState<Theme[]>([]);
  // ID de l'utilisateur·rice connecté·e — sert à filtrer « Mes billets ».
  // Récupéré via /cms/api/users/me. null tant que pas chargé.
  const [currentUserId, setCurrentUserId] = useState<number | string | null>(null);
  // True dès que /me a résolu (succès ou échec). Sert à attendre la
  // valeur de currentUserId avant le premier fetch quand le scope par
  // défaut est « mine » — sinon on flash tous les billets pendant que
  // /me se charge.
  const [meResolved, setMeResolved] = useState(false);

  // Fetch initial des thèmes (pour le filtre Pôle) + user courant
  useEffect(() => {
    fetch('/cms/api/themes?limit=100&depth=0&sort=name', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { docs: Theme[] }) => setThemes(data.docs ?? []))
      .catch(() => setThemes([]));
    fetch('/cms/api/users/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { user?: { id?: number | string } }) => {
        if (data.user?.id != null) setCurrentUserId(data.user.id);
      })
      .catch(() => {
        // Silencieux : si /me échoue, on désactive juste le filtre.
      })
      .finally(() => setMeResolved(true));
  }, []);

  // Fetch des posts à chaque changement de filtre/tri/page
  useEffect(() => {
    // Quand scope='mine', attendre que /me ait résolu pour ne pas
    // afficher tous les billets l'instant d'avant que le filtre author
    // ne soit appliqué. On reste sur l'état loading.
    if (scope === 'mine' && !meResolved) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('depth', '1');
    params.set('sort', '-publishedAt');

    if (type !== 'all') {
      params.append('where[type][equals]', type);
    }
    if (pole !== 'all') {
      params.append('where[themes.slug][equals]', pole);
    }
    if (statut === 'draft') {
      params.append('where[draft][equals]', 'true');
    } else if (statut === 'published') {
      params.append('where[draft][equals]', 'false');
      params.append('where[publishedAt][less_than_equal]', new Date().toISOString());
    } else if (statut === 'scheduled') {
      params.append('where[draft][equals]', 'false');
      params.append('where[publishedAt][greater_than]', new Date().toISOString());
    } else if (statut === 'withDraftZones') {
      params.append('where[hasDraftZones][equals]', 'true');
    }
    if (scope === 'mine' && currentUserId != null) {
      // Filtre par billets dont la liste authors[] contient un kind=user
      // pointant sur l'utilisateur·rice connecté·e. Payload supporte la
      // notation pointée pour les arrays imbriqués.
      params.append('where[authors.user][equals]', String(currentUserId));
    }
    if (search.trim()) {
      params.append('where[title][like]', search.trim());
    }

    fetch(`/cms/api/posts?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult) => {
        setPosts(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setPosts([]);
      })
      .finally(() => setLoading(false));
  }, [type, pole, statut, scope, currentUserId, meResolved, page, search, refreshTick]);

  // Reset page=1 quand un filtre change (sinon on peut être sur p2 d'un filtre vide)
  useEffect(() => {
    setPage(1);
  }, [type, pole, statut, scope, search]);

  const themeOptions = useMemo(
    () => [{ slug: 'all', name: 'tous' }, ...themes],
    [themes],
  );

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/cms/api/posts/${encodeURIComponent(String(deleteTarget.id))}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteTarget(null);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <CarnetPage
      variant="listview"
      modifier="posts"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Billets' }]}
      topbarActions={
        <>
          <button
            type="button"
            className="carnet-btn carnet-btn--ghost"
            onClick={() => alert('Export à venir (issue v2)')}
          >
            Exporter
          </button>
          <Link
            href="/cms/admin/collections/posts/create"
            className="carnet-btn carnet-btn--accent"
          >
            Nouveau billet
          </Link>
        </>
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
            placeholder={`Rechercher dans ${totalDocs} billet${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>

        <label className="carnet-listview__filter">
          <span className="lbl">Type :</span>
          <select value={type} onChange={(e) => setType(e.target.value as FilterType)}>
            <option value="all">tous</option>
            <option value="analyse">Analyse</option>
            <option value="note">Note de lecture</option>
            <option value="fiche">Fiche</option>
          </select>
        </label>

        <label className="carnet-listview__filter">
          <span className="lbl">Thème :</span>
          <select value={pole} onChange={(e) => setPole(e.target.value)}>
            {themeOptions.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="carnet-listview__filter">
          <span className="lbl">Statut :</span>
          <select value={statut} onChange={(e) => setStatut(e.target.value as FilterStatut)}>
            <option value="all">tous</option>
            <option value="draft">Brouillon</option>
            <option value="scheduled">Planifié</option>
            <option value="published">Publié</option>
            <option value="withDraftZones">Zone brouillon</option>
          </select>
        </label>

        <label className="carnet-listview__filter">
          <span className="lbl">Périmètre :</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as FilterScope)}
          >
            <option value="all">Tous les billets</option>
            <option value="mine" disabled={currentUserId == null}>
              Mes billets
            </option>
          </select>
        </label>

      </div>

      {error && (
        <div className="carnet-listview__error">Erreur : {error}</div>
      )}

      <div className="carnet-listview__table" role="table">
        <div
          className={`carnet-listview__row carnet-listview__row--head${
            scope === 'all' ? ' carnet-listview__row--with-authors' : ''
          }`}
          role="row"
        >
          <div role="columnheader">Titre</div>
          {scope === 'all' && <div role="columnheader">Auteur·ice</div>}
          <div role="columnheader">Type</div>
          <div role="columnheader">Thème</div>
          <div role="columnheader">Date</div>
          <div role="columnheader">Statut</div>
          <div role="columnheader" aria-label="Supprimer" />
        </div>

        {loading && posts.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : posts.length === 0 ? (
          <div className="carnet-listview__empty">Aucun billet ne correspond aux filtres.</div>
        ) : (
          posts.map((p) => {
            const status = inferStatus(p);
            const primaryTheme = (p.themes ?? [])[0];
            return (
              <Link
                key={p.id}
                href={`/cms/admin/collections/posts/${p.id}`}
                className={`carnet-listview__row${
                  scope === 'all' ? ' carnet-listview__row--with-authors' : ''
                }`}
                role="row"
              >
                <div role="cell" className="title">
                  {p.title}
                </div>
                {scope === 'all' && (
                  <div role="cell" className="authors">
                    {formatAuthors(p.authors)}
                  </div>
                )}
                <div role="cell" className="type">
                  {TYPE_LABELS[p.type]}
                </div>
                <div role="cell" className="theme">
                  {primaryTheme?.name ?? '—'}
                </div>
                <div role="cell" className="date">
                  <span className="date__value">{isoDate(p.publishedAt)}</span>
                  {p.hasDraftZones && (
                    <span
                      className="carnet-chip-draft"
                      title="Ce billet contient au moins une zone brouillon non finalisée"
                    >
                      Brouillon
                    </span>
                  )}
                </div>
                <div role="cell" className="status">
                  <span className={`carnet-status carnet-status--${status}`}>
                    <span className="carnet-status__dot" aria-hidden="true" />
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div role="cell">
                  <button
                    type="button"
                    className="row-delete"
                    aria-label={`Supprimer ${p.title}`}
                    title="Supprimer ce billet"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget(p);
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
            if (e.target === e.currentTarget && !deleteSubmitting) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
        >
          <div className="carnet-modal" role="dialog" aria-modal="true">
            <header className="carnet-modal__header">
              <h2>Supprimer ce billet ?</h2>
              <button
                type="button"
                className="carnet-modal__close"
                onClick={() => {
                  if (deleteSubmitting) return;
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
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
                «&nbsp;{deleteTarget.title}&nbsp;» sera définitivement supprimé. Cette action est irréversible.
              </p>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={() => {
                  setDeleteTarget(null);
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
