'use client';

// SubscriptionsEditView (client) — vue Édition custom du global
// Subscriptions : flux RSS, alertes mail, flux podcast, profils sociaux.
//
// Fetch via /cms/api/globals/subscriptions (cookies de session). Save
// via POST /cms/api/globals/subscriptions.

import React, { useEffect, useRef, useState } from 'react';

import CarnetPage from './CarnetPage';

const API_URL = '/cms/api/globals/subscriptions';
const API_MEDIA = '/cms/api/media';

/** Bornes imposées par Apple Podcasts pour la vignette d'un flux. */
const COVER_MIN = 1400;
const COVER_MAX = 3000;

type MediaDoc = {
  id: number | string;
  filename?: string | null;
  url?: string | null;
  width?: number | null;
  height?: number | null;
} | null;

type SubscriptionsData = {
  rssEnabled?: boolean;
  emailEnabled?: boolean;
  podcastCover?: MediaDoc | number | string | null;
  podcastExplicit?: boolean;
  podcastOwnerEmail?: string;
  mastodon?: string;
  bluesky?: string;
  orcid?: string;
  hal?: string;
};


/**
 * Couverture du flux — dépôt d'un fichier et rien d'autre : pas de
 * recadrage, contrairement à l'image de couverture d'un billet. Le
 * cadrage des billets est une instruction de mise en page appliquée par
 * le CSS du site ; ici c'est le fichier lui-même que les applications
 * d'écoute téléchargent, et aucune consigne d'affichage ne les suivrait.
 * L'image doit donc être carrée à la source — d'où le contrôle des
 * dimensions, qui prévient plutôt que de laisser un flux se faire
 * refuser sans explication des semaines plus tard.
 */
function CoverField({
  value,
  onChange,
}: {
  value: MediaDoc | number | string | null | undefined;
  onChange: (doc: MediaDoc) => void;
}): React.ReactElement {
  const [doc, setDoc] = useState<MediaDoc>(value && typeof value === 'object' ? value : null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && typeof value === 'object') setDoc(value);
    if (value == null) setDoc(null);
  }, [value]);

  async function deposer(file: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('_payload', JSON.stringify({ alt: 'Couverture du podcast', title: file.name }));
      const res = await fetch(API_MEDIA, { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) throw new Error(`Envoi refusé (HTTP ${res.status}).`);
      const json = (await res.json()) as { doc?: MediaDoc };
      const media = json.doc ?? null;
      setDoc(media);
      onChange(media);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setEnvoi(false);
    }
  }

  const src = doc?.filename ? `${API_MEDIA}/file/${encodeURIComponent(doc.filename)}` : null;
  const l = doc?.width ?? 0;
  const h = doc?.height ?? 0;
  const avertissement =
    doc && l > 0 && h > 0
      ? l !== h
        ? `Image non carrée (${l} × ${h}) — les applications d’écoute la refuseront.`
        : l < COVER_MIN
          ? `Image trop petite (${l} px de côté, minimum ${COVER_MIN}).`
          : l > COVER_MAX
            ? `Image trop grande (${l} px de côté, maximum ${COVER_MAX}).`
            : null
      : null;

  return (
    <div className="tituba-editview__field">
      <span className="lbl">Couverture</span>
      <div className="podcast-cover">
        {src ? (
          <img className="podcast-cover__img" src={src} alt="" />
        ) : (
          <div className="podcast-cover__empty">Aucune couverture</div>
        )}
        <div className="podcast-cover__side">
          <button
            type="button"
            className="tituba-btn tituba-btn--ghost"
            onClick={() => inputRef.current?.click()}
            disabled={envoi}
          >
            {envoi ? 'Envoi…' : src ? 'Remplacer' : 'Déposer une image'}
          </button>
          {src && (
            <button
              type="button"
              className="podcast-cover__remove"
              onClick={() => {
                setDoc(null);
                onChange(null);
              }}
              disabled={envoi}
            >
              Retirer
            </button>
          )}
          {doc && l > 0 && (
            <span className="podcast-cover__dims">
              {l} × {h} px
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void deposer(f);
            e.target.value = '';
          }}
        />
      </div>
      {avertissement && <span className="podcast-cover__warn">{avertissement}</span>}
      {erreur && <span className="podcast-cover__warn">{erreur}</span>}
      <span className="hint">
        Carrée, entre {COVER_MIN} et {COVER_MAX} px de côté. JPEG ou PNG.
      </span>
    </div>
  );
}

const SOCIAL_KEYS = ['mastodon', 'bluesky', 'orcid', 'hal'] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

const EMPTY: SubscriptionsData = {
  rssEnabled: true,
  emailEnabled: true,
  podcastCover: null,
  podcastExplicit: false,
  podcastOwnerEmail: '',
  mastodon: '',
  bluesky: '',
  orcid: '',
  hal: '',
};

