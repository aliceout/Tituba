'use client';

// NavigationEditView (client) — vue Édition custom du global Navigation.
//
// Deux sections :
//   1. Header  : blocs réordonnables. Un seul type de bloc `navItem`
//                avec un `<select>` unifié qui propose dans une seule
//                liste les pages principales activées (Archives, Thèmes,
//                Abonnement) + toutes les pages éditoriales. Pas de
//                doublon possible : une page déjà choisie est exclue
//                des autres selects. Override de libellé optionnel.
//   2. Footer  : array de liens libres { label, href, external }.
//
// Fetch via /cms/api/globals/navigation. Save via POST.
//
// La liste des pages d'index activées vient du global IndexPages
// (champ `enabled` sur chaque section). Une page d'index désactivée
// ne peut pas être ajoutée au header.

import React, { useEffect, useMemo, useState } from 'react';

import CarnetPage from './CarnetPage';
import { stripHeroMarkers } from '@/lib/hero-markers';

const NAV_API = '/cms/api/globals/navigation';
// Les pages fixes sont des documents de `pages` marqués `kind: 'fixe'`
// depuis la fusion des deux listes — plus de global à interroger.
const PAGES_FIXES_API = '/cms/api/pages?where[kind][equals]=fixe&limit=10&depth=0';
const PAGES_API = '/cms/api/pages';

// ─── Types navHeader (un seul bloc) ─────────────────────────────────
type IndexTarget = 'archives' | 'themes' | 'subscribe';
type NavKind = 'index' | 'editorial';

type HeaderNavItem = {
  kind: NavKind;
  indexTarget?: IndexTarget;
  page?: number | string | { id?: number | string; title?: string; slug?: string } | null;
  label?: string;
  id?: string;
};

const INDEX_TARGETS: IndexTarget[] = ['archives', 'themes', 'subscribe'];

const INDEX_DEFAULT_LABEL: Record<IndexTarget, string> = {
  archives: 'Archives',
  themes: 'Thèmes',
  subscribe: 'Abonnement',
};

// Encodage de la sélection dans le <select> : "index:archives" ou
// "editorial:42". On garde le décodage trivial pour le save.
type SelectKey =
  | { kind: 'index'; target: IndexTarget }
  | { kind: 'editorial'; pageId: number | string };

function encodeKey(item: HeaderNavItem): string {
  if (item.kind === 'index' && item.indexTarget) {
    return `index:${item.indexTarget}`;
  }
  if (item.kind === 'editorial' && item.page) {
    const id = typeof item.page === 'object' ? item.page.id : item.page;
    if (id !== undefined && id !== null) return `editorial:${id}`;
  }
  return '';
}

function decodeKey(value: string): SelectKey | null {
  if (!value) return null;
  const [kind, rest] = value.split(':');
  if (kind === 'index' && INDEX_TARGETS.includes(rest as IndexTarget)) {
    return { kind: 'index', target: rest as IndexTarget };
  }
  if (kind === 'editorial' && rest) {
    const asNum = Number(rest);
    return { kind: 'editorial', pageId: isNaN(asNum) ? rest : asNum };
  }
  return null;
}

type PageOption = { id: number | string; title: string; slug: string };
type IndexPagesGlobal = {
  archives?: { enabled?: boolean };
  themes?: { enabled?: boolean };
  subscribe?: { enabled?: boolean };
};

// ─── navFooter ──────────────────────────────────────────────────────
type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

// ─── State ──────────────────────────────────────────────────────────
type NavigationData = {
  navHeader?: HeaderNavItem[];
  navFooter?: FooterLink[];
  /** Colonne « Coulisses » : administration, tickets, contact. */
  navFooterCoulisses?: FooterLink[];
};

const EMPTY: NavigationData = {
  navHeader: [],
  navFooter: [],
  navFooterCoulisses: [],
};

type RawNavItem = {
  blockType?: string;
  id?: string;
  kind?: string;
  indexTarget?: string;
  page?: number | string | { id?: number | string; title?: string; slug?: string } | null;
  label?: string;
};

