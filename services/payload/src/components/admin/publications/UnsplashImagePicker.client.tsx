'use client';

// UnsplashImagePicker — bloc « Image de couverture » des billets
// d'analyse (cf registry.ts → analyses.extraFields, type 'upload').
//
// Rendu dans la colonne centrale, sur le même gabarit que les panneaux
// Notes de bas de page et Bibliographie liée (.fn-block / .bib-block) :
// une image de couverture est du contenu, pas une métadonnée de barre
// latérale.
//
// Deux façons de renseigner le champ media sous-jacent :
//   1. Upload manuel — même API que MediaEditView.client.tsx
//      (POST multipart /cms/api/media).
//   2. Recherche Unsplash — dans une fenêtre contextuelle (champ de
//      recherche en haut, résultats en dessous), via un proxy serveur :
//      la clé API n'est jamais exposée au navigateur (cf
//      endpoints/unsplash.ts). L'import télécharge et auto-héberge la
//      photo, et stocke l'attribution sur le doc media créé.
//
// Crédit photographe affiché sous chaque vignette : obligatoire par les
// conditions Unsplash dès que la photo est affichée, pas seulement une
// fois qu'elle est retenue.

import React, { useCallback, useEffect, useRef, useState } from 'react';

const API_MEDIA = '/cms/api/media';
const API_UNSPLASH_SEARCH = '/cms/api/unsplash/search';
const API_UNSPLASH_IMPORT = '/cms/api/unsplash/import';

type MediaValue = {
  id: number | string;
  filename?: string | null;
  url?: string | null;
  alt?: string | null;
  unsplash?: { photographerName?: string | null; photographerProfileUrl?: string | null } | null;
} | null;

type UnsplashResult = {
  id: string;
  thumbUrl: string;
  altDescription: string;
  photographerName: string;
  photographerProfileUrl: string;
};

function previewUrl(v: MediaValue): string | null {
  if (!v) return null;
  // Chemin same-origin d'abord, `url` seulement en dernier recours :
  // Payload construit `url` en absolu sur ADDRESS (le domaine public du
  // site), qui n'est pas l'origine de l'admin — en dev les deux sont sur
  // des ports différents et l'aperçu s'affiche cassé. L'admin étant
  // toujours servi par Payload, le chemin relatif est toujours joignable.
  if (v.filename) return `${API_MEDIA}/file/${encodeURIComponent(v.filename)}`;
  return v.url ?? null;
}

/**
 * Message porté par la réponse JSON, à défaut le statut. Les endpoints
 * Unsplash traduisent déjà les erreurs amont (clé refusée, quota) en
 * phrases actionnables — les perdre au profit d'un « HTTP 502 » nu
 * priverait l'utilisatrice de la seule indication utile.
 */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error || body.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ─── Fenêtre contextuelle de recherche ────────────────────────────────

