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

import { lireNotes } from './import-citations';

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
