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
 * La bibliographie détachée rejoint la bibliographie du site ET la
 * liste en pied de billet : sans ce second rattachement, l'entrée
 * existe quelque part et le billet n'en dit rien — ce qui revient, du
 * point de vue de la lectrice, à ne l'avoir jamais importée.
 *
 * Rien n'est rattaché d'office pour autant : on montre ce qui sera
 * écrit, coché mais décochable, et quelqu'un tranche. Une référence mal
 * appariée est bien plus coûteuse à repérer, plus tard, qu'à saisir
 * tout de suite.
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
  /** Texte non signé : la place de l'auteur·ice reste vide. */
  anonyme: boolean;
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
  /** Sources citées en entier dans les notes — elles y restent. */
  notesRefs: LigneBiblio[];
  /** Ce que deviennent les « art. cit. » et « Ibid. » des notes. */
  renvois: { resolus: number; ambigus: string[]; orphelins: string[] };
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
  onLier,
}: {
  collection: string;
  /** Un corps déjà écrit : on prévient avant de l'effacer. */
  corpsRempli: boolean;
  onInsert: (r: { body: unknown; titre: string | null }) => void;
  /** Rattache des références à la bibliographie du billet. */
  onLier: (ids: (number | string)[]) => void | Promise<void>;
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
  const [liees, setLiees] = useState(0);
  // Ce qu'on a saisi à la place de ce qui ne se lisait pas.
  const [complements, setComplements] = useState<Map<string, { nom?: string; annee?: string }>>(
    new Map(),
  );

  /** Une référence est-elle prête, une fois les manques comblés ? */
  function pret(l: LigneBiblio, c?: { nom?: string; annee?: string }): boolean {
    const nom = l.nom ?? c?.nom?.trim();
    const annee = l.annee ?? (c?.annee ? Number(c.annee) : NaN);
    return (Boolean(nom) || l.anonyme) && Number.isInteger(annee) && Number(annee) >= 1700;
  }

  function complete(l: LigneBiblio): boolean {
    return pret(l, complements.get(l.texte));
  }

  /**
   * Enregistre une saisie, et coche la ligne dès qu'elle est complète —
   * l'avoir renseignée EST le geste, redemander un clic serait une
   * formalité de plus pour rien.
   */
  function completer(texte: string, champ: 'nom' | 'annee', valeur: string): void {
    const suivant = { ...complements.get(texte), [champ]: valeur };
    setComplements((prev) => new Map(prev).set(texte, suivant));

    const ligne = [...(resultat?.biblio ?? []), ...(resultat?.notesRefs ?? [])].find(
      (l) => l.texte === texte,
    );
    if (ligne && pret(ligne, suivant)) {
      setACreer((prev) => (prev.has(texte) ? prev : new Set(prev).add(texte)));
    }
  }

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
      // Cochées d'emblée : toutes celles qui peuvent rejoindre la
      // bibliographie du billet — qu'il faille les créer d'abord ou
      // qu'elles y soient déjà. C'est le document qui les cite, elles
      // ont leur place en pied de billet.
      setACreer(
        new Set(
          [...data.biblio, ...(data.notesRefs ?? [])]
            .filter((l) => l.manques.length === 0 || l.candidats.some((c) => c.sur))
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
    setLiees(0);
  }

  /**
   * Porte les références cochées dans la bibliographie du billet.
   *
   * Deux gestes en un, parce que la distinction n'intéresse personne :
   * celles qui manquent à la bibliographie y sont créées, puis toutes —
   * les nouvelles comme celles qui existaient déjà — sont rattachées au
   * billet. C'est ce rattachement qui les fera paraître en pied
   * d'article ; sans lui, l'entrée existe quelque part et le billet
   * n'en dit rien.
   *
   * Seuls les textes partent au serveur : c'est lui qui les relit. Le
   * découpage affiché ici vient de lui, le lui renvoyer n'apporterait
   * rien et ouvrirait la porte à autre chose.
   */
  async function creer(): Promise<void> {
    if (!resultat || aCreer.size === 0) return;

    const retenues = [...resultat.biblio, ...(resultat.notesRefs ?? [])].filter((l) =>
      aCreer.has(l.texte),
    );
    // Celles qu'une entrée existante recouvre déjà : rien à créer, tout
    // à rattacher.
    const dejaLa = retenues
      .map((l) => l.candidats.find((c) => c.sur)?.id)
      .filter((id): id is number | string => id != null);
    const aEcrire = retenues
      .filter((l) => !l.candidats.some((c) => c.sur) && complete(l))
      .map((l) => {
        const c = complements.get(l.texte);
        return {
          texte: l.texte,
          nom: l.nom ?? c?.nom?.trim() ?? null,
          annee: l.annee ?? Number(c?.annee) ?? null,
        };
      });

    setCreationEnCours(true);
    try {
      const nouvelles: (number | string)[] = [];

      if (aEcrire.length > 0) {
        const res = await fetch('/cms/api/import-bibliographie', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ references: aEcrire }),
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
          // Ce qui est fait sort de la sélection : recliquer ne doit
          // pas en faire un doublon.
          if (r.id != null) {
            nouvelles.push(r.id);
            restant.delete(r.texte);
          }
        }
        setCreation(suite);
        setACreer(restant);
      } else {
        setACreer(new Set());
      }

      const tout = [...nouvelles, ...dejaLa];
      if (tout.length > 0) {
        await onLier(tout);
        setLiees((n) => n + tout.length);
      }
    } catch {
      setErreur('L’opération a échoué — le serveur n’a pas répondu.');
    } finally {
      setCreationEnCours(false);
    }
  }

  /**
   * Les deux provenances, présentées à part.
   *
   * La bibliographie finale et les notes ne se valent pas du point de
   * vue de qui relit : une source citée en note demande un coup d'œil
   * de plus, parce que la note reste où elle est et qu'on pourrait
   * croire qu'on la déplace.
   */
  const groupes = resultat
    ? [
        {
          titre: 'Bibliographie du document',
          aide: null as string | null,
          lignes: resultat.biblio,
        },
        {
          titre: 'Sources citées en entier dans les notes',
          aide:
            'Les notes ne bougent pas — elles restent dans le texte, telles quelles. ' +
            'Ces sources sont seulement ajoutées à la bibliographie, où le lectorat ira ' +
            'les chercher.',
          lignes: resultat.notesRefs ?? [],
        },
      ].filter((g) => g.lignes.length > 0)
    : [];

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
            compte(resultat.biblio.length + (resultat.notesRefs?.length ?? 0), 'référence'),
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

        {/* Les renvois entre notes — « art. cit. », « Ibid. ». Rien à
            créer : leur source a déjà été reprise à sa première
            mention. Mais ceux qui ne retombent sur rien méritent d'être
            dits : sur le web, la lectrice ne peut pas feuilleter en
            arrière, et un renvoi qui ne mène nulle part est perdu. */}
        {resultat.renvois &&
          (resultat.renvois.ambigus.length > 0 || resultat.renvois.orphelins.length > 0) && (
            <div className="ed-import__renvois">
              <p>
                {compte(resultat.renvois.resolus, 'renvoi')} entre notes (« art. cit. »,
                « Ibid. ») {resultat.renvois.resolus > 1 ? 'retrouvent' : 'retrouve'} bien
                leur source plus haut. Les suivants, non&nbsp;:
              </p>
              <ul>
                {resultat.renvois.ambigus.map((t) => (
                  <li key={`a-${t}`}>
                    <span className="ed-import__ref">{t}</span>
                    <span className="ed-import__match ed-import__match--absent">
                      Ce nom a signé plusieurs textes cités&nbsp;— on ne sait pas lequel.
                    </span>
                  </li>
                ))}
                {resultat.renvois.orphelins.map((t) => (
                  <li key={`o-${t}`}>
                    <span className="ed-import__ref">{t}</span>
                    <span className="ed-import__match ed-import__match--absent">
                      Aucune mention complète de cette source avant ce renvoi.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {groupes.length > 0 && (
          <div className="ed-import__biblio">
            <h4>Références trouvées</h4>
            <p className="ed-import__biblio-note">
              Elles ne sont pas insérées dans le texte&nbsp;: elles rejoignent votre
              bibliographie et la liste en pied de billet. Pour en <em>citer</em> une dans
              le corps, appelez-la ensuite depuis l’éditeur avec <kbd>/</kbd>. Vérifiez ce
              qui sera écrit&nbsp;— seul ce qui se lit sans ambiguïté est repris, le reste
              se complète ensuite.
            </p>
            {groupes.map((g) => (
              <div key={g.titre} className="ed-import__groupe">
                <h5>{g.titre}</h5>
                {g.aide && <p className="ed-import__biblio-note">{g.aide}</p>}
                <ul>
                  {g.lignes.map((l, i) => {
                    const faite = creation.get(l.texte);
                    const sur = l.candidats.find((c) => c.sur);
                    const creable = complete(l) && !sur && !faite?.id;
                    // Cochable = peut rejoindre le billet, qu'il faille la
                    // créer d'abord ou qu'elle existe déjà.
                    const cochable = creable || (Boolean(sur) && !faite);
                    return (
                      <li key={`${i}-${l.texte.slice(0, 20)}`}>
                        <label className="ed-import__ref-ligne">
                          {cochable ? (
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

                        {/* Ce qui sera écrit, en clair — c'est sur cette
                            ligne qu'on repère une lecture qui a dérapé. */}
                        {creable && (
                          <span className="ed-import__lu">
                            {[
                              [l.nom, l.prenom].filter(Boolean).join(', ') ||
                                (l.anonyme ? 'non signé' : ''),
                              l.annee,
                              l.titre ??
                                '(titre non isolé — la référence entière en tiendra lieu)',
                              l.editeur,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}

                        {faite?.id != null && (
                          <span className="ed-import__match">
                            Créée et liée au billet&nbsp;: {faite.label}
                          </span>
                        )}
                        {faite?.erreur && (
                          <span className="ed-import__match ed-import__match--absent">
                            {faite.erreur}
                          </span>
                        )}
                        {!faite && sur && (
                          <span className="ed-import__match">
                            Déjà dans votre bibliographie&nbsp;: {sur.label} — à lier au
                            billet
                          </span>
                        )}
                        {/* Ce qui ne se lit pas se saisit ici. On ne
                            devine pas — mais rien ne doit rester bloqué
                            faute d'un champ où le dire. */}
                        {!faite && !sur && l.manques.length > 0 && (
                          <span className="ed-import__manque">
                            <span className="ed-import__match ed-import__match--absent">
                              {l.manques.join(' et ')} illisible
                              {l.manques.length > 1 ? 's' : ''} dans le document&nbsp;:
                            </span>
                            {l.manques.includes('nom') && (
                              <input
                                type="text"
                                placeholder="Auteur·ice ou organisme"
                                value={complements.get(l.texte)?.nom ?? ''}
                                disabled={creationEnCours}
                                onChange={(e) => completer(l.texte, 'nom', e.target.value)}
                              />
                            )}
                            {l.manques.includes('année') && (
                              <input
                                type="number"
                                placeholder="Année"
                                min={1700}
                                max={3000}
                                value={complements.get(l.texte)?.annee ?? ''}
                                disabled={creationEnCours}
                                onChange={(e) => completer(l.texte, 'annee', e.target.value)}
                              />
                            )}
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
              </div>
            ))}

            <div className="ed-import__biblio-actions">
              <button
                type="button"
                className="ed-import__creer"
                disabled={aCreer.size === 0 || creationEnCours}
                onClick={() => void creer()}
              >
                {creationEnCours
                  ? 'En cours…'
                  : `Ajouter ${compte(aCreer.size, 'référence')} à la bibliographie du billet`}
              </button>
              {aCreer.size > 0 && !creationEnCours && (
                <button
                  type="button"
                  className="ed-import__cancel"
                  onClick={() => setACreer(new Set())}
                >
                  Ne rien ajouter
                </button>
              )}
              {liees > 0 && (
                <span className="ed-import__match">
                  {compte(liees, 'référence')} dans « Bibliographie liée »&nbsp;—
                  enregistrez le billet pour la conserver.
                </span>
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
