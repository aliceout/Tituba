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
  width?: number | null;
  height?: number | null;
  /** Zone retenue pour la couverture, en % des dimensions de l'image.
   *  Absente = image entière, cadrée au centre. Cf CropModal. */
  crop?: { x?: number | null; y?: number | null; w?: number | null; h?: number | null } | null;
  unsplash?: { photographerName?: string | null; photographerProfileUrl?: string | null } | null;
} | null;

type UnsplashResult = {
  id: string;
  thumbUrl: string;
  altDescription: string;
  photographerName: string;
  photographerProfileUrl: string;
  /** Dimensions d'origine — servent à réserver la place de la vignette
   *  avant chargement, pour que la grille ne saute pas. */
  width?: number;
  height?: number;
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [nbColonnes, setNbColonnes] = useState(4);

  // Nombre de colonnes déduit de la largeur disponible, ~280px chacune.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const calc = () => setNbColonnes(Math.max(1, Math.round(el.clientWidth / 300)));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Répartition en colonnes calculée ici plutôt que laissée aux colonnes
   * CSS : `columns` équilibre les hauteurs, donc chaque ajout de page
   * redistribue l'ensemble et les photos déjà vues sautent d'une colonne
   * à l'autre. Ici chaque photo part dans la colonne la plus courte au
   * moment où elle arrive, dans l'ordre des résultats — un traitement
   * glouton, donc stable par préfixe : les N premières photos gardent
   * exactement leur place quoi qu'il arrive ensuite. Le défilement ne
   * fait qu'ajouter en dessous.
   *
   * Les hauteurs se cumulent à partir du ratio de chaque photo (connu de
   * l'API), sans mesurer le DOM : pas de dépendance au chargement des
   * images, donc pas de réagencement pendant qu'elles arrivent.
   */
  const colonnes = React.useMemo(() => {
    const cols: UnsplashResult[][] = Array.from({ length: nbColonnes }, () => []);
    const hauteurs = new Array(nbColonnes).fill(0);
    for (const r of results) {
      let plusCourte = 0;
      for (let i = 1; i < hauteurs.length; i++) {
        if (hauteurs[i] < hauteurs[plusCourte]) plusCourte = i;
      }
      cols[plusCourte].push(r);
      // Hauteur relative pour une largeur de colonne unitaire.
      hauteurs[plusCourte] += (r.height ?? 1) / (r.width ?? 1);
    }
    return cols;
  }, [results, nbColonnes]);

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
  // Repart toujours de la page 1 : une nouvelle saisie remplace les
  // résultats, elle ne s'y ajoute pas.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      setPage(1);
      setTotalPages(0);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      setError(null);
      fetch(`${API_UNSPLASH_SEARCH}?query=${encodeURIComponent(q)}&page=1`, {
        credentials: 'include',
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(await readError(r));
          return r.json();
        })
        .then((body: { results?: UnsplashResult[]; totalPages?: number }) => {
          setResults(body.results ?? []);
          setTotalPages(body.totalPages ?? 0);
          setPage(1);
          setSearched(true);
          // Une nouvelle recherche doit repartir du haut, sinon on reste
          // au niveau de défilement de la précédente.
          if (bodyRef.current) bodyRef.current.scrollTop = 0;
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Recherche échouée.'))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  /** Page suivante, ajoutée à la suite. */
  const loadMore = useCallback(() => {
    const q = query.trim();
    if (!q || loadingMore || searching || page >= totalPages) return;
    const next = page + 1;
    setLoadingMore(true);
    fetch(`${API_UNSPLASH_SEARCH}?query=${encodeURIComponent(q)}&page=${next}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r));
        return r.json();
      })
      .then((body: { results?: UnsplashResult[] }) => {
        // Dédoublonnage : Unsplash peut renvoyer une même photo sur deux
        // pages voisines, et une clé React dupliquée casserait le rendu.
        setResults((prev) => {
          const vus = new Set(prev.map((r) => r.id));
          return [...prev, ...(body.results ?? []).filter((r) => !vus.has(r.id))];
        });
        setPage(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Chargement échoué.'))
      .finally(() => setLoadingMore(false));
  }, [query, page, totalPages, loadingMore, searching]);

  // Défilement infini : une sentinelle en pied de grille déclenche la
  // page suivante quand elle entre dans la zone visible. `root` est le
  // corps défilant de la modale et non la fenêtre, sinon l'observateur
  // ne verrait jamais l'intersection.
  useEffect(() => {
    const cible = sentinelRef.current;
    const racine = bodyRef.current;
    if (!cible || !racine) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // Marge basse : on précharge avant d'arriver au bout, pour que le
      // défilement ne marque pas de pause.
      { root: racine, rootMargin: '600px 0px' },
    );
    obs.observe(cible);
    return () => obs.disconnect();
  }, [loadMore]);

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

        <div className="tituba-modal__body tituba-unsplash__body" ref={bodyRef}>
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
              {colonnes.map((colonne, i) => (
                <div className="tituba-unsplash__col" key={i}>
              {colonne.map((r) => (
                <figure key={r.id} className="tituba-unsplash__item">
                  <button
                    type="button"
                    className="tituba-unsplash__thumb"
                    disabled={importingId !== null}
                    onClick={() => void importPhoto(r.id)}
                    title={r.altDescription || 'Choisir cette photo'}
                  >
                    {/* width/height natifs : le navigateur en déduit le
                        ratio et réserve la hauteur avant le chargement,
                        sinon la grille en colonnes se réagence sous les
                        yeux au fur et à mesure des images qui arrivent. */}
                    <img
                      src={r.thumbUrl}
                      alt={r.altDescription}
                      width={r.width}
                      height={r.height}
                      loading="lazy"
                    />
                    {importingId === r.id && (
                      <span className="tituba-unsplash__importing">Import…</span>
                    )}
                  </button>
                </figure>
              ))}
                </div>
              ))}
            </div>
          )}

          {/* Sentinelle du défilement infini : hors de la grille pour
              qu'elle ne devienne pas une colonne de la mosaïque. */}
          {results.length > 0 && <div ref={sentinelRef} aria-hidden="true" />}

          {loadingMore && <p className="tituba-unsplash__note">Chargement…</p>}

          {results.length > 0 && !loadingMore && page >= totalPages && (
            <p className="tituba-unsplash__note">Fin des résultats.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sélecteur de zone visible ────────────────────────────────────────

/** Rectangle retenu, en % des dimensions de l'image (0–100). */
type Crop = { x: number; y: number; w: number; h: number };

/**
 * Le hero d'un billet affiche l'image dans un carré : il n'en montre
 * qu'une partie. Ce sélecteur laisse choisir laquelle, sur l'image
 * entière plutôt que sur un aperçu déjà rogné — on voit ce qu'on écarte.
 *
 * La zone est carrée en pixels réels, donc pas en pourcentages : sur une
 * image 1600×820, 100 % de la hauteur ne valent que 51 % de la largeur.
 * D'où les conversions permanentes entre les deux axes.
 *
 * Par défaut, le plus grand carré possible, centré : toute la hauteur
 * d'une image paysage, toute la largeur d'une portrait. On peut ensuite
 * le resserrer (poignée d'angle) ou le déplacer (glisser dedans).
 */
function CropModal({
  doc,
  onDone,
  onCancel,
}: {
  doc: NonNullable<MediaValue>;
  onDone: (crop: Crop) => void;
  onCancel: () => void;
}): React.ReactElement {
  const iw = doc.width ?? 1;
  const ih = doc.height ?? 1;
  // Côté du plus grand carré possible, exprimé sur chaque axe.
  const maxW = ih < iw ? (ih / iw) * 100 : 100;
  const maxH = iw < ih ? (iw / ih) * 100 : 100;

  const [crop, setCrop] = useState<Crop>(() => {
    const c = doc.crop;
    if (c && typeof c.w === 'number' && c.w > 0 && typeof c.h === 'number' && c.h > 0) {
      return { x: c.x ?? 0, y: c.y ?? 0, w: c.w, h: c.h };
    }
    return { x: (100 - maxW) / 2, y: (100 - maxH) / 2, w: maxW, h: maxH };
  });
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // Geste en cours : déplacement (avec l'écart au coin) ou redimension.
  const geste = useRef<{ mode: 'move' | 'resize'; dx: number; dy: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /** Position du pointeur en % de l'image. */
  function pct(clientX: number, clientY: number) {
    const box = frameRef.current;
    if (!box) return { x: 0, y: 0 };
    const r = box.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * 100,
      y: ((clientY - r.top) / r.height) * 100,
    };
  }

  function onMove(clientX: number, clientY: number) {
    const g = geste.current;
    if (!g) return;
    const p = pct(clientX, clientY);

    if (g.mode === 'move') {
      setCrop((c) => ({
        ...c,
        // Bornage : la zone ne peut pas sortir de l'image.
        x: Math.max(0, Math.min(100 - c.w, p.x - g.dx)),
        y: Math.max(0, Math.min(100 - c.h, p.y - g.dy)),
      }));
      return;
    }

    // Redimension par le coin bas-droit. La zone reste carrée : on
    // arbitre en pixels réels, puis on reporte le côté sur les deux axes.
    setCrop((c) => {
      const wVoulu = Math.max(0, p.x - c.x);
      const hVoulu = Math.max(0, p.y - c.y);
      const cote = Math.max((wVoulu * iw) / 100, (hVoulu * ih) / 100);
      // Plancher à 10 % du plus petit côté : en dessous, le cadrage
      // devient un zoom extrême sur une zone illisible.
      const plancher = Math.min(iw, ih) * 0.1;
      // Plafond : ce qui reste jusqu'au bord droit et au bord bas.
      const plafond = Math.min(iw - (c.x * iw) / 100, ih - (c.y * ih) / 100);
      const px = Math.max(plancher, Math.min(cote, plafond));
      return { ...c, w: (px / iw) * 100, h: (px / ih) * 100 };
    });
  }

  async function save() {
    const arrondi: Crop = {
      x: Math.round(crop.x * 100) / 100,
      y: Math.round(crop.y * 100) / 100,
      w: Math.round(crop.w * 100) / 100,
      h: Math.round(crop.h * 100) / 100,
    };
    setSaving(true);
    try {
      await fetch(`${API_MEDIA}/${doc.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: arrondi }),
      });
    } catch {
      // Un échec d'enregistrement ne doit pas faire perdre la photo déjà
      // importée : elle reste sélectionnée, cadrée au centre par défaut.
    } finally {
      setSaving(false);
      onDone(arrondi);
    }
  }

  const src = previewUrl(doc);
  const zoneMaximale = () =>
    setCrop({ x: (100 - maxW) / 2, y: (100 - maxH) / 2, w: maxW, h: maxH });

  return (
    <div className="tituba-modal-backdrop" role="presentation">
      <div
        className="tituba-modal tituba-modal--crop"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir la zone visible"
      >
        <header className="tituba-modal__header">
          <span>Zone visible</span>
          <button
            type="button"
            className="tituba-modal__close"
            onClick={onCancel}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="tituba-modal__body tituba-crop__body">
          <p className="tituba-crop__hint">
            Le billet n’affichera que la zone encadrée. Faites-la glisser pour la déplacer, ou
            tirez le coin pour la resserrer.
          </p>

          <div
            className="tituba-crop__frame"
            ref={frameRef}
            onPointerMove={(e) => onMove(e.clientX, e.clientY)}
            onPointerUp={() => {
              geste.current = null;
            }}
            onPointerLeave={() => {
              geste.current = null;
            }}
          >
            {src && <img src={src} alt={doc.alt ?? ''} draggable={false} />}

            {/* Voile sur ce qui sera écarté — rend l'exclusion lisible
                d'un coup d'œil, sans masquer le contenu pour autant. */}
            <div className="tituba-crop__shade" aria-hidden="true">
              <div
                className="tituba-crop__hole"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                }}
              />
            </div>

            <div
              className="tituba-crop__sel"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
              }}
              onPointerDown={(e) => {
                frameRef.current?.setPointerCapture(e.pointerId);
                const p = pct(e.clientX, e.clientY);
                geste.current = { mode: 'move', dx: p.x - crop.x, dy: p.y - crop.y };
              }}
            >
              <span
                className="tituba-crop__handle"
                onPointerDown={(e) => {
                  // Sans stopPropagation, le même pointeur déclencherait
                  // aussi le déplacement : on tirerait le coin tout en
                  // déplaçant le cadre.
                  e.stopPropagation();
                  frameRef.current?.setPointerCapture(e.pointerId);
                  geste.current = { mode: 'resize', dx: 0, dy: 0 };
                }}
              />
            </div>
          </div>

          <div className="tituba-crop__actions">
            <button type="button" className="tituba-btn tituba-btn--ghost" onClick={zoneMaximale}>
              Zone maximale
            </button>
            <button
              type="button"
              className="tituba-btn"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Valider le cadrage'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bloc principal ───────────────────────────────────────────────────