function normalize(doc: SubscriptionsData): SubscriptionsData {
  return {
    rssEnabled: doc.rssEnabled !== false,
    emailEnabled: doc.emailEnabled !== false,
    podcastCover: doc.podcastCover ?? null,
    podcastExplicit: doc.podcastExplicit === true,
    podcastOwnerEmail: doc.podcastOwnerEmail ?? '',
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
    // depth=1 et non 0 : la couverture doit revenir peuplée (nom de
    // fichier et dimensions) pour qu'on puisse l'afficher et vérifier
    // qu'elle est carrée. À depth=0 on ne recevrait qu'un identifiant.
    fetch(`${API_URL}?depth=1`, { credentials: 'include' })
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
        // La couverture est renvoyée peuplée par le fetch : on la
        // réduit à son identifiant avant l'envoi, seule forme qu'une
        // relation accepte à l'écriture.
        body: JSON.stringify({
          ...data,
          podcastCover:
            data.podcastCover && typeof data.podcastCover === 'object'
              ? data.podcastCover.id
              : (data.podcastCover ?? null),
        }),
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
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: 'Abonnements' }]}
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
          <button
            type="button"
            className="tituba-btn tituba-btn--accent"
            onClick={save}
            disabled={!dirty || saving || loading}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
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
          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Flux RSS</h2>
            <p className="tituba-editview__section-help">
              Si désactivé : <code>/rss.xml</code> renvoie 404, le lien
              « Flux RSS » du footer disparaît, et la section RSS de la
              page <code>/abonnement/</code> disparaît.
            </p>

            <div className="tituba-editview__field tituba-editview__field--toggle">
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
                    ? 'tituba-toggle tituba-toggle--on'
                    : 'tituba-toggle'
                }
                onClick={toggleRss}
              >
                <span className="tituba-toggle__thumb" aria-hidden="true" />
              </button>
              <span className="hint">
                {data.rssEnabled !== false
                  ? 'Le flux est servi à /rss.xml et le lien apparaît dans le footer.'
                  : 'Le flux est désactivé et son lien retiré du footer.'}
              </span>
            </div>
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Alertes mail</h2>
            <p className="tituba-editview__section-help">
              Si désactivé : le formulaire d&apos;inscription disparaît de
              <code>/abonnement/</code> et aucun mail n&apos;est envoyé
              à la publication des nouveaux billets.
              <br />
              Les abonné·es déjà actif·ves restent dans la base —
              réactivation possible plus tard sans qu&apos;iels aient à
              se réinscrire.
            </p>

            <div className="tituba-editview__field tituba-editview__field--toggle">
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
                    ? 'tituba-toggle tituba-toggle--on'
                    : 'tituba-toggle'
                }
                onClick={toggleEmail}
              >
                <span className="tituba-toggle__thumb" aria-hidden="true" />
              </button>
              <span className="hint">
                {data.emailEnabled !== false
                  ? "Le formulaire d'inscription est visible et les mails partent à chaque nouveau billet."
                  : "Inscription fermée, aucun mail envoyé."}
              </span>
            </div>
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Flux podcast</h2>
            <p className="tituba-editview__section-help">
              Réglages du flux <code>/podcasts/rss.xml</code>, celui
              qu&apos;on dépose chez Apple Podcasts, Spotify ou Pocket
              Casts. Sans couverture ni catégorie, le flux fonctionne
              sur le site mais aucune de ces applications ne
              l&apos;accepte.
            </p>

            <CoverField
              value={data.podcastCover}
              onChange={(doc) => setData((d) => ({ ...d, podcastCover: doc }))}
            />

            <div className="tituba-editview__field tituba-editview__field--toggle">
              <span className="lbl">Contenu explicite</span>
              <button
                type="button"
                role="switch"
                aria-checked={data.podcastExplicit === true}
                aria-label="Déclarer un contenu explicite"
                className={
                  data.podcastExplicit === true
                    ? 'tituba-toggle tituba-toggle--on'
                    : 'tituba-toggle'
                }
                onClick={() =>
                  setData((d) => ({ ...d, podcastExplicit: !(d.podcastExplicit === true) }))
                }
              >
                <span className="tituba-toggle__thumb" aria-hidden="true" />
              </button>
              <span className="hint">
                {data.podcastExplicit === true
                  ? 'Le flux est déclaré comme comportant des propos crus.'
                  : 'Le flux est déclaré tout public. Une omission peut faire retirer le podcast.'}
              </span>
            </div>

            <label className="tituba-editview__field">
              <span className="lbl">Adresse de contact</span>
              <input
                type="email"
                value={data.podcastOwnerEmail ?? ''}
                onChange={(e) =>
                  setData((d) => ({ ...d, podcastOwnerEmail: e.target.value }))
                }
                placeholder="podcast@…"
              />
              <span className="hint">
                Sert à vérifier que le flux est bien déposé par vous.
                Elle figure dans le flux, donc elle est publique.
              </span>
            </label>
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Réseaux sociaux</h2>
            <p className="tituba-editview__section-help">
              URLs complètes des profils — laisser vide pour masquer.
              Affichés dans le footer (col 3) et sur la page /abonnement/.
            </p>

            {SOCIAL_KEYS.map((k) => (
              <label key={k} className="tituba-editview__field">
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