function normalizeNavItem(raw: RawNavItem): HeaderNavItem | null {
  if (raw.blockType !== 'navItem') return null;
  if (raw.kind === 'index') {
    if (!INDEX_TARGETS.includes(raw.indexTarget as IndexTarget)) return null;
    return {
      kind: 'index',
      indexTarget: raw.indexTarget as IndexTarget,
      label: raw.label ?? '',
      id: raw.id,
    };
  }
  if (raw.kind === 'editorial') {
    return {
      kind: 'editorial',
      page: raw.page ?? null,
      label: raw.label ?? '',
      id: raw.id,
    };
  }
  return null;
}

function normalize(doc: NavigationData): NavigationData {
  return {
    navHeader: ((doc.navHeader ?? []) as RawNavItem[])
      .map(normalizeNavItem)
      .filter((x): x is HeaderNavItem => x !== null),
    navFooter: (doc.navFooter ?? []).map((n) => ({
      label: n.label ?? '',
      href: n.href ?? '',
      external: Boolean(n.external),
    })),
    navFooterCoulisses: (doc.navFooterCoulisses ?? []).map((n) => ({
      label: n.label ?? '',
      href: n.href ?? '',
      external: Boolean(n.external),
    })),
  };
}

export default function NavigationEditViewClient(): React.ReactElement {
  const [data, setData] = useState<NavigationData>(EMPTY);
  const [initial, setInitial] = useState<NavigationData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Erreurs par champ, indexées par ligne pour les liens de pied. */
  const [champsEnErreur, setChampsEnErreur] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);
  const [indexPages, setIndexPages] = useState<IndexPagesGlobal>({});

  // Liste des pages éditoriales — sert au <select>. depth=0 pour ne pas
  // hydrater les sections (lourdes et inutiles ici).
  useEffect(() => {
    // Pages libres seulement : une page fixe a déjà son entrée câblée
    // dans le menu, la proposer une seconde fois comme lien éditorial
    // permettrait de la mettre deux fois dans la même barre.
    fetch(`${PAGES_API}?where[kind][equals]=libre&depth=0&limit=200&sort=title`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: Array<{ id: number | string; title?: string; slug?: string }> }) => {
        const docs = (res.docs ?? [])
          .filter((d) => d.slug)
          .map((d) => ({ id: d.id, title: d.title ?? d.slug ?? `#${d.id}`, slug: d.slug ?? '' }));
        setPageOptions(docs);
      })
      .catch(() => {
        /* dropdown vide — l'utilisatrice peut réordonner / supprimer */
      });
  }, []);

  // État « affichée » des pages fixes — pour exclure du sélecteur celles
  // qui sont masquées. Recomposé sous la forme qu'attendait le global
  // qu'elles remplacent : la source a changé, pas ce qui la lit.
  useEffect(() => {
    fetch(PAGES_FIXES_API, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((res: { docs?: { slug?: string; enabled?: boolean }[] }) => {
        const etat: IndexPagesGlobal = {};
        for (const d of res.docs ?? []) {
          if (d.slug === 'archives' || d.slug === 'themes' || d.slug === 'subscribe') {
            etat[d.slug] = { enabled: d.enabled !== false };
          }
        }
        setIndexPages(etat);
      })
      .catch(() => {
        /* fallback : toutes considérées actives. */
      });
  }, []);

  // Charge l'état actuel du global au mount (depth=1 pour populer la
  // page éditoriale référencée par chaque navItem 'editorial').
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${NAV_API}?depth=1`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: NavigationData) => {
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

  // Sélection actuelle par index (encoded keys). Sert au dédup : un
  // select ne propose pas les pages déjà choisies ailleurs.
  const selectedKeys = useMemo(
    () => (data.navHeader ?? []).map(encodeKey),
    [data.navHeader],
  );

  // ─── Header navItems ──────────────────────────────────────────────
  function applySelect(idx: number, value: string) {
    const decoded = decodeKey(value);
    setData((d) => {
      const items = [...(d.navHeader ?? [])];
      if (!decoded) {
        // vide le bloc (cas '— sélectionner —')
        items[idx] = { ...items[idx], kind: 'index', indexTarget: undefined, page: null };
      } else if (decoded.kind === 'index') {
        items[idx] = {
          ...items[idx],
          kind: 'index',
          indexTarget: decoded.target,
          page: null,
        };
      } else {
        items[idx] = {
          ...items[idx],
          kind: 'editorial',
          indexTarget: undefined,
          page: decoded.pageId,
        };
      }
      return { ...d, navHeader: items };
    });
  }
  function applyLabel(idx: number, label: string) {
    setData((d) => {
      const items = [...(d.navHeader ?? [])];
      items[idx] = { ...items[idx], label };
      return { ...d, navHeader: items };
    });
  }
  function addItem() {
    setData((d) => ({
      ...d,
      navHeader: [
        ...(d.navHeader ?? []),
        { kind: 'index', indexTarget: undefined, label: '' },
      ],
    }));
  }
  function removeItem(idx: number) {
    setData((d) => ({
      ...d,
      navHeader: (d.navHeader ?? []).filter((_, i) => i !== idx),
    }));
  }
  function moveItem(idx: number, delta: -1 | 1) {
    setData((d) => {
      const items = [...(d.navHeader ?? [])];
      const target = idx + delta;
      if (target < 0 || target >= items.length) return d;
      [items[idx], items[target]] = [items[target], items[idx]];
      return { ...d, navHeader: items };
    });
  }

  // ─── Footer ───────────────────────────────────────────────────────
  //
  // Le pied compte deux colonnes de liens éditables — « Naviguer » et
  // « Coulisses ». Les manipulateurs prennent donc le nom de la colonne
  // plutôt que d'exister en double : cent lignes dupliquées auraient
  // fini par diverger, et une correction n'aurait été appliquée qu'à
  // l'une des deux.
  type ColonneFooter = 'navFooter' | 'navFooterCoulisses';

  function updateFooter(champ: ColonneFooter, idx: number, patch: Partial<FooterLink>) {
    setData((d) => {
      const nav = [...(d[champ] ?? [])];
      nav[idx] = { ...nav[idx], ...patch };
      return { ...d, [champ]: nav };
    });
  }
  function addFooter(champ: ColonneFooter) {
    setData((d) => ({
      ...d,
      [champ]: [...(d[champ] ?? []), { label: '', href: '', external: false }],
    }));
  }
  function removeFooter(champ: ColonneFooter, idx: number) {
    setData((d) => ({
      ...d,
      [champ]: (d[champ] ?? []).filter((_, i) => i !== idx),
    }));
  }
  function moveFooter(champ: ColonneFooter, idx: number, delta: -1 | 1) {
    setData((d) => {
      const nav = [...(d[champ] ?? [])];
      const target = idx + delta;
      if (target < 0 || target >= nav.length) return d;
      [nav[idx], nav[target]] = [nav[target], nav[idx]];
      return { ...d, [champ]: nav };
    });
  }

  /**
   * Rend une colonne de liens du pied. Appelée deux fois — « Naviguer »
   * et « Coulisses » — plutôt que recopiée : c'est le même formulaire,
   * et deux copies auraient fini par ne plus se ressembler.
   *
   * `prefixe` sépare les clés d'erreur des deux colonnes : sans lui,
   * un lien incomplet dans l'une signalerait le lien de même rang dans
   * l'autre.
   */
  function colonneLiens(
    champ: ColonneFooter,
    prefixe: string,
    titre: string,
    aide: string,
  ): React.ReactElement {
    const longueur = (data[champ] ?? []).length;
    return (
              <section className="tituba-editview__section">
                <h2 className="tituba-editview__section-title">{titre}</h2>
                <p className="tituba-editview__section-help">{aide}</p>

                <div className="tituba-editview__rows">
                  {longueur === 0 && (
                    <div className="tituba-editview__empty">Aucun lien.</div>
                  )}
                  {(data[champ] ?? []).map((row, idx) => (
                    <div key={idx} className="tituba-editview__rowitem">
                      {/* Chaque lien de pied porte ses propres erreurs : sur
                          une liste de huit, un message général laisserait
                          chercher laquelle est incomplète. D'où des clés
                          indexées, `footer.<n>.label` et `.href`. */}
                      <label
                        className={`tituba-editview__field tituba-editview__field--inline${
                          champsEnErreur[`${prefixe}.${idx}.label`] ? ' tituba-editview__field--invalid' : ''
                        }`}
                      >
                        <span className="lbl">
                          Label <span className="req" aria-hidden="true">*</span>
                          <span className="sr-only"> (obligatoire)</span>
                        </span>
                        <input
                          type="text"
                          value={row.label}
                          aria-invalid={champsEnErreur[`${prefixe}.${idx}.label`] ? true : undefined}
                          onChange={(e) => {
                            updateFooter(champ, idx, { label: e.target.value });
                            oublierErreur(`${prefixe}.${idx}.label`);
                          }}
                        />
                        {champsEnErreur[`${prefixe}.${idx}.label`] && (
                          <span className="err">{champsEnErreur[`${prefixe}.${idx}.label`]}</span>
                        )}
                      </label>
                      <label
                        className={`tituba-editview__field tituba-editview__field--inline${
                          champsEnErreur[`${prefixe}.${idx}.href`] ? ' tituba-editview__field--invalid' : ''
                        }`}
                      >
                        <span className="lbl">
                          Href <span className="req" aria-hidden="true">*</span>
                          <span className="sr-only"> (obligatoire)</span>
                        </span>
                        <input
                          type="text"
                          value={row.href}
                          aria-invalid={champsEnErreur[`${prefixe}.${idx}.href`] ? true : undefined}
                          onChange={(e) => {
                            updateFooter(champ, idx, { href: e.target.value });
                            oublierErreur(`${prefixe}.${idx}.href`);
                          }}
                        />
                        {champsEnErreur[`${prefixe}.${idx}.href`] && (
                          <span className="err">{champsEnErreur[`${prefixe}.${idx}.href`]}</span>
                        )}
                      </label>
                      <label className="tituba-editview__field tituba-editview__field--inline tituba-editview__field--check">
                        <input
                          type="checkbox"
                          checked={Boolean(row.external)}
                          onChange={(e) => updateFooter(champ, idx, { external: e.target.checked })}
                        />
                        <span className="lbl">Externe</span>
                      </label>
                      <div className="tituba-editview__rowitem-actions">
                        <button
                          type="button"
                          className="tituba-btn tituba-btn--ghost"
                          onClick={() => moveFooter(champ, idx, -1)}
                          disabled={idx === 0}
                          aria-label="Monter"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="tituba-btn tituba-btn--ghost"
                          onClick={() => moveFooter(champ, idx, 1)}
                          disabled={idx === longueur - 1}
                          aria-label="Descendre"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="tituba-btn tituba-btn--ghost"
                          onClick={() => removeFooter(champ, idx)}
                          aria-label="Supprimer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="tituba-editview__rows-actions">
                  <button
                    type="button"
                    className="tituba-btn tituba-btn--ghost"
                    onClick={() => addFooter(champ)}
                  >
                    + Ajouter un lien
                  </button>
                </div>
              </section>
    );
  }
  /** Retire l'erreur d'un champ dès qu'on le corrige. */
  function oublierErreur(cle: string) {
    setChampsEnErreur((prev) => {
      if (!prev[cle]) return prev;
      const suite = { ...prev };
      delete suite[cle];
      return suite;
    });
  }

  async function save() {
    // Validation cliente avant l'envoi : un lien de pied incomplet
    // remontait en 400 dont le corps JSON s'affichait tel quel, sans
    // dire lequel des liens était en cause.
    const manquants: Record<string, string> = {};
    // Les deux colonnes du pied se valident pareil ; le préfixe des
    // clés est ce qui distingue leurs messages à l'affichage.
    for (const [champ, prefixe] of [
      ['navFooter', 'footer'],
      ['navFooterCoulisses', 'coulisses'],
    ] as const) {
      (data[champ] ?? []).forEach((l, i) => {
        if (!String(l.label ?? '').trim()) {
          manquants[`${prefixe}.${i}.label`] = 'Le libellé est obligatoire.';
        }
        if (!String(l.href ?? '').trim()) {
          manquants[`${prefixe}.${i}.href`] = 'L’adresse est obligatoire.';
        }
      });
    }
    if (Object.keys(manquants).length > 0) {
      setChampsEnErreur(manquants);
      setError(null);
      return;
    }
    setChampsEnErreur({});
    setSaving(true);
    setError(null);
    try {
      // Sérialise navHeader avec blockType: 'navItem' (Payload l'exige
      // pour les blocs). On supprime les champs inutiles selon `kind`.
      const payload = {
        navHeader: (data.navHeader ?? []).map((item) => ({
          blockType: 'navItem',
          kind: item.kind,
          ...(item.kind === 'index'
            ? { indexTarget: item.indexTarget }
            : { page: typeof item.page === 'object' ? item.page?.id : item.page }),
          label: item.label || undefined,
        })),
        navFooter: data.navFooter ?? [],
        navFooterCoulisses: data.navFooterCoulisses ?? [],
      };
      const res = await fetch(NAV_API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      const doc = (await res.json()) as { result?: NavigationData } | NavigationData;
      const fresh: NavigationData =
        (doc as { result?: NavigationData }).result ?? (doc as NavigationData);
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

  const headerLen = (data.navHeader ?? []).length;
  const footerLen = (data.navFooter ?? []).length;

  // Liste des pages d'index proposables — exclut celles désactivées.
  const enabledIndexTargets = INDEX_TARGETS.filter(
    (t) => indexPages[t]?.enabled !== false,
  );

  return (
    <CarnetPage
      variant="editview"
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: 'Navigation' }]}
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
      {Object.keys(champsEnErreur).length > 0 && (
        <div className="tituba-editview__error" role="alert">
          {Object.keys(champsEnErreur).length === 1
            ? 'Un champ obligatoire n’est pas rempli — il est signalé ci-dessous.'
            : `${Object.keys(champsEnErreur).length} champs obligatoires ne sont pas remplis — ils sont signalés ci-dessous.`}
        </div>
      )}
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
            <h2 className="tituba-editview__section-title">Header</h2>
            <p className="tituba-editview__section-help">
              Onglets du header, dans l&apos;ordre d&apos;affichage. Le lien
              « Billets » reste toujours en première position et n&apos;apparaît
              pas ici. Un onglet pointe soit vers une page d&apos;index
              (Archives, Thèmes, Abonnement — désactivables dans Pages
              d&apos;index), soit vers une page éditoriale. Une même page
              ne peut être référencée qu&apos;une fois.
            </p>

            <div className="tituba-editview__rows">
              {headerLen === 0 && (
                <div className="tituba-editview__empty">
                  Aucun onglet — le header n&apos;affichera que « Billets ».
                </div>
              )}
              {(data.navHeader ?? []).map((item, idx) => {
                const currentKey = encodeKey(item);
                return (
                  <div key={idx} className="tituba-editview__rowitem">
                    <label className="tituba-editview__field tituba-editview__field--inline">
                      <span className="lbl">Page</span>
                      <select
                        value={currentKey}
                        onChange={(e) => applySelect(idx, e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        <optgroup label="Pages fixes">
                          {enabledIndexTargets.map((t) => {
                            const key = `index:${t}`;
                            const taken = selectedKeys.includes(key) && key !== currentKey;
                            return (
                              <option key={key} value={key} disabled={taken}>
                                {INDEX_DEFAULT_LABEL[t]}
                                {taken ? ' (déjà ajoutée)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="Pages">
                          {pageOptions.map((p) => {
                            const key = `editorial:${p.id}`;
                            const taken = selectedKeys.includes(key) && key !== currentKey;
                            return (
                              <option key={key} value={key} disabled={taken}>
                                {stripHeroMarkers(p.title)} (/{p.slug}/)
                                {taken ? ' — déjà ajoutée' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      </select>
                    </label>
                    <label className="tituba-editview__field tituba-editview__field--inline">
                      <span className="lbl">Libellé (optionnel)</span>
                      <input
                        type="text"
                        value={item.label ?? ''}
                        onChange={(e) => applyLabel(idx, e.target.value)}
                        placeholder="Sinon : libellé natif de la page"
                      />
                    </label>
                    <div className="tituba-editview__rowitem-actions">
                      <button
                        type="button"
                        className="tituba-btn tituba-btn--ghost"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="tituba-btn tituba-btn--ghost"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === headerLen - 1}
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="tituba-btn tituba-btn--ghost"
                        onClick={() => removeItem(idx)}
                        aria-label="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="tituba-editview__rows-actions">
              <button type="button" className="tituba-btn tituba-btn--ghost" onClick={addItem}>
                + Ajouter un onglet
              </button>
            </div>
          </section>

          {colonneLiens(
            'navFooter',
            'footer',
            'Footer — colonne « Naviguer »',
            'Les grandes destinations du site. L’ordre ici détermine l’ordre d’affichage.',
          )}

          {colonneLiens(
            'navFooterCoulisses',
            'coulisses',
            'Footer — colonne « Coulisses »',
            'L’envers du site plutôt que son contenu : l’administration, le suivi des tickets, le formulaire de contact.',
          )}
        </form>
      )}
    </CarnetPage>
  );
}
