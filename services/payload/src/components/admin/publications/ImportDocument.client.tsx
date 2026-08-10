'use client';

/**
 * ImportDocument — reprendre un texte écrit ailleurs.
 *
 * La plupart des textes n'arrivent pas dans l'éditeur : ils arrivent en
 * pièce jointe, écrits sous Word ou LibreOffice, avec leurs intertitres,
 * leurs notes de bas de page et leur bibliographie. Les ressaisir à la
 * main coûte une heure par texte et perd des notes en chemin.
 *
 * Le déroulé, en deux temps :
 *
 *  1. Le bouton ouvre directement le sélecteur de fichiers du système.
 *     Le serveur lit le document et renvoie ce qu'il y a trouvé — sans
 *     rien écrire.
 *  2. On regarde — tant d'intertitres, tant de notes, la bibliographie
 *     détachée référence par référence, ce qui n'a pas suivi — puis on
 *     insère, ou pas.
 *
 * Deux temps et pas trois : un panneau intermédiaire pour héberger le
 * champ de fichier n'apprenait rien que le sélecteur du système ne
 * montre déjà, et coûtait un clic à chaque import.
 *
 * L'arrêt, en revanche, se situe APRÈS la lecture, et il compte :
 * l'import remplace le corps entier. Insérer dès le dépôt effacerait
 * sans prévenir un texte en cours de rédaction. Cela reste annulable
 * par Ctrl+Z une fois inséré (cf `remplacerContenu`), mais mieux vaut
 * ne pas avoir à s'en servir.
 *
 * La bibliographie est affichée, jamais reliée d'office : on montre les
 * entrées existantes qui pourraient correspondre, et quelqu'un tranche.
 * Une référence mal appariée est bien plus coûteuse à repérer, plus
 * tard, qu'à saisir tout de suite.
 */

import React, { useRef, useState } from 'react';

/** Une référence détachée du document, et ce qu'on lui a trouvé. */
type LigneBiblio = {
  texte: string;
  nom: string | null;
  prenom: string | null;
  annee: number | null;
  titre: string | null;
  editeur: string | null;
  url: string | null;
  /** Ce qui manque pour pouvoir créer l'entrée. Vide = créable. */
  manques: string[];
  candidats: { id: number | string; label: string; sur: boolean }[];
};

/** Ce qu'il est advenu d'une référence qu'on a demandé de créer. */
type Creation = { id?: number | string; label?: string; erreur?: string };

type Resultat = {
  body: unknown;
  titre: string | null;
  resume: { titres: number; paragraphes: number; notes: number };
  biblio: LigneBiblio[];
  avertissements: string[];
};

const EXTENSIONS = '.docx,.odt';

