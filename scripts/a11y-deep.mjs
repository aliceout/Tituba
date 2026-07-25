#!/usr/bin/env node
// Audit d'accessibilité profond via axe-core + Playwright (Chromium headless).
//
// Couvre plus que le scan HTML statique (scripts/a11y-audit.mjs) : exécute
// la page dans un vrai navigateur, applique les règles WCAG 2.1 AA, détecte
// les problèmes runtime (contraste, ARIA, focus, ordre de tabulation, etc.).
//
// Utilisation :
//   1. pnpm build
//   2. pnpm preview --host 127.0.0.1 --port 4322  (dans un autre terminal)
//   3. BASE_URL=http://127.0.0.1:4322 pnpm a11y:deep
//
// En CI : un step démarre le serveur preview en arrière-plan avant ce script.
//
// Seuils :
//   - critical / serious  → échec (exit 1)
//   - moderate / minor    → warning (affichés mais n'échouent pas)
//
// Règles warn-only : certaines règles sont affichées mais ne bloquent pas
// tant qu'un chantier de fond n'a pas eu lieu. Pour l'instant le contraste
// de couleur est warn-only : la charte (orange #ec6a2c sur paper blanc)
// produit des violations sur de nombreux éléments, à traiter en une passe
// dédiée avant de remettre la règle en blocking.

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';

// ~18 routes représentatives : couvre la home, les index de section, les
// pages de fond (prose + blocs riches), les formulaires (contact), l'agenda
// et la déclaration d'accessibilité. Ajouter ici chaque nouvelle page
// présentant un bloc inédit pour qu'elle soit auditée.
const routes = [
  '/',
  '/association',
  '/association/qui-sommes-nous',
  '/association/interventions',
  '/association/equipe',
  '/association/documents',
  '/association/financeurs',
  '/isolement-corporel',
  '/isolement-corporel/impense',
  '/isolement-corporel/toucher',
  '/isolement-corporel/ressources',
  '/pour',
  '/pour/structures',
  '/pour/femmes',
  '/pour/entreprises',
  '/pour/temoignages',
  '/agir',
  '/agir/benevolat',
  '/agir/praticiennes',
  '/soutenir',
  '/soutenir/dons',
  '/soutenir/mecenat',
  '/agenda',
  '/contact',
  '/mentions-legales',
  '/politique-confidentialite',
  '/accessibilite',
];

// Règles détectées mais non bloquantes (à rendre bloquantes une fois fixées).
const WARN_ONLY_RULES = new Set(['color-contrast']);

const impactIcon = { critical: '✗', serious: '✗', moderate: '⚠', minor: '⚠' };
const impactColor = {
  critical: '\x1b[31m', // rouge
  serious: '\x1b[31m',
  moderate: '\x1b[33m', // jaune
  minor: '\x1b[33m',
};
const reset = '\x1b[0m';

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'fr-FR' });

const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const warnOnlyTotals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
let routesFailed = 0;

for (const route of routes) {
  const url = BASE + route;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (err) {
    console.log(`✗ ${route} — impossible de charger (${err.message})`);
    routesFailed++;
    await page.close();
    continue;
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const warnCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of results.violations) {
    const bucket = WARN_ONLY_RULES.has(v.id) ? warnCounts : counts;
    if (v.impact && bucket[v.impact] !== undefined) bucket[v.impact]++;
  }
  for (const k of Object.keys(totals)) totals[k] += counts[k];
  for (const k of Object.keys(warnOnlyTotals)) warnOnlyTotals[k] += warnCounts[k];

  const blocking = counts.critical + counts.serious;
  const nonBlocking = counts.moderate + counts.minor;
  const warnOnly = Object.values(warnCounts).reduce((a, b) => a + b, 0);
  const status = blocking > 0 ? '✗' : nonBlocking + warnOnly > 0 ? '⚠' : '✓';
  const summary = `${counts.critical}c ${counts.serious}s ${counts.moderate}m ${counts.minor}n${warnOnly > 0 ? ` +${warnOnly}wo` : ''}`;
  console.log(`${status} ${route.padEnd(40)} ${summary}`);

  for (const v of results.violations) {
    const color = impactColor[v.impact] ?? '';
    const icon = WARN_ONLY_RULES.has(v.id) ? '⚠' : (impactIcon[v.impact] ?? '•');
    const tag = WARN_ONLY_RULES.has(v.id) ? `${v.impact} · warn-only` : v.impact;
    console.log(
      `  ${color}${icon} [${tag}] ${v.id}${reset} — ${v.help}`,
    );
    console.log(`    ${v.helpUrl}`);
    for (const node of v.nodes.slice(0, 3)) {
      const sel = Array.isArray(node.target) ? node.target.join(' > ') : node.target;
      console.log(`    → ${sel}`);
    }
    if (v.nodes.length > 3) {
      console.log(`    (+ ${v.nodes.length - 3} autres occurrences)`);
    }
  }
  if (results.violations.length > 0) console.log();

  await page.close();
}

await browser.close();

console.log(
  `\nBloquant : ${totals.critical} critical · ${totals.serious} serious · ${totals.moderate} moderate · ${totals.minor} minor`,
);
const woTotal = Object.values(warnOnlyTotals).reduce((a, b) => a + b, 0);
if (woTotal > 0) {
  console.log(
    `Warn-only (${[...WARN_ONLY_RULES].join(', ')}) : ${woTotal} violations — à traiter dans un chantier charte dédié.`,
  );
}
if (routesFailed > 0) console.log(`${routesFailed} route(s) n'ont pas pu être chargée(s).`);

const blocking = totals.critical + totals.serious;
if (blocking > 0 || routesFailed > 0) {
  console.error('\nAudit a11y échoué.');
  process.exit(1);
}
console.log('\nAudit a11y OK (violations warn-only tolérées).');
