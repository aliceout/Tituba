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

const NAV_API = '/cms/api/globals/navigation';
const INDEX_PAGES_API = '/cms/api/globals/index-pages';
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
};

const EMPTY: NavigationData = {
  navHeader: [],
  navFooter: [],
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
  };
}

export default function NavigationEditViewClient(): React.ReactElement {
  const [data, setData] = useState<NavigationData>(EMPTY);
  const [initial, setInitial] = useState<NavigationData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);
  const [indexPages, setIndexPages] = useState<IndexPagesGlobal>({});

  // Liste des pages éditoriales — sert au <select>. depth=0 pour ne pas
  // hydrater les sections (lourdes et inutiles ici).
  useEffect(() => {
    fetch(`${PAGES_API}?depth=0&limit=200&sort=title`, { credentials: 'include' })
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

  // État `enabled` des pages d'index — pour exclure du sélecteur celles
  // qui sont désactivées (cf. global IndexPages).
  useEffect(() => {
    fetch(`${INDEX_PAGES_API}?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((res: IndexPagesGlobal) => setIndexPages(res ?? {}))
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
  function updateFooter(idx: number, patch: Partial<FooterLink>) {
    setData((d) => {
      const nav = [...(d.navFooter ?? [])];
      nav[idx] = { ...nav[idx], ...patch };
      return { ...d, navFooter: nav };
    });
  }
  function addFooter() {
    setData((d) => ({
      ...d,
      navFooter: [...(d.navFooter ?? []), { label: '', href: '', external: false }],
    }));
  }
  function removeFooter(idx: number) {
    setData((d) => ({
      ...d,
      navFooter: (d.navFooter ?? []).filter((_, i) => i !== idx),
    }));
  }
  function moveFooter(idx: number, delta: -1 | 1) {
    setData((d) => {
      const nav = [...(d.navFooter ?? [])];
      const target = idx + delta;
      if (target < 0 || target >= nav.length) return d;
      [nav[idx], nav[target]] = [nav[target], nav[idx]];
      return { ...d, navFooter: nav };
    });
  }

  async function save() {
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
      crumbs={[{ href: '/cms/admin', label: 'Carnet' }, { label: 'Navigation' }]}
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
            <h2 className="carnet-editview__section-title">Header</h2>
            <p className="carnet-editview__section-help">
              Onglets du header, dans l&apos;ordre d&apos;affichage. Le lien
              « Billets » reste toujours en première position et n&apos;apparaît
              pas ici. Un onglet pointe soit vers une page d&apos;index
              (Archives, Thèmes, Abonnement — désactivables dans Pages
              d&apos;index), soit vers une page éditoriale. Une même page
              ne peut être référencée qu&apos;une fois.
            </p>

            <div className="carnet-editview__rows">
              {headerLen === 0 && (
                <div className="carnet-editview__empty">
                  Aucun onglet — le header n&apos;affichera que « Billets ».
                </div>
              )}
              {(data.navHeader ?? []).map((item, idx) => {
                const currentKey = encodeKey(item);
                return (
                  <div key={idx} className="carnet-editview__rowitem">
                    <label className="carnet-editview__field carnet-editview__field--inline">
                      <span className="lbl">Page</span>
                      <select
                        value={currentKey}
                        onChange={(e) => applySelect(idx, e.target.value)}
                      >
                        <option value="">— sélectionner —</option>
                        <optgroup label="Pages principales">
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
                        <optgroup label="Pages éditoriales">
                          {pageOptions.map((p) => {
                            const key = `editorial:${p.id}`;
                            const taken = selectedKeys.includes(key) && key !== currentKey;
                            return (
                              <option key={key} value={key} disabled={taken}>
                                {p.title} (/{p.slug}/)
                                {taken ? ' — déjà ajoutée' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      </select>
                    </label>
                    <label className="carnet-editview__field carnet-editview__field--inline">
                      <span className="lbl">Libellé (optionnel)</span>
                      <input
                        type="text"
                        value={item.label ?? ''}
                        onChange={(e) => applyLabel(idx, e.target.value)}
                        placeholder="Sinon : libellé natif de la page"
                      />
                    </label>
                    <div className="carnet-editview__rowitem-actions">
                      <button
                        type="button"
                        className="carnet-btn carnet-btn--ghost"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="carnet-btn carnet-btn--ghost"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === headerLen - 1}
                        aria-label="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="carnet-btn carnet-btn--ghost"
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

            <div className="carnet-editview__rows-actions">
              <button type="button" className="carnet-btn carnet-btn--ghost" onClick={addItem}>
                + Ajouter un onglet
              </button>
            </div>
          </section>

          <section className="carnet-editview__section">
            <h2 className="carnet-editview__section-title">Footer</h2>
            <p className="carnet-editview__section-help">
              Liens affichés dans la colonne « Naviguer » du footer du site.
              L&apos;ordre ici détermine l&apos;ordre d&apos;affichage.
            </p>

            <div className="carnet-editview__rows">
              {footerLen === 0 && (
                <div className="carnet-editview__empty">Aucun lien.</div>
              )}
              {(data.navFooter ?? []).map((row, idx) => (
                <div key={idx} className="carnet-editview__rowitem">
                  <label className="carnet-editview__field carnet-editview__field--inline">
                    <span className="lbl">Label</span>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateFooter(idx, { label: e.target.value })}
                    />
                  </label>
                  <label className="carnet-editview__field carnet-editview__field--inline">
                    <span className="lbl">Href</span>
                    <input
                      type="text"
                      value={row.href}
                      onChange={(e) => updateFooter(idx, { href: e.target.value })}
                    />
                  </label>
                  <label className="carnet-editview__field carnet-editview__field--inline carnet-editview__field--check">
                    <input
                      type="checkbox"
                      checked={Boolean(row.external)}
                      onChange={(e) => updateFooter(idx, { external: e.target.checked })}
                    />
                    <span className="lbl">Externe</span>
                  </label>
                  <div className="carnet-editview__rowitem-actions">
                    <button
                      type="button"
                      className="carnet-btn carnet-btn--ghost"
                      onClick={() => moveFooter(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="carnet-btn carnet-btn--ghost"
                      onClick={() => moveFooter(idx, 1)}
                      disabled={idx === footerLen - 1}
                      aria-label="Descendre"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="carnet-btn carnet-btn--ghost"
                      onClick={() => removeFooter(idx)}
                      aria-label="Supprimer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="carnet-editview__rows-actions">
              <button
                type="button"
                className="carnet-btn carnet-btn--ghost"
                onClick={addFooter}
              >
                + Ajouter un lien
              </button>
            </div>
          </section>
        </form>
      )}
    </CarnetPage>
  );
}
