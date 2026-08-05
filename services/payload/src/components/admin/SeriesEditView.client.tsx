'use client';

// SeriesEditView (client) — vue Édition custom d'une série. Reprend le
// gabarit de ThemeEditView : CarnetPage variant editview, topbar avec
// état « non enregistré », raccourci ⌘S, modale de suppression.
//
// Deux choses lui sont propres :
//
//   — Le format se choisit à la création et se verrouille ensuite. Le
//     changer sur une série peuplée orphelinerait ses billets ; la
//     collection l'interdit aussi côté API (cf Series.ts), ce champ
//     grisé n'est que la traduction visible de cette règle.
//   — Les réglages de flux n'apparaissent que pour une émission, et se
//     présentent comme des surcharges : laissés vides, ce sont ceux du
//     global Abonnements qui s'appliquent.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import CarnetPage from './CarnetPage';
import UnsplashImagePicker from './publications/UnsplashImagePicker.client';
import { stripHeroMarkers } from '@/lib/hero-markers';

const API_SERIES = '/cms/api/series';

/**
 * Un média déjà enregistré porte toujours un identifiant — d'où `id`
 * obligatoire, comme l'attend le sélecteur qu'on réemploie. Un champ
 * vide s'exprime par `null`, pas par un objet sans id.
 */
type MediaValue = {
  id: number | string;
  filename?: string | null;
  alt?: string | null;
  url?: string | null;
} | null;

type Feed = {
  explicit?: boolean;
  ownerEmail?: string | null;
};

type Theme = { id: number | string; name: string };

type Serie = {
  id?: number | string;
  name: string;
  slug: string;
  format: 'podcasts' | 'articles' | 'analyses';
  /** Peuplées (depth ≥ 1) ou brutes (juste cochées) selon le moment. */
  themes?: (Theme | number | string)[];
  lede?: string;
  image?: MediaValue | number | string | null;
  feed?: Feed;
  draft?: boolean;
};

type BilletLie = { id: number | string; title?: string; seriesNumber?: number | null };

const VIDE: Serie = {
  name: '',
  slug: '',
  format: 'articles',
  themes: [],
  lede: '',
  image: null,
  feed: { explicit: false, ownerEmail: '' },
  draft: true,
};

const FORMATS: { value: Serie['format']; label: string }[] = [
  { value: 'podcasts', label: 'Émission (podcasts)' },
  { value: 'articles', label: 'Articles de recherche' },
  { value: 'analyses', label: "Billets d'analyse" },
];


