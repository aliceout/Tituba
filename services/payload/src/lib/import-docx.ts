/**
 * Import d'un document Word — la conversion, sans la plomberie HTTP.
 *
 * Séparée de l'endpoint pour être vérifiable seule : on peut lui donner
 * un .docx et regarder ce qui en sort, sans serveur ni session.
 *
 * ─── Ce que le document devient ──────────────────────────────────────
 *
 * `mammoth` traduit le .docx en HTML : titres, gras, italique, liens,
 * listes, et les notes de bas de page sous forme d'appels `<sup>` dans
 * le texte plus une liste finale. On reprend ensuite ce HTML pour
 * l'amener à la forme du site :
 *
 *  1. Les titres descendent d'un cran — le « Titre 1 » de Word devient
 *     un h2. Le h1 de la page est déjà le titre du billet ; en laisser
 *     un second dans le corps casserait la structure que lisent les
 *     lecteurs d'écran et le sommaire.
 *  2. Les appels de note deviennent des blocs `footnote`, ceux du site,
 *     avec le texte de la note dedans. Sans quoi le corps garderait des
 *     ancres HTML pointant vers une liste qui n'existe plus.
 *  3. La bibliographie finale est DÉTACHÉE du corps : elle a sa propre
 *     collection, et la laisser en paragraphes en ferait un doublon que
 *     rien ne relierait aux références.
 *
 * ─── Ce que ça ne fait pas ───────────────────────────────────────────
 *
 * Les citations Zotero insérées comme champs Word arrivent en texte
 * brut : Word les rend avant l'export, leur nature se perd. On ne peut
 * donc pas les relier automatiquement — c'est l'appariement proposé
 * ensuite qui s'en charge, avec un humain devant.
 */
import mammoth from 'mammoth';

/** Une ligne de la bibliographie détachée du document. */
export type LigneBiblio = {
  /** Le texte tel qu'il figurait dans le document. */
  texte: string;
  /** Nom de famille présumé — sert à chercher une entrée existante. */
  nom: string | null;
  /** Année présumée. */
  annee: number | null;
};

export type ResultatImport = {
  /** HTML du corps, notes marquées, bibliographie retirée. */
  html: string;
  /** Texte des notes, dans l'ordre de leur appel. */
  notes: string[];
  biblio: LigneBiblio[];
  /** Ce que mammoth n'a pas su traduire — affiché à l'import. */
  avertissements: string[];
};

/**
 * Marqueur d'appel de note posé dans le HTML.
 *
 * Un jeton textuel plutôt qu'une balise : il doit survivre à la
 * conversion en Lexical, où seul le texte est préservé de façon sûre.
 * Les caractères choisis n'apparaissent pas dans un texte français.
 */
export const MARQUE_NOTE = (n: number): string => `⁣NOTE${n}⁣`;
export const RE_MARQUE = /⁣NOTE(\d+)⁣/;

/** Titres qui annoncent une bibliographie, quelle que soit la casse. */
const RE_TITRE_BIBLIO =
  /^\s*(bibliographie|références?\s*(bibliographiques?)?|references?|sources?\s*cit[ée]es?|ouvrages?\s*cit[ée]s?)\s*$/i;

/**
 * Sépare la bibliographie du corps.
 *
 * On cherche le DERNIER titre qui l'annonce, et on prend tout ce qui
 * suit. Le dernier et non le premier : un article peut mentionner le
 * mot « sources » en cours de route, et couper là amputerait le texte.
 */
function detacherBiblio(html: string): { corps: string; lignes: string[] } {
  const titres = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const dernier = titres.filter((m) => RE_TITRE_BIBLIO.test(m[1].replace(/<[^>]+>/g, ''))).pop();
  if (!dernier || dernier.index === undefined) return { corps: html, lignes: [] };

  const apres = html.slice(dernier.index + dernier[0].length);
  const lignes = [...apres.matchAll(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)]
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 8);

  return { corps: html.slice(0, dernier.index), lignes };
}

