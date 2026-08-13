/**
 * Vérifie, dans un vrai navigateur, qu'un champ propre à un format
 * survit à la sauvegarde depuis le formulaire admin.
 *
 * C'est le seul chemin que les tests d'API ne couvrent pas, et c'est
 * celui qui porte le risque : la vue d'édition énumère les champs à
 * quatre endroits indépendants — brouillon vierge, corps de la requête
 * de sauvegarde, renormalisation de la réponse, validation cliente. Un
 * champ absent de l'une de ces listes n'émet aucune erreur ; il est
 * simplement perdu au save. Le scénario crée donc un podcast, saisit
 * son lien audio, sauvegarde, recharge la page et vérifie que le lien
 * est toujours là.
 *
 *   node scripts/verify-admin-save.mjs
 *
 * Prérequis : Payload sur :3001, Mailpit sur :8026, et un compte dont
 * les identifiants sont passés par ADMIN_EMAIL / ADMIN_PASS.
 *
 * Note : l'envoi du code 2FA passe par SMTP et prend une trentaine de
 * secondes en local, d'où les délais généreux. Le limiteur de débit de
 * l'auth est en mémoire : en cas de « trop de codes envoyés »,
 * redémarrer Payload le remet à zéro.
 */
import { chromium } from 'playwright';

const BASE = process.env.ADMIN_BASE ?? 'http://localhost:3001';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8026';
const EMAIL = process.env.ADMIN_EMAIL ?? 'verif@tituba.local';
const PASS = process.env.ADMIN_PASS ?? 'VerifTituba!2026';

const AUDIO = 'https://exemple.org/verif-episode.mp3';
const GUESTS = 'Aïcha Touré, Lila Mendes';
const TITLE = 'Épisode de vérification';
const SLUG = `verif-podcast-${Date.now()}`;

async function latestOtp() {
  for (let i = 0; i < 90; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages?limit=1`)
      .then((r) => r.json())
      .catch(() => null);
    const id = list?.messages?.[0]?.ID;
    if (id) {
      const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const m = `${msg.Text ?? ''} ${msg.HTML ?? ''}`.match(/\b(\d{6})\b/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('aucun code 2FA reçu via Mailpit');
}

/** Remplit le champ dont le <label> correspond au motif donné. */
async function fillByLabel(page, pattern, value) {
  const field = page
    .locator('.field, label')
    .filter({ has: page.locator('label', { hasText: pattern }) })
    .locator('input, textarea')
    .first();
  if (await field.count()) {
    await field.fill(value);
    return true;
  }
  // Repli : le <label> et le champ sont frères directs.
  const alt = page
    .locator(
      `label:text-matches("${pattern.source ?? pattern}", "i") + input, label:text-matches("${pattern.source ?? pattern}", "i") + textarea`,
    )
    .first();
  if (await alt.count()) {
    await alt.fill(value);
    return true;
  }
  return false;
}

const browser = await chromium.launch();
const page = await browser.newPage();
let ok = true;
const check = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) ok = false;
};

try {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => {});

  // ─── Connexion (mot de passe puis code 2FA) ───────────────────
  await page.goto(`${BASE}/cms/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');

  const otp = await latestOtp();
  // Le champ du code est le seul input texte de l'etape 2FA : on exclut
  // explicitement la case « se souvenir de cet appareil ».
  const codeInput = page
    .locator('input[type="text"], input[type="tel"], input[inputmode="numeric"]')
    .first();
  await codeInput.waitFor({ timeout: 120_000 });
  await codeInput.fill(otp);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 120_000 });
  check(true, 'connecté à l’admin');

  // ─── Création d'un podcast ────────────────────────────────────
  await page.goto(`${BASE}/cms/admin/collections/podcasts/create`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('textarea, input', { timeout: 60_000 });
  await page.waitForTimeout(2000);

  await page.locator('textarea').first().fill(TITLE);
  await fillByLabel(page, /slug/i, SLUG);
  const ledeBox = page.locator('textarea').nth(1);
  if (await ledeBox.count()) await ledeBox.fill('Chapô de vérification.');
  const filledAudio = await fillByLabel(page, /audio/i, AUDIO);
  check(filledAudio, 'champ « lien du fichier audio » présent dans le formulaire');
  await fillByLabel(page, /invité/i, GUESTS);

  // ─── Sauvegarde ───────────────────────────────────────────────
  const saveResp = page.waitForResponse(
    (r) =>
      r.url().includes('/cms/api/podcasts') &&
      ['POST', 'PATCH'].includes(r.request().method()),
    { timeout: 60_000 },
  );
  await page
    .getByRole('button', { name: /sauvegarder|enregistrer|publier/i })
    .first()
    .click();
  const resp = await saveResp;
  const sent = JSON.parse(resp.request().postData() ?? '{}');
  check(resp.ok(), `sauvegarde acceptée (HTTP ${resp.status()})`);
  check(sent.audioUrl === AUDIO, 'le lien audio est bien dans la requête envoyée');

  // ─── Relecture après rechargement ─────────────────────────────
  await page.waitForTimeout(2000);
  const created = await fetch(
    `${BASE}/cms/api/podcasts?where[slug][equals]=${SLUG}&depth=0`,
  ).then((r) => r.json());
  const doc = created?.docs?.[0];
  check(!!doc, 'podcast retrouvé en base après sauvegarde');
  check(doc?.audioUrl === AUDIO, `lien audio persisté (${doc?.audioUrl ?? 'absent'})`);
  check(doc?.guests === GUESTS, `invité·es persisté·es (${doc?.guests ?? 'absent'})`);
  check(typeof doc?.numero === 'number', `numéro attribué (n° ${doc?.numero})`);
} catch (err) {
  check(false, `échec : ${err.message}`);
  await page.screenshot({ path: 'scripts/_verif-echec.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(ok ? '\nOK — le champ de format survit au formulaire admin.' : '\nÉCHEC');
process.exit(ok ? 0 : 1);