/** « Voix de la mer » → « voix-de-la-mer ». */
function slugifier(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SeriesEditViewClient({
  docId,
}: {
  docId: string | null;
}): React.ReactElement {
  const params = useSearchParams();
  const formatDemande = params?.get('format');

  const [data, setData] = useState<Serie>(() =>
    formatDemande === 'podcasts' || formatDemande === 'analyses' || formatDemande === 'articles'
      ? { ...VIDE, format: formatDemande }
      : VIDE,
  );
  const [initial, setInitial] = useState<string>(JSON.stringify(VIDE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [billets, setBillets] = useState<BilletLie[]>([]);
  /** Taxonomie complète, pour le sélecteur — chargée une fois. */
  const [themes, setThemes] = useState<Theme[]>([]);
  // Le slug ne se recalcule à partir du nom que tant que personne n'y a
  // touché : une série publiée garde son adresse même si on corrige son
  // titre, sinon les liens déjà partagés tombent.
  const [slugLibre, setSlugLibre] = useState(true);

  /**
   * Le format est-il déjà décidé par la porte qu'on a prise ?
   *
   * Pour une émission, oui : « Nouvelle émission » ne peut donner qu'un
   * podcast, et poser la question reviendrait à laisser répondre
   * autrement par mégarde.
   *
   * Pour une série de textes, non : la porte réunit deux formats — un
   * cycle d'articles de recherche et un feuilleton de billets d'analyse
   * sont deux séries différentes. Le sélecteur reste, restreint à ces
   * deux-là.
   */
  const porteEmission = formatDemande === 'podcasts';

  const estEmission = data.format === 'podcasts';
  const collectionLiee = estEmission ? 'podcasts' : data.format;
  const motEntree = estEmission ? 'épisode' : 'volet';

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      const depart =
        formatDemande === 'podcasts' || formatDemande === 'analyses' || formatDemande === 'articles'
          ? { ...VIDE, format: formatDemande }
          : VIDE;
      setInitial(JSON.stringify(depart));
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`${API_SERIES}/${encodeURIComponent(docId)}?depth=1`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: Serie) => {
        const norm: Serie = {
          ...VIDE,
          ...doc,
          name: doc.name ?? '',
          slug: doc.slug ?? '',
          lede: doc.lede ?? '',
          feed: { ...VIDE.feed, ...(doc.feed ?? {}) },
        };
        setData(norm);
        setInitial(JSON.stringify(norm));
        setSlugLibre(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    fetch('/cms/api/themes?limit=100&depth=0&sort=name', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: Theme[] }) => setThemes(res.docs ?? []))
      .catch(() => {
        /* liste vide — le reste du formulaire reste utilisable */
      });
  }, []);

  // Billets déjà rattachés — dans l'ordre où la page publique les
  // présentera : le rang s'il est renseigné, la date de parution sinon.
  useEffect(() => {
    if (!docId) return;
    fetch(
      `/cms/api/${collectionLiee}?where[series][equals]=${encodeURIComponent(docId)}&limit=100&depth=0&sort=seriesNumber`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: BilletLie[] }) => setBillets(res.docs ?? []))
      .catch(() => setBillets([]));
  }, [docId, collectionLiee]);

  const dirty = JSON.stringify(data) !== initial;

  function patch<K extends keyof Serie>(key: K, value: Serie[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function patchFeed<K extends keyof Feed>(key: K, value: Feed[K]) {
    setData((d) => ({ ...d, feed: { ...d.feed, [key]: value } }));
  }

  /** Identifiants des thématiques cochées, quelle que soit leur forme. */
  const themeIds = (data.themes ?? []).map((t) => (typeof t === 'object' ? t.id : t));

  function basculerTheme(id: number | string) {
    setData((d) => {
      const courant = d.themes ?? [];
      const ids = courant.map((t) => (typeof t === 'object' ? t.id : t));
      if (ids.includes(id)) {
        return { ...d, themes: courant.filter((t) => (typeof t === 'object' ? t.id : t) !== id) };
      }
      return { ...d, themes: [...courant, themes.find((t) => t.id === id) ?? id] };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const existe = data.id != null && data.id !== '';
      const url = existe ? `${API_SERIES}/${encodeURIComponent(String(data.id))}` : API_SERIES;
      // L'image peut être un objet peuplé (depth=1) : l'API attend un
      // identifiant, pas le document.
      const image =
        data.image && typeof data.image === 'object' ? (data.image.id ?? null) : (data.image ?? null);
      const corps: Record<string, unknown> = {
        name: data.name,
        lede: data.lede,
        // L'API attend des identifiants, pas les documents peuplés que
        // renvoie un fetch avec depth ≥ 1.
        themes: themeIds,
        image,
        draft: data.draft,
        ...(estEmission ? { feed: data.feed } : {}),
      };
      // Format et slug ne sont envoyés qu'à la création : l'API les
      // refuse en modification, et les inclure ferait échouer chaque
      // enregistrement.
      if (!existe) {
        corps.format = data.format;
        corps.slug = data.slug;
      }

      const res = await fetch(url, {
        method: existe ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status} — ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { doc?: Serie } | Serie;
      const frais: Serie = (json as { doc?: Serie }).doc ?? (json as Serie);
      const norm: Serie = { ...VIDE, ...frais, feed: { ...VIDE.feed, ...(frais.feed ?? {}) } };
      setData(norm);
      setInitial(JSON.stringify(norm));
      setSavedAt(Date.now());
      setSlugLibre(false);
      if (!docId && frais.id != null && typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/cms/admin/collections/series/${frais.id}`);
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
      const res = await fetch(`${API_SERIES}/${encodeURIComponent(String(data.id))}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (typeof window !== 'undefined') {
        window.location.href = `/cms/admin/collections/series?format=${estEmission ? 'podcasts' : 'textes'}`;
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
      modifier="series"
      crumbs={[
        { href: '/cms/admin', label: 'Tituba' },
        {
          href: `/cms/admin/collections/series?format=${estEmission ? 'podcasts' : 'textes'}`,
          label: estEmission ? 'Émissions' : "Séries d'articles",
        },
        { label: data.slug || (docId ? '—' : 'nouvelle') },
      ]}
      suppressHydrationWarningOnActions
      topbarActions={
        <>
          {dirty && (
            <span className="tituba-editview__dirty" aria-live="polite">
              Modifications non enregistrées
            </span>
          )}
          {!dirty && savedAt && (
            <span className="tituba-editview__saved" aria-live="polite">
              Enregistré
            </span>
          )}
          {data.id != null && (
            <button
              type="button"
              className="tituba-btn tituba-btn--ghost"
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
            className="tituba-btn tituba-btn--accent"
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
      {error && <div className="tituba-editview__error">Erreur : {error}</div>}

      {loading ? (
        <div className="tituba-editview__loading">Chargement…</div>
      ) : (
        <form
          className="tituba-editview__form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="tituba-editview__hero">
            <h1 className="tituba-h1">{estEmission ? 'Émission' : 'Série'}</h1>
            {data.slug && (
              <p className="tituba-editview__hero-key">
                clé : <span className="mono">{data.slug}</span>
              </p>
            )}
          </div>

          <section className="tituba-editview__section">
            <label className="tituba-editview__field">
              <span className="lbl">Nom</span>
              <input
                type="text"
                value={data.name}
                onChange={(e) => {
                  patch('name', e.target.value);
                  if (slugLibre) patch('slug', slugifier(e.target.value));
                }}
                placeholder={estEmission ? 'Ex : Voix de la mer' : 'Ex : Homonationalismes'}
              />
              <span className="hint">
                Le nom sous lequel la série apparaît partout — page publique, mention sur chaque{' '}
                {motEntree}, et titre du flux pour une émission.
              </span>
            </label>

            <label className="tituba-editview__field">
              <span className="lbl">Slug</span>
              <input
                type="text"
                value={data.slug}
                onChange={(e) => {
                  setSlugLibre(false);
                  patch('slug', slugifier(e.target.value));
                }}
                placeholder="voix-de-la-mer"
                // Figé une fois la série créée : son adresse est
                // publique, et la changer casserait tous les liens déjà
                // partagés. On le rend impossible plutôt que d'en
                // avertir — un avertissement se lit après coup.
                disabled={data.id != null}
              />
              <span className="hint">
                {data.id != null ? (
                  <>
                    Adresse définitive : <span className="mono">/series/{data.slug}/</span>. Elle ne
                    change plus, même si le nom est corrigé.
                  </>
                ) : (
                  <>
                    Formera l’adresse <span className="mono">/series/{data.slug || '<slug>'}/</span>,
                    définitivement. Déduite du nom tant que vous n’y touchez pas.
                  </>
                )}
              </span>
            </label>

            {/* Le sélecteur ne s'affiche que là où il y a un choix.
                « Nouvelle émission » ne peut donner qu'un podcast, et une
                série existante ne peut plus changer de format — dans ces
                deux cas c'est le titre de la page qui l'annonce. Une
                série de textes, elle, se choisit encore entre articles de
                recherche et billets d'analyse. */}
            {!porteEmission && data.id == null && (
              <label className="tituba-editview__field">
                <span className="lbl">Format</span>
                <select
                  value={data.format}
                  onChange={(e) => patch('format', e.target.value as Serie['format'])}
                >
                  {FORMATS.filter((f) => f.value !== 'podcasts').map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Décide de ce qu’on pourra ranger dans cette série — des articles de recherche ou
                  des billets d’analyse, pas les deux. Non modifiable ensuite.
                </span>
              </label>
            )}

            {/* Même sélecteur que sur la fiche d'un billet — c'est la
                même taxonomie et le même geste. Les thématiques d'une
                série sont saisies et non déduites de ses billets : une
                émission de cinq épisodes en toucherait six par addition,
                et sa page afficherait un nuage au lieu d'un sujet. */}
            <div className="tituba-editview__field">
              <span className="lbl">Thématiques</span>
              <details className="multi-select">
                <summary>
                  {themeIds.length === 0
                    ? 'Sélectionner des thématiques…'
                    : `${themeIds.length} thématique${themeIds.length > 1 ? 's' : ''} sélectionnée${
                        themeIds.length > 1 ? 's' : ''
                      }`}
                </summary>
                <div className="multi-select__list">
                  {themes.length === 0 && (
                    <div className="multi-select__empty">Aucune thématique disponible.</div>
                  )}
                  {themes.map((t) => (
                    <label key={t.id} className="multi-select__opt">
                      <input
                        type="checkbox"
                        checked={themeIds.includes(t.id)}
                        onChange={() => basculerTheme(t.id)}
                      />
                      <span>{t.name}</span>
                    </label>
                  ))}
                </div>
              </details>
              <span className="hint">
                Ce dont traite la série dans son ensemble. Indépendantes de celles de ses{' '}
                {motEntree}s, qui peuvent être plus précises.
              </span>
            </div>

            <label className="tituba-editview__field">
              <span className="lbl">Présentation</span>
              <textarea
                rows={4}
                value={data.lede ?? ''}
                onChange={(e) => patch('lede', e.target.value)}
              />
              <span className="hint">
                2 à 4 phrases, en tête de la page de la série
                {estEmission ? ' — et description de l’émission dans les applications d’écoute.' : '.'}
              </span>
            </label>
          </section>

          <section className="tituba-editview__section">
            <div className="tituba-editview__field">
              <span className="lbl">Image</span>
              {/* Bande large et non carré : cette image sert de fond au
                  hero pleine largeur des billets de la série, pas de
                  vignette. Cadrer en carré ce qui s'affichera en bandeau
                  ne donnait aucune idée de ce qui serait gardé. La
                  valeur suit la proportion du hero d'épisode — environ
                  trois fois plus large que haut. */}
              <UnsplashImagePicker
                value={data.image ?? null}
                onChange={(id) => patch('image', id)}
                aspect={16 / 5}
              />
              <span className="hint">
                Fond du hero des billets de la série.
                {estEmission
                  ? ' Sert aussi de couverture dans les applications d’écoute : carrée, entre 1400 et 3000 px de côté.'
                  : ''}
              </span>
            </div>
          </section>

          {estEmission && (
            <section className="tituba-editview__section">
              <h2 className="tituba-editview__section-title">Flux podcast</h2>
              <p className="tituba-editview__section-help">
                Ces trois réglages surchargent ceux du global{' '}
                <Link href="/cms/admin/globals/subscriptions">Abonnements</Link>. Laissés vides, ce
                sont ceux du site qui s’appliquent — inutile de ressaisir la même adresse de contact
                à chaque émission.
              </p>

              <label className="tituba-editview__field tituba-editview__field--toggle">
                <input
                  type="checkbox"
                  checked={Boolean(data.feed?.explicit)}
                  onChange={(e) => patchFeed('explicit', e.target.checked)}
                />
                <span className="lbl">Contenu explicite</span>
                <span className="hint">
                  À cocher si les épisodes de cette émission comportent des propos crus. Une omission
                  peut faire retirer le flux.
                </span>
              </label>

              <label className="tituba-editview__field">
                <span className="lbl">Adresse de contact du flux</span>
                <input
                  type="email"
                  value={data.feed?.ownerEmail ?? ''}
                  onChange={(e) => patchFeed('ownerEmail', e.target.value)}
                  placeholder="réglage du site"
                />
                <span className="hint">
                  Sert à Apple et Spotify pour vérifier que le flux est bien déposé par vous.
                  Publique, puisque présente dans le flux.
                </span>
              </label>
            </section>
          )}

          <section className="tituba-editview__section">
            <label className="tituba-editview__field tituba-editview__field--toggle">
              <input
                type="checkbox"
                checked={Boolean(data.draft)}
                onChange={(e) => patch('draft', e.target.checked)}
              />
              <span className="lbl">Brouillon</span>
              <span className="hint">
                Tant que la case est cochée, la série n’a pas de page publique
                {estEmission ? ' et son flux n’est pas publié' : ''}. Les billets qu’elle contient,
                eux, restent publiés — c’est leur propre brouillon qui en décide.
              </span>
            </label>
          </section>

          {data.id != null && (
            <div className="tituba-biblio-usedin">
              {billets.length === 0 ? (
                <span>
                  Aucun {motEntree} dans cette série pour l’instant. On les y range depuis la fiche du
                  billet, pas d’ici.
                </span>
              ) : (
                <>
                  {billets.length} {billets.length > 1 ? `${motEntree}s` : motEntree} :{' '}
                  {billets.map((b, i) => (
                    <React.Fragment key={b.id}>
                      {i > 0 && ', '}
                      <Link href={`/cms/admin/collections/${collectionLiee}/${b.id}`}>
                        {stripHeroMarkers(b.title) || `#${b.id}`}
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
          className="tituba-modal-backdrop"
          onClick={() => {
            if (!deleteSubmitting) setDeleteOpen(false);
          }}
        >
          <div className="tituba-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="tituba-modal__header">
              <h2>Supprimer {estEmission ? 'cette émission' : 'cette série'} ?</h2>
              <button
                type="button"
                className="tituba-modal__close"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteSubmitting}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {deleteError && <div className="tituba-modal__error">Erreur&nbsp;: {deleteError}</div>}

            <div className="tituba-modal__body">
              <p>
                <strong>{data.name || 'Sans nom'}</strong> sera supprimée.
                {billets.length > 0 ? (
                  <>
                    {' '}
                    Les {billets.length} {billets.length > 1 ? `${motEntree}s` : motEntree} qu’elle
                    contient ne seront pas effacés : ils se retrouveront simplement sans série.
                  </>
                ) : (
                  ' Elle ne contient aucun billet.'
                )}
              </p>
            </div>

            <footer className="tituba-modal__footer">
              <button
                type="button"
                className="tituba-btn tituba-btn--ghost"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteSubmitting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="tituba-btn tituba-btn--danger"
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
