'use client';

// ThemeEditView (client) — vue Édition custom d'un thème de la
// taxonomie. Layout :
//
//   CarnetTopbar : crumbs Carnet / Thèmes / [slug] + Supprimer + Sauvegarder
//   .carnet-editview__hero : h1 « Thème » + « clé : <slug> » mono
//   Champs : Nom, Slug, Description éditoriale (textarea)
//   used-in : billets qui ont ce thème dans Post.themes
//
// Fetch / save via /cms/api/themes/[id] (cookies de session).

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const API_THEMES = '/cms/api/themes';
const API_POSTS = '/cms/api/posts';

type Theme = {
  id?: number | string;
  name: string;
  slug: string;
  description?: string;
};

type UsedInPost = { id: number | string; numero?: number; title?: string };

const EMPTY: Theme = {
  name: '',
  slug: '',
  description: '',
};

function pad3(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return String(n).padStart(3, '0');
}

export default function ThemeEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const [data, setData] = useState<Theme>(EMPTY);
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
    fetch(`${API_THEMES}/${encodeURIComponent(docId)}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: Theme) => {
        const norm: Theme = {
          ...EMPTY,
          ...doc,
          name: doc.name ?? '',
          slug: doc.slug ?? '',
          description: doc.description ?? '',
        };
        setData(norm);
        setInitial(JSON.stringify(norm));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));

    // Fetch used-in : billets qui ont ce thème dans leur champ themes
    fetch(
      `${API_POSTS}?where[themes][in]=${encodeURIComponent(docId)}&limit=50&depth=0&sort=-publishedAt`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: UsedInPost[] }) => setUsedIn(res.docs ?? []))
      .catch(() => setUsedIn([]));
  }, [docId]);

  const dirty = JSON.stringify(data) !== initial;

  function patch<K extends keyof Theme>(key: K, value: Theme[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const url =
        data.id != null && data.id !== ''
          ? `${API_THEMES}/${encodeURIComponent(String(data.id))}`
          : API_THEMES;
      const method = data.id != null && data.id !== '' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: Theme } | Theme;
      const fresh: Theme = (json as { doc?: Theme }).doc ?? (json as Theme);
      const norm: Theme = { ...EMPTY, ...fresh };
      setData(norm);
      setInitial(JSON.stringify(norm));
      setSavedAt(Date.now());
      if (!docId && fresh.id != null) {
        const path = `/cms/admin/collections/themes/${fresh.id}`;
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
      const res = await fetch(`${API_THEMES}/${encodeURIComponent(String(data.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/cms/admin/collections/themes';
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

  return (
    <CarnetPage
      variant="editview"
      modifier="theme"
      crumbs={[
        { href: '/cms/admin', label: 'Carnet' },
        { href: '/cms/admin/collections/themes', label: 'Thèmes' },
        { label: data.slug || (docId ? '—' : 'nouveau') },
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
          <button
            type="button"
            className="carnet-btn carnet-btn--accent"
            onClick={() => void save()}
            disabled={!dirty || saving || loading}
            title="Sauvegarder (⌘S)"
            suppressHydrationWarning
          >
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
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
            <h1 className="carnet-h1">Thème</h1>
            {data.slug && (
              <p className="carnet-editview__hero-key">
                clé : <span className="mono">{data.slug}</span>
              </p>
            )}
          </div>

          <section className="carnet-editview__section">
            <label className="carnet-editview__field">
              <span className="lbl">Nom</span>
              <input
                type="text"
                value={data.name}
                onChange={(e) => patch('name', e.target.value)}
                placeholder="Ex : Genre & géopolitique"
              />
              <span className="hint">
                Appellation publique du thème — affichée dans les chips de billet et la page
                /theme/&lt;slug&gt;/.
              </span>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Slug</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => patch('slug', e.target.value)}
                placeholder="genre-geopolitique"
              />
              <span className="hint">
                Identifiant URL — sert aussi de hash de tag inline
                (<span className="mono">#queer-theory</span>).
              </span>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Description éditoriale</span>
              <textarea
                rows={3}
                value={data.description ?? ''}
                onChange={(e) => patch('description', e.target.value)}
              />
              <span className="hint">
                1 à 2 phrases — apparaît en hero de la page{' '}
                <span className="mono">/theme/&lt;slug&gt;/</span>.
              </span>
            </label>
          </section>

          {data.id != null && (
            <div className="carnet-biblio-usedin">
              {usedIn.length === 0 ? (
                <span>Ce thème n’est utilisé dans aucun billet pour l’instant.</span>
              ) : (
                <>
                  Utilisé dans {usedIn.length} billet{usedIn.length > 1 ? 's' : ''} :{' '}
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
              <h2>Supprimer ce thème&nbsp;?</h2>
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
                «&nbsp;{data.name || data.slug || data.id}&nbsp;» sera
                définitivement supprimé. Les billets rattachés à ce thème
                garderont leurs autres thèmes mais perdront celui-ci.
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
