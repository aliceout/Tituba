// Tests pour zotero/mapping.ts.
//
// Mapping Zotero → Bibliography. Critique car invoqué pour chaque ref
// importée — toute régression silencieuse fait passer des refs en
// « other » ou les fait basculer en `keptCited`/`error` côté sync.
//
// Lancer : `pnpm test`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mapItem, makeSlug } from './mapping';
import type { ZoteroItem } from './types';

// ─── Helpers ──────────────────────────────────────────────────────

function item(data: Partial<ZoteroItem['data']> & { itemType: string; title?: string }, key = 'ABCD1234', version = 1): ZoteroItem {
  return {
    key,
    version,
    data: {
      key,
      version,
      ...data,
    },
  } as ZoteroItem;
}

// ─── makeSlug ────────────────────────────────────────────────────

test('makeSlug : préfixe zot- + userId + key, lowercase', () => {
  assert.equal(makeSlug(42, 'ABCD1234'), 'zot-42-abcd1234');
  assert.equal(makeSlug('alice', 'XYZ'), 'zot-alice-xyz');
});

// ─── mapItem : cas d'erreur ──────────────────────────────────────

test('mapItem : titre vide → ok=false avec raison « titre manquant »', () => {
  const r = mapItem(item({ itemType: 'book', date: '2020', creators: [{ lastName: 'X' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /titre manquant/i);
    assert.equal(r.title, null);
  }
});

test('mapItem : date manquante → ok=false avec raison « date manquante »', () => {
  const r = mapItem(item({ itemType: 'book', title: 'X', creators: [{ lastName: 'X' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.reason, /date manquante/i);
    assert.equal(r.title, 'X');
  }
});

test('mapItem : année non parseable → ok=false avec raison année', () => {
  const r = mapItem(item({
    itemType: 'book',
    title: 'X',
    date: 'pas une année',
    creators: [{ lastName: 'X' }],
  }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /année/i);
});

test('mapItem : aucun creator → ok=false', () => {
  const r = mapItem(item({ itemType: 'book', title: 'X', date: '2020', creators: [] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /auteur/i);
});

// ─── mapItem : cas nominal ───────────────────────────────────────

test('mapItem : book minimal → mapped correctement', () => {
  const r = mapItem(item({
    itemType: 'book',
    title: 'A Critique of Postcolonial Reason',
    date: '1999',
    creators: [{ creatorType: 'author', firstName: 'Gayatri', lastName: 'Spivak' }],
    publisher: 'Harvard University Press',
  }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.mapped.type, 'book');
    assert.equal(r.mapped.title, 'A Critique of Postcolonial Reason');
    assert.equal(r.mapped.year, 1999);
    assert.equal(r.mapped.authors.length, 1);
    assert.equal(r.mapped.authors[0].lastName, 'Spivak');
    assert.equal(r.mapped.authors[0].firstName, 'Gayatri');
    assert.equal(r.mapped.authors[0].role, 'author');
    assert.equal(r.mapped.publisher, 'Harvard University Press');
    assert.equal(r.mapped.source, 'zotero');
  }
});

test('mapItem : journal article → publicationTitle va dans `journal`, pas `publisher`', () => {
  const r = mapItem(item({
    itemType: 'journalArticle',
    title: 'Can the Subaltern Speak?',
    date: '1988',
    creators: [{ creatorType: 'author', lastName: 'Spivak' }],
    publicationTitle: 'Marxism and the Interpretation of Culture',
    publisher: 'should be ignored for articles',
    volume: '12',
    issue: '3',
    pages: '271-313',
  }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.mapped.type, 'article');
    assert.equal(r.mapped.journal, 'Marxism and the Interpretation of Culture');
    assert.equal(r.mapped.publisher, undefined);
    // Volume + issue concaténés en un seul champ.
    assert.equal(r.mapped.volume, '12, 3');
    assert.equal(r.mapped.pages, '271-313');
  }
});

test('mapItem : itemType inconnu → type=other (fallback safe)', () => {
  const r = mapItem(item({
    itemType: 'audioRecording', // pas dans ITEM_TYPE_MAP
    title: 'Conférence enregistrée',
    date: '2020',
    creators: [{ creatorType: 'author', lastName: 'X' }],
  }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mapped.type, 'other');
});

test('mapItem : creator corporatif (name only) → lastName=name, firstName undefined', () => {
  const r = mapItem(item({
    itemType: 'report',
    title: 'World Migration Report 2024',
    date: '2024',
    creators: [{ creatorType: 'author', name: 'IOM' }],
  }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.mapped.authors[0].lastName, 'IOM');
    assert.equal(r.mapped.authors[0].firstName, undefined);
  }
});

test('mapItem : creator editor → role=editor', () => {
  const r = mapItem(item({
    itemType: 'book',
    title: 'Anthology',
    date: '2010',
    creators: [{ creatorType: 'editor', firstName: 'A', lastName: 'B' }],
  }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mapped.authors[0].role, 'editor');
});

test('mapItem : zoteroKey + version repercutés sur le mapped', () => {
  const r = mapItem(item(
    {
      itemType: 'book',
      title: 'X',
      date: '2020',
      creators: [{ lastName: 'Y' }],
    },
    'KEY42',
    7,
  ));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.mapped.zoteroKey, 'KEY42');
    assert.equal(r.mapped.zoteroVersion, 7);
  }
});
