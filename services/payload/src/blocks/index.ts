// Index des blocks Carnet — exporte deux ensembles selon le contexte
// d'usage :
//
//   pageBlocks   — blocs empilables dans Pages.sections (champ `blocks`
//                  Payload classique). Utilisés pour l'À propos, le
//                  Colophon, les mentions légales, etc.
//
//   inlineBlocks — blocs insérables dans le rich text Lexical d'un Post
//                  (via le slash menu / la BlocksFeature). Notes,
//                  citations longues, références biblio inline, figures.
//
// Certains blocs (Figure, CitationBloc) appartiennent aux deux : on
// peut les empiler dans une Page comme les insérer dans un Post.

import { Footnote } from './Footnote';
import { CitationBloc } from './CitationBloc';
import { BiblioInline } from './BiblioInline';
import { Figure } from './Figure';
import { Prose } from './Prose';

export { Footnote, CitationBloc, BiblioInline, Figure, Prose };

export const pageBlocks = [Prose, Figure, CitationBloc];

export const inlineBlocks = [Footnote, CitationBloc, BiblioInline, Figure];
