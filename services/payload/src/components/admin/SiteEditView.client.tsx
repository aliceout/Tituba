'use client'

// SiteEditView (client) — vue Édition custom du global Site (label
// « Options »). Branding + Lecture des billets, plus la section Version
// si elle est injectée par le wrapper server.
//
// Les autres axes (identité, abonnements, navigation, pages d'index)
// vivent dans des globals dédiés avec leur propre edit view.
//
// Fetch via /cms/api/globals/site (cookies de session). Save via
// POST /cms/api/globals/site.

import React, { useEffect, useState } from 'react'

import CarnetPage from './CarnetPage'

const API_URL = '/cms/api/globals/site'

type SiteData = {
  branding?: {
    accentColor?: string
    backgroundColor?: string
  }
  reading?: {
    notesMode?: 'classic' | 'sidenotes'
  }
  preparation?: {
    noindex?: boolean
    accesRestreint?: boolean
    /** Saisie seulement : le serveur la remplace par son condensat, et
     *  ce champ revient toujours vide. */
    clefApercu?: string
    clefApercuHash?: string
    demoChargee?: boolean
    demoEtat?: string
  }
}

// Doit rester aligné avec les options du select dans globals/Site.ts.
const ACCENT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Violet (par défaut)', value: '#5a3a7a' },
  { label: 'Rouge sourd', value: '#8a3a3a' },
  { label: 'Bleu encre', value: '#1f3a5a' },
  { label: 'Gris ardoise', value: '#3a3a3a' },
  { label: 'Vert forêt', value: '#2d5a3d' },
]
const DEFAULT_ACCENT = ACCENT_OPTIONS[0].value

const BG_OPTIONS: { label: string; value: string }[] = [
  { label: 'Ivoire (par défaut)', value: '#f6f5f1' },
  { label: 'Presque-blanc', value: '#fdfcf8' },
  { label: 'Blanc pur', value: '#ffffff' },
  { label: 'Craie', value: '#f1efe8' },
  { label: 'Parchemin', value: '#eee9dd' },
  { label: 'Froid pâle', value: '#e9eaec' },
]
const DEFAULT_BG = BG_OPTIONS[0].value

const EMPTY: SiteData = {
  branding: { accentColor: DEFAULT_ACCENT, backgroundColor: DEFAULT_BG },
  reading: { notesMode: 'classic' },
  preparation: { noindex: false, accesRestreint: false, demoChargee: false },
}

function normalize(doc: SiteData): SiteData {
  return {
    branding: {
      accentColor: doc.branding?.accentColor || DEFAULT_ACCENT,
      backgroundColor: doc.branding?.backgroundColor || DEFAULT_BG,
    },
    reading: {
      notesMode: doc.reading?.notesMode === 'sidenotes' ? 'sidenotes' : 'classic',
    },
    preparation: {
      noindex: doc.preparation?.noindex === true,
      accesRestreint: doc.preparation?.accesRestreint === true,
      // Toujours vide : l'API ne rend jamais la clé, seulement son
      // empreinte. Le champ ne sert qu'à en envoyer une nouvelle.
      clefApercu: '',
      clefApercuHash: doc.preparation?.clefApercuHash ?? '',
      demoChargee: doc.preparation?.demoChargee === true,
      demoEtat: doc.preparation?.demoEtat ?? '',
    },
  }
}

/**
 * Le bloc de la clé d’aperçu.
 *
 * La clé est tirée au sort ICI, dans le navigateur, et envoyée au
 * serveur qui n’en garde que l’empreinte. Elle n’est donc lisible
 * qu’une fois, au moment où on la fabrique — d’où l’affichage du lien
 * complet, à recopier avant d’enregistrer.
 *
 * Ce détour évite de stocker un secret dans un global que l’API rend
 * publiquement.
 */
function ClefApercu({
  aUneClef,
  onNouvelleClef,
}: {
  aUneClef: boolean
  onNouvelleClef: (clef: string) => void
}): React.ReactElement {
  const [clef, setClef] = React.useState<string>('')

  function tirer() {
    const octets = new Uint8Array(16)
    crypto.getRandomValues(octets)
    // base64url : la clé voyage dans une URL, où « + » et « / » ne
    // survivent pas à un encodage de paramètre.
    const nouvelle = btoa(String.fromCharCode(...octets))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    setClef(nouvelle)
    onNouvelleClef(nouvelle)
  }

  // `origin` ne porte que le schéma et l'hôte — l'administration vit
  // sous /cms, mais le lien d'aperçu vise la racine du site.
  const lien = clef ? `${window.location.origin}/?apercu=${clef}` : ''

  return (
    <div className="tituba-editview__field">
      <span className="lbl">Lien d’aperçu</span>
      {clef ? (
        <>
          <input readOnly value={lien} onFocus={(e) => e.currentTarget.select()} />
          <small>
            <strong>À copier maintenant.</strong> Cette clé ne sera plus lisible après
            l’enregistrement — le serveur n’en garde qu’une empreinte. Pensez à enregistrer pour
            qu’elle prenne effet.
          </small>
        </>
      ) : (
        <>
          <button type="button" onClick={tirer}>
            {aUneClef ? 'Remplacer la clé' : 'Tirer une clé'}
          </button>
          <small>
            {aUneClef
              ? 'Une clé existe déjà et reste valable. En tirer une nouvelle invalide l’ancienne.'
              : 'Aucune clé pour l’instant : personne ne pourra entrer tant que le site est fermé.'}
          </small>
        </>
      )}
    </div>
  )
}

