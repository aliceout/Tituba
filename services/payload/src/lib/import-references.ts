/**
 * Lire une référence bibliographique écrite à la main.
 *
 * Une bibliographie de mémoire n'est pas une base de données : c'est du
 * texte, mis en forme selon l'usage de la discipline, de la directrice
 * de recherche ou de l'habitude. On n'en tirera jamais des champs
 * propres à tous les coups, et prétendre le contraire produirait des
 * entrées fausses — plus coûteuses à repérer, une fois en base, qu'à
 * saisir à la main.
 *
 * La règle tenue ici est donc : **ne rien inventer**. Ce qui se lit sans
 * ambiguïté est repris ; le reste est laissé vide, et le texte d'origine
 * est conservé intégralement dans l'entrée pour qu'on puisse toujours
 * revenir à ce qui était écrit.
 *
 * Deux usages sont reconnus, parce que ce sont les deux qu'on rencontre :
 *
 *   Farris, Sara R. 2017. In the Name of Women's Rights. Durham : Duke UP.
 *   Agier Michel, « La fabrique des indésirables », Le Monde diplo., 2017.
 *
 * Le premier place le prénom après la virgule, le second avant elle.
 */

export type TypeReference = 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';

export type ReferenceLue = {
  /** Le texte tel qu'il figurait dans le document. Jamais perdu. */
  texte: string;
  nom: string | null;
  prenom: string | null;
  annee: number | null;
  /** Titre isolé, ou `null` si aucun ne se laisse distinguer. */
  titre: string | null;
  /** Revue, journal ou maison d'édition, selon le cas. */
  editeur: string | null;
  url: string | null;
  type: TypeReference;
  /**
   * Texte non signé, et qui l'annonce (« [anon.] », « Anonyme »).
   *
   * Distinct d'un nom qu'on n'a pas su lire : ici on sait qu'il n'y en
   * a pas. L'entrée peut donc se créer sans auteur·ice plutôt que
   * d'attendre qu'on en invente un.
   */
  anonyme: boolean;
  /**
   * Ce qui manque pour créer l'entrée. Vide = créable.
   * Le nom et l'année sont exigés par la collection ; sans eux, aucune
   * entrée n'est proposée plutôt qu'une entrée à trous.
   */
  manques: string[];
};

