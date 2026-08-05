'use client';

// SeriesListView (client) — vue Liste custom des séries, sur le gabarit
// de ThemeListView : CarnetPage variant listview, barre de recherche,
// tableau, pagination compacte.
//
// Particularité : une seule collection sert deux entrées de nav. Le
// paramètre `format` de l'URL dit laquelle on regarde — `podcasts` pour
// les émissions, `textes` pour les séries d'articles (qui réunissent
// articles de recherche et billets d'analyse). Sans paramètre, la liste
// montre tout, ce qui reste utile si on arrive par un lien direct.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;
const API_SERIES = '/cms/api/series';

/** Formats de publication réunis derrière chaque porte de la nav. */
const PORTES = {
  podcasts: {
    formats: ['podcasts'],
    titre: 'Émissions',
    singulier: 'émission',
    pluriel: 'émissions',
    // « Nouvelle émission » plutôt que « Nouvelle série » : c'est le mot
    // du métier, et celui qu'emploie la nav qui vient de nous amener ici.
    creer: 'Nouvelle émission',
    /** Collections à interroger pour compter les billets d'une série. */
    compte: ['podcasts'],
    entree: 'épisode',
    entrees: 'épisodes',
  },
  textes: {
    formats: ['articles', 'analyses'],
    titre: "Séries d'articles",
    singulier: 'série',
    pluriel: 'séries',
    creer: 'Nouvelle série',
    compte: ['articles', 'analyses'],
    entree: 'volet',
    entrees: 'volets',
  },
} as const;

type Porte = keyof typeof PORTES;

type Serie = {
  id: number | string;
  name: string;
  slug: string;
  format: 'podcasts' | 'articles' | 'analyses';
  lede?: string | null;
  draft?: boolean;
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

const NOM_FORMAT: Record<Serie['format'], string> = {
  podcasts: 'Émission',
  articles: 'Articles de recherche',
  analyses: "Billets d'analyse",
};

export default function SeriesListViewClient(): React.ReactElement {
  const params = useSearchParams();
  const brut = params?.get('format');
  const porte: Porte = brut === 'podcasts' ? 'podcasts' : 'textes';
  // Une porte inconnue ou absente retombe sur les séries de textes : la
  // nav ne pose jamais autre chose, et un tableau vide serait un cul-de-sac.
  const spec = PORTES[porte];

  const [series, setSeries] = useState<Serie[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Recalculée à chaque changement de porte : c'est elle qui pilote le
  // fetch, et la garder stable évite de le relancer à chaque rendu.
  const filtre = useMemo(() => spec.formats, [spec]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams();
    p.set('limit', String(PER_PAGE));
    p.set('page', String(page));
    p.set('sort', 'name');
    p.set('depth', '0');
    for (const f of filtre) p.append('where[format][in]', f);
    if (search.trim()) p.append('where[name][like]', search.trim());

    fetch(`${API_SERIES}?${p.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: FetchResult<Serie>) => {
        setSeries(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);

        // Nombre de billets par série. Une série de textes peut réunir
        // deux collections, d'où la somme : on interroge chacune et on
        // additionne, plutôt que d'inventer un endpoint pour ça.
        const m = new Map<string, number>();
        await Promise.all(
          (data.docs ?? []).map(async (s) => {
            const collections = s.format === 'podcasts' ? ['podcasts'] : [s.format];
            let total = 0;
            for (const col of collections) {
              try {
                const r = await fetch(
                  `/cms/api/${col}?where[series][equals]=${encodeURIComponent(String(s.id))}&limit=1&depth=0`,
                  { credentials: 'include' },
                );
                if (r.ok) {
                  const d = (await r.json()) as { totalDocs?: number };
                  total += d.totalDocs ?? 0;
                }
              } catch {
                /* une collection injoignable ne doit pas vider tout le compte */
              }
            }
            m.set(String(s.id), total);
          }),
        );
        setCounts(m);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setSeries([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, filtre]);

  useEffect(() => setPage(1), [search, porte]);

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);
  // Le format part dans l'URL de création : la vue d'édition en
  // pré-remplit son sélecteur, et comme le champ se verrouille après
  // création, mieux vaut qu'il soit juste dès le départ.
  const hrefCreer = `/cms/admin/collections/series/create?format=${porte === 'podcasts' ? 'podcasts' : 'articles'}`;

  return (
    <CarnetPage
      variant="listview"
      modifier="series"
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: spec.titre }]}
      topbarActions={
        <Link href={hrefCreer} className="tituba-btn tituba-btn--accent">
          {spec.creer}
        </Link>
      }
    >
      <div className="tituba-listview__toolbar">
        <div className="tituba-listview__search">
          <span className="ic" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher dans ${totalDocs} ${totalDocs > 1 ? spec.pluriel : spec.singulier}…`}
          />
        </div>
      </div>

      {error && <div className="tituba-listview__error">Erreur : {error}</div>}

      <div className="tituba-listview__table" role="table">
        <div className="tituba-listview__row tituba-listview__row--head" role="row">
          <div role="columnheader">Nom</div>
          <div role="columnheader">{porte === 'podcasts' ? 'Présentation' : 'Format'}</div>
          <div role="columnheader">{spec.entrees.charAt(0).toUpperCase() + spec.entrees.slice(1)}</div>
        </div>

        {loading && series.length === 0 ? (
          <div className="tituba-listview__loading">Chargement…</div>
        ) : series.length === 0 ? (
          <div className="tituba-listview__empty">
            {search.trim()
              ? `Aucune ${spec.singulier} ne correspond à cette recherche.`
              : `Aucune ${spec.singulier} pour l’instant.`}
          </div>
        ) : (
          series.map((s) => (
            <Link
              key={s.id}
              href={`/cms/admin/collections/series/${s.id}`}
              className="tituba-listview__row"
              role="row"
            >
              <div role="cell" className="title">
                {s.name}
                {/* Pastille de statut déjà en place ailleurs dans
                    l'admin — même objet, même traitement. */}
                {s.draft && <span className="status-pill status-pill--draft">brouillon</span>}
              </div>
              <div role="cell" className="desc">
                {porte === 'podcasts' ? s.lede || '—' : NOM_FORMAT[s.format]}
              </div>
              <div role="cell" className="count">
                {counts.get(String(s.id)) ?? '—'}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="tituba-listview__pagination">
        <span className="tituba-listview__pagination-info">
          {totalDocs === 0
            ? 'Aucun résultat'
            : `Affichage ${startIdx}–${endIdx} sur ${totalDocs} · ${PER_PAGE} par page`}
        </span>
        {totalPages > 1 && (
          <div className="tituba-listview__pagination-pages">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Page précédente"
            >
              ←
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === page ? 'on' : ''}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Page suivante"
            >
              →
            </button>
          </div>
        )}
      </div>
    </CarnetPage>
  );
}
