// Ce que le corps d'un billet a le droit de produire.
//
// Lancer : `pnpm test` à la racine.
//
// Un seul sujet ici pour l'instant, mais il vient d'un défaut observé en
// ligne : le billet `zm8y6p` portait un <h2> vide — un retour à la ligne
// resté en style « Titre » dans l'éditeur. Il n'était visible nulle
// part, et pourtant il annonçait une section inexistante à qui parcourt
// la page par ses titres, et le sommaire en tirait un lien sans libellé
// vers `#`. Un arrêt de tabulation muet qui ne mène nulle part.
//
// Le défaut se répare des deux côtés à la fois, et c'est ce que ces
// tests tiennent : réparer le rendu sans réparer le sommaire laisserait
// une entrée pointant vers un titre qui n'existe plus.

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractToc, renderLexical } from './lexical';

/** Enveloppe minimale : Lexical range toujours sous une racine. */
function corps(...enfants: unknown[]): unknown {
  return { root: { type: 'root', children: enfants } };
}

function titre(tag: 'h2' | 'h3', texte: string): unknown {
  return {
    type: 'heading',
    tag,
    children: texte === '' ? [] : [{ type: 'text', text: texte }],
  };
}

test('un titre vide ne se rend pas', () => {
  const html = renderLexical(corps(titre('h2', 'Vrai titre'), titre('h2', '')));
  assert.match(html, /<h2 id="vrai-titre">/);
  // Ni la balise, ni l'`id=""` qu'elle portait.
  assert.equal(html.match(/<h2/g)?.length, 1);
  assert.ok(!html.includes('id=""'));
});

test('un titre réduit à des espaces ne se rend pas davantage', () => {
  const html = renderLexical(corps(titre('h2', '   ')));
  assert.ok(!html.includes('<h2'));
});

test('le sommaire ignore les titres sans texte', () => {
  const toc = extractToc(
    corps(titre('h2', 'Premier'), titre('h2', ''), titre('h3', 'Second')),
  );
  assert.deepEqual(
    toc.map((e) => e.text),
    ['Premier', 'Second'],
  );
  // Aucune entrée sans identifiant : c'est elle qui donnait un lien
  // vers `#`.
  assert.ok(toc.every((e) => e.id.length > 0));
});
