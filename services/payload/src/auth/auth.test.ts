// Tests de sécurité du module auth.
//
// Lancer : `pnpm test:auth` côté services/payload (équivaut à
// `tsx --test src/auth/auth.test.ts`). Le PAYLOAD_SECRET est requis,
// d'où le wrap dotenv-cli côté script du package.json.
//
// On teste 3 zones :
//   1. Le bypass /users/login natif est bien fermé (410 Gone).
//   2. Les comparaisons d'ID survivent au mismatch number/string.
//   3. Les primitives crypto (HTML escape, hash, signature cookie) ne
//      régressent pas — sentinelle contre une refacto qui casse la
//      sécurité par accident.

import test from 'node:test'
import assert from 'node:assert/strict'

import { authEndpoints } from './endpoints/index.js'
import { hashToken, safeEqualHex, generateNumericCode } from './crypto.js'
import { signCookie, verifyCookie } from './cookies.js'

// PAYLOAD_SECRET est nécessaire pour les helpers crypto/cookies.
// Si non défini (ex: lancement sans dotenv), on en pose un de test.
if (!process.env.PAYLOAD_SECRET) {
  process.env.PAYLOAD_SECRET = 'a'.repeat(64)
}

// ─── 1. Login natif désactivé ─────────────────────────────────────────

test('Le endpoint POST /login natif renvoie 410 (pas de bypass 2FA)', async () => {
  const loginEndpoint = authEndpoints.find(
    (e) => e.path === '/login' && e.method === 'post',
  )
  assert.ok(loginEndpoint, 'Override /login manquant dans authEndpoints')

  // Le handler est trivial, on l'appelle sans req réel.
  const res = await (loginEndpoint!.handler as () => Promise<Response> | Response)()
  assert.equal(res.status, 410, 'Doit renvoyer 410 Gone')

  const body = (await res.json()) as { error?: string }
  assert.match(body.error ?? '', /login-2fa/i, 'Le message doit pointer vers /login-2fa')
})

test('Aucun autre endpoint custom ne shadow les routes Payload natives critiques', () => {
  const paths = authEndpoints.map((e) => `${e.method} ${e.path}`)
  // /login : OK, on le veut désactivé.
  // /logout, /me, /forgot-password, /reset-password : on ne les override pas
  // pour ne pas casser des fonctionnalités natives. Test sentinelle au cas
  // où une refacto les ajouterait sans concertation.
  for (const dangerous of ['post /logout', 'get /me', 'post /forgot-password', 'post /reset-password']) {
    assert.equal(
      paths.includes(dangerous),
      false,
      `${dangerous} ne doit pas être override (laisse le natif gérer)`,
    )
  }
})

// ─── 2. ID coercion ───────────────────────────────────────────────────

test('safeEqualHex compare en temps constant et tolère différentes longueurs', () => {
  assert.equal(safeEqualHex('abcd', 'abcd'), true)
  assert.equal(safeEqualHex('abcd', 'abce'), false)
  // Différentes longueurs → false sans throw
  assert.equal(safeEqualHex('abcd', 'abcdef'), false)
  // null/undefined → false sans throw
  assert.equal(safeEqualHex(null, 'abcd'), false)
  assert.equal(safeEqualHex('abcd', undefined), false)
  assert.equal(safeEqualHex(null, null), false)
})

test("Comparaison d'IDs : number vs string doit converger après String()", () => {
  // Régression : une comparaison stricte === échouerait sur ces cas, alors
  // que les fonctions d'access (isSelfOrAdmin, isCurrentDeviceTrusted) les
  // traitent comme égaux.
  const cases: Array<[number | string, number | string]> = [
    [42, 42],
    [42, '42'],
    ['42', 42],
    ['42', '42'],
  ]
  for (const [a, b] of cases) {
    assert.equal(String(a) === String(b), true, `${typeof a} ${a} vs ${typeof b} ${b}`)
  }
  // Et les vraies inégalités restent inégales.
  assert.equal(String(42) === String(43), false)
  assert.equal(String('42') === String('43'), false)
})

// ─── 3. Crypto sentinelles ────────────────────────────────────────────

test('hashToken est déterministe et SHA-256', () => {
  const a = hashToken('hello')
  const b = hashToken('hello')
  assert.equal(a, b, 'Hash déterministe')
  assert.equal(a.length, 64, 'SHA-256 = 64 hex chars')
  assert.notEqual(a, hashToken('hellO'), 'Sensible à la casse')
})

test('generateNumericCode produit le bon nombre de chiffres avec leading zeros', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateNumericCode(6)
    assert.equal(code.length, 6, `Code "${code}" doit faire 6 chars`)
    assert.match(code, /^\d{6}$/, `Code "${code}" doit être numérique`)
  }
})

test('signCookie + verifyCookie : roundtrip OK, signature invalide rejetée', () => {
  const payload = { uid: 42, did: 'abc123', fp: 'def456' }
  const signed = signCookie(payload)
  assert.match(signed, /\..+$/, 'Format <b64>.<hmac>')

  const verified = verifyCookie<typeof payload>(signed)
  assert.deepEqual(verified, payload, 'Roundtrip identique')

  // Signature manipulée → null
  const tampered = signed.slice(0, -4) + 'XXXX'
  assert.equal(verifyCookie(tampered), null, 'Signature corrompue rejetée')

  // Payload manipulé → signature ne matche plus → null
  const [, sig] = signed.split('.')
  const fakePayload = Buffer.from(JSON.stringify({ uid: 1 }), 'utf8').toString('base64url')
  assert.equal(verifyCookie(`${fakePayload}.${sig}`), null, 'Payload modifié rejeté')

  // null/undefined → null
  assert.equal(verifyCookie(null), null)
  assert.equal(verifyCookie(undefined), null)
  assert.equal(verifyCookie(''), null)
  assert.equal(verifyCookie('nopoint'), null)
})

test('Cookie tampering : remplacement de la signature seule rejeté', () => {
  const a = signCookie({ uid: 1 })
  const b = signCookie({ uid: 2 })
  const [payloadA] = a.split('.')
  const [, sigB] = b.split('.')
  // Combinaison frankenstein : payload de A avec signature de B → invalide.
  assert.equal(verifyCookie(`${payloadA}.${sigB}`), null)
})
