/**
 * Import d'un document rédigé ailleurs — la conversion, sans la
 * plomberie HTTP.
 *
 * Deux formats acceptés : le .docx de Word et l'.odt de LibreOffice.
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

import { odtVersHtml } from './import-odt';
import {
  analyserReference,
  cleDeDoublon,
  noteEstReference,
  type ReferenceLue,
} from './import-references';

/**
 * Une ligne de la bibliographie détachée du document, telle que la lit
 * `import-references` — texte d'origine compris, toujours.
 */
export type LigneBiblio = ReferenceLue;

export type ResultatImport = {
  /** HTML du corps, notes marquées, bibliographie retirée. */
  html: string;
  /** Titre du document, s'il en portait un — proposé, jamais imposé. */
  titre: string | null;
  /** Texte des notes, dans l'ordre de leur appel. */
  notes: string[];
  biblio: LigneBiblio[];
  /**
   * Références complètes trouvées DANS les notes.
   *
   * Elles restent des notes — on ne touche pas au texte. Mais une
   * source citée en entier dans une note appartient aussi à la
   * bibliographie du billet, et ne l'y trouver nulle part serait
   * incompréhensible pour qui lit l'article.
   */
  notesRefs: LigneBiblio[];
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

/** Titres qui annoncent un sommaire, quelle que soit la casse. */
const RE_TITRE_SOMMAIRE =
  /^\s*(table\s+des\s+mati[èe]res|sommaire|table\s+of\s+contents)\s*[:.]?\s*$/i;

/**
 * Retire le sommaire engendré par le traitement de texte.
 *
 * Word insère une table des matières figée : une suite de « Titre I : …
 * 12 » renvoyant à des ancres internes. Importée telle quelle, elle
 * atterrit au milieu du billet, avec des numéros de page qui ne veulent
 * plus rien dire sur le web et des liens qui ne mènent nulle part — le
 * tout en double du sommaire que le site fabrique lui-même.
 *
 * Les renvois portent une ancre `#_Toc…`, signature qui ne trompe pas.
 * À défaut de liens, on ne retire les lignes que juste après un titre
 * qui annonce un sommaire, et seulement si elles en ont la forme : un
 * intitulé suivi d'un numéro de page.
 */
function retirerSommaire(html: string): { corps: string; retire: number } {
  let retire = 0;

  let corps = html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (bloc) => {
    if (!/href="#_Toc/i.test(bloc)) return bloc;
    retire += 1;
    return '';
  });

  const titre = [...corps.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].find((m) =>
    RE_TITRE_SOMMAIRE.test(m[2].replace(/<[^>]+>/g, '')),
  );
  if (!titre || titre.index === undefined) return { corps, retire };

  // Ce qui suit le titre, tant que ça ressemble à une ligne de sommaire.
  let fin = titre.index + titre[0].length;
  let lignes = 0;
  for (;;) {
    const suite = corps.slice(fin).match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!suite) break;
    const t = suite[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Une ligne vide sépare parfois deux entrées : on la franchit.
    if (t && !/\s\d{1,4}$/.test(t)) break;
    if (t) lignes += 1;
    fin += suite[0].length;
  }

  // Le titre seul part avec ses lignes ; sans lignes à retirer, il ne
  // part que si les renvois ont déjà été enlevés au-dessus.
  if (lignes < 2 && retire === 0) return { corps, retire };

  retire += lignes;
  corps = corps.slice(0, titre.index) + corps.slice(lignes >= 2 ? fin : titre.index + titre[0].length);
  return { corps, retire };
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
 * Détache le titre du document, quand il en porte un.
 *
 * Un texte commence presque toujours par son titre, en « Titre 1 ».
 * Laissé dans le corps, il y deviendrait un intertitre faisant double
 * emploi avec le titre du billet, et le sommaire annoncerait une section
 * qui n'en est pas une.
 *
 * Seulement le tout premier élément : un h1 rencontré plus loin est une
 * partie du texte, et l'arracher de là déplacerait du contenu.
 */
function detacherTitre(html: string): { corps: string; titre: string | null } {
  const m = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return { corps: html, titre: null };

  const titre = m[1]
    .replace(/<[^>]+>/g, '')
    .replace(new RegExp(RE_MARQUE.source, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!titre) return { corps: html, titre: null };

  return { corps: html.slice(m[0].length), titre };
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

/**
 * Ce qu'on dit de ce qui n'a pas suivi.
 *
 * mammoth se plaint en anglais et par identifiant de style interne —
 * « Unrecognised run style: 'null' (Style ID: FootnoteReference) ». Cela
 * ne veut rien dire pour qui a écrit le texte, et ça inquiète pour rien :
 * ces messages accompagnent une conversion parfaitement réussie.
 *
 * On les ramène donc à une phrase, une seule, qui dit ce qui est vrai :
 * une mise en forme sans équivalent sur le site n'a pas été reprise.
 */
function nettoyerAvertissements(messages: string[]): string[] {
  const out = new Set<string>();
  for (const m of messages) {
    if (/style/i.test(m)) {
      out.add('Certaines mises en forme n’ont pas d’équivalent sur le site et ont été ignorées.');
    } else {
      out.add(m);
    }
  }
  return [...out];
}

/**
 * Retire les images et signale ce qui ne passera pas.
 *
 * mammoth incorpore les images dans le HTML, encodées en toutes lettres.
 * Laissées là, elles finiraient recopiées dans le corps du billet et
 * stockées telles quelles en base — plusieurs mégaoctets de texte pour
 * une photo, hors de la médiathèque, sans texte alternatif et sans
 * possibilité de les remplacer. Elles sont donc retirées, et signalées :
 * qui a illustré son texte doit savoir qu'il faut redéposer les images.
 */
function retirerImages(html: string): { corps: string; avertissements: string[] } {
  const avertissements: string[] = [];
  if (/<img\b/i.test(html)) {
    avertissements.push(
      'Les images ne sont pas importées — à redéposer depuis la médiathèque.',
    );
  }
  if (/<table\b/i.test(html)) {
    avertissements.push('Les tableaux ne sont pas importés — à reprendre à la main.');
  }
  return { corps: html.replace(/<img\b[^>]*>/gi, ''), avertissements };
}

/** Formats acceptés, et ce qu'on en dit à qui dépose autre chose. */
export const EXTENSIONS = ['.docx', '.odt'] as const;

/**
 * Convertit un document en éléments prêts à devenir un billet.
 *
 * Deux formats, une seule suite d'opérations : le lecteur .odt rend
 * volontairement le même HTML que mammoth — mêmes balises, mêmes ancres
 * de note. Traiter les deux séparément aurait garanti qu'ils finissent
 * par diverger sur un détail, et qu'un défaut ne soit corrigé que d'un
 * côté.
 */
export async function lireDocument(
  buffer: Buffer,
  nomFichier: string,
): Promise<ResultatImport> {
  const estOdt = /\.odt$/i.test(nomFichier);

  let value: string;
  let messages: string[];
  if (estOdt) {
    const r = await odtVersHtml(buffer);
    value = r.html;
    messages = r.avertissements;
  } else {
    const r = await mammoth.convertToHtml({ buffer });
    value = r.value;
    messages = r.messages.map((m) => m.message);
  }

  // Les notes d'abord, la bibliographie ensuite — et l'ordre n'est pas
  // indifférent : mammoth place la liste des notes tout à la fin du
  // document, donc APRÈS la bibliographie. Détacher celle-ci en premier
  // emportait la liste avec elle, et le texte des notes se retrouvait
  // pris pour des références.
  const { corps: sansImages, avertissements: perdus } = retirerImages(value);
  const { corps: sansNotes, notes } = extraireNotes(sansImages);
  const { corps: sansBiblio, lignes } = detacherBiblio(sansNotes);
  const { corps: sansSommaire, retire } = retirerSommaire(sansBiblio);
  const { corps: sansTitre, titre } = detacherTitre(sansSommaire.trim());
  // Un titre vide n'a pas de contenu à porter, mais il ouvre une section
  // dans le sommaire du site : une entrée sans intitulé, sur laquelle on
  // clique pour n'aller nulle part.
  const html = descendreTitres(sansTitre)
    .replace(/<h([1-6])[^>]*>\s*<\/h\1>/gi, '')
    .trim();

  // Les sources citées en entier dans les notes rejoignent celles de la
  // bibliographie finale — sans doublon : une source se trouve souvent
  // aux deux endroits, et la proposer deux fois ferait deux entrées pour
  // un même livre.
  const biblio = lignes.map(analyserReference);
  const vues = new Set(biblio.map(cleDeDoublon));
  const notesRefs: LigneBiblio[] = [];
  for (const note of notes) {
    if (!noteEstReference(note)) continue;
    const ref = analyserReference(note);
    const cle = cleDeDoublon(ref);
    if (vues.has(cle)) continue;
    vues.add(cle);
    notesRefs.push(ref);
  }

  return {
    html,
    titre,
    notes,
    biblio,
    notesRefs,
    // Ce qui n'a pas suivi est dit, pas tu : quelqu'un qui a illustré ou
    // mis en forme son texte doit savoir ce qu'il lui reste à faire. Ce
    // qui a été retiré à dessein est dit aussi — sans quoi on chercherait
    // son sommaire.
    avertissements: [
      ...new Set([
        ...perdus,
        ...(retire > 0
          ? [
              `Le sommaire du document (${retire} ligne${retire > 1 ? 's' : ''}) n’a pas été repris — le site fabrique le sien.`,
            ]
          : []),
        ...nettoyerAvertissements(messages),
      ]),
    ],
  };
}
