'use client';

// IndexPagesEditView (client) — vue Édition custom du global IndexPages.
//
// Quatre sections symétriques (toggle enabled + heroTitle + heroLede)
// pour les quatre landings « système » du site : accueil, archives,
// thèmes, s'abonner.
//
// Le toggle `enabled` désactive l'URL (404 côté Astro) et fait
// disparaître l'entrée du sélecteur dans Navigation.
//
// Fetch via /cms/api/globals/index-pages. Save via POST.

import React, { useEffect, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_URL = '/cms/api/globals/index-pages';

type HeroBlock = {
  enabled?: boolean;
  heroTitle?: string;
  heroLede?: string;
};

type IndexPagesData = {
  home?: HeroBlock;
  archives?: HeroBlock;
  themes?: HeroBlock;
  subscribe?: HeroBlock;
};

type IndexKey = keyof IndexPagesData;

const KEYS: IndexKey[] = ['home', 'archives', 'themes', 'subscribe'];

// La page d'accueil n'a pas de toggle d'activation (c'est la racine du
// site, elle doit toujours exister). Pour les trois autres : `toggleable`.
const SECTION_META: Record<
  IndexKey,
  { title: string; route: string; help: React.ReactNode; toggleable: boolean; disabledHint?: string }
> = {
  home: {
    title: "Page d'accueil",
    route: '/',
    toggleable: false,
    help: (
      <>
        Titre principal et texte de présentation affichés en haut de la home.
        Entourer une portion de <code>*</code> pour la mettre en italique
        dans le titre (ex. <code>*études de genre*</code>).
      </>
    ),
  },
  archives: {
    title: 'Page Archives',
    route: '/archives/',
    toggleable: true,
    help: (
      <>
        Titre et présentation de la page <code>/archives/</code>.
      </>
    ),
    disabledHint: 'Si désactivée, /archives/ renvoie 404.',
  },
  themes: {
    title: 'Page Thèmes',
    route: '/themes/',
    toggleable: true,
    help: (
      <>
        Titre et présentation de la page <code>/themes/</code>.
      </>
    ),
    disabledHint: 'Si désactivée, /themes/ et /theme/<slug>/ renvoient 404.',
  },
  subscribe: {
    title: 'Page Abonnement',
    route: '/abonnement/',
    toggleable: true,
    help: (
      <>
        Titre et présentation de la page <code>/abonnement/</code>.
      </>
    ),
    disabledHint: 'Si désactivée, /abonnement/ renvoie 404.',
  },
};

const EMPTY: IndexPagesData = {
  home: { enabled: true, heroTitle: '', heroLede: '' },
  archives: { enabled: true, heroTitle: '', heroLede: '' },
  themes: { enabled: true, heroTitle: '', heroLede: '' },
  subscribe: { enabled: true, heroTitle: '', heroLede: '' },
};

function normalizeBlock(b: HeroBlock | undefined): HeroBlock {
  return {
    enabled: b?.enabled !== false, // défaut true
    heroTitle: b?.heroTitle ?? '',
    heroLede: b?.heroLede ?? '',
  };
}

function normalize(doc: IndexPagesData): IndexPagesData {
  return {
    home: normalizeBlock(doc.home),
    archives: normalizeBlock(doc.archives),
    themes: normalizeBlock(doc.themes),
    subscribe: normalizeBlock(doc.subscribe),
  };
}

export default function IndexPagesEditViewClient(): React.ReactElement {
  const [data, setData] = useState<IndexPagesData>(EMPTY);
  const [initial, setInitial] = useState<IndexPagesData>(EMPTY);
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
      .then((doc: IndexPagesData) => {
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

  function updateField(group: IndexKey, key: keyof HeroBlock, value: string | boolean) {
    setData((d) => ({
      ...d,
      [group]: { ...(d[group] ?? {}), [key]: value },
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
      const doc = (await res.json()) as { result?: IndexPagesData } | IndexPagesData;
      const fresh: IndexPagesData =
        (doc as { result?: IndexPagesData }).result ?? (doc as IndexPagesData);
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
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Pages principales' }]}
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
          {KEYS.map((k) => {
            const meta = SECTION_META[k];
            const block = data[k] ?? {};
            const enabled = !meta.toggleable || block.enabled !== false;
            return (
              <section key={k} className="carnet-editview__section">
                <h2 className="carnet-editview__section-title">{meta.title}</h2>
                <p className="carnet-editview__section-help">{meta.help}</p>

                {meta.toggleable && (
                  <div className="carnet-editview__field carnet-editview__field--toggle">
                    <span className="lbl">Page {enabled ? 'activée' : 'désactivée'}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Activer ou désactiver ${meta.title}`}
                      className={
                        enabled
                          ? 'carnet-toggle carnet-toggle--on'
                          : 'carnet-toggle'
                      }
                      onClick={() => updateField(k, 'enabled', !enabled)}
                    >
                      <span className="carnet-toggle__thumb" aria-hidden="true" />
                    </button>
                    <span className="hint">
                      {enabled ? `Accessible à ${meta.route}.` : meta.disabledHint}
                    </span>
                  </div>
                )}

                <label className="carnet-editview__field">
                  <span className="lbl">Titre du hero</span>
                  <textarea
                    rows={3}
                    value={block.heroTitle ?? ''}
                    onChange={(e) => updateField(k, 'heroTitle', e.target.value)}
                    disabled={!enabled}
                  />
                </label>

                <label className="carnet-editview__field">
                  <span className="lbl">Texte de présentation (lede)</span>
                  <textarea
                    rows={4}
                    value={block.heroLede ?? ''}
                    onChange={(e) => updateField(k, 'heroLede', e.target.value)}
                    disabled={!enabled}
                  />
                </label>
              </section>
            );
          })}
        </form>
      )}
    </CarnetPage>
  );
}
