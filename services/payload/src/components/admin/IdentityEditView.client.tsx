'use client';

// IdentityEditView (client) — vue Édition custom du global Identity.
// Quatre champs simples (siteName, authorName, baseline, copyrightLine)
// dans une section unique « Identité ».
//
// Fetch via /cms/api/globals/identity (cookies de session). Save via
// POST /cms/api/globals/identity.

import React, { useEffect, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_URL = '/cms/api/globals/identity';

type IdentityData = {
  siteName?: string;
  authorName?: string;
  baseline?: string;
  copyrightLine?: string;
};

const EMPTY: IdentityData = {
  siteName: 'Carnet',
  authorName: '',
  baseline: '',
  copyrightLine: '',
};

function normalize(doc: IdentityData): IdentityData {
  return {
    siteName: doc.siteName ?? 'Carnet',
    authorName: doc.authorName ?? '',
    baseline: doc.baseline ?? '',
    copyrightLine: doc.copyrightLine ?? '',
  };
}

export default function IdentityEditViewClient(): React.ReactElement {
  const [data, setData] = useState<IdentityData>(EMPTY);
  const [initial, setInitial] = useState<IdentityData>(EMPTY);
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
      .then((doc: IdentityData) => {
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

  function update<K extends keyof IdentityData>(key: K, value: IdentityData[K]) {
    setData((d) => ({ ...d, [key]: value }));
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
      const doc = (await res.json()) as { result?: IdentityData } | IdentityData;
      const fresh: IdentityData =
        (doc as { result?: IdentityData }).result ?? (doc as IdentityData);
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
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Identité' }]}
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
            <h2 className="carnet-editview__section-title">Identité</h2>
            <p className="carnet-editview__section-help">
              Le « Nom du site » est le wordmark affiché dans le header, le
              footer, le suffixe des onglets navigateur, les mails et le flux
              RSS. Le « Nom complet » apparaît dans la description meta. La
              baseline et la ligne copyright apparaissent dans le footer
              (col 1).
              <br />
              Le format citation par auteur·ice (Chicago) se règle
              individuellement dans Mon compte.
            </p>

            <label className="carnet-editview__field">
              <span className="lbl">Nom du site (wordmark)</span>
              <input
                type="text"
                value={data.siteName ?? ''}
                onChange={(e) => update('siteName', e.target.value)}
                placeholder="Carnet"
              />
              <span className="hint">
                Court de préférence (1 à 2 mots). S&apos;applique partout où le
                nom du site apparaît côté visiteur·euse et dans les mails.
              </span>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Nom complet</span>
              <input
                type="text"
                value={data.authorName ?? ''}
                onChange={(e) => update('authorName', e.target.value)}
                placeholder="ex. Marie Dupont, LATTS, Collectif…"
              />
              <span className="hint">
                Nom du laboratoire de recherche, de la personne, du
                collectif… selon l&apos;utilisation du carnet.
              </span>
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Baseline</span>
              <textarea
                rows={3}
                value={data.baseline ?? ''}
                onChange={(e) => update('baseline', e.target.value)}
              />
            </label>

            <label className="carnet-editview__field">
              <span className="lbl">Ligne copyright</span>
              <input
                type="text"
                value={data.copyrightLine ?? ''}
                onChange={(e) => update('copyrightLine', e.target.value)}
              />
              <span className="hint">Affichée en mono sous la baseline.</span>
            </label>
          </section>
        </form>
      )}
    </CarnetPage>
  );
}
