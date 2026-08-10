/**
 * Lecture des références — les formes rencontrées pour de vrai.
 *
 * Chaque cas vient d'un document importé. Les garder sous forme de test
 * évite qu'une correction apportée à l'un ne casse un autre en silence :
 * c'est exactement ce qui s'est produit deux fois pendant l'écriture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyserReference,
  citationsDeNote,
  nomsDeSignature,
  noteEstReference,
  resoudreRenvois,
} from './import-references';

describe('lecture du nom', () => {
  const cas: [string, string, string | null][] = [
    // Le nom précède la virgule, le prénom suit.
    ['de Rochegonde, A., « Chronique des médias », RFI, 2 décembre 2017.', 'de Rochegonde', 'A.'],
    ['Wa Kabwe-Segatti, A., « Les migrations », Karthala, 2011.', 'Wa Kabwe-Segatti', 'A.'],
    ['Farris, Sara R. 2017. In the Name of Women’s Rights. Durham : Duke UP.', 'Farris', 'Sara R.'],
    // Le prénom précède la virgule, le titre suit.
    ['Agier Michel, « La fabrique des indésirables », Le Monde diplomatique, 2017.', 'Agier', 'Michel'],
    ['Le Cain Blandine, « Migrants », Le Figaro, 7 juin 2017.', 'Le Cain', 'Blandine'],
    ['de Rochegonde Amaury, « Chronique », RFI, 2017.', 'de Rochegonde', 'Amaury'],
    // Auteur collectif.
    ['Union européenne, « Communication conjointe », Action extérieure, 4 mai 2017.', 'Union européenne', null],
    // Co-signature : la première personne, la seule dont la place soit sûre.
    ['Rodier Claire et Morice Alain, « Migrations », Plein droit, 2010.', 'Rodier', 'Claire'],
  ];

  for (const [texte, nom, prenom] of cas) {
    it(texte.slice(0, 52), () => {
      const r = analyserReference(texte);
      assert.equal(r.nom, nom);
      assert.equal(r.prenom, prenom);
      assert.deepEqual(r.manques, []);
    });
  }

  it('ne devine pas un nom là où il n’y en a pas', () => {
    assert.equal(analyserReference('Sur ce point, la littérature reste divisée.').nom, null);
  });
});

describe('lecture de l’année', () => {
  const cas: [string, number | null][] = [
    // La date de consultation n'est pas celle de la source.
    ['UE, « Rapport », 19 décembre 2013, [En ligne] - Consulté le 21 mars 2018.', 2013],
    // Une année dans le titre n'est pas celle de la publication.
    ['UE, « Programme indicatif national 2008-2013 », 19 décembre 2013.', 2013],
    // « s.d. » veut dire qu'il n'y en a pas.
    ['UE, « Fifth Progress Report », Action extérieure, s.d., Consulté le 31 mars 2018.', null],
    ['Weber Serge, « L’Europe discrimine », Revue Projet, n° 311, 2009.', 2009],
  ];
  for (const [texte, annee] of cas) {
    it(texte.slice(0, 52), () => {
      assert.equal(analyserReference(texte).annee, annee);
    });
  }
});

describe('lecture du titre', () => {
  it('suit les guillemets imbriqués jusqu’au bon fermant', () => {
    const r = analyserReference(
      '[anon.], « Les réfugiés sont « une chance » pour l’Allemagne », Les echos, 2015.',
    );
    assert.equal(r.titre, 'Les réfugiés sont « une chance » pour l’Allemagne');
    // Faute de signature, l'organe de presse répond du texte.
    assert.equal(r.nom, 'Les echos');
  });
});

describe('notes', () => {
  it('découpe une note en citations', () => {
    const note =
      'UE, « Document de stratégie », 19 décembre 2013 ; Loujna-Tounkaranké, rap. cit., p. 24.';
    assert.equal(citationsDeNote(note).length, 2);
  });

  it('retient la source complète même quand un renvoi la suit', () => {
    const note =
      'Weber Serge, « L’Europe discrimine », Revue Projet, 2009 ; Agier, M., art. cit.';
    assert.equal(noteEstReference(citationsDeNote(note)[0]), true);
    assert.equal(noteEstReference(citationsDeNote(note)[1]), false);
  });

  it('écarte les renvois et les commentaires', () => {
    assert.equal(noteEstReference('Weber, S., art. cit., p. 33.'), false);
    assert.equal(noteEstReference('Ibid., p. 36.'), false);
    assert.equal(noteEstReference('Sur ce point, la littérature reste divisée.'), false);
  });
});

describe('renvois', () => {
  it('retrouve la source par le nom, par la revue, et signale le reste', () => {
    const etat = resoudreRenvois([
      'Giuliani Jean-Dominique, « L’Europe et les migrations », Revue du Droit de l’Union Européenne, n° 3, 2015.',
      'Revue du Droit de l’Union Européenne art. cit., p. 249.',
      'Weber Serge, « L’Europe discrimine », Revue Projet, n° 311, 2009.',
      'Weber, S., art. cit., p. 33.',
      'Ibid., p. 36.',
      'Dupont, X., art. cit., p. 12.',
    ]);
    assert.equal(etat.resolus, 3);
    assert.deepEqual(etat.ambigus, []);
    assert.deepEqual(etat.orphelins, ['Dupont, X., art. cit., p. 12.']);
  });

  it('refuse de trancher entre deux œuvres du même nom', () => {
    const etat = resoudreRenvois([
      'Rodier Claire, « Migrations », Plein droit, 2010.',
      'Rodier Claire, « Frontières », Vacarme, 2014.',
      'Rodier, C., art. cit., p. 109.',
    ]);
    assert.equal(etat.resolus, 0);
    assert.equal(etat.ambigus.length, 1);
  });

  it('distingue le texte co-signé de celui écrit seule', () => {
    const etat = resoudreRenvois([
      'Rodier Claire et Morice Alain, « Migrations : comment l’UE enferme », Plein droit, 2010.',
      'Rodier Claire, « Frontières », Vacarme, 2014.',
      // Deux noms : le texte co-signé.
      'Rodier, C. et Morice, A., art. cit.',
      // Un seul : celui qu’elle a signé seule.
      'Rodier, C., art. cit., p. 109.',
    ]);
    assert.equal(etat.resolus, 2);
    assert.deepEqual(etat.ambigus, []);
    assert.deepEqual(etat.orphelins, []);
  });

  it('retombe sur le premier nom quand la signature ne concorde pas', () => {
    const etat = resoudreRenvois([
      'Audebert Cedric et Nelly Robin, « L’externalisation », Cultures & Conflits, 2009.',
      // Renvoi au premier signataire seul : la source reste identifiable.
      'Audebert, C., art. cit., p. 43.',
    ]);
    assert.equal(etat.resolus, 1);
    assert.deepEqual(etat.orphelins, []);
  });
});

describe('signature', () => {
  it('lit les deux écritures d’une co-signature', () => {
    assert.deepEqual(nomsDeSignature('Rodier Claire et Morice Alain'), ['Rodier', 'Morice']);
    assert.deepEqual(nomsDeSignature('Rodier, C. et Morice, A.'), ['Rodier', 'Morice']);
    assert.deepEqual(nomsDeSignature('de Rochegonde, A.'), ['de Rochegonde']);
  });
});
