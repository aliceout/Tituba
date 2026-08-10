/**
 * Des notes de bas de page aux citations bibliographiques.
 *
 * Dans un mémoire, la note EST la référence : la source y est donnée en
 * entier à sa première mention, puis en forme courte. Sur le papier
 * c'est nécessaire — on ne peut pas cliquer sur une page. Sur le web,
 * avec la bibliographie en pied d'article, chaque note refait le travail
 * que cette bibliographie fait déjà : cent quarante-six notes pour
 * cinquante-cinq références.
 *
 * Ce module dit, pour chaque note, vers quelle source elle pointe et
 * avec quelle pagination — de quoi la remplacer par une citation qui
 * renvoie à l'entrée plutôt que de la recopier.
 *
 * Ce qu'il refuse de convertir, et c'est le plus important :
 *
 *  - une note qui dit autre chose que la référence. Un commentaire
 *    perdu dans la conversion serait irrattrapable, là où une note de
 *    trop se retire en un geste ;
 *  - une note dont la source ne se laisse pas identifier ;
 *  - un renvoi ambigu — deux textes du même auteur cités, « art. cit. »
 *    ne dit plus lequel.
 *
 * Dans le doute, la note reste une note.
 */
import {
  analyserReference,
  citationsDeNote,
  cleDeDoublon,
  nomsDeSignature,
  noteEstReference,
} from './import-references';

/** Une citation reconnue dans une note, et ce vers quoi elle pointe. */
export type CitationLue = {
  /** Clé de la source visée — cf `cleDeDoublon`. */
  cle: string;
  /** Pagination lue dans la citation : « p. 33 » → « 33 ». */
  pages: string;
};

export type NoteLue = {
  /** Le texte de la note, tel qu'il est. */
  texte: string;
  /**
   * Les citations qu'elle porte, dans l'ordre. Vide = la note reste
   * une note.
   */
  citations: CitationLue[];
  /** Pourquoi on ne convertit pas, s'il y a lieu — affiché à l'import. */
  garde: string | null;
};

const RE_RENVOI =
  /\b(art\.\s*cit|op\.\s*cit|loc\.\s*cit|rap\.\s*cit|ouvr\.\s*cit|art\.\s*cité)\b/i;
const RE_IBID = /^\s*(ibid|idem)\b/i;

/** « p. 33 », « pp. 343-345 ». Le premier tiret suffit à les relier. */
function lirePages(texte: string): string {
  const m = texte.match(/\bpp?\.\s*(\d+(?:\s*[‑–-]\s*\d+)?)/);
  return m ? m[1].replace(/\s*[‑–-]\s*/, '-') : '';
}

/**
 * Ce que la note dit APRÈS sa référence.
 *
 * Une note peut donner sa source puis ajouter une précision — « […]
 * p. 95 Le terme « Bruleurs de frontières » provient du surnom marocain
 * « Harraga » ». Cette précision est du texte d'auteur·ice : la
 * convertir en citation la ferait disparaître.
 *
 * On repère la fin de l'appareil bibliographique — pagination, date de
 * consultation, adresse, année — et l'on regarde ce qui suit.
 */
function commentaireApres(texte: string): string {
  const bornes = [
    /\bConsult[ée]e?\s+le[^,;.]*/gi,
    /https?:\/\/\S+/g,
    /\bpp?\.\s*\d+(?:\s*[‑–-]\s*\d+)?/g,
    /\b(1[5-9]\d{2}|20\d{2})\b/g,
  ];
  let fin = 0;
  for (const re of bornes) {
    for (const m of texte.matchAll(re)) {
      if (m.index !== undefined) fin = Math.max(fin, m.index + m[0].length);
    }
  }
  if (fin === 0) return '';

  const queue = texte
    .slice(fin)
    .replace(/\[En ligne\]|URL\s*:|»|«/gi, ' ')
    .replace(/[.,;:\-–‑\s]+/g, ' ')
    .trim();
  // Deux mots ou moins : une fin de phrase, pas un propos.
  return queue.split(/\s+/).filter(Boolean).length > 2 ? queue : '';
}

/**
 * Lit une suite de notes et relie chacune à sa source.
 *
 * L'ordre compte : « Ibid. » désigne la note précédente, et « art. cit. »
 * la dernière mention complète du même nom. On avance donc en tenant à
 * jour ce qui a été cité, exactement comme le fait une lectrice.
 */
export function lireNotes(notes: string[]): NoteLue[] {
  // Une désignation → la ou les sources qu'elle peut viser. Plusieurs =
  // on ne tranche pas.
  const parSignature = new Map<string, Set<string>>();
  const parNom = new Map<string, Set<string>>();
  const parEditeur = new Map<string, Set<string>>();
  let derniere: string | null = null;

  const noter = (registre: Map<string, Set<string>>, k: string, cle: string): void => {
    const s = registre.get(k) ?? new Set<string>();
    s.add(cle);
    registre.set(k, s);
  };
  const unique = (s: Set<string> | undefined): string | null =>
    s && s.size === 1 ? [...s][0] : null;

  const out: NoteLue[] = [];

  for (const texte of notes) {
    const citations: CitationLue[] = [];
    let garde: string | null = null;

    const commentaire = commentaireApres(texte);
    if (commentaire) garde = 'la note ajoute un propos à la référence';

    for (const citation of citationsDeNote(texte)) {
      const pages = lirePages(citation);

      if (noteEstReference(citation)) {
        const r = analyserReference(citation);
        const cle = cleDeDoublon(r);
        const zone = citation.split(/[«“"(]/)[0]?.replace(/[,;\s]+$/, '') ?? '';
        const signature = zone ? nomsDeSignature(zone) : r.nom ? [r.nom] : [];
        if (signature.length > 0) {
          noter(parSignature, signature.map((n) => n.toLowerCase()).join('|'), cle);
        }
        if (r.nom) noter(parNom, r.nom, cle);
        if (r.editeur) noter(parEditeur, r.editeur, cle);
        derniere = cle;
        citations.push({ cle, pages });
        continue;
      }

      if (RE_IBID.test(citation)) {
        if (derniere) citations.push({ cle: derniere, pages });
        else garde ??= 'aucune source à laquelle « Ibid. » puisse renvoyer';
        continue;
      }

      if (!RE_RENVOI.test(citation)) {
        // Ni référence ni renvoi : c'est du texte.
        if (citation.trim().length > 0) garde ??= 'la note dit autre chose qu’une référence';
        continue;
      }

      const coupe = citation.search(RE_RENVOI);
      const avant = (coupe > 0 ? citation.slice(0, coupe) : '').replace(/[,;\s]+$/, '');
      const noms = avant ? nomsDeSignature(avant) : [];
      const essais = [
        unique(parSignature.get(noms.map((n) => n.toLowerCase()).join('|'))),
        ...noms.map((n) => unique(parNom.get(n))),
        unique(parNom.get(avant)),
        unique(parEditeur.get(avant)),
      ];
      const cle = essais.find((x): x is string => Boolean(x));
      if (cle) {
        derniere = cle;
        citations.push({ cle, pages });
      } else {
        garde ??= 'le renvoi ne désigne pas une source unique';
      }
    }

    if (citations.length === 0) garde ??= 'aucune citation reconnue';
    out.push({ texte, citations, garde });
  }

  return out;
}