export default function SiteEditViewClient(): React.ReactElement {
  const [data, setData] = useState<SiteData>(EMPTY)
  const [initial, setInitial] = useState<SiteData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_URL}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((doc: SiteData) => {
        const n = normalize(doc)
        setData(n)
        setInitial(n)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      })
      .finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(data) !== JSON.stringify(initial)

  function updateAccent(value: string) {
    setData((d) => ({
      ...d,
      branding: { ...(d.branding ?? {}), accentColor: value },
    }))
  }

  function updateBackground(value: string) {
    setData((d) => ({
      ...d,
      branding: { ...(d.branding ?? {}), backgroundColor: value },
    }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`)
      }
      const doc = (await res.json()) as { result?: SiteData } | SiteData
      const fresh: SiteData = (doc as { result?: SiteData }).result ?? (doc as SiteData)
      const n = normalize(fresh)
      setData(n)
      setInitial(n)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <CarnetPage
      variant="editview"
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: 'Options' }]}
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
            e.preventDefault()
            void save()
          }}
        >
          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Branding</h2>
            <p className="tituba-editview__section-help">
              Couleurs appliquées à tout le site — accent (point de la marque, item nav actif,
              kickers, liens des billets, boutons actifs…) et fond (body, header, footer, fond des
              billets).
            </p>

            <label className="tituba-editview__field">
              <span className="lbl">Couleur d&apos;accentuation</span>
              <div className="tituba-accent-picker">
                <span
                  className="tituba-accent-picker__swatch"
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

            <label className="tituba-editview__field">
              <span className="lbl">Couleur de fond</span>
              <div className="tituba-accent-picker">
                <span
                  className="tituba-accent-picker__swatch"
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

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Lecture des billets</h2>
            <p className="tituba-editview__section-help">
              Choix typographique pour les notes de bas de page. S&apos;applique à tous les billets
              du Tituba.
            </p>

            <label className="tituba-editview__field">
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
                <option value="classic">Classique — toutes les notes en pied d&apos;article</option>
                <option value="sidenotes">En marge — notes alignées à droite du paragraphe</option>
              </select>
            </label>
          </section>

          <section className="tituba-editview__section">
            <h2 className="tituba-editview__section-title">Avant l&apos;ouverture</h2>
            <p className="tituba-editview__section-help">
              Trois réglages indépendants, pour travailler en ligne avant que le site soit annoncé.
              Ils se combinent librement.
            </p>

            <label className="tituba-editview__field">
              <span className="lbl">
                <input
                  type="checkbox"
                  checked={data.preparation?.noindex ?? false}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      preparation: { ...d.preparation, noindex: e.target.checked },
                    }))
                  }
                />{' '}
                Demander aux moteurs de ne pas indexer
              </span>
              <small>
                Pose un « noindex » sur toutes les pages et les fichiers, interdit tout le site dans
                robots.txt, et retire le plan du site. C&apos;est une demande, pas une garantie : un
                moteur peut l&apos;ignorer, et une page déjà indexée met du temps à disparaître.
              </small>
            </label>

            <label className="tituba-editview__field">
              <span className="lbl">
                <input
                  type="checkbox"
                  checked={data.preparation?.accesRestreint ?? false}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      preparation: { ...d.preparation, accesRestreint: e.target.checked },
                    }))
                  }
                />{' '}
                Fermer le site, sauf avec le lien d&apos;aperçu
              </span>
              <small>
                Le site répond « en préparation » à tout le monde, sauf à qui arrive par le lien
                ci-dessous. L&apos;administration reste joignable normalement.
              </small>
            </label>

            {/* La clé est tirée ici, dans le navigateur, et n'est jamais
                relue ensuite : le serveur n'en garde que l'empreinte. On
                l'affiche donc une fois, et on prévient qu'il faut la noter. */}
            <ClefApercu
              aUneClef={Boolean(data.preparation?.clefApercuHash)}
              onNouvelleClef={(clef) =>
                setData((d) => ({
                  ...d,
                  preparation: { ...d.preparation, clefApercu: clef },
                }))
              }
            />

            <label className="tituba-editview__field">
              <span className="lbl">
                <input
                  type="checkbox"
                  checked={data.preparation?.demoChargee ?? false}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      preparation: { ...d.preparation, demoChargee: e.target.checked },
                    }))
                  }
                />{' '}
                Charger les données de démonstration
              </span>
              <small>
                Coché puis enregistré, pose un jeu de faux billets, faux comptes et fausses images —
                de quoi montrer à quoi ressemble le site rempli. Décoché, les retire, et seulement
                eux : ce que vous aurez écrit n&apos;y touche pas. L&apos;opération prend quelques
                secondes.
              </small>
              {data.preparation?.demoEtat ? (
                <small style={{ opacity: 0.75 }}>
                  Dernière opération — {data.preparation.demoEtat}
                </small>
              ) : null}
            </label>
          </section>
        </form>
      )}
    </CarnetPage>
  )
}
