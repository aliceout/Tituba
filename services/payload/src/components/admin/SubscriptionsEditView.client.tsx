'use client';

// SubscriptionsEditView (client) — vue Édition custom du global
// Subscriptions. Pour l'instant : URLs des profils sociaux. À venir :
// toggle d'activation du flux RSS, toggle des alertes mail (issue #3).
//
// Fetch via /cms/api/globals/subscriptions (cookies de session). Save
// via POST /cms/api/globals/subscriptions.

import React, { useEffect, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_URL = '/cms/api/globals/subscriptions';

type SubscriptionsData = {
  rssEnabled?: boolean;
  emailEnabled?: boolean;
  mastodon?: string;
  bluesky?: string;
  orcid?: string;
  hal?: string;
};

const SOCIAL_KEYS = ['mastodon', 'bluesky', 'orcid', 'hal'] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

const EMPTY: SubscriptionsData = {
  rssEnabled: true,
  emailEnabled: true,
  mastodon: '',
  bluesky: '',
  orcid: '',
  hal: '',
};

function normalize(doc: SubscriptionsData): SubscriptionsData {
  return {
    rssEnabled: doc.rssEnabled !== false,
    emailEnabled: doc.emailEnabled !== false,
    mastodon: doc.mastodon ?? '',
    bluesky: doc.bluesky ?? '',
    orcid: doc.orcid ?? '',
    hal: doc.hal ?? '',
  };
}

const LABELS: Record<SocialKey, string> = {
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  orcid: 'ORCID',
  hal: 'HAL',
};

export default function SubscriptionsEditViewClient(): React.ReactElement {
  const [data, setData] = useState<SubscriptionsData>(EMPTY);
  const [initial, setInitial] = useState<SubscriptionsData>(EMPTY);
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
      .then((doc: SubscriptionsData) => {
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

  function updateSocial(key: SocialKey, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }
  function toggleRss() {
    setData((d) => ({ ...d, rssEnabled: !(d.rssEnabled !== false) }));
  }
  function toggleEmail() {
    setData((d) => ({ ...d, emailEnabled: !(d.emailEnabled !== false) }));
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
      const doc = (await res.json()) as { result?: SubscriptionsData } | SubscriptionsData;
      const fresh: SubscriptionsData =
        (doc as { result?: SubscriptionsData }).result ?? (doc as SubscriptionsData);
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
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Abonnements' }]}
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
            <h2 className="carnet-editview__section-title">Flux RSS</h2>
            <p className="carnet-editview__section-help">
              Si désactivé : <code>/rss.xml</code> renvoie 404, le lien
              « Flux RSS » du footer disparaît, et la section RSS de la
              page <code>/abonnement/</code> disparaît.
            </p>

            <div className="carnet-editview__field carnet-editview__field--toggle">
              <span className="lbl">
                Flux RSS {data.rssEnabled !== false ? 'activé' : 'désactivé'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={data.rssEnabled !== false}
                aria-label="Activer ou désactiver le flux RSS"
                className={
                  data.rssEnabled !== false
                    ? 'carnet-toggle carnet-toggle--on'
                    : 'carnet-toggle'
                }
                onClick={toggleRss}
              >
                <span className="carnet-toggle__thumb" aria-hidden="true" />
              </button>
              <span className="hint">
                {data.rssEnabled !== false
                  ? 'Le flux est servi à /rss.xml et le lien apparaît dans le footer.'
                  : 'Le flux est désactivé et son lien retiré du footer.'}
              </span>
            </div>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Alertes mail</h2>
            <p className="carnet-editview__section-help">
              Si désactivé : le formulaire d&apos;inscription disparaît de
              <code>/abonnement/</code> et aucun mail n&apos;est envoyé
              à la publication des nouveaux billets.
              <br />
              Les abonné·es déjà actif·ves restent dans la base —
              réactivation possible plus tard sans qu&apos;iels aient à
              se réinscrire.
            </p>

            <div className="carnet-editview__field carnet-editview__field--toggle">
              <span className="lbl">
                Alertes mail {data.emailEnabled !== false ? 'activées' : 'désactivées'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={data.emailEnabled !== false}
                aria-label="Activer ou désactiver les alertes mail"
                className={
                  data.emailEnabled !== false
                    ? 'carnet-toggle carnet-toggle--on'
                    : 'carnet-toggle'
                }
                onClick={toggleEmail}
              >
                <span className="carnet-toggle__thumb" aria-hidden="true" />
              </button>
              <span className="hint">
                {data.emailEnabled !== false
                  ? "Le formulaire d'inscription est visible et les mails partent à chaque nouveau billet."
                  : "Inscription fermée, aucun mail envoyé."}
              </span>
            </div>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Réseaux sociaux</h2>
            <p className="carnet-editview__section-help">
              URLs complètes des profils — laisser vide pour masquer.
              Affichés dans le footer (col 3) et sur la page /abonnement/.
            </p>

            {SOCIAL_KEYS.map((k) => (
              <label key={k} className="carnet-editview__field">
                <span className="lbl">{LABELS[k]}</span>
                <input
                  type="url"
                  value={data[k] ?? ''}
                  onChange={(e) => updateSocial(k, e.target.value)}
                  placeholder={`https://…`}
                />
              </label>
            ))}
          </section>
        </form>
      )}
    </CarnetPage>
  );
}