/** « 1 note » / « 3 notes » — l'accord, sans y penser à chaque appel. */
function compte(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

export default function ImportDocument({
  collection,
  corpsRempli,
  onInsert,
}: {
  collection: string;
  /** Un corps déjà écrit : on prévient avant de l'effacer. */
  corpsRempli: boolean;
  onInsert: (r: { body: unknown; titre: string | null }) => void;
}): React.ReactElement {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [reprendreTitre, setReprendreTitre] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Références retenues pour création, par leur texte — stable là où un
  // indice ne l'est pas.
  const [aCreer, setACreer] = useState<Set<string>>(new Set());
  const [creation, setCreation] = useState<Map<string, Creation>>(new Map());
  const [creationEnCours, setCreationEnCours] = useState(false);

  async function lire(fichier: File): Promise<void> {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    setNomFichier(fichier.name);
    try {
      const form = new FormData();
      form.append('fichier', fichier);
      form.append('collection', collection);
      const res = await fetch('/cms/api/import-document', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = (await res.json()) as Resultat & { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setErreur(data.message ?? 'Le document n’a pas pu être lu.');
        return;
      }
      setResultat(data);
      setReprendreTitre(Boolean(data.titre));
      setCreation(new Map());
      // Cochées d'emblée : celles qui se lisent et qu'aucune entrée
      // existante ne recouvre. Les autres demandent un geste.
      setACreer(
        new Set(
          data.biblio
            .filter((l) => l.manques.length === 0 && !l.candidats.some((c) => c.sur))
            .map((l) => l.texte),
        ),
      );
    } catch {
      setErreur('La lecture a échoué — le serveur n’a pas répondu.');
    } finally {
      setEnCours(false);
      // Sans quoi redéposer deux fois le même fichier ne déclenche rien.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function inserer(): void {
    if (!resultat) return;
    onInsert({
      body: resultat.body,
      titre: reprendreTitre ? resultat.titre : null,
    });
    fermer();
  }

  function fermer(): void {
    setResultat(null);
    setErreur(null);
    setNomFichier('');
    setACreer(new Set());
    setCreation(new Map());
  }

  /**
   * Crée les références cochées dans la bibliographie.
   *
   * Seuls les textes partent : c'est le serveur qui les relit. Le
   * découpage affiché ici vient de lui, le lui renvoyer n'apporterait
   * rien et ouvrirait la porte à autre chose.
   */
  async function creer(): Promise<void> {
    const textes = [...aCreer];
    if (textes.length === 0) return;
    setCreationEnCours(true);
    try {
      const res = await fetch('/cms/api/import-bibliographie', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textes }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        resultats?: ({ texte: string } & Creation)[];
      };
      if (!res.ok || !data.ok) {
        setErreur(data.error ?? 'Les références n’ont pas pu être créées.');
        return;
      }
      const suite = new Map(creation);
      const restant = new Set(aCreer);
      for (const r of data.resultats ?? []) {
        suite.set(r.texte, { id: r.id, label: r.label, erreur: r.erreur });
        // Ce qui est créé sort de la sélection : recliquer ne doit pas
        // en faire un doublon.
        if (r.id != null) restant.delete(r.texte);
      }
      setCreation(suite);
      setACreer(restant);
    } catch {
      setErreur('La création a échoué — le serveur n’a pas répondu.');
    } finally {
      setCreationEnCours(false);
    }
  }

  function basculer(texte: string): void {
    setACreer((prev) => {
      const suite = new Set(prev);
      if (suite.has(texte)) suite.delete(texte);
      else suite.add(texte);
      return suite;
    });
  }

  // Le champ de fichier reste monté et invisible : le bouton l'actionne.
  // Un panneau intermédiaire pour l'héberger n'aurait rien dit de plus
  // que le sélecteur du système, en coûtant un clic de plus.
  const champ = (
    <input
      ref={inputRef}
      type="file"
      accept={EXTENSIONS}
      className="ed-import__file"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void lire(f);
      }}
    />
  );

  if (!resultat) {
    return (
      <div className="ed-import">
        {champ}
        <button
          type="button"
          className="ed-import__open"
          disabled={enCours}
          onClick={() => inputRef.current?.click()}
        >
          {enCours ? `Lecture de ${nomFichier}…` : 'Importer un document'}
        </button>
        {erreur ? (
          <span className="ed-import__error" role="alert">
            {erreur}
          </span>
        ) : (
          <span className="ed-import__hint">
            Word (.docx) ou LibreOffice&nbsp;(.odt) — intertitres, notes et bibliographie
            repris.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="ed-import ed-import--open">
      {champ}
      <div className="ed-import__head">
        <strong>Importer un document</strong>
        <button type="button" className="ed-import__close" onClick={fermer}>
          Fermer
        </button>
      </div>

      <div className="ed-import__result">
        <p className="ed-import__found">
          <strong>{nomFichier}</strong> —{' '}
          {[
            compte(resultat.resume.paragraphes, 'paragraphe'),
            compte(resultat.resume.titres, 'intertitre'),
            compte(resultat.resume.notes, 'note'),
            compte(resultat.biblio.length, 'référence'),
          ].join(', ')}
          .
        </p>

        {resultat.titre && (
          <label className="ed-import__titre">
            <input
              type="checkbox"
              checked={reprendreTitre}
              onChange={(e) => setReprendreTitre(e.target.checked)}
            />
            <span>
              Reprendre le titre du document&nbsp;: «&nbsp;{resultat.titre}&nbsp;»
            </span>
          </label>
        )}

        {resultat.avertissements.length > 0 && (
          <ul className="ed-import__warnings">
            {resultat.avertissements.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}

        {resultat.biblio.length > 0 && (
          <div className="ed-import__biblio">
            <h4>Bibliographie détachée</h4>
            <p className="ed-import__biblio-note">
              Ces références ne sont pas insérées dans le texte&nbsp;: elles vont dans
              votre bibliographie, d’où vous les appellerez depuis l’éditeur avec
              <kbd>/</kbd>. Vérifiez ce qui sera créé&nbsp;— seul ce qui se lit sans
              ambiguïté est repris, le reste se complète ensuite.
            </p>
            <ul>
              {resultat.biblio.map((l, i) => {
                const faite = creation.get(l.texte);
                const sur = l.candidats.find((c) => c.sur);
                const creable = l.manques.length === 0 && !sur && !faite?.id;
                return (
                  <li key={`${i}-${l.texte.slice(0, 20)}`}>
                    <label className="ed-import__ref-ligne">
                      {creable ? (
                        <input
                          type="checkbox"
                          checked={aCreer.has(l.texte)}
                          disabled={creationEnCours}
                          onChange={() => basculer(l.texte)}
                        />
                      ) : (
                        <span className="ed-import__puce" aria-hidden="true" />
                      )}
                      <span className="ed-import__ref">{l.texte}</span>
                    </label>

                    {/* Ce qui sera écrit, en clair — c'est sur cette ligne
                        qu'on repère une lecture qui a dérapé. */}
                    {creable && (
                      <span className="ed-import__lu">
                        {[
                          [l.nom, l.prenom].filter(Boolean).join(', '),
                          l.annee,
                          l.titre ?? '(titre non isolé — la référence entière en tiendra lieu)',
                          l.editeur,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}

                    {faite?.id != null && (
                      <span className="ed-import__match">
                        Créée dans la bibliographie&nbsp;: {faite.label}
                      </span>
                    )}
                    {faite?.erreur && (
                      <span className="ed-import__match ed-import__match--absent">
                        {faite.erreur}
                      </span>
                    )}
                    {!faite && sur && (
                      <span className="ed-import__match">
                        Déjà dans la bibliographie&nbsp;: {sur.label}
                      </span>
                    )}
                    {!faite && !sur && l.manques.length > 0 && (
                      <span className="ed-import__match ed-import__match--absent">
                        {l.manques.join(' et ')} introuvable
                        {l.manques.length > 1 ? 's' : ''} — à saisir à la main.
                      </span>
                    )}
                    {!faite && !sur && l.manques.length === 0 && l.candidats.length > 0 && (
                      <span className="ed-import__match">
                        Peut-être déjà là&nbsp;: {l.candidats[0].label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="ed-import__biblio-actions">
              <button
                type="button"
                className="ed-import__creer"
                disabled={aCreer.size === 0 || creationEnCours}
                onClick={() => void creer()}
              >
                {creationEnCours
                  ? 'Création…'
                  : `Créer ${compte(aCreer.size, 'référence')} dans la bibliographie`}
              </button>
              {aCreer.size > 0 && !creationEnCours && (
                <button
                  type="button"
                  className="ed-import__cancel"
                  onClick={() => setACreer(new Set())}
                >
                  Ne rien créer
                </button>
              )}
            </div>
          </div>
        )}

        {corpsRempli && (
          <p className="ed-import__warn-body" role="alert">
            Le corps du billet n’est pas vide&nbsp;: l’insertion le remplacera
            entièrement. <kbd>Ctrl</kbd>+<kbd>Z</kbd> permet de revenir en arrière.
          </p>
        )}

        <div className="ed-import__actions">
          <button type="button" className="ed-import__insert" onClick={inserer}>
            {corpsRempli ? 'Remplacer le corps' : 'Insérer dans le billet'}
          </button>
          <button type="button" className="ed-import__cancel" onClick={fermer}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
