'use client';

/**
 * FichierUploadField — champ « Les fichiers » d'un outil (cf registry.ts
 * → outils.extraFields, type 'fichier').
 *
 * Un outil existe pour transmettre des documents ; ceux-ci sont donc
 * déposés dans la médiathèque, pas désignés par une adresse tapée à la
 * main. Payload garantit alors qu'ils existent, en connaît le poids et
 * le type, et l'adresse ne peut pas être fausse.
 *
 * Chaque entrée porte son fichier et sa description. L'intitulé, lui,
 * est le titre du média : il se corrige ici mais vit là-bas, pour qu'un
 * même document ne porte pas deux noms selon l'endroit d'où on le
 * regarde. Sans eux, la page annonçait « grille-v3-final.pdf » — un
 * accident de nommage donné à lire au public.
 *
 * Plusieurs entrées, parce qu'un outil en réunit souvent plusieurs : un
 * guide et sa grille, un support et son corrigé. Chaque ligne porte ses
 * propres actions — ouvrir pour vérifier, remplacer, retirer — et le
 * bouton du bas en ajoute une.
 *
 * Rendu nu, sans libellé ni aide : comme les autres champs, c'est la
 * boucle de PublicationEditView qui les fournit depuis le registre.
 */

import React, { useEffect, useRef, useState } from 'react';

import { API_MEDIA, envoyerVersMedia, fichierUrl, poidsLisible, type MediaDoc } from './media-upload';

/**
 * Renomme un média. L'intitulé affiché sur le site est son titre : il
 * se corrige donc là où il vit, pas dans une copie propre à l'outil —
 * sinon un même fichier porterait deux noms selon l'endroit d'où on le
 * regarde.
 */
async function renommer(id: number | string, title: string): Promise<void> {
  await fetch(`${API_MEDIA}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

type Fichier = NonNullable<MediaDoc>;

/** Une entrée du tableau côté Payload. */
export type Ressource = {
  fichier: Fichier | number | string | null;
  description?: string;
  id?: string;
};

/** « application/pdf » → « PDF ». Le type MIME est illisible tel quel. */
function typeLisible(doc: Fichier): string {
  const parExtension = (doc.filename ?? '').split('.').pop();
  if (parExtension && parExtension.length <= 5 && parExtension !== doc.filename) {
    return parExtension.toUpperCase();
  }
  return doc.mimeType?.split('/').pop()?.toUpperCase() ?? 'Fichier';
}

/** Le document d'une entrée, quand il est peuplé. */
function docDe(r: Ressource): Fichier | null {
  return r.fichier && typeof r.fichier === 'object' ? r.fichier : null;
}

export default function FichierUploadField({
  value,
  onChange,
}: {
  value: Ressource[] | null | undefined;
  onChange: (ressources: Ressource[]) => void;
}): React.ReactElement {
  const [entrees, setEntrees] = useState<Ressource[]>(() => (Array.isArray(value) ? value : []));
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [pourcent, setPourcent] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Index dont on remplace le fichier, ou null pour une entrée neuve. */
  const cible = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Array.isArray(value)) setEntrees(value);
  }, [value]);

  function publier(liste: Ressource[]): void {
    setEntrees(liste);
    onChange(liste);
  }

  function modifier(i: number, patch: Partial<Ressource>): void {
    publier(entrees.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  async function deposer(file: File) {
    setEnvoiEnCours(true);
    setPourcent(0);
    setErreur(null);
    try {
      const doc = await envoyerVersMedia(file, setPourcent);
      const i = cible.current;
      if (i === null) {
        // Le titre du média sert d'intitulé : à l'envoi il vaut le nom
        // du fichier, et se corrige dans le champ ci-dessous.
        publier([...entrees, { fichier: doc, description: '' }]);
      } else {
        publier(entrees.map((e, j) => (j === i ? { ...e, fichier: doc } : e)));
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setEnvoiEnCours(false);
      cible.current = null;
    }
  }

  function choisir(index: number | null) {
    cible.current = index;
    inputRef.current?.click();
  }

  return (
    <div className="fichier-block">
      {entrees.length === 0 ? (
        <div className="fichier-block__empty">Aucun fichier pour le moment.</div>
      ) : (
        <ul className="fichier-block__liste">
          {entrees.map((r, i) => {
            const doc = docDe(r);
            const href = fichierUrl(doc);
            return (
              <li className="fichier-block__current" key={r.id ?? `${i}`}>
                <div className="fichier-block__infos">
                  <span className="fichier-block__type">{doc ? typeLisible(doc) : '—'}</span>
                  <span className="fichier-block__nom">
                    {(doc?.title ?? '').trim() || doc?.filename || 'Fichier manquant'}
                  </span>
                  {doc && poidsLisible(doc.filesize) && (
                    <span className="fichier-block__poids">{poidsLisible(doc.filesize)}</span>
                  )}
                </div>

                <label className="fichier-block__champ">
                  <span className="lbl">Intitulé</span>
                  <input
                    type="text"
                    value={doc?.title ?? ''}
                    placeholder={doc?.filename ?? ''}
                    onChange={(e) => {
                      // L'état local suit la frappe ; l'enregistrement
                      // attend la sortie du champ (cf onBlur) pour ne
                      // pas envoyer une requête par caractère.
                      if (!doc) return;
                      publier(
                        entrees.map((x, j) =>
                          j === i ? { ...x, fichier: { ...doc, title: e.target.value } } : x,
                        ),
                      );
                    }}
                    onBlur={() => {
                      if (doc?.id) void renommer(doc.id, (doc.title ?? '').trim() || doc.filename || 'Document');
                    }}
                  />
                  <span className="hint">
                    C’est le titre du fichier dans la médiathèque : il change partout où ce
                    document apparaît.
                  </span>
                </label>

                <label className="fichier-block__champ">
                  <span className="lbl">Description</span>
                  <textarea
                    rows={2}
                    value={r.description ?? ''}
                    placeholder="Ce que contient ce document, et à quoi il sert."
                    onChange={(e) => modifier(i, { description: e.target.value })}
                  />
                </label>

                <div className="fichier-block__links">
                  {/* Ouvrir plutôt que télécharger : ici on vérifie
                      qu'on a déposé le bon document, on ne le collecte
                      pas. */}
                  {href && (
                    <a className="fichier-block__link" href={href} target="_blank" rel="noopener">
                      Ouvrir
                    </a>
                  )}
                  <button
                    type="button"
                    className="fichier-block__link"
                    onClick={() => choisir(i)}
                    disabled={envoiEnCours}
                  >
                    Remplacer
                  </button>
                  <button
                    type="button"
                    className="fichier-block__remove"
                    onClick={() => publier(entrees.filter((_, j) => j !== i))}
                    disabled={envoiEnCours}
                  >
                    Retirer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {envoiEnCours && (
        <div
          className="fichier-block__jauge"
          role="progressbar"
          aria-valuenow={pourcent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Envoi du fichier"
        >
          <div className="fichier-block__jauge-fill" style={{ width: `${pourcent}%` }} />
        </div>
      )}

      <div className="fichier-block__actions">
        <button
          type="button"
          className="tituba-btn tituba-btn--ghost"
          onClick={() => choisir(null)}
          disabled={envoiEnCours}
        >
          {envoiEnCours
            ? `Envoi… ${pourcent}%`
            : entrees.length === 0
              ? 'Déposer un fichier'
              : 'Ajouter un fichier'}
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void deposer(f);
            e.target.value = '';
          }}
        />
      </div>

      {erreur && <div className="fichier-block__error">{erreur}</div>}
    </div>
  );
}
