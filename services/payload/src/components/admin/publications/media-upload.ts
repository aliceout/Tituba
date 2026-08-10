/**
 * Ce que partagent les champs de dépôt de fichier — l'audio d'un
 * épisode, la ressource d'un outil.
 *
 * Extrait d'AudioUploadField, qui portait ces trois fonctions en propre.
 * Un second champ de dépôt allait les recopier, et deux copies d'un
 * envoi authentifié finissent toujours par diverger sur un détail qui
 * compte — l'`alt` vide ci-dessous en est un.
 */

/** Médiathèque commune : images, audio et documents y vivent ensemble. */
export const API_MEDIA = '/cms/api/media';

export type MediaDoc = {
  id: number | string;
  filename?: string | null;
  url?: string | null;
  filesize?: number | null;
  mimeType?: string | null;
  title?: string | null;
} | null;

/**
 * Chemin de même origine plutôt que le champ `url` : Payload construit
 * ce dernier en absolu sur ADDRESS (le domaine public du site), qui
 * n'est pas l'origine de l'admin — en développement les deux sont sur
 * des ports différents et l'aperçu ne charge pas.
 */
export function fichierUrl(v: MediaDoc): string | null {
  if (!v) return null;
  if (v.filename) return `${API_MEDIA}/file/${encodeURIComponent(v.filename)}`;
  return v.url ?? null;
}

export function poidsLisible(octets: number | null | undefined): string {
  if (typeof octets !== 'number' || octets <= 0) return '';
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.round(octets / 1024)} Ko`;
}

/**
 * Envoi avec jauge de progression.
 *
 * XMLHttpRequest et non `fetch` : ce dernier ne sait pas rendre compte
 * de l'avancement d'un corps de requête. Un épisode pèse des dizaines
 * de mégaoctets et l'envoi dure ; sans jauge, l'admin paraît figée.
 */
export function envoyerVersMedia(
  file: File,
  onProgress: (pourcent: number) => void,
): Promise<NonNullable<MediaDoc>> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    // `alt` explicitement vide et non omis : la colonne est NOT NULL en
    // base, héritée du temps où seules des images y vivaient. La
    // validation, elle, ne l'exige que pour une image (cf Media.ts) —
    // un épisode ou un PDF n'a rien à décrire.
    fd.append('_payload', JSON.stringify({ title: file.name, alt: '' }));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_MEDIA);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let corps: { doc?: MediaDoc; errors?: { message?: string }[]; message?: string } = {};
      try {
        corps = JSON.parse(xhr.responseText);
      } catch {
        /* réponse non-JSON : on retombe sur le statut */
      }
      if (xhr.status >= 200 && xhr.status < 300 && corps.doc) {
        resolve(corps.doc);
        return;
      }
      reject(
        new Error(
          corps.errors?.[0]?.message || corps.message || `Envoi refusé (HTTP ${xhr.status}).`,
        ),
      );
    };
    xhr.onerror = () => reject(new Error('Envoi interrompu.'));
    xhr.send(fd);
  });
}
