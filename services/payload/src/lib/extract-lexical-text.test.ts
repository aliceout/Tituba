// Tests pour extract-lexical-text.ts.
//
// Walker pur du JSON Lexical, deux modes (avec/sans blocks custom).
// Critique : utilisé par
//   - le calcul du temps de lecture (Posts.ts beforeChange readingTime)
//   - le tsvector de recherche FTS (post-search-vector.ts → hook
//     update-post-search-vector)
// Toute régression silencieuse sur l'extraction = posts mal indexés
// pour la recherche → résultats manquants côté lecteurs.
//
// Lancer : `pnpm test` (ou `pnpm --dir services/payload test`).

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractLexicalText } from './extract-lexical-text';

// ─── Helpers — fabriquent des nodes Lexical synthétiques ──────────

function paragraph(text: string) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  };
}

function heading(text: string, level = 2) {
  return {
    type: 'heading',
    tag: `h${level}`,
    children: [{ type: 'text', text }],
  };
}

function root(...children: unknown[]) {
  return { root: { type: 'root', children } };
}

function block(blockType: string, fields: Record<string, unknown>) {
  return { type: 'block', fields: { blockType, ...fields } };
}

function inlineBlock(blockType: string, fields: Record<string, unknown>) {
  return { type: 'inlineBlock', fields: { blockType, ...fields } };
}

// ─── Cas limites ──────────────────────────────────────────────────

test('extractLexicalText : node null/undefined → string vide', () => {
  assert.equal(extractLexicalText(null), '');
  assert.equal(extractLexicalText(undefined), '');
  assert.equal(extractLexicalText({}), '');
});

test('extractLexicalText : root vide → string vide', () => {
  assert.equal(extractLexicalText(root()), '');
});

// ─── Texte courant ────────────────────────────────────────────────

test('extractLexicalText : extrait le texte des paragraphes', () => {
  const body = root(paragraph('Lorem ipsum'), paragraph('dolor sit amet'));
  assert.equal(extractLexicalText(body), 'Lorem ipsum dolor sit amet');
});

test('extractLexicalText : inclut les headings', () => {
  const body = root(heading('Introduction'), paragraph('Premier paragraphe.'));
  assert.equal(extractLexicalText(body), 'Introduction Premier paragraphe.');
});

test('extractLexicalText : normalise les espaces multiples / sauts de ligne', () => {
  const body = root({
    type: 'paragraph',
    children: [{ type: 'text', text: 'A  B\nC\tD' }],
  });
  // Run d'espaces collapsé en 1, trim global.
  assert.equal(extractLexicalText(body), 'A B C D');
});

// ─── Zones brouillon (draft_container) ────────────────────────────

test('extractLexicalText : zones brouillon ignorées par défaut', () => {
  const body = root(
    paragraph('Avant brouillon.'),
    {
      type: 'draft_container',
      children: [paragraph('Texte brouillon non publié.')],
    },
    paragraph('Après brouillon.'),
  );
  const out = extractLexicalText(body);
  assert.equal(out, 'Avant brouillon. Après brouillon.');
  assert.ok(!out.includes('non publié'));
});

test('extractLexicalText : includeDraftZones=true ramène le texte brouillon', () => {
  const body = root(
    paragraph('Avant.'),
    {
      type: 'draft_container',
      children: [paragraph('Brouillon visible.')],
    },
  );
  const out = extractLexicalText(body, { includeDraftZones: true });
  assert.ok(out.includes('Brouillon visible'));
});

// ─── Blocks custom ────────────────────────────────────────────────

test('extractLexicalText : blocks custom ignorés par défaut', () => {
  const body = root(
    paragraph('Texte courant.'),
    inlineBlock('footnote', { content: 'Une note de bas de page.' }),
    block('citation_bloc', { text: 'Citation longue.', source: 'Spivak (2007)' }),
    block('figure', { legende: 'Légende image', credit: 'Photo X' }),
  );
  // Sans includeBlocks, on n'a que le texte courant.
  assert.equal(extractLexicalText(body), 'Texte courant.');
});

test('extractLexicalText : includeBlocks=true ramène footnote', () => {
  const body = root(
    paragraph('Le texte.'),
    inlineBlock('footnote', { content: 'Note importante.' }),
  );
  const out = extractLexicalText(body, { includeBlocks: true });
  assert.ok(out.includes('Le texte.'));
  assert.ok(out.includes('Note importante.'));
});

test('extractLexicalText : includeBlocks ramène citation_bloc (text + source)', () => {
  const body = root(
    block('citation_bloc', { text: 'Le texte cité.', source: 'Auteur, année' }),
  );
  const out = extractLexicalText(body, { includeBlocks: true });
  assert.ok(out.includes('Le texte cité.'));
  assert.ok(out.includes('Auteur, année'));
});

test('extractLexicalText : includeBlocks ramène figure (légende + crédit)', () => {
  const body = root(
    block('figure', { legende: 'Carte de l\'Europe.', credit: 'OpenStreetMap' }),
  );
  const out = extractLexicalText(body, { includeBlocks: true });
  assert.ok(out.includes('Carte de l\'Europe.'));
  assert.ok(out.includes('OpenStreetMap'));
});

test('extractLexicalText : biblio_inline n\'a pas de texte propre — sans contribution', () => {
  // Le block biblio_inline ne porte qu'un pointeur vers une entry,
  // pas du texte. L'extracteur ne doit pas tenter de lire des fields
  // techniques (entry id, prefix, pages…).
  const body = root(
    paragraph('Avant. '),
    inlineBlock('biblio_inline', {
      entry: 42,
      prefix: 'cf.',
      pages: '12-15',
    }),
    paragraph(' Après.'),
  );
  const out = extractLexicalText(body, { includeBlocks: true });
  assert.equal(out, 'Avant. Après.');
});

test('extractLexicalText : block inconnu ignoré silencieusement', () => {
  const body = root(
    paragraph('OK.'),
    block('mystery_block', { whatever: 'should not be extracted' }),
  );
  const out = extractLexicalText(body, { includeBlocks: true });
  assert.equal(out, 'OK.');
});

// ─── Récursion profonde ───────────────────────────────────────────

test('extractLexicalText : descend dans les listes imbriquées', () => {
  const body = root({
    type: 'list',
    children: [
      {
        type: 'listitem',
        children: [{ type: 'text', text: 'Item 1.' }],
      },
      {
        type: 'listitem',
        children: [
          {
            type: 'list',
            children: [
              {
                type: 'listitem',
                children: [{ type: 'text', text: 'Sous-item.' }],
              },
            ],
          },
        ],
      },
    ],
  });
  const out = extractLexicalText(body);
  assert.ok(out.includes('Item 1.'));
  assert.ok(out.includes('Sous-item.'));
});
