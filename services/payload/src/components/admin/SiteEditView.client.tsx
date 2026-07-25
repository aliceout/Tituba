'use client';

// SiteEditView (client) — vue Édition custom du global Site (label
// « Options »). Branding + Lecture des billets, plus la section Version
// si elle est injectée par le wrapper server.
//
// Les autres axes (identité, abonnements, navigation, pages d'index)
// vivent dans des globals dédiés avec leur propre edit view.
//
// Fetch via /cms/api/globals/site (cookies de session). Save via
// POST /cms/api/globals/site.

import React, { useEffect, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_URL = '/cms/api/globals/site';

type SiteData = {
  branding?: {
    accentColor?: string;
    backgroundColor?: string;
  };
  reading?: {
    notesMode?: 'classic' | 'sidenotes';
  };
};

// Doit rester aligné avec les options du select dans globals/Site.ts.
const ACCENT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Violet (par défaut)', value: '#5a3a7a' },
  { label: 'Rouge sourd', value: '#8a3a3a' },
  { label: 'Bleu encre', value: '#1f3a5a' },
  { label: 'Gris ardoise', value: '#3a3a3a' },
  { label: 'Vert forêt', value: '#2d5a3d' },
];
const DEFAULT_ACCENT = ACCENT_OPTIONS[0].value;

const BG_OPTIONS: { label: string; value: string }[] = [
  { label: 'Ivoire (par défaut)', value: '#f6f5f1' },
  { label: 'Presque-blanc', value: '#fdfcf8' },
  { label: 'Blanc pur', value: '#ffffff' },
  { label: 'Craie', value: '#f1efe8' },
  { label: 'Parchemin', value: '#eee9dd' },
  { label: 'Froid pâle', value: '#e9eaec' },
];
const DEFAULT_BG = BG_OPTIONS[0].value;

const EMPTY: SiteData = {
  branding: { accentColor: DEFAULT_ACCENT, backgroundColor: DEFAULT_BG },
  reading: { notesMode: 'classic' },
};

function normalize(doc: SiteData): SiteData {
  return {
    branding: {
      accentColor: doc.branding?.accentColor || DEFAULT_ACCENT,
      backgroundColor: doc.branding?.backgroundColor || DEFAULT_BG,
    },
    reading: {
      notesMode: doc.reading?.notesMode === 'sidenotes' ? 'sidenotes' : 'classic',
    },
  };
}

export default function SiteEditViewClient(): React.ReactElement {
  const [data, setData] = useState<SiteData>(EMPTY);
  const [initial, setInitial] = useState<SiteData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: SiteData) => {
        const n = normalize(doc);
        setData(n);
        setInitial(n);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = JSON.stringify(data) !== JSON.stringify(initial);

  function updateAccent(value: string) {
    setData((d) => ({
      ...d,
      branding: { ...(d.branding ?? {}), accentColor: value },
    }));
  }

  function updateBackground(value: string) {
    setData((d) => ({
      ...d,
      branding: { ...(d.branding ?? {}), backgroundColor: value },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      const doc = (await res.json()) as { result?: SiteData } | SiteData;
      const fresh: SiteData = (doc as { result?: SiteData }).result ?? (doc as SiteData);
      const n = normalize(fresh);
      setData(n);
      setInitial(n);
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
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Options' }]}
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
          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Branding</h2>
            <p className="carnet-editview__section-help">
              Couleurs appliquées à tout le site — accent (point de la marque,
              item nav actif, kickers, liens des billets, boutons actifs…) et
              fond (body, header, footer, fond des billets).
            </p>

            <label className="carnet-editview__field">
              <span className="lbl">Couleur d&apos;accentuation</span>
              <div className="carnet-accent-picker">
                <span
                  className="carnet-accent-picker__swatch"
                  style={{ background: data.branding?.accentColor || DEFAULT_ACCENT }}
                  aria-hidden="true"
                />
                <select
                  value={data.branding?.accentColor || DEFAULT_ACCENT}
                  onChange={(e) => updateAccent(e.target.value)}
                >
                  {ACCENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.value}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Couleur de fond</span>
              <div className="carnet-accent-picker">
                <span
                  className="carnet-accent-picker__swatch"
                  style={{ background: data.branding?.backgroundColor || DEFAULT_BG }}
                  aria-hidden="true"
                />
                <select
                  value={data.branding?.backgroundColor || DEFAULT_BG}
                  onChange={(e) => updateBackground(e.target.value)}
                >
                  {BG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.value}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Lecture des billets</h2>
            <p className="carnet-editview__section-help">
              Choix typographique pour les notes de bas de page. S&apos;applique à
              tous les billets du Carnet.
            </p>

            <label className="carnet-editview__field">
              <span className="lbl">Affichage des notes</span>
              <select
                value={data.reading?.notesMode ?? 'classic'}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    reading: { notesMode: e.target.value as 'classic' | 'sidenotes' },
                  }))
                }
              >
                <option value="classic">
                  Classique — toutes les notes en pied d&apos;article
                </option>
                <option value="sidenotes">
                  En marge — notes alignées à droite du paragraphe
                </option>
              </select>
            </label>
          </section>

        </form>
      )}
    </CarnetPage>
  );
}
