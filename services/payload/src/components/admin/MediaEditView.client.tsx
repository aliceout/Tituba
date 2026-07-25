'use client';

// MediaEditView (client) — vue Édition custom d'un média. Layout :
//
//   CarnetTopbar : crumbs Carnet / Médias / [filename] + Supprimer +
//                  Sauvegarder
//   Hero         : h1 « Média » + « fichier : <filename> » mono
//   Création (pas d'id) :
//     Zone drop / picker fichier — sélection requise avant save
//   Edition (id existant) :
//     Aperçu (image inline / icône type) + meta (mime · taille · dims)
//   Champ Alt (requis)
//
// API Payload upload :
//   POST   /cms/api/media        multipart/form-data + _payload JSON
//   PATCH  /cms/api/media/[id]   JSON pour update alt seul ;
//                                 multipart/form-data pour remplacer
//                                 le fichier (skip pour le V1).

import React, { useEffect, useRef, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_MEDIA = '/cms/api/media';

type Media = {
  id?: number | string;
  filename?: string;
  mimeType?: string;
  filesize?: number;
  width?: number;
  height?: number;
  title?: string;
  alt?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
};

const EMPTY: Media = { title: '', alt: '' };

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortMime(m?: string): string {
  if (!m) return '—';
  return m.split('/').pop() || m;
}

export default function MediaEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const [data, setData] = useState<Media>(EMPTY);
  const [initial, setInitial] = useState<string>(JSON.stringify(EMPTY));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Modale de confirmation de suppression. open=true affiche le
  // backdrop + dialog ; submitting bloque les boutons pendant l'appel
  // DELETE.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Erreurs par champ — affichées sous l'input concerné (cf. pattern
  // PostEditView fieldErrors). Plus lisible qu'un message générique
  // dans la bannière error en haut du form.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      setInitial(JSON.stringify(EMPTY));
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API_MEDIA}/${encodeURIComponent(docId)}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: Media) => {
        const norm: Media = { ...EMPTY, ...doc, alt: doc.alt ?? '' };
        setData(norm);
        setInitial(JSON.stringify(norm));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));
  }, [docId]);

  // Object URL local pour la preview au moment du choix d'un fichier
  // (avant upload). Révoqué au démontage.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dirty = JSON.stringify(data) !== initial || file !== null;
  const isImage = (data.mimeType ?? file?.type ?? '').startsWith('image/');

  function patch<K extends keyof Media>(key: K, value: Media[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function onPickFile(f: File | null) {
    setFile(f);
    setError(null);
  }

  async function save() {
    setError(null);
    // Validation client : titre + alt obligatoires (cf. schema). Erreurs
    // posées sur chaque field plutôt qu'une bannière globale, pour que
    // l'autrice voie immédiatement quel input corriger.
    const title = (data.title ?? '').trim();
    const alt = (data.alt ?? '').trim();
    const errs: Record<string, string> = {};
    if (!title) errs.title = 'Le titre est obligatoire.';
    if (!alt) errs.alt = 'Le texte alternatif est obligatoire.';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      let res: Response;
      if (!data.id) {
        // Création : multipart obligatoire (Payload upload). Le fichier
        // est requis ; les fields JSON passent dans `_payload`.
        if (!file) {
          throw new Error('Sélectionnez un fichier avant de sauvegarder.');
        }
        const fd = new FormData();
        fd.append('file', file);
        fd.append(
          '_payload',
          JSON.stringify({ alt: data.alt ?? '', title: data.title ?? '' }),
        );
        res = await fetch(API_MEDIA, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
      } else {
        // Update : on PATCH l'alt en JSON. Remplacement du fichier
        // pas géré dans le V1.
        res = await fetch(`${API_MEDIA}/${encodeURIComponent(String(data.id))}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alt: data.alt ?? '',
            title: data.title ?? '',
          }),
        });
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: Media } | Media;
      const fresh: Media = (json as { doc?: Media }).doc ?? (json as Media);
      const norm: Media = {
        ...EMPTY,
        ...fresh,
        alt: fresh.alt ?? '',
        title: fresh.title ?? '',
      };
      setData(norm);
      setInitial(JSON.stringify(norm));
      setFile(null);
      setSavedAt(Date.now());
      if (!docId && fresh.id != null) {
        const path = `/cms/admin/collections/media/${fresh.id}`;
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
      const res = await fetch(`${API_MEDIA}/${encodeURIComponent(String(data.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/cms/admin/collections/media';
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
  }, [dirty, saving, data, file]);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  }

  const serverUrl =
    data.url ?? (data.filename ? `${API_MEDIA}/file/${encodeURIComponent(data.filename)}` : null);
  const displayUrl = previewUrl ?? serverUrl;
  const displayName = file?.name ?? data.filename ?? null;

  return (
    <CarnetPage
      variant="editview"
      modifier="media"
      crumbs={[
        { href: '/cms/admin', label: 'Carnet' },
        { href: '/cms/admin/collections/media', label: 'Médias' },
        { label: data.filename || (docId ? '—' : 'nouveau') },
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
            <h1 className="carnet-h1">Média</h1>
            {displayName && (
              <p className="carnet-editview__hero-key">
                fichier : <span className="mono">{displayName}</span>
              </p>
            )}
          </div>

          {/* En création, la section Description est posée AVANT le
              fichier — l'autrice écrit d'abord ce que le média
              représente, puis upload. Les deux champs sont obligatoires
              (cf. schema collections/Media.ts).
              En édition (data.id != null), Titre + Alt vivent dans le
              side panel de la section Fichier (cf .carnet-media-preview
              ci-dessous), car la prévisualisation est plus pertinente
              en haut. */}
          {!data.id && (
            <section className="carnet-editview__section">
              <h2 className="carnet-editview__section-title">Description</h2>

              <label
                className={`carnet-editview__field${
                  fieldErrors.title ? ' carnet-editview__field--invalid' : ''
                }`}
              >
                <span className="lbl">Titre</span>
                <input
                  type="text"
                  required
                  value={data.title ?? ''}
                  onChange={(e) => {
                    patch('title', e.target.value);
                    if (fieldErrors.title) {
                      setFieldErrors((prev) => {
                        const { title: _omit, ...rest } = prev;
                        return rest;
                      });
                    }
                  }}
                  placeholder="Titre du média…"
                />
                <span className="hint">
                  Affiché en légende ou en infobulle selon le contexte.
                </span>
              </label>
              {fieldErrors.title && (
                <div className="carnet-editview__field-error" role="alert">
                  {fieldErrors.title}
                </div>
              )}

              <label
                className={`carnet-editview__field${
                  fieldErrors.alt ? ' carnet-editview__field--invalid' : ''
                }`}
              >
                <span className="lbl">Texte alternatif (alt)</span>
                <input
                  type="text"
                  required
                  value={data.alt ?? ''}
                  onChange={(e) => {
                    patch('alt', e.target.value);
                    if (fieldErrors.alt) {
                      setFieldErrors((prev) => {
                        const { alt: _omit, ...rest } = prev;
                        return rest;
                      });
                    }
                  }}
                  placeholder="Décrivez l'image pour les lecteurs d'écran et le SEO."
                />
                <span className="hint">
                  Obligatoire — exigence d'accessibilité (WCAG 2.2). Décrivez
                  <em> ce qu'on voit</em>, pas le contexte du billet.
                </span>
              </label>
              {fieldErrors.alt && (
                <div className="carnet-editview__field-error" role="alert">
                  {fieldErrors.alt}
                </div>
              )}
            </section>
          )}

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Fichier</h2>

            {data.id != null ? (
              // Edition : aperçu + meta. Pas de remplacement de
              // fichier dans le V1 — pour ça, il faut supprimer puis
              // recréer.
              <div className="carnet-media-preview">
                {isImage && displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={data.alt ?? ''}
                    className="carnet-media-preview__img"
                  />
                ) : (
                  <div className="carnet-media-preview__fallback" aria-hidden="true">
                    {shortMime(data.mimeType).toUpperCase()}
                  </div>
                )}
                <div className="carnet-media-preview__side">
                  <label
                    className={`carnet-editview__field${
                      fieldErrors.title ? ' carnet-editview__field--invalid' : ''
                    }`}
                  >
                    <span className="lbl">Titre</span>
                    <input
                      type="text"
                      required
                      value={data.title ?? ''}
                      onChange={(e) => {
                        patch('title', e.target.value);
                        if (fieldErrors.title) {
                          setFieldErrors((prev) => {
                            const { title: _omit, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      placeholder="Titre du média…"
                    />
                    <span className="hint">
                      Affiché en légende ou en infobulle selon le contexte.
                    </span>
                  </label>
                  {fieldErrors.title && (
                    <div className="carnet-editview__field-error" role="alert">
                      {fieldErrors.title}
                    </div>
                  )}

                  <label
                    className={`carnet-editview__field${
                      fieldErrors.alt ? ' carnet-editview__field--invalid' : ''
                    }`}
                  >
                    <span className="lbl">Texte alternatif (alt)</span>
                    <input
                      type="text"
                      required
                      value={data.alt ?? ''}
                      onChange={(e) => {
                        patch('alt', e.target.value);
                        if (fieldErrors.alt) {
                          setFieldErrors((prev) => {
                            const { alt: _omit, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      placeholder="Décrivez l'image pour les lecteurs d'écran et le SEO."
                    />
                    <span className="hint">
                      Obligatoire — exigence d'accessibilité (WCAG 2.2). Décrivez
                      <em> ce qu'on voit</em>, pas le contexte du billet.
                    </span>
                  </label>
                  {fieldErrors.alt && (
                    <div className="carnet-editview__field-error" role="alert">
                      {fieldErrors.alt}
                    </div>
                  )}

                  <hr className="carnet-media-preview__rule" />

                  <dl className="carnet-media-preview__meta">
                    <div>
                      <dt>Type</dt>
                      <dd className="mono">{data.mimeType ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Taille</dt>
                      <dd className="mono">{formatSize(data.filesize)}</dd>
                    </div>
                    {data.width && data.height && (
                      <div>
                        <dt>Dimensions</dt>
                        <dd className="mono">
                          {data.width} × {data.height}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            ) : (
              // Création : drop zone + button picker
              <div
                className={`carnet-media-drop${drag ? ' carnet-media-drop--drag' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                {previewUrl && isImage ? (
                  <img
                    src={previewUrl}
                    alt={file?.name ?? ''}
                    className="carnet-media-drop__preview"
                  />
                ) : file ? (
                  <div className="carnet-media-drop__filename mono">{file.name}</div>
                ) : (
                  <p className="carnet-media-drop__hint">
                    Glissez un fichier ici, ou cliquez pour en sélectionner un.
                  </p>
                )}

                <div className="carnet-media-drop__actions">
                  <button
                    type="button"
                    className="carnet-btn carnet-btn--ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {file ? 'Choisir un autre fichier' : 'Sélectionner un fichier'}
                  </button>
                  {file && (
                    <button
                      type="button"
                      className="carnet-btn carnet-btn--ghost"
                      onClick={() => onPickFile(null)}
                    >
                      Retirer
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </section>
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
              <h2>Supprimer ce média&nbsp;?</h2>
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
                «&nbsp;{data.filename || data.id}&nbsp;» sera définitivement
                supprimé. Les billets ou pages qui le référencent perdront
                leur image. Cette action est irréversible.
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
