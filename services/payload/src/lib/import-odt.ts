/**
 * Lecture d'un document OpenDocument (.odt), tel qu'en produit
 * LibreOffice.
 *
 * Écrit ici plutôt que confié à une bibliothèque : le sous-ensemble
 * d'ODF dont on a besoin — titres, gras, italique, liens, listes, notes
 * de bas de page — est petit et spécifié, tandis que les paquets qui
 * s'en chargent tiennent à une personne et n'ont pas bougé depuis
 * longtemps. Cent cinquante lignes vérifiables valent mieux qu'une
 * dépendance à surveiller.
 *
 * La sortie imite exactement celle de `mammoth` pour le .docx — mêmes
 * balises, mêmes ancres de note. Les deux formats convergent ainsi vers
 * un seul traitement en aval (cf. import-docx.ts), au lieu de deux
 * chaînes parallèles qui finiraient par diverger.
 *
 * Ce qu'un .odt met où :
 *  - `content.xml` porte le texte ET les styles « automatiques » (ceux
 *    qu'engendre une mise en forme à la main). Le gras n'est pas une
 *    balise mais un nom de style, qu'il faut résoudre — d'où la table
 *    construite en première passe.
 *  - Les notes sont en ligne, contenu compris, là où Word les renvoie
 *    dans un fichier séparé.
 */
import JSZip from 'jszip';

/** Ce qu'un style automatique dit d'une portion de texte. */
type Style = { gras: boolean; italique: boolean };

function echapper(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Décode les entités XML d'un texte extrait. */
function decoder(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Table des styles automatiques : nom → gras/italique.
 *
 * ODF n'écrit pas « ce mot est en gras » mais « ce mot porte le style
 * T3 », et définit T3 plus haut dans le même fichier. Sans cette table,
 * toute la mise en forme se perdrait.
 */
function lireStyles(xml: string): Map<string, Style> {
  const styles = new Map<string, Style>();
  for (const m of xml.matchAll(
    /<style:style[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)<\/style:style>/g,
  )) {
    const corps = m[2];
    const props = corps.match(/<style:text-properties[^>]*\/?>/);
    if (!props) continue;
    styles.set(m[1], {
      gras: /fo:font-weight="(bold|[6-9]00)"/.test(props[0]),
      italique: /fo:font-style="italic"/.test(props[0]),
    });
  }
  return styles;
}

/**
 * Rend le contenu d'un élément ODF en HTML en ligne.
 *
 * Traite récursivement les spans (mise en forme), les liens, les sauts
 * de ligne et les espaces répétées. Les notes, elles, ont déjà été
 * retirées du XML en amont — cf. `extraireNotes`.
 */
function rendreInline(xml: string, styles: Map<string, Style>): string {
  let out = '';
  let i = 0;

  while (i < xml.length) {
    const suivant = xml.indexOf('<', i);
    if (suivant < 0) {
      out += echapper(decoder(xml.slice(i)));
      break;
    }
    out += echapper(decoder(xml.slice(i, suivant)));

    const lien = xml.slice(suivant).match(/^<text:a\b[^>]*xlink:href="([^"]*)"[^>]*>([\s\S]*?)<\/text:a>/);
    if (lien) {
      out += `<a href="${echapper(decoder(lien[1]))}">${rendreInline(lien[2], styles)}</a>`;
      i = suivant + lien[0].length;
      continue;
    }

    const span = xml.slice(suivant).match(/^<text:span\b([^>]*)>([\s\S]*?)<\/text:span>/);
    if (span) {
      const nom = span[1].match(/text:style-name="([^"]+)"/)?.[1];
      const st = nom ? styles.get(nom) : undefined;
      let dedans = rendreInline(span[2], styles);
      if (st?.italique) dedans = `<em>${dedans}</em>`;
      if (st?.gras) dedans = `<strong>${dedans}</strong>`;
      out += dedans;
      i = suivant + span[0].length;
      continue;
    }

    const saut = xml.slice(suivant).match(/^<text:line-break\s*\/>/);
    if (saut) {
      out += '<br />';
      i = suivant + saut[0].length;
      continue;
    }

    // Espaces répétées et tabulations, encodées en ODF.
    const espaces = xml.slice(suivant).match(/^<text:s\b[^>]*text:c="(\d+)"[^>]*\/>/);
    if (espaces) {
      out += ' '.repeat(Number(espaces[1]));
      i = suivant + espaces[0].length;
      continue;
    }
    if (/^<text:(s|tab)\s*\/>/.test(xml.slice(suivant))) {
      out += ' ';
      i = suivant + xml.slice(suivant).indexOf('>') + 1;
      continue;
    }

    // Toute autre balise est franchie sans être rendue : on garde le
    // texte qu'elle contient plutôt que de le perdre.
    const fin = xml.indexOf('>', suivant);
    if (fin < 0) break;
    i = fin + 1;
  }
  return out;
}

