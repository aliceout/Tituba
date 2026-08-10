/**
 * Du HTML de l'import vers le format de l'éditeur.
 *
 * Deux opérations, dans cet ordre :
 *
 *  1. Payload convertit le HTML en arbre Lexical. Il faut lui passer
 *     la configuration de l'éditeur du champ visé — pas celle par
 *     défaut : c'est elle qui déclare les blocs du site, et un arbre
 *     bâti sans elle serait refusé à l'enregistrement.
 *  2. Les repères de note laissés dans le texte deviennent de vrais
 *     blocs en ligne `footnote`. C'est l'étape que la conversion ne
 *     peut pas faire seule : elle ne connaît que le HTML, et une note
 *     du site n'a pas d'équivalent HTML.
 *
 * Pourquoi des repères textuels plutôt qu'une balise à convertir : le
 * convertisseur laisse tomber ce qu'il ne connaît pas. Une balise
 * inventée aurait disparu en silence, emportant les notes avec elle,
 * alors qu'un texte traverse la conversion intact — et se retrouve donc
 * à coup sûr de l'autre côté.
 */
import { convertHTMLToLexical } from '@payloadcms/richtext-lexical';
import { JSDOM } from 'jsdom';
import type { SanitizedServerEditorConfig } from '@payloadcms/richtext-lexical';

import { RE_MARQUE } from './import-docx';

/** Nœud Lexical sérialisé — la forme minimale qui nous concerne. */
type Noeud = {
  type?: string;
  text?: string;
  format?: number | string;
  children?: Noeud[];
  fields?: Record<string, unknown>;
  [k: string]: unknown;
};

/** Bloc en ligne `footnote`, tel que l'enregistre l'éditeur. */
function blocNote(texte: string): Noeud {
  return {
    type: 'inlineBlock',
    version: 1,
    fields: {
      // L'identifiant est attribué par l'éditeur à la saisie ; on en
      // pose un ici pour que le bloc soit complet dès l'import.
      id: Math.random().toString(36).slice(2, 12),
      blockName: '',
      blockType: 'footnote',
      content: texte,
    },
  };
}

function noeudTexte(texte: string, modele: Noeud): Noeud {
  return { ...modele, type: 'text', text: texte, children: undefined };
}

/**
 * Remplace les repères de note par des blocs, en parcourant l'arbre.
 *
 * Un repère peut se trouver au milieu d'un nœud de texte : celui-ci est
 * alors coupé en trois — avant, le bloc, après. Les morceaux vides sont
 * écartés, sans quoi l'éditeur afficherait des nœuds sans contenu.
 */
function poserNotes(noeud: Noeud, notes: string[]): Noeud {
  if (!Array.isArray(noeud.children)) return noeud;

  const enfants: Noeud[] = [];
  for (const enfant of noeud.children) {
    if (typeof enfant.text !== 'string' || !RE_MARQUE.test(enfant.text)) {
      enfants.push(poserNotes(enfant, notes));
      continue;
    }

    let reste = enfant.text;
    let m = reste.match(RE_MARQUE);
    while (m && m.index !== undefined) {
      const avant = reste.slice(0, m.index);
      if (avant) enfants.push(noeudTexte(avant, enfant));

      const i = Number.parseInt(m[1], 10);
      // Un repère sans note correspondante ne doit pas produire un bloc
      // vide : on le laisse simplement tomber.
      if (notes[i]) enfants.push(blocNote(notes[i]));

      reste = reste.slice(m.index + m[0].length);
      m = reste.match(RE_MARQUE);
    }
    if (reste) enfants.push(noeudTexte(reste, enfant));
  }

  return { ...noeud, children: enfants };
}

/**
 * Convertit le HTML de l'import en état Lexical prêt à enregistrer.
 *
 * @param editorConfig configuration de l'éditeur du champ `body` — à
 *   prendre sur le champ lui-même, pas sur l'éditeur racine.
 */
export function htmlVersLexical(
  html: string,
  notes: string[],
  editorConfig: SanitizedServerEditorConfig,
): unknown {
  const etat = convertHTMLToLexical({
    editorConfig,
    html,
    JSDOM: JSDOM as unknown as new (html: string) => { window: { document: Document } },
  }) as unknown as { root: Noeud };

  return { root: poserNotes(etat.root, notes) };
}
