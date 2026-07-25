'use client';

// UserEditView (client) — vue Édition custom d'un compte user, alignée
// sur le langage visuel du reste de l'admin Carnet (CarnetTopbar +
// .carnet-editview).
//
// Layout :
//   CarnetTopbar : crumbs Carnet / Utilisateurs / [email] + Sauvegarder
//   hero         : h1 « Utilisateur·ice »
//   section Identification : Email (readonly) · Nom affiché
//   section Rôle : select root / admin / éditeur·ice — disabled selon
//                  les ACLs (target=root ou viewer pas habilité)
//   section Sécurité (admin) : Force Unlock
//   section Sécurité (self)  : embed AccountSecurity (2FA + trusted
//                              devices). Visible uniquement si on
//                              consulte son propre profil.
//   sidebar : Statut · Last activity · Last login (readonly)
//   section --danger : Supprimer ce compte (modale), masquée si role=root
//
// Fetch / save via /cms/api/users/[id] (cookies de session).
// /cms/api/users/me sert à connaître le rôle/viewer-id, pour gérer
// les conditions d'affichage des actions.

import React, { useEffect, useState } from 'react';

import AccountSecurity from '@/components/auth/AccountSecurity.client';

import CarnetPage from './CarnetPage';

const API_USERS = '/cms/api/users';

type UserRole = 'root' | 'admin' | 'editor';
type UserStatus = 'pending' | 'active' | 'disabled';

type User = {
  id: number | string;
  email: string;
  displayName?: string | null;
  role: UserRole;
  status: UserStatus;
  lastActivityAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  loginAttempts?: number | null;
  lockUntil?: string | null;
};

type Me = {
  id: number | string;
  role: UserRole;
};

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

function isoDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UserEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('editor');
  const [initialJson, setInitialJson] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // État du bouton Force Unlock (action ponctuelle, pas un toggle).
  const [unlocking, setUnlocking] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null);

  // Modale de confirmation de suppression.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch parallèle : user cible + /me (pour connaître le rôle viewer).
  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setError('Création directe interdite — passez par « Inviter ».');
      return;
    }
    setLoading(true);
    setError(null);

    const userP = fetch(`${API_USERS}/${encodeURIComponent(docId)}?depth=0`, {
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: User) => {
        setUser(doc);
        setDisplayName(doc.displayName ?? '');
        setRole(doc.role);
        setInitialJson(JSON.stringify({ displayName: doc.displayName ?? '', role: doc.role }));
      });

    const meP = fetch(`${API_USERS}/me?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { user?: Me } | null) => {
        if (res && res.user) setMe(res.user);
      })
      .catch(() => {
        // silencieux : si /me échoue, on tombe sur le mode safe
        // (boutons admin masqués).
      });

    Promise.all([userP, meP])
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));
  }, [docId]);

  const dirty = JSON.stringify({ displayName, role }) !== initialJson;

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const body: Partial<User> = { displayName };
      // Inclut role uniquement s'il a changé — évite que le serveur
      // rejette la requête sur un champ readonly côté ACL pour les
      // editor qui sauvegardent leur displayName.
      const initial = JSON.parse(initialJson) as { role?: UserRole };
      if (role !== initial.role) body.role = role;

      const res = await fetch(`${API_USERS}/${encodeURIComponent(String(user.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: User } | User;
      const fresh = ((json as { doc?: User }).doc ?? (json as User)) as User;
      setUser(fresh);
      setDisplayName(fresh.displayName ?? '');
      setRole(fresh.role);
      setInitialJson(
        JSON.stringify({ displayName: fresh.displayName ?? '', role: fresh.role }),
      );
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  async function forceUnlock() {
    if (!user) return;
    setUnlocking(true);
    setUnlockMsg(null);
    try {
      // Endpoint Payload natif : POST /api/users/unlock { email }.
      // Réinitialise loginAttempts + lockUntil sur le doc cible.
      const res = await fetch(`${API_USERS}/unlock`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUnlockMsg('Compte déverrouillé.');
      // Refetch pour rafraîchir loginAttempts/lockUntil
      const refresh = await fetch(`${API_USERS}/${encodeURIComponent(String(user.id))}?depth=0`, {
        credentials: 'include',
      });
      if (refresh.ok) setUser((await refresh.json()) as User);
    } catch (err) {
      setUnlockMsg(err instanceof Error ? `Échec : ${err.message}` : 'Échec');
    } finally {
      setUnlocking(false);
    }
  }

  async function deleteUser() {
    if (!user) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_USERS}/${encodeURIComponent(String(user.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/cms/admin/collections/users';
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
  }, [dirty, saving, displayName, role, user]);

  // Conditions de visibilité.
  const isSelf =
    me != null && user != null && String(me.id) === String(user.id);
  const isAdmin = me?.role === 'admin' || me?.role === 'root';
  const isTargetRoot = user?.role === 'root';
  // Le rôle ne se modifie pas si la cible est root, ou si le viewer
  // n'est pas admin/root, ou si on regarde son propre profil
  // (canMutateRole côté serveur interdit l'auto-promotion).
  const roleEditable = isAdmin && !isTargetRoot && !isSelf;
  // Compte verrouillé par maxLoginAttempts ?
  const isLocked =
    !!user &&
    typeof user.lockUntil === 'string' &&
    new Date(user.lockUntil).getTime() > Date.now();
  // Suppression : admin/root, jamais le compte root.
  const canDelete = isAdmin && !isTargetRoot;

  return (
    <CarnetPage
      variant="editview"
      modifier="user"
      // Layout 2-colonnes via .carnet-postedit__doc à l'intérieur :
      // pas de padding latéral sur le body pour que le grid prenne
      // toute la largeur (le __center interne a son propre padding).
      fullWidth
      crumbs={[
        { href: '/cms/admin', label: 'Carnet' },
        { href: '/cms/admin/collections/users', label: 'Utilisateurs' },
        { label: user?.email ?? (docId ? '—' : 'nouveau') },
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
        </>
      }
    >
      {error && <div className="carnet-editview__error">Erreur : {error}</div>}

      {loading || !user ? (
        <div className="carnet-editview__loading">Chargement…</div>
      ) : (
        <div className="carnet-postedit__doc">
          <form
            className="carnet-postedit__center carnet-editview__form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="carnet-editview__hero">
              <h1 className="carnet-h1">Utilisateur·ice</h1>
              <p className="carnet-editview__hero-key">
                <span className={`carnet-role carnet-role--${user.role}`}>
                  {ROLE_LABEL[user.role]}
                </span>
              </p>
            </div>

            <section className="carnet-editview__section">
              <h2 className="carnet-editview__section-title">Identification</h2>

              <label className="carnet-editview__field carnet-editview__field--readonly">
                <span className="lbl">Email</span>
                <input type="email" value={user.email} readOnly disabled />
                <span className="hint">
                  Le changement d&apos;email passe par le support — pas modifiable ici.
                </span>
              </label>

              <label className="carnet-editview__field">
                <span className="lbl">Nom affiché</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <span className="hint">Affiché dans la nav et les en-têtes admin.</span>
              </label>
            </section>

            <section className="carnet-editview__section">
              <h2 className="carnet-editview__section-title">Rôle</h2>

              <label className="carnet-editview__field">
                <span className="lbl">Rôle</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  disabled={!roleEditable}
                >
                  {/* Root n'apparaît que si la cible est déjà root —
                      sinon on ne peut pas y promouvoir (hook serveur). */}
                  {isTargetRoot && <option value="root">Root</option>}
                  <option value="admin">Admin</option>
                  <option value="editor">Éditeur·ice</option>
                </select>
                <span className="hint">
                  {isTargetRoot
                    ? 'Le rôle root est figé sur ce compte (1 seul, non modifiable).'
                    : !isAdmin
                      ? 'Seul un compte admin ou root peut modifier le rôle.'
                      : isSelf
                        ? 'Vous ne pouvez pas modifier votre propre rôle.'
                        : 'Root = propriétaire (verrouillé). Admin = gère les comptes. Éditeur·ice = édite le contenu.'}
                </span>
              </label>
            </section>

            {(isAdmin || isSelf) && (
              <section className="carnet-editview__section">
                <h2 className="carnet-editview__section-title">Sécurité</h2>

                {isAdmin && (
                  <div className="carnet-editview__field">
                    <span className="lbl">Verrouillage de connexion</span>
                    <div className="carnet-editview__inline-action">
                      <span className="hint">
                        {isLocked
                          ? `Compte verrouillé (échec de connexion répété, jusqu'à ${isoDateTime(
                              user.lockUntil,
                            )}).`
                          : `Compteur d'échecs : ${user.loginAttempts ?? 0}.`}
                      </span>
                      <button
                        type="button"
                        className="carnet-btn carnet-btn--ghost"
                        onClick={() => void forceUnlock()}
                        disabled={unlocking}
                      >
                        {unlocking ? 'Déverrouillage…' : 'Force unlock'}
                      </button>
                    </div>
                    {unlockMsg && (
                      <span className="carnet-editview__inline-feedback">{unlockMsg}</span>
                    )}
                  </div>
                )}

                {isSelf && <AccountSecurity />}

                {!isSelf && !isAdmin && (
                  <p className="carnet-editview__section-help">
                    Aucune action de sécurité disponible sur ce profil.
                  </p>
                )}
              </section>
            )}

            {canDelete && (
              <section className="carnet-editview__section carnet-editview__section--danger">
                <button
                  type="button"
                  className="carnet-postedit__delete"
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteError(null);
                  }}
                >
                  Supprimer ce compte
                </button>
              </section>
            )}
          </form>

          <aside className="carnet-postedit__meta">
            <h3>Métadonnées</h3>

            <div className="field">
              <label>Statut</label>
              <span className={`carnet-status carnet-status--${user.status}`}>
                <span className="carnet-status__dot" aria-hidden="true" />
                {STATUS_LABEL[user.status]}
              </span>
              <div className="help">
                Géré automatiquement par le système d&apos;invitation.
              </div>
            </div>

            <hr />
            <h3>Activité</h3>

            <div className="field">
              <label>Dernière activité</label>
              <div className="auto">{isoDateTime(user.lastActivityAt)}</div>
            </div>
            <div className="field">
              <label>Dernière connexion</label>
              <div className="auto">{isoDateTime(user.lastLoginAt)}</div>
            </div>

            {(user.createdAt || user.updatedAt) && (
              <>
                <hr />
                <h3>Historique</h3>
                {user.createdAt && (
                  <div className="field">
                    <label>Créé le</label>
                    <div className="auto">{isoDateTime(user.createdAt)}</div>
                  </div>
                )}
                {user.updatedAt && (
                  <div className="field">
                    <label>Mis à jour</label>
                    <div className="auto">{isoDateTime(user.updatedAt)}</div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
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
              <h2>Supprimer ce compte&nbsp;?</h2>
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
                Le compte «&nbsp;{user?.email}&nbsp;» sera définitivement supprimé.
                Les billets dont il/elle est auteur·ice seront conservés mais
                le rattachement à ce compte sera perdu.
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
                onClick={() => void deleteUser()}
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