/**
 * Retire les notes du XML et les remplace par un repère textuel.
 *
 * À faire AVANT toute découpe en blocs, et c'est tout l'objet de cette
 * fonction : une note ODF contient ses propres `<text:p>`. Tant qu'elles
 * restaient en place, la découpe des paragraphes s'arrêtait à la balise
 * fermante de la note — le paragraphe se trouvait tronqué et le texte de
 * la note se déversait dans le corps.
 *
 * Le repère est fait de caractères ordinaires : il traverse le rendu
 * sans être échappé ni confondu avec du balisage.
 */
function extraireNotes(xml: string): { corps: string; notes: string[] } {
  const notes: string[] = [];
  const corps = xml.replace(
    /<text:note\b[^>]*>([\s\S]*?)<\/text:note>/g,
    (_, dedans: string) => {
      const body = dedans.match(/<text:note-body>([\s\S]*?)<\/text:note-body>/);
      const texte = body
        ? body[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : '';
      notes.push(decoder(texte));
      return `@@NOTE${notes.length}@@`;
    },
  );
  return { corps, notes };
}

/** Convertit le corps ODF en HTML de même forme que celui de mammoth. */
function rendreCorps(xml: string, styles: Map<string, Style>): string {
  const morceaux: string[] = [];
  // Les éléments de premier niveau, dans l'ordre du document.
  const re = /<text:(h|p|list)\b([^>]*)>([\s\S]*?)<\/text:\1>|<text:(h|p)\b([^>]*)\/>/g;

  for (const m of xml.matchAll(re)) {
    const balise = m[1] ?? m[4];
    const attrs = m[2] ?? m[5] ?? '';
    const contenu = m[3] ?? '';

    if (balise === 'h') {
      const niveau = Math.min(Number(attrs.match(/text:outline-level="(\d+)"/)?.[1] ?? 1), 6);
      const dedans = rendreInline(contenu, styles).trim();
      if (dedans) morceaux.push(`<h${niveau}>${dedans}</h${niveau}>`);
      continue;
    }

    if (balise === 'list') {
      const items = [...contenu.matchAll(/<text:list-item>([\s\S]*?)<\/text:list-item>/g)]
        .map((it) => rendreInline(it[1], styles).trim())
        .filter(Boolean);
      if (items.length) morceaux.push(`<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`);
      continue;
    }

    const dedans = rendreInline(contenu, styles).trim();
    if (dedans) morceaux.push(`<p>${dedans}</p>`);
  }

  return morceaux.join('');
}

/**
 * Lit un .odt et rend le même HTML qu'un .docx passé par mammoth :
 * appels de note en `<sup>` et liste finale `<ol>` d'identifiants
 * `footnote-N`. Le traitement en aval ne voit donc pas la différence.
 */
export async function odtVersHtml(buffer: Buffer): Promise<{ html: string; avertissements: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const fichier = zip.file('content.xml');
  if (!fichier) {
    throw new Error(
      'Archive sans content.xml — êtes-vous sûr qu’il s’agit d’un document OpenDocument ?',
    );
  }
  const xml = await fichier.async('string');

  const styles = lireStyles(xml);
  const corps = xml.match(/<office:text\b[^>]*>([\s\S]*)<\/office:text>/);
  if (!corps) throw new Error('Document illisible : aucun corps de texte trouvé.');

  const { corps: sansNotes, notes } = extraireNotes(corps[1]);
  let html = rendreCorps(sansNotes, styles);

  // Les repères deviennent les appels de note, dans la forme qu'attend
  // le traitement commun aux deux formats.
  html = html.replace(
    /@@NOTE(\d+)@@/g,
    (_, n: string) => `<sup><a href="#footnote-${n}" id="footnote-ref-${n}">[${n}]</a></sup>`,
  );

  if (notes.length > 0) {
    html += `<ol>${notes
      .map(
        (t, i) =>
          `<li id="footnote-${i + 1}"><p>${echapper(t)} <a href="#footnote-ref-${i + 1}">↑</a></p></li>`,
      )
      .join('')}</ol>`;
  }

  // Les tableaux et les images ne sont pas repris : le dire plutôt que
  // de les laisser disparaître sans bruit.
  const avertissements: string[] = [];
  if (/<table:table\b/.test(xml)) {
    avertissements.push('Les tableaux ne sont pas importés — à reprendre à la main.');
  }
  if (/<draw:image\b/.test(xml)) {
    avertissements.push('Les images ne sont pas importées — à déposer depuis la médiathèque.');
  }

  return { html, avertissements };
}
