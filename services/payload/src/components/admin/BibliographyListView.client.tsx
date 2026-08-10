'use client';

// BibliographyListView (client) — vue Liste custom Bibliographie :
// recherche par auteur, filtre par type + provenance, et sélection
// multiple pour agir sur plusieurs entrées d'un coup.
//
// La croix en bout de ligne a cédé la place aux cases : ce qu'on vient
// faire dans cette liste, c'est du ménage — retirer des doublons,
// corriger les entrées où la revue a pris la place de l'auteur·ice — et
// une par une, on renonce.
//
// Les refs Zotero supprimées reviennent au prochain sync ; celles qu'on
// tente de modifier sont refusées par la collection, et l'échec est
// compté puis affiché plutôt que tu.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import CarnetPage from './CarnetPage';

const PER_PAGE = 25;
const API_BIBLIO = '/cms/api/bibliography';

type BiblioEntry = {
  id: number | string;
  slug: string;
  authorLabel?: string | null;
  authors?: Array<{ firstName?: string | null; lastName?: string | null }>;
  year: number;
  title: string;
  type: string;
  publisher?: string;
  journal?: string;
  source?: 'manual' | 'zotero';
};

type FetchResult<T> = {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
};

type FilterType = 'all' | 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';
type FilterSource = 'all' | 'manual' | 'zotero';

const TYPE_LABEL: Record<Exclude<FilterType, 'all'>, string> = {
  book: 'Livre',
  chapter: 'Chapitre',
  article: 'Article',
  paper: 'Working paper',
  web: 'Web',
  other: 'Autre',
};