/**
 * Devine le nom et l'année d'une référence, pour proposer un
 * rapprochement.
 *
 * Volontairement grossier : on ne cherche pas à analyser une citation —
 * l'exercice est notoirement peu fiable sur du texte libre — mais à
 * réunir de quoi interroger la bibliothèque existante. C'est un humain
 * qui tranchera.
 */
function deviner(texte: string): { nom: string | null; annee: number | null } {
  const annee = texte.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  // Le nom de famille ouvre presque toujours une référence, avant la
  // virgule qui introduit le prénom.
  const nom = texte.match(/^\s*([A-ZÀ-Ý][\p{L}'’-]{1,})\s*[,.]/u);
  return {
    nom: nom ? nom[1] : null,
    annee: annee ? Number.parseInt(annee[1], 10) : null,
  };
}

/**
 * Extrait les notes et remplace leurs appels par des marqueurs.
 *
 * mammoth produit `<sup><a href="#footnote-3" …>[2]</a></sup>` dans le
 * texte et une liste finale `<li id="footnote-3">`. On relie les deux
 * par l'identifiant, puis on retire la liste : son contenu vit
 * désormais dans les blocs de note.
 */
function extraireNotes(html: string): { corps: string; notes: string[] } {
  const textes = new Map<string, string>();
  for (const m of html.matchAll(/<li id="(footnote-\d+)">([\s\S]*?)<\/li>/gi)) {
    const texte = m[2]
      // La flèche de retour vers l'appel n'a de sens que dans le HTML
      // de mammoth ; le site rend ses propres renvois.
      .replace(/<a[^>]*href="#footnote-ref[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<\/?p[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    textes.set(m[1], texte);
  }

  const notes: string[] = [];
  const corps = html
    // La liste des notes disparaît du corps.
    .replace(/<ol>\s*(?:<li id="footnote-\d+">[\s\S]*?<\/li>\s*)+<\/ol>/gi, '')
    // Chaque appel devient un marqueur, numéroté dans l'ordre de
    // lecture — l'ordre du document, pas celui des identifiants Word,
    // qui ne se suivent pas forcément.
    .replace(/<sup>\s*<a[^>]*href="#(footnote-\d+)"[^>]*>[\s\S]*?<\/a>\s*<\/sup>/gi, (_, id) => {
      notes.push(textes.get(id) ?? '');
      return MARQUE_NOTE(notes.length - 1);
    });

  return { corps, notes };
}

/**
 * Ramène les titres d'un cran : le h1 de la page est le titre du
 * billet, un second dans le corps désorganiserait la structure. Un h5
 * ou h6 reste au plancher plutôt que de disparaître.
 */
function descendreTitres(html: string): string {
  return html.replace(/<(\/?)h([1-6])([^>]*)>/gi, (_, fin, n, reste) => {
    const niveau = Math.min(Number(n) + 1, 6);
    return `<${fin}h${niveau}${reste}>`;
  });
}

/** Convertit un .docx en éléments prêts à devenir un billet. */
export async function lireDocx(buffer: Buffer): Promise<ResultatImport> {
  const { value, messages } = await mammoth.convertToHtml({ buffer });

  // Les notes d'abord, la bibliographie ensuite — et l'ordre n'est pas
  // indifférent : mammoth place la liste des notes tout à la fin du
  // document, donc APRÈS la bibliographie. Détacher celle-ci en premier
  // emportait la liste avec elle, et le texte des notes se retrouvait
  // pris pour des références.
  const { corps: sansNotes, notes } = extraireNotes(value);
  const { corps: sansBiblio, lignes } = detacherBiblio(sansNotes);
  const html = descendreTitres(sansBiblio).trim();

  return {
    html,
    notes,
    biblio: lignes.map((texte) => ({ texte, ...deviner(texte) })),
    // Les styles inconnus sont signalés, pas tus : quelqu'un qui a mis
    // en forme son texte doit savoir ce qui n'a pas suivi.
    avertissements: [...new Set(messages.map((m) => m.message))],
  };
}
