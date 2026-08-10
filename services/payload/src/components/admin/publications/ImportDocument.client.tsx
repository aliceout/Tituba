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
  annee: number | null;
  candidats: { id: number | string; label: string; sur: boolean }[];
};

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
              Ces références ne sont pas insérées dans le texte. Créez-les dans la
              bibliographie si elles y manquent, puis appelez-les depuis l’éditeur avec
              <kbd>/</kbd>.
            </p>
            <ul>
              {resultat.biblio.map((l, i) => (
                <li key={`${i}-${l.texte.slice(0, 20)}`}>
                  <span className="ed-import__ref">{l.texte}</span>
                  {l.candidats.length > 0 ? (
                    <span className="ed-import__match">
                      {l.candidats[0].sur ? 'Déjà dans la bibliographie' : 'Peut-être'}
                      &nbsp;: {l.candidats[0].label}
                    </span>
                  ) : (
                    <span className="ed-import__match ed-import__match--absent">
                      Absente de la bibliographie
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