function UnsplashSearchModal({
  onPick,
  onClose,
}: {
  onPick: (doc: MediaValue) => void;
  onClose: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnsplashResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Échap ferme la fenêtre — attendu de toute modale, et seule sortie
  // au clavier puisque le fond n'est pas focusable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Recherche debouncée (350 ms) — évite une requête par frappe, et
  // ménage le quota Unsplash (50 req/h pour une application en démo).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      setError(null);
      fetch(`${API_UNSPLASH_SEARCH}?query=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(await readError(r));
          return r.json();
        })
        .then((body: { results?: UnsplashResult[] }) => {
          setResults(body.results ?? []);
          setSearched(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Recherche échouée.'))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  async function importPhoto(photoId: string) {
    setImportingId(photoId);
    setError(null);
    try {
      const res = await fetch(API_UNSPLASH_IMPORT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const { doc } = (await res.json()) as { doc: MediaValue };
      onPick(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import échoué.');
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div
      className="tituba-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        // Seul un clic sur le fond lui-même ferme : sans ce test, un
        // clic qui traverse depuis l'intérieur refermerait la fenêtre.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tituba-modal tituba-modal--unsplash"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher une photo sur Unsplash"
      >
        <header className="tituba-modal__header">
          <span>Photo Unsplash</span>
          <button
            type="button"
            className="tituba-modal__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="tituba-unsplash__search">
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Rechercher une photo… (ex. forêt, brume, manifestation)"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="tituba-modal__body tituba-unsplash__body">
          {error && <div className="tituba-unsplash__error">{error}</div>}

          {!error && searching && <p className="tituba-unsplash__note">Recherche…</p>}

          {!error && !searching && !query.trim() && (
            <p className="tituba-unsplash__note">
              Saisissez un mot-clé pour parcourir la photothèque Unsplash. La photo choisie est
              téléchargée et hébergée par Tituba, avec le crédit de son autrice ou de son auteur.
            </p>
          )}

          {!error && !searching && searched && results.length === 0 && (
            <p className="tituba-unsplash__note">Aucun résultat pour « {query.trim()} ».</p>
          )}

          {results.length > 0 && (
            <div className="tituba-unsplash__grid">
              {results.map((r) => (
                <figure key={r.id} className="tituba-unsplash__item">
                  <button
                    type="button"
                    className="tituba-unsplash__thumb"
                    disabled={importingId !== null}
                    onClick={() => void importPhoto(r.id)}
                    title={r.altDescription || 'Choisir cette photo'}
                  >
                    <img src={r.thumbUrl} alt={r.altDescription} />
                    {importingId === r.id && (
                      <span className="tituba-unsplash__importing">Import…</span>
                    )}
                  </button>
                  {/* Crédit obligatoire dès l'affichage (conditions
                      Unsplash), pas seulement une fois la photo retenue. */}
                  <figcaption className="tituba-unsplash__credit">
                    <a
                      href={`${r.photographerProfileUrl}?utm_source=tituba&utm_medium=referral`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.photographerName}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bloc principal ───────────────────────────────────────────────────

export default function UnsplashImagePicker({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: MediaValue | number | string | null;
  onChange: (mediaId: number | string | null, mediaDoc: MediaValue) => void;
}): React.ReactElement {
  // `value` arrive soit comme id brut (juste choisi), soit comme objet
  // media peuplé (depth du fetch initial du billet) — normalisé ici en
  // un seul état d'affichage.
  const [resolved, setResolved] = useState<MediaValue>(
    value && typeof value === 'object' ? value : null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (value && typeof value === 'object') setResolved(value);
    if (value == null) setResolved(null);
  }, [value]);

  const pick = useCallback(
    (doc: MediaValue) => {
      setResolved(doc);
      onChange(doc?.id ?? null, doc);
      setModalOpen(false);
    },
    [onChange],
  );

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('_payload', JSON.stringify({ alt: file.name, title: file.name }));
      const res = await fetch(API_MEDIA, { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { doc?: MediaValue } | MediaValue;
      const doc = (json as { doc?: MediaValue }).doc ?? (json as MediaValue);
      setResolved(doc);
      onChange(doc?.id ?? null, doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’upload.');
    } finally {
      setUploading(false);
    }
  }

  const img = previewUrl(resolved);

  return (
    <div className="img-block">
      <div className="img-block__h">
        <span>{label}</span>
      </div>

      {help && <div className="img-block__help">{help}</div>}

      <div className="img-block__body">
        {resolved ? (
          <div className="img-block__current">
            {img && <img src={img} alt={resolved.alt ?? ''} />}
            <div className="img-block__meta">
              <span className="img-block__name">
                {resolved.unsplash?.photographerName
                  ? `Photo par ${resolved.unsplash.photographerName} (Unsplash)`
                  : resolved.filename ?? 'Fichier importé'}
              </span>
              <button
                type="button"
                className="img-block__remove"
                onClick={() => {
                  setResolved(null);
                  onChange(null, null);
                }}
              >
                Retirer
              </button>
            </div>
          </div>
        ) : (
          <div className="img-block__empty">Aucune image pour le moment.</div>
        )}

        <div className="img-block__actions">
          <button
            type="button"
            className="tituba-btn tituba-btn--ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Envoi…' : 'Uploader un fichier'}
          </button>
          <button
            type="button"
            className="tituba-btn tituba-btn--ghost"
            onClick={() => setModalOpen(true)}
          >
            Rechercher sur Unsplash
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {error && <div className="img-block__error">{error}</div>}
      </div>

      {modalOpen && <UnsplashSearchModal onPick={pick} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
