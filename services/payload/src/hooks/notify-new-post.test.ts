// Qui reçoit un mail à la parution d'un billet.
//
// Lancer : `pnpm test` côté services/payload.
//
// Le cas qui compte est le deuxième : les inscriptions antérieures au
// champ `rythmes` n'ont rien d'enregistré, et elles recevaient les
// parutions. Traiter cette absence comme un refus les couperait sans
// que rien ne le signale — on ne s'en apercevrait qu'au jour où
// quelqu'un dirait ne plus rien recevoir, s'iel le dit.

import test from 'node:test'
import assert from 'node:assert/strict'

import { veutLesParutions } from './notify-new-post.js'

const abonne = (rythmes?: string[] | null) => ({ id: 1, email: 'a@example.com', rythmes })

test('qui a demandé les parutions les reçoit', () => {
  assert.equal(veutLesParutions(abonne(['publications'])), true)
  assert.equal(veutLesParutions(abonne(['newsletter', 'publications'])), true)
})

test('une inscription sans rythme enregistré continue de les recevoir', () => {
  // Les trois formes que prend l'absence, selon qu'on lit une ligne
  // d'avant le champ, un tableau vidé, ou un document sans la clé.
  assert.equal(veutLesParutions(abonne(undefined)), true)
  assert.equal(veutLesParutions(abonne(null)), true)
  assert.equal(veutLesParutions(abonne([])), true)
})

test("qui n'a demandé que la lettre ne reçoit pas les parutions", () => {
  assert.equal(veutLesParutions(abonne(['newsletter'])), false)
})