// Rendu nu, sans libellé ni aide : le composant vit dans la barre
// latérale, où la boucle de champs de PublicationEditView fournit déjà
// le <label> et le texte d'aide depuis le registre. Les redoubler
// afficherait deux fois le même intitulé.
export default function UnsplashImagePicker({
  value,
  onChange,
}: {
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
  /** Doc en attente de cadrage — non nul = fenêtre de recadrage ouverte. */
  const [cropDoc, setCropDoc] = useState<NonNullable<MediaValue> | null>(null);

  useEffect(() => {
    if (value && typeof value === 'object') setResolved(value);
    if (value == null) setResolved(null);
  }, [value]);

  // Une photo non carrée sera rognée par le hero du billet : on ouvre
  // aussitôt le choix de la zone visible, plutôt que de laisser
  // découvrir le recadrage centré par défaut une fois l'article publié.
  const retenir = useCallback(
    (doc: MediaValue) => {
      setResolved(doc);
      onChange(doc?.id ?? null, doc);
      setModalOpen(false);
      if (doc && doc.width && doc.height && doc.width !== doc.height) {
        setCropDoc(doc);
      }
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
      // Même traitement qu'une photo Unsplash : un fichier uploté à la
      // main subit exactement le même rognage carré dans le hero.
      retenir(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’upload.');
    } finally {
      setUploading(false);
    }
  }

  const img = previewUrl(resolved);

  return (
    <div className="img-block">
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
              <div className="img-block__links">
                {/* Rouvrir le cadrage sans repasser par une sélection —
                    l'image en place peut avoir été choisie avant, ou son
                    cadrage jugé insatisfaisant après coup. Masqué pour une
                    image déjà carrée : il n'y aurait rien à y régler. */}
                {resolved.width && resolved.height && resolved.width !== resolved.height && (
                  <button
                    type="button"
                    className="img-block__link"
                    onClick={() => setCropDoc(resolved)}
                  >
                    Ajuster le cadrage
                  </button>
                )}
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

      {modalOpen && <UnsplashSearchModal onPick={retenir} onClose={() => setModalOpen(false)} />}

      {cropDoc && (
        <CropModal
          doc={cropDoc}
          onDone={(crop) => {
            // Reflète le cadrage sur l'état local : rouvrir la fenêtre
            // repartirait sinon de la zone d'avant.
            setResolved((r) => (r ? { ...r, crop } : r));
            setCropDoc(null);
          }}
          onCancel={() => setCropDoc(null)}
        />
      )}
    </div>
  );
}
