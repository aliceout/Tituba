#!/usr/bin/env node
// Audit d'accessibilité statique sur dist/.
// Sans navigateur headless : vérifications structurelles courantes
// (images sans alt, boutons sans nom accessible, hiérarchie h1, labels
// de formulaire, lang, viewport, titres dupliqués, etc.)
//
// Non-exhaustif — complémentaire d'un vrai audit Lighthouse/axe côté prod.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Parser } from 'htmlparser2';

const DIST = 'dist';
let filesChecked = 0;
const issues = [];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, files);
    else if (entry.endsWith('.html')) files.push(full);
  }
  return files;
}

function report(file, rule, msg, severity = 'error') {
  issues.push({ file: relative('.', file), rule, severity, msg });
}

function audit(html, file) {
  filesChecked++;

  let htmlLang = '';
  let hasViewport = false;
  let titleDepth = 0;
  let title = '';
  let inScript = false;
  let inStyle = false;
  let insideButton = null; // { tag, attrs, text }
  let insideAnchor = null;
  let insideLabel = null;
  let headings = []; // { level, text }
  const ids = new Map();
  const formControls = []; // { tag, attrs, hasLabel }
  const labels = []; // { forId, text, nestedControl }

  let currentHeading = null;
  let insideHead = false;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'html') htmlLang = attrs.lang || '';
        if (name === 'head') insideHead = true;
        if (name === 'meta' && attrs.name === 'viewport') hasViewport = true;
        if (name === 'title') titleDepth++;
        if (name === 'script') inScript = true;
        if (name === 'style') inStyle = true;

        if (attrs.id) {
          const prev = ids.get(attrs.id) ?? 0;
          ids.set(attrs.id, prev + 1);
        }

        // Images
        if (name === 'img') {
          const alt = attrs.alt;
          const role = attrs.role;
          const ariaHidden = attrs['aria-hidden'];
          if (alt === undefined && role !== 'presentation' && ariaHidden !== 'true') {
            report(file, 'img-alt', 'Image sans attribut alt');
          }
        }

        // Boutons / liens sans nom accessible
        if (name === 'button') {
          insideButton = { attrs, text: '' };
        }
        if (name === 'a') {
          insideAnchor = { attrs, text: '' };
        }
        if (name === 'label') {
          insideLabel = { attrs, text: '', nestedControl: false };
        }

        if (insideLabel && ['input', 'select', 'textarea'].includes(name)) {
          insideLabel.nestedControl = true;
        }

        // Form controls
        if (['input', 'select', 'textarea'].includes(name)) {
          const type = attrs.type || (name === 'input' ? 'text' : name);
          // Hidden / submit / button / honeypot n'ont pas besoin de label
          const hiddenType = ['hidden', 'submit', 'button', 'reset', 'image'];
          const isHoneypot =
            attrs['aria-hidden'] === 'true' || attrs.tabindex === '-1';
          if (!hiddenType.includes(type) && !isHoneypot) {
            formControls.push({ tag: name, attrs });
          }
        }

        // Headings
        const m = name.match(/^h([1-6])$/);
        if (m) {
          currentHeading = { level: parseInt(m[1], 10), text: '' };
        }
      },

      ontext(text) {
        if (inScript || inStyle) return;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return;
        if (titleDepth > 0) title += clean;
        if (insideButton) insideButton.text += ' ' + clean;
        if (insideAnchor) insideAnchor.text += ' ' + clean;
        if (insideLabel) insideLabel.text += ' ' + clean;
        if (currentHeading) currentHeading.text += ' ' + clean;
      },

      onclosetag(name) {
        if (name === 'head') insideHead = false;
        if (name === 'title') titleDepth--;
        if (name === 'script') inScript = false;
        if (name === 'style') inStyle = false;

        if (name === 'button' && insideButton) {
          const hasText = insideButton.text.trim().length > 0;
          const hasAria =
            insideButton.attrs['aria-label'] || insideButton.attrs['aria-labelledby'];
          if (!hasText && !hasAria) {
            report(file, 'button-name', 'Bouton sans texte ni aria-label');
          }
          insideButton = null;
        }
        if (name === 'a' && insideAnchor) {
          const hasText = insideAnchor.text.trim().length > 0;
          const hasAria =
            insideAnchor.attrs['aria-label'] || insideAnchor.attrs['aria-labelledby'];
          if (!hasText && !hasAria) {
            report(file, 'link-name', 'Lien sans texte ni aria-label');
          }
          insideAnchor = null;
        }
        if (name === 'label' && insideLabel) {
          labels.push(insideLabel);
          insideLabel = null;
        }

        const m = name.match(/^h([1-6])$/);
        if (m && currentHeading) {
          headings.push(currentHeading);
          currentHeading = null;
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );

  parser.write(html);
  parser.end();

  // Checks au niveau document.
  if (!htmlLang) report(file, 'html-lang', '<html> sans attribut lang');
  if (!hasViewport) report(file, 'viewport', 'Meta viewport manquant');
  if (!title.trim()) report(file, 'title', '<title> vide ou manquant');

  // Une seule h1 par page
  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) report(file, 'h1-present', 'Aucun <h1>');
  if (h1Count > 1) report(file, 'h1-unique', `${h1Count} <h1> — une seule attendue`);

  // Hiérarchie h1-h6 pas de saut de plus d'un niveau
  let prev = 0;
  for (const h of headings) {
    if (prev > 0 && h.level > prev + 1) {
      report(
        file,
        'heading-order',
        `Saut de niveau h${prev} → h${h.level} ("${h.text.trim().slice(0, 40)}")`,
        'warn',
      );
    }
    prev = h.level;
  }

  // IDs dupliqués
  for (const [id, count] of ids) {
    if (count > 1) report(file, 'duplicate-id', `ID "${id}" présent ${count} fois`);
  }

  // Labels / form controls : un input doit avoir un label (par for=id) ou un parent label
  const labelledIds = new Set(
    labels.filter((l) => l.attrs.for).map((l) => l.attrs.for),
  );
  for (const ctrl of formControls) {
    const hasFor = ctrl.attrs.id && labelledIds.has(ctrl.attrs.id);
    const hasAria =
      ctrl.attrs['aria-label'] || ctrl.attrs['aria-labelledby'] || ctrl.attrs.title;
    // Label parent : on ne track pas directement ici ; on accepte la présence
    // d'un label englobant avec `nestedControl=true`.
    const hasNested = labels.some(
      (l) => l.nestedControl && !l.attrs.for,
    );
    if (!hasFor && !hasAria && !hasNested) {
      report(
        file,
        'form-label',
        `<${ctrl.tag} name="${ctrl.attrs.name || '?'}"> sans label associé`,
      );
    }
  }
}

const files = walk(DIST);
for (const f of files) {
  audit(readFileSync(f, 'utf8'), f);
}

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warn');

console.log(`\nScanned ${filesChecked} HTML files.\n`);

const byFile = {};
for (const issue of issues) {
  (byFile[issue.file] ??= []).push(issue);
}

for (const [file, list] of Object.entries(byFile).sort()) {
  console.log(`📄 ${file}`);
  for (const i of list) {
    const icon = i.severity === 'error' ? '✗' : '⚠';
    console.log(`  ${icon} [${i.rule}] ${i.msg}`);
  }
  console.log();
}

console.log(`\nTotal : ${errors.length} erreur(s), ${warnings.length} avertissement(s).`);

if (errors.length > 0) {
  process.exit(1);
}
