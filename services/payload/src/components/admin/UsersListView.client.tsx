'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;

type UserRole = 'root' | 'admin' | 'editor';
type UserStatus = 'pending' | 'active' | 'disabled';

type User = {
  id: number | string;
  email: string;
  displayName?: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string | null;
  updatedAt: string;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

type FilterRole = 'all' | UserRole;

const ROLE_LABEL: Record<UserRole, string> = {
  root: 'Root',
  admin: 'Admin',
  editor: 'Éditeur·ice',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'En attente',
  active: 'Actif',
  disabled: 'Désactivé',
};

function isoDate(d?: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

export default function UsersListViewClient(): React.ReactElement {
  const [users, setUsers] = useState<User[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<FilterRole>('all');

  // Modal d'invitation — formulaire email + role + displayName qui
  // POST /cms/api/users/invite (l'endpoint génère un token, persiste
  // un user pending, et envoie le mail). La création directe de user
  // est interdite côté schéma (Users.access.create = () => false), on
  // ne navigue donc PAS vers /collections/users/create (qui renvoie
  // Unauthorized).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'admin'>('editor');
  const [inviteName, setInviteName] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  function openInvite() {
    setInviteEmail('');
    setInviteRole('editor');
    setInviteName('');
    setInviteError(null);
    setInviteOpen(true);
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSubmitting(true);
    try {
      const res = await fetch('/cms/api/users/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          displayName: inviteName || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Invitation impossible');
      setInviteOpen(false);
      // Refresh la liste pour afficher le nouvel user pending
      setPage(1);
      setSearch((s) => s); // déclenche le useEffect
      // Force-fetch direct
      const params = new URLSearchParams();
      params.set('limit', String(PER_PAGE));
      params.set('page', '1');
      params.set('sort', '-updatedAt');
      params.set('depth', '0');
      const r = await fetch(`/cms/api/users?${params.toString()}`, {
        credentials: 'include',
      });
      if (r.ok) {
        const d = (await r.json()) as FetchResult<User>;
        setUsers(d.docs ?? []);
        setTotalDocs(d.totalDocs ?? 0);
        setTotalPages(d.totalPages ?? 1);
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setInviteSubmitting(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', '-updatedAt');
    params.set('depth', '0');
    if (search.trim()) params.append('where[email][like]', search.trim());
    if (role !== 'all') params.append('where[role][equals]', role);

    fetch(`/cms/api/users?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<User>) => {
        setUsers(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setUsers([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, role]);

  useEffect(() => setPage(1), [search, role]);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="users"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Utilisateurs' }]}
      topbarActions={
        <button
          type="button"
          className="carnet-btn carnet-btn--accent"
          onClick={openInvite}
        >
          Inviter un·e utilisateur·ice
        </button>
      }
    >
      {inviteOpen && (
        <div
          className="carnet-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !inviteSubmitting) setInviteOpen(false);
          }}
        >
          <form className="carnet-modal" onSubmit={submitInvite}>
            <header className="carnet-modal__header">
              <h2>Inviter un·e utilisateur·ice</h2>
              <button
                type="button"
                className="carnet-modal__close"
                onClick={() => !inviteSubmitting && setInviteOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {inviteError && (
              <div className="carnet-modal__error">Erreur : {inviteError}</div>
            )}

            <div className="carnet-modal__body">
              <label className="carnet-editview__field">
                <span className="lbl">Email</span>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">Nom affiché (optionnel)</span>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </label>
              <label className="carnet-editview__field">
                <span className="lbl">Rôle</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'editor' | 'admin')}
                >
                  <option value="editor">Éditeur·ice (édite le contenu)</option>
                  <option value="admin">Admin (peut aussi gérer les comptes)</option>
                </select>
                <span className="hint">
                  Un mail d&apos;invitation sera envoyé. Lien valable 7 jours.
                </span>
              </label>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={() => setInviteOpen(false)}
                disabled={inviteSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="carnet-btn carnet-btn--accent"
                disabled={inviteSubmitting}
              >
                {inviteSubmitting ? 'Envoi…' : 'Envoyer l’invitation'}
              </button>
            </footer>
          </form>
        </div>
      )}

      <div className="carnet-listview__toolbar">
        <div className="carnet-listview__search">
          <span className="ic" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher dans ${totalDocs} utilisateur·ice${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
        <label className="carnet-listview__filter">
          <span className="lbl">Rôle :</span>
          <select value={role} onChange={(e) => setRole(e.target.value as FilterRole)}>
            <option value="all">tous</option>
            <option value="root">Root</option>
            <option value="admin">Admin</option>
            <option value="editor">Éditeur·ice</option>
          </select>
        </label>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Nom affiché</div>
          <div role="columnheader">Email</div>
          <div role="columnheader">Rôle</div>
          <div role="columnheader">Statut</div>
          <div role="columnheader">Dernière connexion</div>
        </div>

        {loading && users.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : users.length === 0 ? (
          <div className="carnet-listview__empty">Aucun utilisateur·ice.</div>
        ) : (
          users.map((u) => (
            <Link
              key={u.id}
              href={`/cms/admin/collections/users/${u.id}`}
              className="carnet-listview__row"
              role="row"
            >
              <div role="cell" className="name">
                {u.displayName?.trim() || '—'}
              </div>
              <div role="cell" className="email">
                {u.email}
              </div>
              <div role="cell" className="role">
                <span className={`carnet-role carnet-role--${u.role}`}>
                  {ROLE_LABEL[u.role]}
                </span>
              </div>
              <div role="cell" className="status-cell">
                <span className={`carnet-status carnet-status--${u.status}`}>
                  <span className="carnet-status__dot" aria-hidden="true" />
                  {STATUS_LABEL[u.status]}
                </span>
              </div>
              <div role="cell" className="date">
                {isoDate(u.lastLoginAt)}
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
