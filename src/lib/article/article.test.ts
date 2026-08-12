/**
 * Ce que la page d'un billet calcule — éprouvé sans monter de page.
 *
 * C'est tout l'intérêt de les avoir sorties du composant : ces
 * décisions se vérifiaient jusqu'ici en ouvrant cinq URLs et en
 * regardant, ce qui ne dit rien des cas qu'on n'a pas sous la main.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { afficherBrief, afficherSommaire, dateDansColonne, type Contexte } from './affichage';
import { cadrageDeZone } from './couverture';
import { listerInvitees } from './episode';
import { libellePublic, poidsLisible } from './ressources';

const base: Contexte = {
  collection: 'articles',
  citable: true,
  nbEntreesSommaire: 0,
  aUneDuree: false,
  aDesNotes: false,
  nbReferences: 0,
  aUnBrief: false,
  lecteurDansHero: false,
};

describe('cadrage de la couverture', () => {
  it('traduit une zone en agrandissement et décalage', () => {
    // En pourcentages de l'image : montrer la moitié revient à
    // l'afficher au double.
    assert.equal(
      cadrageDeZone({ x: 25, y: 10, w: 50, h: 50 }),
      'width:200%;height:200%;left:-50%;top:-20%;',
    );
  });

  it('ne cadre rien sans zone utilisable', () => {
    assert.equal(cadrageDeZone(null), null);
    assert.equal(cadrageDeZone({ w: 0, h: 100 }), null);
    // Une zone sans dimensions n'en est pas une.
    assert.equal(cadrageDeZone({ x: 10, y: 10 }), null);
  });
});

describe('invité·es d’un épisode', () => {
  it('remplace la dernière virgule par « et »', () => {
    assert.equal(listerInvitees(['A', 'B', 'C']), 'A, B et C');
    assert.equal(listerInvitees(['A', 'B']), 'A et B');
    assert.equal(listerInvitees(['A']), 'A');
    assert.equal(listerInvitees([]), '');
    assert.equal(listerInvitees(['  ', 'A']), 'A');
  });
});

describe('ressources d’un outil', () => {
  it('donne un poids lisible, ou rien', () => {
    assert.equal(poidsLisible(1_572_864), '1,5 Mo');
    assert.equal(poidsLisible(327_680), '320 Ko');
    // Jamais « 0 Ko » faute de valeur.
    assert.equal(poidsLisible(0), '');
    assert.equal(poidsLisible(null), '');
  });

  it('ne nomme un public que s’il est connu', () => {
    assert.equal(libellePublic('militantes'), 'Militant·es et collectifs');
    assert.equal(libellePublic('inconnu'), '');
    assert.equal(libellePublic(null), '');
  });
});

describe('ce que la page montre', () => {
  it('prive l’actu de sa colonne latérale', () => {
    const actu = { ...base, collection: 'actus', nbEntreesSommaire: 8, aUneDuree: true };
    assert.equal(afficherSommaire(actu), false);
    // Elle la retrouve pour un rappel des faits, et pour lui seul.
    assert.equal(afficherBrief(actu), false);
    assert.equal(afficherBrief({ ...actu, aUnBrief: true }), true);
  });

  it('monte la colonne dès qu’il y a quelque chose à offrir', () => {
    // Pas de titres de section, mais une durée de lecture suffit.
    assert.equal(afficherSommaire({ ...base, citable: false, aUneDuree: true }), true);
    assert.equal(afficherSommaire({ ...base, citable: false, nbReferences: 3 }), true);
    assert.equal(afficherSommaire({ ...base, citable: false }), false);
    // Un format citable l'a toujours, même vide de tout le reste.
    assert.equal(afficherSommaire(base), true);
  });

  it('ne met la date dans la colonne que si elle s’y monte', () => {
    assert.equal(dateDansColonne({ ...base, collection: 'articles' }), true);
    assert.equal(dateDansColonne({ ...base, collection: 'analyses' }), true);
    // Un outil sans rien à offrir n'a pas de colonne : la date reste
    // dans le bandeau plutôt que de disparaître.
    assert.equal(dateDansColonne({ ...base, collection: 'outils', citable: false }), false);
    // Un épisode dont le lecteur est dans le hero l'a aussi.
    assert.equal(
      dateDansColonne({ ...base, collection: 'podcasts', lecteurDansHero: true }),
      true,
    );
  });
});
