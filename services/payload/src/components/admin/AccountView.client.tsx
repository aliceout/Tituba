'use client';

// AccountView (client) — page Mon compte custom qui matche le langage
// visuel de l'admin Carnet (cf .carnet-listview / .carnet-btn).
//
// Layout :
//   - Header : crumbs « Carnet / Mon compte », actions Save accent
//   - Section Profil : displayName (éditable), email (read-only),
//     rôle (chip), statut (chip), dernière connexion (read-only)
//   - Section Sécurité : embed AccountSecurity (2FA, trusted devices)
//
// Fetch via /cms/api/users/me (cookies de session). Save via
// PATCH /cms/api/users/[id] avec uniquement les champs éditables
// (displayName) — les autres champs sont envoyés en read-only.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import AccountSecurity from '@/components/auth/AccountSecurity.client';

import CarnetPage from './CarnetPage';

const API_USERS = '/cms/api/users';

type UserRole = 'root' | 'admin' | 'editor';
type UserStatus = 'pending' | 'active' | 'disabled';

type Me = {
  id: number | string;
  email: string;
  displayName?: string | null;
  citationFormat?: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string | null;
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

function isoDateTime(d?: string | null): string {
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

export default function AccountViewClient(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [citationFormat, setCitationFormat] = useState('');
  const [initialJson, setInitialJson] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_USERS}/me?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((res: { user?: Me } | Me) => {
        const u = (res as { user?: Me }).user ?? (res as Me);
        setMe(u);
        const name = u.displayName ?? '';
        const cf = u.citationFormat ?? '';
        setDisplayName(name);
        setCitationFormat(cf);
        setInitialJson(JSON.stringify({ displayName: name, citationFormat: cf }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify({ displayName, citationFormat }) !== initialJson;

  async function save() {
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_USERS}/${encodeURIComponent(String(me.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, citationFormat }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      setInitialJson(JSON.stringify({ displayName, citationFormat }));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <CarnetPage
      variant="editview"
      modifier="account"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Mon compte' }]}
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
            onClick={save}
            disabled={!dirty || saving || loading}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      {error && <div className="carnet-editview__error">Erreur : {error}</div>}

      {loading || !me ? (
        <div className="carnet-editview__loading">Chargement…</div>
      ) : (
        <form
          className="carnet-editview__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Profil</h2>

            <label className="carnet-editview__field">
              <span className="lbl">Nom affiché</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <span className="hint">Affiché dans la nav et les en-têtes admin.</span>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Format citation (Chicago)</span>
              <input
                type="text"
                value={citationFormat}
                onChange={(e) => setCitationFormat(e.target.value)}
                placeholder="Ex : Dupont, M."
              />
              <span className="hint">
                Format « Nom, P. » utilisé pour vous dans le bloc « Pour citer
                » des billets. Si vide, la signature est dérivée
                automatiquement du nom affiché.
              </span>
            </label>

            <label className="carnet-editview__field carnet-editview__field--readonly">
              <span className="lbl">Email</span>
              <input type="email" value={me.email} readOnly disabled />
              <span className="hint">
                Le changement d&apos;email passe par le support — pas modifiable ici.
              </span>
            </label>

            <div className="carnet-editview__readonly-grid">
              <div className="carnet-editview__readonly">
                <span className="lbl">Rôle</span>
                <span className={`carnet-role carnet-role--${me.role}`}>
                  {ROLE_LABEL[me.role]}
                </span>
              </div>
              <div className="carnet-editview__readonly">
                <span className="lbl">Statut</span>
                <span className={`carnet-status carnet-status--${me.status}`}>
                  <span className="carnet-status__dot" aria-hidden="true" />
                  {STATUS_LABEL[me.status]}
                </span>
              </div>
              <div className="carnet-editview__readonly">
                <span className="lbl">Dernière connexion</span>
                <span className="carnet-editview__readonly-value mono">
                  {isoDateTime(me.lastLoginAt)}
                </span>
              </div>
            </div>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Bibliothèque Zotero</h2>
            <ZoteroSection />
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Sécurité</h2>
            <AccountSecurity />
          </section>
        </form>
      )}
    </CarnetPage>
  );
}

// ─── Section Zotero (sous-composant) ──────────────────────────────────
// Saisie de la clé API + ID utilisateur Zotero + actions : tester la
// connexion, sauvegarder, synchroniser maintenant, déconnecter.
//
// La clé API n'est jamais exposée par l'API : `apiKey.access.read`
// retourne false côté collection. L'UI obtient un état sanitisé via
// GET /me/zotero-status (configured + last4 pour l'indice visuel).
// Si l'utilisatrice tape dans le champ Clé API, la nouvelle valeur
// écrase la précédente ; si elle laisse vide, la clé persistée est
// conservée.

const API_ZOTERO = '/cms/api/users/me/zotero';
const API_ZOTERO_STATUS = '/cms/api/users/me/zotero-status';

type ZoteroStatus = {
  configured: boolean;
  last4: string | null;
  libraryId: string;
  libraryType: 'user' | 'group';
  lastSyncAt: string | null;
  lastSyncVersion: number | null;
  lastSyncAdded: number | null;
  lastSyncUpdated: number | null;
  lastSyncError: string | null;
};

type SyncResult = {
  ok: boolean;
  added: number;
  updated: number;
  deleted: number;
  keptCited: Array<{ key: string; title: string; postNumeros: number[] }>;
  errors: Array<{ key: string; title: string | null; reason: string }>;
  newVersion: number;
};

type TestResult = {
  ok: boolean;
  error?: string;
  itemCount?: number;
};

function ZoteroSection(): React.ReactElement {
  const [status, setStatus] = useState<ZoteroStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [libraryIdInput, setLibraryIdInput] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'sync' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Modale de confirmation de déconnexion (remplace window.confirm).
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  // Liste détaillée des items ignorés au dernier sync — affichée en
  // dessous du message « X items ignorés » pour permettre à l'autrice
  // d'identifier les refs à corriger dans Zotero. `title` est extrait
  // du doc Zotero quand il existe ; sinon on n'a que la clé.
  const [syncErrors, setSyncErrors] = useState<
    Array<{ key: string; title: string | null; reason: string }>
  >([]);
  // Refs supprimées côté Zotero mais conservées au Carnet parce qu'elles
  // sont encore citées dans des billets — affichées avec le numéro des
  // billets concernés pour permettre à l'autrice de retirer la citation
  // ou de garder la ref.
  const [syncKeptCited, setSyncKeptCited] = useState<
    Array<{ key: string; title: string; postNumeros: number[] }>
  >([]);

  const refresh = React.useCallback(() => {
    setError(null);
    fetch(API_ZOTERO_STATUS, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<ZoteroStatus>) : null))
      .then((res) => {
        if (res) {
          setStatus(res);
          setLibraryIdInput(res.libraryId ?? '');
        }
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue.');
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasKey = status?.configured === true;
  const dirty =
    apiKeyInput.length > 0 ||
    libraryIdInput !== (status?.libraryId ?? '');

  async function save() {
    setBusy('save');
    setError(null);
    setInfo(null);
    try {
      // libraryType: toujours 'user' (les bibliothèques de groupe sont
      // hors scope du Carnet — la biblio Zotero est intrinsèquement perso).
      const body: Record<string, unknown> = {
        libraryId: libraryIdInput.trim(),
        libraryType: 'user',
      };
      if (apiKeyInput.trim().length > 0) {
        body.apiKey = apiKeyInput.trim();
      }
      const res = await fetch(API_ZOTERO, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      setApiKeyInput('');
      setInfo('Configuration enregistrée.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${API_ZOTERO}-test`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as TestResult;
      if (!res.ok || !data.ok) {
        setError(data.error || `Échec du test (HTTP ${res.status}).`);
        return;
      }
      setInfo(
        data.itemCount !== undefined
          ? `Connexion OK — ${data.itemCount} item${data.itemCount > 1 ? 's' : ''} dans la bibliothèque Zotero.`
          : 'Connexion OK.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    setError(null);
    setInfo(null);
    setSyncErrors([]);
    setSyncKeptCited([]);
    try {
      const res = await fetch(`${API_ZOTERO}-sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as SyncResult & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || `Échec du sync (HTTP ${res.status}).`);
        return;
      }
      // Defensive defaults : un endpoint ancien (image prod pas encore
      // redéployée) pourrait ne pas renvoyer deleted/keptCited.
      const added = data.added ?? 0;
      const updated = data.updated ?? 0;
      const deleted = data.deleted ?? 0;
      const errors = data.errors ?? [];
      const keptCited = data.keptCited ?? [];

      const parts: string[] = [];
      if (added > 0) parts.push(`${added} ajoutée${added > 1 ? 's' : ''}`);
      if (updated > 0) parts.push(`${updated} mise${updated > 1 ? 's' : ''} à jour`);
      if (deleted > 0) parts.push(`${deleted} supprimée${deleted > 1 ? 's' : ''}`);
      if (parts.length === 0) parts.push('rien de neuf depuis Zotero');
      let msg = `Sync terminé — ${parts.join(', ')}.`;
      if (keptCited.length > 0) {
        msg += ` ${keptCited.length} ref${keptCited.length > 1 ? 's' : ''} supprimée${keptCited.length > 1 ? 's' : ''} côté Zotero mais conservée${keptCited.length > 1 ? 's' : ''} (encore citée${keptCited.length > 1 ? 's' : ''}) — voir le détail ci-dessous.`;
      }
      if (errors.length > 0) {
        msg += ` ${errors.length} item${errors.length > 1 ? 's' : ''} ignoré${errors.length > 1 ? 's' : ''} — voir le détail ci-dessous.`;
      }
      setInfo(msg);
      setSyncErrors(errors);
      setSyncKeptCited(keptCited);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  async function confirmDisconnect() {
    setBusy('disconnect');
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(API_ZOTERO, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      setApiKeyInput('');
      setInfo('Zotero déconnecté.');
      setDisconnectOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return <div className="carnet-zotero__loading">Chargement…</div>;
  }

  return (
    <div className="carnet-zotero">
      <p className="carnet-zotero__intro">
        Connectez votre bibliothèque Zotero pour qu’elle alimente
        automatiquement la liste de références disponibles dans le slash
        menu et le picker biblio des billets. Les modifications faites dans
        Zotero descendent au prochain sync ; les références importées sont
        en lecture seule côté Carnet.
      </p>

      <div className={`carnet-zotero__status carnet-zotero__status--${hasKey ? 'on' : 'off'}`}>
        <span className="dot" aria-hidden="true" />
        {hasKey ? 'Connecté à Zotero' : 'Non connecté'}
      </div>

      <div className="carnet-editview__row carnet-editview__row--2">
        <label className="carnet-editview__field">
          <span className="lbl">Clé API</span>
          <input
            type="password"
            value={apiKeyInput}
            placeholder={
              hasKey
                ? status?.last4
                  ? `••••••••${status.last4}`
                  : '••••••••'
                : 'Collez votre clé Zotero'
            }
            onChange={(e) => setApiKeyInput(e.target.value)}
            autoComplete="off"
          />
          <span className="hint">
            À générer sur{' '}
            <a
              href="https://www.zotero.org/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="carnet-link"
            >
              zotero.org/settings/keys
            </a>
            . Stockée chiffrée.
          </span>
        </label>

        <label className="carnet-editview__field">
          <span className="lbl">ID utilisateur Zotero</span>
          <input
            type="text"
            value={libraryIdInput}
            onChange={(e) => setLibraryIdInput(e.target.value)}
            placeholder="12345678"
          />
          <span className="hint">
            Numéro affiché en haut de{' '}
            <a
              href="https://www.zotero.org/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="carnet-link"
            >
              zotero.org/settings/keys
            </a>
            {' '}— « Your userID for use in API calls is … ».
          </span>
        </label>
      </div>

      <div className="carnet-zotero__actions">
        <button
          type="button"
          className="carnet-btn carnet-btn--accent"
          onClick={save}
          disabled={busy !== null || !dirty}
        >
          {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          className="carnet-btn carnet-btn--ghost"
          onClick={test}
          disabled={busy !== null}
          title="Tester la connexion Zotero (utilise les credentials enregistrés)."
        >
          {busy === 'test' ? 'Test…' : 'Tester la connexion'}
        </button>
        <button
          type="button"
          className="carnet-btn carnet-btn--accent"
          onClick={sync}
          disabled={busy !== null}
          title="Synchroniser depuis Zotero (utilise les credentials enregistrés)."
        >
          {busy === 'sync' ? 'Sync en cours…' : 'Synchroniser maintenant'}
        </button>
        {hasKey && (
          <button
            type="button"
            className="carnet-btn carnet-btn--ghost"
            onClick={() => setDisconnectOpen(true)}
            disabled={busy !== null}
          >
            {busy === 'disconnect' ? 'Déconnexion…' : 'Déconnecter'}
          </button>
        )}
      </div>

      {error && <div className="carnet-zotero__error">Erreur : {error}</div>}
      {info && <div className="carnet-zotero__info">{info}</div>}

      {syncKeptCited.length > 0 && (
        <details className="carnet-zotero__skipped">
          <summary>
            {syncKeptCited.length} ref{syncKeptCited.length > 1 ? 's' : ''}{' '}
            supprimée{syncKeptCited.length > 1 ? 's' : ''} côté Zotero mais
            conservée{syncKeptCited.length > 1 ? 's' : ''} au Carnet — voir le détail
          </summary>
          <p className="hint">
            Ces références ont été supprimées dans Zotero mais sont encore
            citées dans des billets — on les garde pour ne pas casser les
            citations existantes. Pour vraiment vous en débarrasser : retirez
            la citation du billet, puis supprimez la ref depuis la liste
            Bibliographie (× en bout de ligne).
          </p>
          <ul>
            {syncKeptCited.map((e) => (
              <li key={e.key}>
                <span className="title">{e.title}</span>{' '}
                <span className="mono key">{e.key}</span>
                <br />
                <span className="reason">
                  → encore citée dans{' '}
                  {e.postNumeros.length === 0 ? (
                    'au moins un billet'
                  ) : (
                    e.postNumeros
                      .map((n) => `n° ${String(n).padStart(3, '0')}`)
                      .join(', ')
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {syncErrors.length > 0 && (
        <details className="carnet-zotero__skipped">
          <summary>
            {syncErrors.length} item{syncErrors.length > 1 ? 's' : ''} ignoré
            {syncErrors.length > 1 ? 's' : ''} — voir le détail
          </summary>
          <p className="hint">
            Corrigez ces refs dans Zotero (elles ne peuvent pas former une
            citation Chicago telles quelles), puis relancez un sync.
          </p>
          <ul>
            {syncErrors.map((e) => {
              const url =
                status?.libraryType === 'group' && status.libraryId
                  ? `https://www.zotero.org/groups/${status.libraryId}/items/${e.key}`
                  : null;
              return (
                <li key={e.key}>
                  {e.title ? (
                    <span className="title">{e.title}</span>
                  ) : (
                    <span className="title muted">(sans titre)</span>
                  )}{' '}
                  {url ? (
                    <Link
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="mono key"
                    >
                      {e.key}
                    </Link>
                  ) : (
                    <span className="mono key">{e.key}</span>
                  )}
                  <br />
                  <span className="reason">→ {e.reason}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {hasKey && status?.lastSyncAt && (
        <div className="carnet-zotero__last">
          <span className="lbl">Dernier sync :</span>{' '}
          <span className="mono">{isoDateTime(status.lastSyncAt)}</span>
          {(status.lastSyncAdded || status.lastSyncUpdated) && (
            <>
              {' — '}
              {status.lastSyncAdded ? `${status.lastSyncAdded} ajoutée${status.lastSyncAdded > 1 ? 's' : ''}` : null}
              {status.lastSyncAdded && status.lastSyncUpdated ? ', ' : null}
              {status.lastSyncUpdated ? `${status.lastSyncUpdated} mise${status.lastSyncUpdated > 1 ? 's' : ''} à jour` : null}
            </>
          )}
          {status.lastSyncVersion ? (
            <>
              {' '}
              · version <span className="mono">{status.lastSyncVersion}</span>
            </>
          ) : null}
        </div>
      )}

      {disconnectOpen && (
        <div
          className="carnet-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && busy !== 'disconnect') {
              setDisconnectOpen(false);
            }
          }}
        >
          <div className="carnet-modal" role="dialog" aria-modal="true">
            <header className="carnet-modal__header">
              <h2>Déconnecter Zotero&nbsp;?</h2>
              <button
                type="button"
                className="carnet-modal__close"
                onClick={() => {
                  if (busy === 'disconnect') return;
                  setDisconnectOpen(false);
                }}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <div className="carnet-modal__body">
              <p>
                La clé API sera effacée du Carnet. Les références déjà
                importées dans la bibliographie ne seront pas supprimées,
                mais elles ne pourront plus être mises à jour automatiquement
                tant que vous n'aurez pas reconnecté Zotero.
              </p>
            </div>

            <footer className="carnet-modal__footer">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={() => setDisconnectOpen(false)}
                disabled={busy === 'disconnect'}
              >
                Annuler
              </button>
              <button
                type="button"
                className="carnet-btn carnet-btn--danger"
                onClick={() => void confirmDisconnect()}
                disabled={busy === 'disconnect'}
              >
                {busy === 'disconnect' ? 'Déconnexion…' : 'Déconnecter'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
