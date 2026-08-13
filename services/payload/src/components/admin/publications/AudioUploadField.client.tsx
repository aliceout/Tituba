'use client';

// AudioUploadField — champ « Fichier audio » des épisodes de podcast
// (cf registry.ts → podcasts.extraFields, type 'audio').
//
// Rendu nu, sans libellé ni aide : comme UnsplashImagePicker, le
// composant vit dans la barre latérale où la boucle de champs de
// PublicationEditView fournit déjà le <label> et le texte d'aide depuis
// le registre.
//
// Deux choses le distinguent d'un champ d'upload ordinaire :
//
//  1. **La durée est lue dans le fichier**, par le navigateur, avant
//     même l'envoi. C'est une donnée que l'éditeur·ice n'a aucune raison
//     de compter à la main, et qu'une saisie manuelle finit toujours par
//     désynchroniser d'un remontage à l'autre. Elle alimente l'affichage
//     « 42 min » des cartes et la balise <itunes:duration> du flux.
//
//  2. **La progression de l'envoi est affichée**, ce qui impose
//     XMLHttpRequest : `fetch` ne sait pas rendre compte de l'avancement
//     d'un corps de requête. Un épisode pèse des dizaines de mégaoctets
//     et l'envoi dure ; sans jauge, l'admin paraît figée.

import React, { useEffect, useRef, useState } from 'react';

// Plomberie commune aux champs de dépôt : envoi authentifié avec
// jauge, adresse de même origine, poids lisible. Elle vivait ici, et
// le champ « fichier » des outils allait la recopier — deux copies
// d'un envoi authentifié finissent toujours par diverger sur un
// détail qui compte (l'`alt` vide en est un).
import {
  API_MEDIA,
  envoyerVersMedia as envoyer,
  fichierUrl,
  poidsLisible,
  type MediaDoc as AudioValue,
} from './media-upload';



/**
 * Durée du fichier, lue par le décodeur du navigateur sans l'envoyer
 * nulle part. Retourne null plutôt que de deviner : certains MP3 à débit
 * variable annoncent une durée infinie tant qu'on ne les a pas parcourus
 * entièrement, et une valeur fausse serait pire qu'une valeur absente.
 */
function lireDuree(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('audio');
    el.preload = 'metadata';
    const fin = (valeur: number | null) => {
      URL.revokeObjectURL(url);
      resolve(valeur);
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      fin(Number.isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    el.onerror = () => fin(null);
    el.src = url;
  });
}


export default function AudioUploadField({
  value,
  onChange,
  onDuration,
}: {
  value: AudioValue | number | string | null;
  onChange: (audioId: number | string | null, doc: AudioValue) => void;
  /** Durée lue dans le fichier, à reporter sur le champ du billet. */
  onDuration: (secondes: number | null) => void;
}): React.ReactElement {
  // `value` arrive soit comme id brut (fichier tout juste déposé), soit
  // comme document peuplé (depth du fetch initial du billet) — normalisé
  // ici en un seul état d'affichage.
  const [resolved, setResolved] = useState<AudioValue>(
    value && typeof value === 'object' ? value : null,
  );
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [pourcent, setPourcent] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && typeof value === 'object') setResolved(value);
    if (value == null) setResolved(null);
  }, [value]);

  async function deposer(file: File) {
    setEnvoiEnCours(true);
    setPourcent(0);
    setErreur(null);
    // Lecture de la durée d'abord : elle porte sur le fichier local, et
    // la connaître avant l'envoi évite d'avoir à retélécharger l'épisode
    // qu'on vient tout juste de téléverser.
    const duree = await lireDuree(file);
    try {
      const doc = await envoyer(file, setPourcent);
      setResolved(doc);
      onChange(doc.id, doc);
      if (duree != null) onDuration(duree);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  const src = fichierUrl(resolved);

  return (
    <div className="audio-block">
      {resolved ? (
        <div className="audio-block__current">
          {/* Lecteur natif, contrairement à la page publique : il ne
              s'agit pas d'écouter l'épisode mais de vérifier en deux
              secondes qu'on a déposé le bon fichier. */}
          {src && <audio className="audio-block__player" src={src} controls preload="metadata" />}
          <div className="audio-block__name" title={resolved.filename ?? ''}>
            {resolved.filename ?? 'Fichier déposé'}
          </div>
          <div className="audio-block__meta">
            {[poidsLisible(resolved.filesize), resolved.mimeType].filter(Boolean).join(' · ')}
          </div>
          <div className="audio-block__links">
            <button
              type="button"
              className="audio-block__link"
              onClick={() => inputRef.current?.click()}
              disabled={envoiEnCours}
            >
              Remplacer
            </button>
            {/* Ne supprime pas le fichier de la collection : un épisode
                déjà publié peut être en cours de téléchargement chez
                quelqu'un. Le détachement est réversible, la suppression
                se fait depuis Fichiers audio. */}
            <button
              type="button"
              className="audio-block__remove"
              onClick={() => {
                setResolved(null);
                onChange(null, null);
              }}
              disabled={envoiEnCours}
            >
              Détacher
            </button>
          </div>
        </div>
      ) : (
        <div className="audio-block__empty">Aucun fichier pour le moment.</div>
      )}

      {!resolved && (
        <button
          type="button"
          className="tituba-btn tituba-btn--ghost audio-block__pick"
          onClick={() => inputRef.current?.click()}
          disabled={envoiEnCours}
        >
          Déposer un fichier
        </button>
      )}

      {envoiEnCours && (
        <div className="audio-block__progress">
          <div className="audio-block__bar">
            <span style={{ width: `${pourcent}%` }} />
          </div>
          <span className="audio-block__pct">
            {pourcent < 100 ? `Envoi… ${pourcent} %` : 'Traitement…'}
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void deposer(f);
          e.target.value = '';
        }}
      />

      {erreur && <div className="audio-block__error">{erreur}</div>}
    </div>
  );
}
