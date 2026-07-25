'use client';

// TagListView (client) — vue Liste custom Tags : édition inline et
// suppression. La création se fait uniquement depuis l'édition d'un
// billet (TagsPicker), jamais depuis cette page : les tags émergent
// du flux d'écriture, pas d'une saisie « à blanc ». Donc :
//
//   - chaque ligne ressemble à celles de Thèmes / Biblio (texte statique)
//   - clic sur le nom → bascule en input à la même place ; blur ou
//     Entrée valide (PATCH /cms/api/tags/[id]), Échap annule
//   - bouton × par ligne = suppression (avec confirm)
//   - le slug et le compteur Billets ne sont jamais éditables
//
// Recherche + pagination compacte comme ThemeListView.

import React, { useEffect, useRef, useState } from 'react';

import CarnetPage from './CarnetPage';

const PER_PAGE = 50;
const API_TAGS = '/cms/api/tags';
const API_POSTS = '/cms/api/posts';

type Tag = {
  id: number | string;
  name: string;
  slug: string;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

export default function TagListViewClient(): React.ReactElement {
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  // Modale de confirmation de suppression d'un tag (remplace le
  // window.confirm natif). target = le tag à supprimer ; null = fermée.
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', 'name');
    params.set('depth', '0');
    if (search.trim()) params.append('where[name][like]', search.trim());

    fetch(`${API_TAGS}?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: FetchResult<Tag>) => {
        setTags(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);

        // Compteurs d'usages : un fetch par tag (parallèle).
        const countsMap = new Map<string, number>();
        await Promise.all(
          (data.docs ?? []).map(async (t) => {
            try {
              const r = await fetch(
                `${API_POSTS}?where[tags][in]=${encodeURIComponent(String(t.id))}&limit=1&depth=0`,
                { credentials: 'include' },
              );
              if (r.ok) {
                const d = await r.json();
                countsMap.set(String(t.id), d.totalDocs ?? 0);
              } else {
                countsMap.set(String(t.id), 0);
              }
            } catch {
              countsMap.set(String(t.id), 0);
            }
          }),
        );
        setCounts(countsMap);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setTags([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, reloadKey]);

  useEffect(() => setPage(1), [search]);

  function setBusy(id: string, on: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // PATCH : renomme un tag existant.
  async function renameTag(tag: Tag, newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === tag.name) return true;
    setBusy(String(tag.id), true);
    setError(null);
    try {
      const res = await fetch(`${API_TAGS}/${encodeURIComponent(String(tag.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      // Reload pour récupérer le slug régénéré côté serveur.
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return false;
    } finally {
      setBusy(String(tag.id), false);
    }
  }

  // DELETE : supprime un tag (Payload nettoie automatiquement les
  // relations qui pointent dessus). Effectif après confirmation
  // dans la modale (cf deleteTarget plus haut).
  async function confirmDeleteTag() {
    const tag = deleteTarget;
    if (!tag) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_TAGS}/${encodeURIComponent(String(tag.id))}`, {
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
      modifier="tags"
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Tags' }]}
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
            placeholder={`Rechercher dans ${totalDocs} tag${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
      </div>

      {error && <div className="carnet-listview__error">Erreur : {error}</div>}

      <div className="carnet-listview__table" role="table">
        <div className="carnet-listview__row carnet-listview__row--head" role="row">
          <div role="columnheader">Nom</div>
          <div role="columnheader">Slug</div>
          <div role="columnheader">Billets</div>
          <div role="columnheader" aria-label="Actions" />
        </div>

        {loading && tags.length === 0 ? (
          <div className="carnet-listview__loading">Chargement…</div>
        ) : tags.length === 0 ? (
          <div className="carnet-listview__empty">Aucun tag.</div>
        ) : (
          tags.map((t) => (
            <TagRow
              key={t.id}
              tag={t}
              count={counts.get(String(t.id)) ?? 0}
              busy={busyIds.has(String(t.id))}
              onRename={(name) => renameTag(t, name)}
              onDelete={() => {
                setDeleteTarget(t);
                setDeleteError(null);
              }}
            />
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
              <h2>Supprimer ce tag&nbsp;?</h2>
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
              <div className="carnet-modal__error">Erreur&nbsp;: {deleteError}</div>
            )}

            <div className="carnet-modal__body">
              {(() => {
                const usages = counts.get(String(deleteTarget.id)) ?? 0;
                return (
                  <p>
                    «&nbsp;{deleteTarget.name}&nbsp;» sera définitivement
                    supprimé.{' '}
                    {usages > 0
                      ? `Il est utilisé dans ${usages} billet${usages > 1 ? 's' : ''} ; la relation sera retirée automatiquement.`
                      : 'Aucun billet ne le référence.'}
                  </p>
                );
              })()}
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
                onClick={() => void confirmDeleteTag()}
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

// Une ligne tag existante. Texte statique par défaut (comme les autres
// list views) ; clic sur le nom → input à la même place. Blur ou
// Entrée valide, Échap annule.
function TagRow({
  tag,
  count,
  busy,
  onRename,
  onDelete,
}: {
  tag: Tag;
  count: number;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resync si la prop change (reload après PATCH).
  useEffect(() => {
    setValue(tag.name);
  }, [tag.name]);

  // Focus + sélection complète à l'entrée en édition.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    setEditing(false);
    if (value.trim() === tag.name) return;
    const ok = await onRename(value);
    if (!ok) setValue(tag.name);
  }

  function cancel() {
    setValue(tag.name);
    setEditing(false);
  }

  return (
    <div className="carnet-listview__row carnet-listview__row--tag" role="row">
      <div role="cell" className="title">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            className="carnet-listview__inline-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            disabled={busy}
          />
        ) : (
          <button
            type="button"
            className="carnet-listview__inline-static"
            onClick={() => setEditing(true)}
            disabled={busy}
            title="Cliquer pour renommer"
          >
            {tag.name}
          </button>
        )}
      </div>
      <div role="cell" className="slug mono">
        {tag.slug}
      </div>
      <div role="cell" className="count">
        {count}
      </div>
      <div role="cell" className="actions">
        <button
          type="button"
          className="carnet-listview__rowact"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Supprimer le tag ${tag.name}`}
          title="Supprimer"
        >
          ×
        </button>
      </div>
    </div>
  );
}