export default function BibliographyListViewClient(): React.ReactElement {
  const [entries, setEntries] = useState<BiblioEntry[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<FilterType>('all');
  const [source, setSource] = useState<FilterSource>('all');
  const [reloadKey, setReloadKey] = useState(0);


  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PER_PAGE));
    params.set('page', String(page));
    params.set('sort', 'authorLabel');
    params.set('depth', '0');
    if (search.trim()) params.append('where[authorLabel][like]', search.trim());
    if (type !== 'all') params.append('where[type][equals]', type);
    if (source !== 'all') params.append('where[source][equals]', source);

    fetch(`${API_BIBLIO}?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FetchResult<BiblioEntry>) => {
        setEntries(data.docs ?? []);
        setTotalDocs(data.totalDocs ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [page, search, type, source, reloadKey]);

  useEffect(() => setPage(1), [search, type, source]);

  // ─── Sélection et actions groupées ───────────────────────────
  //
  // La croix en bout de ligne ne servait qu'à une chose à la fois. Or
  // ce qu'on vient faire dans cette liste, c'est du ménage : retirer
  // dix doublons, corriger onze entrées où la revue s'est retrouvée à
  // la place de l'auteur·ice. Une par une, on renonce.
  //
  // La sélection traverse les pages : on repère des entrées de proche
  // en proche, la pagination ne doit pas défaire ce qu'on a coché. En
  // contrepartie la confirmation dit exactement combien d'entrées sont
  // en jeu, et lesquelles — sans quoi on agirait sur ce qu'on ne voit
  // plus.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'supprimer' | 'anonymiser' | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [echecs, setEchecs] = useState<string[]>([]);

  function basculer(id: number | string) {
    setSelection((prev) => {
      const suite = new Set(prev);
      const k = String(id);
      if (suite.has(k)) suite.delete(k);
      else suite.add(k);
      return suite;
    });
  }

  const idsPage = entries.map((b) => String(b.id));
  const toutePage = idsPage.length > 0 && idsPage.every((k) => selection.has(k));

  function basculerPage() {
    setSelection((prev) => {
      const suite = new Set(prev);
      if (toutePage) for (const k of idsPage) suite.delete(k);
      else for (const k of idsPage) suite.add(k);
      return suite;
    });
  }

  /** Les entrées cochées qu'on a sous la main, pour les nommer. */
  const nommees = entries.filter((b) => selection.has(String(b.id)));
  const vide = selection.size === 0;

  function fermerAction() {
    if (enCours) return;
    setAction(null);
    setEchecs([]);
  }

  /**
   * Applique l'action à chaque entrée cochée.
   *
   * Une par une, et les échecs sont comptés plutôt qu'ignorés : une
   * référence venue de Zotero refuse d'être modifiée ici, et il vaut
   * mieux le dire que laisser croire que tout est passé.
   */
  async function executer() {
    if (!action) return;
    setEnCours(true);
    setEchecs([]);
    const rates: string[] = [];

    for (const id of selection) {
      try {
        const res =
          action === 'supprimer'
            ? await fetch(`${API_BIBLIO}/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'include',
              })
            : await fetch(`${API_BIBLIO}/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authors: [] }),
              });
        if (!res.ok) {
          const t = await res.text();
          rates.push(`#${id} — ${t.slice(0, 120)}`);
        }
      } catch (err) {
        rates.push(`#${id} — ${err instanceof Error ? err.message : 'erreur inconnue'}`);
      }
    }

    setEnCours(false);
    setEchecs(rates);
    if (rates.length === 0) {
      setSelection(new Set());
      setAction(null);
    }
    setReloadKey((k) => k + 1);
  }

  const startIdx = (page - 1) * PER_PAGE + 1;
  const endIdx = Math.min(page * PER_PAGE, totalDocs);

  return (
    <CarnetPage
      variant="listview"
      modifier="biblio"
      crumbs={[{ href: '/cms/admin', label: 'Tituba' }, { label: 'Bibliographie' }]}
      topbarActions={
        <Link
          href="/cms/admin/collections/bibliography/create"
          className="tituba-btn tituba-btn--accent"
        >
          Nouvelle référence
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
            placeholder={`Rechercher par auteur dans ${totalDocs} référence${totalDocs > 1 ? 's' : ''}…`}
          />
        </div>
        <label className="tituba-listview__filter">
          <span className="lbl">Type :</span>
          <select value={type} onChange={(e) => setType(e.target.value as FilterType)}>
            <option value="all">tous</option>
            <option value="book">Livre</option>
            <option value="chapter">Chapitre</option>
            <option value="article">Article</option>
            <option value="paper">Working paper</option>
            <option value="web">Web</option>
            <option value="other">Autre</option>
          </select>
        </label>
        <label className="tituba-listview__filter">
          <span className="lbl">Provenance :</span>
          <select value={source} onChange={(e) => setSource(e.target.value as FilterSource)}>
            <option value="all">toutes</option>
            <option value="manual">Saisie manuelle</option>
            <option value="zotero">Zotero</option>
          </select>
        </label>
        {/* Les actions groupées, au bout de la barre d'outils.

            Elles ont eu une barre à elles, qui n'apparaissait qu'à la
            première case cochée et poussait alors tout le tableau vers
            le bas : la ligne qu'on visait se dérobait sous le curseur
            au moment même où l'on cochait la précédente. Pénible à la
            souris, hostile pour qui vise difficilement.

            Ici elles n'apparaissent toujours qu'une fois quelque chose
            de coché, mais sans rien décaler : la ligne existe déjà, et
            sa hauteur est celle du champ de recherche — les boutons
            sont plus courts, ils s'y logent sans la pousser.

            `aria-live` annonce le décompte aux lecteurs d'écran. */}
        <div className="tituba-listview__lot" aria-live="polite">
          {!vide && (
            <>
              <span className="tituba-listview__lot-compte">
                {selection.size} sélectionnée{selection.size > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                className="tituba-btn tituba-btn--ghost"
                onClick={() => setAction('anonymiser')}
              >
                Retirer l’auteur·ice
              </button>
              <button
                type="button"
                className="tituba-btn tituba-btn--danger"
                onClick={() => setAction('supprimer')}
              >
                Supprimer
              </button>
              <button
                type="button"
                className="tituba-listview__lot-annuler"
                onClick={() => setSelection(new Set())}
              >
                Tout décocher
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="tituba-listview__error">Erreur : {error}</div>}

      <div className="tituba-listview__table" role="table">
        <div className="tituba-listview__row tituba-listview__row--head" role="row">
          <div role="columnheader" className="pick">
            <input
              type="checkbox"
              checked={toutePage}
              onChange={basculerPage}
              aria-label="Tout cocher sur cette page"
              title="Tout cocher sur cette page"
            />
          </div>
          <div role="columnheader">Prénom</div>
          <div role="columnheader">Nom</div>
          <div role="columnheader">Année</div>
          <div role="columnheader">Titre</div>
          <div role="columnheader">Éditeur / Revue</div>
          <div role="columnheader">Type</div>
        </div>

        {loading && entries.length === 0 ? (
          <div className="tituba-listview__loading">Chargement…</div>
        ) : entries.length === 0 ? (
          <div className="tituba-listview__empty">Aucune référence.</div>
        ) : (
          entries.map((b) => {
            const first = b.authors?.[0];
            const hasMore = (b.authors?.length ?? 0) > 1;
            return (
              <Link
                key={b.id}
                href={`/cms/admin/collections/bibliography/${b.id}`}
                className="tituba-listview__row"
                role="row"
              >
                {/* La case vit dans le lien de la ligne : le clic doit
                    s'arrêter là, sinon cocher ouvrirait la fiche. On
                    l'arrête sans l'annuler — la case garde ainsi son
                    comportement propre, et c'est elle seule qui compte
                    le geste. */}
                <div role="cell" className="pick" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selection.has(String(b.id))}
                    onChange={() => basculer(b.id)}
                    aria-label={`Sélectionner ${b.title}`}
                  />
                </div>
                <div role="cell" className="firstname">
                  {first?.firstName || '—'}
                </div>
                <div role="cell" className="lastname">
                  {first?.lastName || '—'}
                  {hasMore && <span className="lastname__etal"> et al.</span>}
                </div>
                <div role="cell" className="year">
                  {b.year}
                </div>
                <div role="cell" className="title">
                  {b.title}
                </div>
                <div role="cell" className="venue">
                  {b.publisher || b.journal || '—'}
                </div>
                <div role="cell" className="type-cell">
                  {TYPE_LABEL[b.type as Exclude<FilterType, 'all'>] ?? b.type}
                </div>
              </Link>
            );
          })
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

      {action && (
        <div
          className="tituba-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) fermerAction();
          }}
        >
          <div className="tituba-modal" role="dialog" aria-modal="true">
            <header className="tituba-modal__header">
              <h2>
                {action === 'supprimer'
                  ? `Supprimer ${selection.size} référence${selection.size > 1 ? 's' : ''} ?`
                  : `Retirer l’auteur·ice de ${selection.size} référence${selection.size > 1 ? 's' : ''} ?`}
              </h2>
              <button
                type="button"
                className="tituba-modal__close"
                onClick={fermerAction}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            {echecs.length > 0 && (
              <div className="tituba-modal__error">
                {echecs.length} référence{echecs.length > 1 ? 's' : ''} n’
                {echecs.length > 1 ? 'ont' : 'a'} pas pu être modifiée
                {echecs.length > 1 ? 's' : ''} :
                <ul>
                  {echecs.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="tituba-modal__body">
              <p>
                {action === 'supprimer'
                  ? 'Elles seront retirées du Tituba. Celles qui viennent de Zotero reviendront au prochain sync.'
                  : 'Leur champ auteur·ice sera vidé — pour les textes non signés, dont la revue avait pris la place. Le reste de la référence ne bouge pas.'}
              </p>

              {/* Nommer ce qui est en jeu : la sélection traverse les
                  pages, et l'on ne voit plus forcément tout ce qu'on a
                  coché. */}
              {nommees.length > 0 && (
                <ul className="tituba-modal__liste">
                  {nommees.slice(0, 8).map((b) => (
                    <li key={b.id}>
                      {b.authors?.[0]?.lastName ? `${b.authors[0].lastName} — ` : ''}
                      {b.title}
                    </li>
                  ))}
                </ul>
              )}
              {selection.size > nommees.length && (
                <p className="tituba-modal__reste">
                  et {selection.size - nommees.length} autre
                  {selection.size - nommees.length > 1 ? 's' : ''} cochée
                  {selection.size - nommees.length > 1 ? 's' : ''} sur les autres pages.
                </p>
              )}
            </div>

            <footer className="tituba-modal__footer">
              <button
                type="button"
                className="tituba-btn tituba-btn--ghost"
                onClick={fermerAction}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={`tituba-btn ${action === 'supprimer' ? 'tituba-btn--danger' : ''}`}
                onClick={() => void executer()}
                disabled={enCours}
              >
                {enCours
                  ? 'En cours…'
                  : action === 'supprimer'
                    ? 'Supprimer'
                    : 'Retirer l’auteur·ice'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </CarnetPage>
  );
}