/** Une particule ouvre un nom sans porter de majuscule. */
const PARTICULE = /^(d[eu]|des|d’|d'|van|von|der|le|la|les|di|da|dos|del|ter|ten)$/i;

const MAJUSCULE = /^[A-ZÀ-Ý]/u;

/**
 * Renvoi à une source déjà citée plus haut, pas une source.
 *
 * « Weber, S., art. cit., p. 33 » ne dit pas ce qu'est l'article : il
 * dit d'aller le chercher dans une note antérieure. Créer une entrée
 * là-dessus produirait une référence sans titre, sans année et sans
 * éditeur, qui ne servirait à personne.
 */
export const RE_FORME_COURTE =
  /\b(art\.\s*cit|op\.\s*cit|loc\.\s*cit|rap\.\s*cit|ouvr\.\s*cit|art\.\s*cité|ibid|idem|supra|infra)\b/i;

/** Marque d'un texte non signé, en tête de référence. */
const RE_ANONYME = /^\s*(\[?\s*anon\.?\s*\]?|anonyme|collectif|s\.\s*n\.)\s*[,.]/i;

/** Mois français — sert à écarter les dates des segments de titre. */
const RE_DATE =
  /^\s*\d{0,2}\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*\d{4}\s*$/i;

/**
 * Nom et prénom, quelle que soit la manière de les écrire.
 *
 * Ce qui départage les usages n'est pas la ponctuation mais ce qui suit
 * la première virgule :
 *
 *   de Rochegonde, A., « Chronique… »   → « A. » est un prénom, donc
 *                                         toute la tête est le nom
 *   Agier Michel, « La fabrique… »      → rien avant le titre, donc la
 *                                         tête porte nom ET prénom
 *   Union européenne, « Communication… »→ idem, mais la casse trahit
 *                                         une institution
 *
 * Les particules ne portent pas de majuscule et ouvrent pourtant le
 * nom : « de Rochegonde », « Le Cain », « Wa Kabwe-Segatti ». Les
 * traiter comme un défaut de casse revenait à ne pas lire du tout des
 * noms parfaitement clairs.
 *
 * Les co-signataires sont écartés : on garde la première personne, la
 * seule dont la place dans la référence soit certaine. L'ordre des
 * suivantes se lit dans le texte d'origine, conservé dans l'entrée.
 */
function lireNom(texte: string): { nom: string | null; prenom: string | null } {
  // Le titre ferme la zone des noms : ce qui vient après ne s'y trouve
  // jamais.
  const avantTitre = texte.split(/[«“"(]/)[0] ?? texte;
  const morceaux = avantTitre.split(',');
  const tete = (morceaux[0] ?? '').split(/\s+(?:et|&|and)\s+/i)[0]?.trim() ?? '';
  const suite = (morceaux.slice(1).join(',') ?? '').trim();

  const mots = tete.split(/\s+/).filter(Boolean);
  if (mots.length === 0) return { nom: null, prenom: null };

  const debut = mots.length > 1 && PARTICULE.test(mots[0]) ? 1 : 0;
  const utiles = mots.slice(debut);
  if (utiles.length === 0 || !MAJUSCULE.test(utiles[0])) return { nom: null, prenom: null };

  // Un prénom, ou des initiales, juste après la virgule.
  const prenomSuivant = suite.match(
    /^([A-ZÀ-Ý][\p{L}'’-]*\.?(?:\s+[A-ZÀ-Ý][\p{L}'’-]*\.?){0,2})(?=\s*[,.]|\s*$|\s+\d)/u,
  );

  // Le prénom suit : la tête entière est donc le nom.
  if (prenomSuivant) {
    return { nom: tete, prenom: prenomSuivant[1].trim() || null };
  }

  // Les deux formes suivantes reposent sur le titre : c'est lui qui
  // ferme la zone des noms et atteste qu'on en lit une. Sans lui,
  // « Sur ce point, la littérature reste divisée » se laisserait
  // prendre pour un auteur collectif nommé « Sur ce point ».
  const avecTitre = avantTitre.length < texte.length;
  if (!avecTitre) return { nom: null, prenom: null };

  // La tête porte les deux, sauf si la casse trahit une institution :
  // « Agier Michel » prend deux majuscules, « Union européenne » une.
  if (utiles.length >= 2 && utiles.length <= 4 && utiles.every((m) => MAJUSCULE.test(m))) {
    return { nom: mots.slice(0, -1).join(' '), prenom: mots[mots.length - 1] };
  }
  if (mots.length >= 2 && mots.length <= 8 && utiles.slice(1).some((m) => !MAJUSCULE.test(m))) {
    return { nom: tete, prenom: null };
  }

  // Un nom seul, sans prénom lisible.
  return { nom: utiles.length === 1 ? tete : null, prenom: null };
}

const MOIS =
  'janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre';

/**
 * L'année de publication — pas n'importe quelle année du texte.
 *
 * Trois pièges, tous rencontrés :
 *
 *  - la date de consultation d'une page web (« Consulté le 31 mars
 *    2018 ») n'est pas la date de la source ;
 *  - un titre en porte souvent une (« Programme indicatif national
 *    2008-2013 »), antérieure à la publication ;
 *  - « s.d. » veut dire qu'il n'y en a pas, et une source sans date
 *    doit le rester plutôt que d'en recevoir une par accident.
 *
 * On écarte donc la consultation, on cherche d'abord une date complète,
 * et l'on ne retient un nombre isolé qu'à défaut — le dernier, car
 * l'année de publication ferme la référence là où celles du titre
 * l'ouvrent.
 */
function lireAnnee(texte: string): number | null {
  const sansAcces = texte.replace(/consult[ée]e?\s+le[^,;.]*/gi, ' ');
  if (/\b(s\.\s*d\.|sans\s+date|n\.\s*d\.)/i.test(sansAcces)) return null;

  const pleine = sansAcces.match(
    new RegExp(`\\b\\d{1,2}\\s+(?:${MOIS})\\s+(1[5-9]\\d{2}|20\\d{2})\\b`, 'i'),
  );
  if (pleine) return Number.parseInt(pleine[1], 10);

  const moisAnnee = sansAcces.match(new RegExp(`(?:${MOIS})\\s+(1[5-9]\\d{2}|20\\d{2})\\b`, 'i'));
  if (moisAnnee) return Number.parseInt(moisAnnee[1], 10);

  const toutes = [...sansAcces.matchAll(/\b(1[5-9]\d{2}|20\d{2})\b/g)];
  if (toutes.length === 0) return null;
  return Number.parseInt(toutes[toutes.length - 1][1], 10);
}

/**
 * Le contenu des guillemets ouvrants les plus extérieurs.
 *
 * Compté plutôt que cherché par expression régulière, parce que les
 * titres de presse en contiennent d'autres : « Les réfugiés sont « une
 * chance » pour l'Allemagne ». Une recherche s'arrêtait au premier
 * guillemet fermant et rendait un titre coupé en deux, avec la fin
 * reversée dans le nom du journal.
 *
 * Des guillemets non refermés ne rendent rien : mieux vaut un titre
 * absent, qu'on complètera, qu'un titre faux qu'on ne relira pas.
 */
function entreGuillemets(texte: string): string | null {
  const debut = texte.indexOf('«');
  if (debut >= 0) {
    let profondeur = 0;
    for (let i = debut; i < texte.length; i++) {
      if (texte[i] === '«') profondeur += 1;
      else if (texte[i] === '»') {
        profondeur -= 1;
        if (profondeur === 0) {
          const dedans = texte.slice(debut + 1, i).trim();
          return dedans.length >= 4 ? dedans : null;
        }
      }
    }
    return null;
  }
  // Guillemets droits ou anglais : pas d'imbrication à démêler.
  const m = texte.match(/[“"]\s*([^”"]{4,300}?)\s*[”"]/);
  return m ? m[1].trim() : null;
}

/**
 * Titre de l'œuvre.
 *
 * Les guillemets d'abord — c'est le repère le plus sûr, et le seul qui
 * survive à la perte de l'italique lors de la conversion. À défaut,
 * l'usage anglo-saxon place le titre juste après l'année et un point.
 * Si aucun des deux ne se présente, on ne devine pas.
 */
function lireTitre(texte: string): string | null {
  const guillemets = entreGuillemets(texte);
  if (guillemets) return guillemets;

  const apresAnnee = texte.match(/\b(?:1[5-9]\d{2}|20\d{2})\s*[.,]\s*([^.]{6,300}?)\s*\./);
  if (apresAnnee) return apresAnnee[1].trim();

  return null;
}

/**
 * Revue ou maison d'édition : le segment qui suit le titre.
 *
 * On écarte les dates, les mentions « [En ligne] » et les adresses —
 * ce qui reste est, dans les deux usages, le support de publication.
 */
function lireEditeur(texte: string, titre: string | null): string | null {
  if (!titre) return null;
  const apres = texte.slice(texte.indexOf(titre) + titre.length);
  for (const brut of apres.split(/[,.;]/)) {
    const seg = brut.replace(/[»”"\]]/g, '').trim();
    if (seg.length < 3 || seg.length > 90) continue;
    if (RE_DATE.test(seg)) continue;
    if (/^\[?en ligne\]?$/i.test(seg) || /^url\b/i.test(seg) || /https?:/i.test(seg)) continue;
    if (/^(consult|disponible|p{1,2}\.\s*\d)/i.test(seg)) continue;
    return seg;
  }
  return null;
}

/** Lit une référence sans jamais compléter ce qui n'y est pas. */
export function analyserReference(texte: string): ReferenceLue {
  const propre = texte.replace(/\s+/g, ' ').trim();

  const lu = lireNom(propre);
  const annee = lireAnnee(propre);
  const urlM = propre.match(/https?:\/\/[^\s,;»”"')\]]+/);
  const url = urlM ? urlM[0].replace(/[.]$/, '') : null;
  const titre = lireTitre(propre);
  const editeur = lireEditeur(propre, titre);

  // Un texte non signé reste non signé.
  //
  // On y portait l'organe de presse en auteur collectif — l'usage
  // bibliographique l'autorise — mais dans la bibliothèque cela donnait
  // « Jeune Afrique » à la fois comme autrice et comme revue, deux fois
  // la même chose sur la même ligne, et une attribution que personne
  // n'avait demandée. La revue reste la revue ; la place de l'auteur·ice
  // reste vide, ce qui est exact.
  const nom = lu.nom;
  const prenom = lu.prenom;
  const anonyme = !nom && RE_ANONYME.test(propre);

  // Le type se déduit de la forme, pas du contenu : un titre entre
  // guillemets accompagné d'un support est un article ; une adresse
  // seule, une page web ; le reste, un ouvrage. « Autre » n'apprendrait
  // rien de plus que le doute.
  let type: TypeReference = 'book';
  if (titre && editeur && /[«“"]/.test(propre)) type = 'article';
  else if (url && !editeur) type = 'web';

  const manques: string[] = [];
  // Un texte qui se déclare non signé ne manque de rien : l'absence
  // d'auteur·ice y est une information, pas un trou.
  if (!nom && !anonyme) manques.push('nom');
  if (annee == null) manques.push('année');

  return { texte: propre, nom, prenom, annee, titre, editeur, url, type, anonyme, manques };
}

/**
 * Une note contient-elle une référence complète ?
 *
 * L'usage en sciences humaines donne la source en entier à sa première
 * mention, puis en forme courte ensuite. Les premières ont leur place
 * dans la bibliographie ; les secondes n'ont de sens que dans le fil
 * des notes, et n'apprendraient rien hors de lui.
 *
 * Exigeant à dessein : un nom, une année, et de quoi identifier
 * l'œuvre. Une note qui commente le propos de l'auteur·ice — le cas le
 * plus fréquent — n'a rien de tout cela et reste où elle est.
 */
export function noteEstReference(texte: string): boolean {
  if (RE_FORME_COURTE.test(texte)) return false;
  const r = analyserReference(texte);
  return r.manques.length === 0 && Boolean(r.titre || r.url);
}

/**
 * Découpe une note en citations.
 *
 * Une note en porte souvent plusieurs, séparées par des points-virgules :
 * une source donnée en entier, puis un renvoi vers une autre. Juger la
 * note d'un bloc revenait à tout jeter dès qu'elle contenait un « rap.
 * cit. » quelque part — et l'on perdait la source complète qui ouvrait
 * la phrase.
 *
 * Le point-virgule est le séparateur d'usage. Les morceaux trop courts
 * pour porter une citation sont recollés au précédent : un point-virgule
 * peut aussi apparaître à l'intérieur d'un titre.
 */
export function citationsDeNote(texte: string): string[] {
  const bruts = texte.split(/\s*;\s*/);
  const out: string[] = [];
  for (const bout of bruts) {
    if (out.length > 0 && bout.trim().length < 15) {
      out[out.length - 1] += ` ; ${bout.trim()}`;
      continue;
    }
    if (bout.trim()) out.push(bout.trim());
  }
  return out;
}

/** Les références complètes que porte une note, citation par citation. */
export function referencesDansNote(texte: string): ReferenceLue[] {
  return citationsDeNote(texte)
    .filter(noteEstReference)
    .map(analyserReference);
}

/** « Weber, S., art. cit. » — un renvoi nommé vers une source antérieure. */
const RE_RENVOI_NOMME =
  /\b(art\.\s*cit|op\.\s*cit|loc\.\s*cit|rap\.\s*cit|ouvr\.\s*cit|art\.\s*cité)\b/i;

/** « Ibid. », « Idem » — renvoi à la note qui précède. */
const RE_IBID = /^\s*(ibid|idem)\b/i;

/**
 * Les noms de famille d'une signature, dans l'ordre.
 *
 * « Rodier Claire et Morice Alain » → [Rodier, Morice]
 * « Rodier, C. et Morice, A. »      → [Rodier, Morice]
 *
 * Les deux écritures donnent la même liste, et c'est tout l'intérêt :
 * c'est elle qui distingue deux textes d'un même auteur quand l'un est
 * co-signé et l'autre non.
 */
export function nomsDeSignature(zone: string): string[] {
  return zone
    .split(/\s+(?:et|&|and)\s+/i)
    .map((bout) => {
      const c = bout.trim();
      if (!c) return '';
      // « Rodier, C. » : le nom précède la virgule.
      if (c.includes(',')) return (c.split(',')[0] ?? '').trim();
      const mots = c.split(/\s+/).filter(Boolean);
      // « Morice Alain » : le dernier mot est le prénom.
      return mots.length === 1 ? mots[0] : mots.slice(0, -1).join(' ');
    })
    .filter((s) => s.length >= 2);
}

/** Clé d'une signature, insensible à la casse et à l'écriture. */
function cleSignature(noms: string[]): string {
  return noms.map((n) => n.toLowerCase()).join('|');
}

/**
 * La zone des noms d'une référence complète : ce qui précède le titre.
 * Sans titre repérable, on s'en remet au seul nom lu.
 */
function zoneDesNoms(texte: string): string {
  const i = texte.search(/[«“"(]/);
  return i > 0 ? texte.slice(0, i).replace(/[,;\s]+$/, '') : '';
}

/**
 * Les désignations possibles de la source visée par un renvoi.
 *
 * Ce qui précède « art. cit. » n'est pas toujours un nom de famille :
 * « Revue du Droit de l'Union Européenne art. cit., p. 249 » désigne la
 * source par sa revue. On rend donc plusieurs écritures du même bout de
 * texte, de la plus complète à la plus dépouillée, à confronter ensuite
 * aux noms comme aux titres de publication déjà rencontrés.
 */
function designationsDuRenvoi(texte: string): string[] {
  const coupe = texte.search(RE_RENVOI_NOMME);
  const avant = (coupe > 0 ? texte.slice(0, coupe) : texte).replace(/[,;\s]+$/, '').trim();
  if (!avant) return [];

  const out = new Set<string>([avant]);
  // Le premier des co-signataires.
  const premier = avant.split(/\s+(?:et|&|and)\s+/i)[0]?.trim();
  if (premier) out.add(premier);
  // Sans le prénom, abrégé ou non.
  const sansPrenom = (premier ?? avant).split(',')[0]?.trim();
  if (sansPrenom) out.add(sansPrenom);
  // Sans l'initiale accolée : « Weber S. » → « Weber ».
  if (sansPrenom) out.add(sansPrenom.replace(/\s+[A-ZÀ-Ý]\.?$/u, '').trim());

  return [...out].filter((s) => s.length >= 3);
}

export type EtatRenvois = {
  /** Renvois qui retombent sur une source citée en entier plus haut. */
  resolus: number;
  /**
   * Renvois qui pourraient désigner deux œuvres du même auteur.
   *
   * Ce n'est pas un défaut de lecture mais un défaut du texte : « art.
   * cit. » ne suffit plus dès qu'un même nom a signé deux choses. Le
   * signaler vaut mieux que deviner — sur le web, où la lectrice ne
   * peut pas feuilleter en arrière, un renvoi ambigu ne se rattrape pas.
   */
  ambigus: string[];
  /** Renvois dont la source n'a jamais été donnée en entier. */
  orphelins: string[];
};

/**
 * Suit les renvois d'une suite de notes jusqu'à leur source.
 *
 * « Weber, S., art. cit., p. 33 » désigne le dernier article de Weber
 * cité en entier plus haut : il suffit donc de parcourir les notes dans
 * l'ordre en tenant à jour, pour chaque nom, la dernière source
 * complète rencontrée. « Ibid. » renvoie, lui, à la note précédente.
 *
 * On ne s'en sert pas pour créer quoi que ce soit — la source a déjà
 * été reprise à sa première mention — mais pour dire ce qui ne se
 * résout pas. C'est là que se cachent les vraies difficultés : un
 * renvoi ambigu ou orphelin est une référence que le lectorat ne pourra
 * pas retrouver.
 */
export function resoudreRenvois(notes: string[]): EtatRenvois {
  // Une source se laisse désigner par son auteur·ice comme par sa revue :
  // on tient les deux registres, et l'on retient pour chacun les titres
  // rencontrés — c'est leur nombre qui dira si le renvoi est ambigu.
  // La signature entière d'abord — c'est elle qui départage deux textes
  // d'un même auteur, l'un co-signé et l'autre non. Le premier nom seul
  // et la revue ne servent qu'à défaut.
  const parSignature = new Map<string, Set<string>>();
  const parNom = new Map<string, Set<string>>();
  const parEditeur = new Map<string, Set<string>>();
  let courante: string | null = null;
  const etat: EtatRenvois = { resolus: 0, ambigus: [], orphelins: [] };

  const noter = (registre: Map<string, Set<string>>, cle: string, titre: string): void => {
    const titres = registre.get(cle) ?? new Set<string>();
    titres.add(titre);
    registre.set(cle, titres);
  };

  const chercher = (designations: string[]): Set<string> | undefined => {
    for (const d of designations) {
      const trouve = parNom.get(d) ?? parEditeur.get(d);
      if (trouve) return trouve;
    }
    return undefined;
  };

  // Citation par citation, et non note par note : une même note donne
  // souvent une source en entier puis renvoie à une autre.
  for (const note of notes) {
    for (const citation of citationsDeNote(note)) {
      if (noteEstReference(citation)) {
        const r = analyserReference(citation);
        const titre = r.titre ?? r.texte.slice(0, 40);
        const zone = zoneDesNoms(citation);
        const signature = zone ? nomsDeSignature(zone) : r.nom ? [r.nom] : [];
        if (signature.length > 0) {
          noter(parSignature, cleSignature(signature), titre);
          courante = signature[0];
        }
        if (r.nom) noter(parNom, r.nom, titre);
        if (r.editeur) noter(parEditeur, r.editeur, titre);
        continue;
      }

      if (RE_IBID.test(citation)) {
        if (courante) etat.resolus += 1;
        else etat.orphelins.push(citation);
        continue;
      }
      if (!RE_RENVOI_NOMME.test(citation)) continue;

      const designations = designationsDuRenvoi(citation);
      // La signature du renvoi d'abord : « Rodier, C. et Morice, A. »
      // ne désigne pas le même texte que « Rodier, C. » seul, et
      // confondre les deux rendait ambigu ce qui ne l'est pas.
      const coupe = citation.search(RE_RENVOI_NOMME);
      const zone = (coupe > 0 ? citation.slice(0, coupe) : '').replace(/[,;\s]+$/, '');
      const signature = zone ? nomsDeSignature(zone) : [];
      const titres =
        (signature.length > 0 ? parSignature.get(cleSignature(signature)) : undefined) ??
        chercher(designations);
      if (!titres) {
        etat.orphelins.push(citation);
        continue;
      }
      if (titres.size > 1) {
        etat.ambigus.push(citation);
        continue;
      }
      etat.resolus += 1;
      courante = designations[designations.length - 1] ?? courante;
    }
  }

  return etat;
}

/**
 * Clé de rapprochement entre deux écritures d'une même source.
 *
 * Une source citée en note ET listée en bibliographie ne doit être
 * proposée qu'une fois : les deux écritures diffèrent toujours un peu —
 * ponctuation, mention « [En ligne] », page — mais le nom, l'année et
 * le début du titre suffisent à les reconnaître.
 */
export function cleDeDoublon(r: ReferenceLue): string {
  const titre = (r.titre ?? r.texte)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
  return `${(r.nom ?? '').toLowerCase()}|${r.annee ?? ''}|${titre}`;
}

/**
 * Clé courte pour l'ancre `#bib-…`, dérivée du nom et de l'année.
 *
 * Sans suffixe ici : deux références du même auteur et de la même année
 * donneraient la même clé, et c'est à la création — qui seule connaît ce
 * qui existe déjà — de départager.
 */
export function slugDeReference(nom: string, annee: number): string {
  const base = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'ref'}-${annee}`;
}
