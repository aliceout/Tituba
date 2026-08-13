/**
 * Des notes aux citations — les cas qui décident de la conversion.
 *
 * Ce qui compte ici n'est pas tant ce qui se convertit que ce qui
 * refuse de l'être : une note qui commente, un renvoi ambigu, une
 * source jamais donnée en entier. Une note de trop se retire en un
 * geste ; un propos perdu dans la conversion ne se retrouve pas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertirCorps, lireNotes } from './import-citations';

describe('lecture des notes', () => {
  it('relie une référence, puis « Ibid. », puis un renvoi nommé', () => {
    const [ref, ibid, renvoi] = lireNotes([
      'Weber Serge, « L’Europe discrimine à ses frontières », Revue Projet, n° 311, 2009, p. 32.',
      'Ibid., p. 36.',
      'Weber, S., art. cit., p. 33.',
    ]);
    assert.equal(ref.garde, null);
    assert.equal(ref.citations[0].pages, '32');
    // Les trois désignent la même source.
    assert.equal(ibid.citations[0].cle, ref.citations[0].cle);
    assert.equal(renvoi.citations[0].cle, ref.citations[0].cle);
    assert.equal(renvoi.citations[0].pages, '33');
  });

  it('garde la note qui ajoute un propos à la référence', () => {
    const [n] = lireNotes([
      'Souiah Farida, « Les harraga », Hommes & migrations, n° 1304, octobre 2013, p. 95 Le terme « harraga » vient du marocain.',
    ]);
    assert.equal(n.garde, 'la note ajoute un propos à la référence');
  });

  it('garde le renvoi qui ne désigne pas une source unique', () => {
    const notes = lireNotes([
      'Rodier Claire, « Migrations », Plein droit, 2010.',
      'Rodier Claire, « Frontières », Vacarme, 2014.',
      'Rodier, C., art. cit., p. 109.',
    ]);
    assert.equal(notes[2].garde, 'le renvoi ne désigne pas une source unique');
  });

  it('garde le renvoi dont la source n’a jamais été donnée', () => {
    const [n] = lireNotes(['Dupont, X., art. cit., p. 12.']);
    assert.equal(n.citations.length, 0);
    assert.notEqual(n.garde, null);
  });

  it('pose deux citations quand la note en porte deux', () => {
    const notes = lireNotes([
      'Weber Serge, « L’Europe discrimine », Revue Projet, 2009.',
      'Agier Michel, « La fabrique des indésirables », Le Monde diplomatique, 2017.',
      'Weber, S., art. cit., p. 16 ; Agier, M., art. cit., p. 25.',
    ]);
    assert.equal(notes[2].garde, null);
    assert.equal(notes[2].citations.length, 2);
    assert.deepEqual(
      notes[2].citations.map((c) => c.pages),
      ['16', '25'],
    );
  });

  it('lit une pagination en intervalle', () => {
    const [n] = lireNotes([
      'Giuliani Jean-Dominique, « L’Europe et les migrations », Revue du Droit de l’UE, n° 3, 2015, pp. 343‑345.',
    ]);
    assert.equal(n.citations[0].pages, '343-345');
  });
});

describe('conversion du corps', () => {
  /** Un corps minimal : un paragraphe et ses notes. */
  const corpsAvec = (notes: string[]) => ({
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Un propos' },
            ...notes.map((t) => ({
              type: 'inlineBlock',
              fields: { blockType: 'footnote', content: t },
            })),
          ],
        },
      ],
    },
  });

  const compter = (body: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    (function walk(n: Record<string, unknown> | undefined): void {
      if (!n || typeof n !== 'object') return;
      const f = n.fields as { blockType?: string } | undefined;
      if (n.type === 'inlineBlock' && f?.blockType) out[f.blockType] = (out[f.blockType] ?? 0) + 1;
      for (const c of (n.children as Record<string, unknown>[]) ?? []) walk(c);
    })((body as { root: Record<string, unknown> }).root);
    return out;
  };

  const NOTES = [
    'Weber Serge, « L’Europe discrimine à ses frontières », Revue Projet, n° 311, 2009, p. 32.',
    'Ibid., p. 36.',
    'Souiah Farida, « Les harraga », Hommes & migrations, n° 1304, octobre 2013, p. 95 Le terme vient du marocain.',
  ];

  it('remplace les notes citables et garde les autres', () => {
    const lues = lireNotes(NOTES);
    const cles = new Map<string, number | string>(
      lues.filter((l) => !l.garde).flatMap((l) => l.citations.map((c) => [c.cle, 42] as const)),
    );
    const body = corpsAvec(NOTES);
    const posees = convertirCorps(body, lues, cles);

    assert.equal(posees, 2);
    // La note qui commente reste une note.
    assert.deepEqual(compter(body), { biblio_inline: 2, footnote: 1 });
  });

  it('reporte la pagination sur la citation', () => {
    const lues = lireNotes(NOTES);
    const cles = new Map<string, number | string>(
      lues.filter((l) => !l.garde).flatMap((l) => l.citations.map((c) => [c.cle, 7] as const)),
    );
    const body = corpsAvec(NOTES);
    convertirCorps(body, lues, cles);

    const pages: string[] = [];
    (function walk(n: Record<string, unknown> | undefined): void {
      if (!n || typeof n !== 'object') return;
      const f = n.fields as { blockType?: string; pages?: string; entry?: unknown } | undefined;
      if (f?.blockType === 'biblio_inline') pages.push(String(f.pages ?? ''));
      for (const c of (n.children as Record<string, unknown>[]) ?? []) walk(c);
    })(body.root as never);
    assert.deepEqual(pages, ['32', '36']);
  });

  it('ne convertit rien sans entrée vers quoi pointer', () => {
    const lues = lireNotes(NOTES);
    const body = corpsAvec(NOTES);
    // Une citation qui renverrait dans le vide serait pire que la note.
    assert.equal(convertirCorps(body, lues, new Map()), 0);
    assert.deepEqual(compter(body), { footnote: 3 });
  });
});
