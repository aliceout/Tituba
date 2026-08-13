// Tests des gardes de l'inscription publique aux alertes mail.
//
// Lancer : `pnpm test` côté services/payload.
//
// Ce que ces tests protègent, précisément : l'endpoint fait partir un
// mail signé du site vers une adresse choisie par l'appelant. Chacune
// des gardes ci-dessous borne cette capacité, et chacune se désarme
// d'une ligne — un `if` déplacé, un champ oublié dans un proxy. On
// vérifie donc le comportement observable, pas la présence du code :
// combien de mails partent, et lesquels.
//
// Le handler tourne contre un faux `payload` : rien ne touche à la base
// ni au SMTP. Les compteurs de débit, eux, sont le vrai module — ils
// sont remis à zéro entre les cas.

import test from 'node:test'
import assert from 'node:assert/strict'

import { subscribersEndpoints } from './subscribers.js'
import { RATE_PROFILES, reset } from '../auth/rate-limit.js'

if (!process.env.PAYLOAD_SECRET) {
  process.env.PAYLOAD_SECRET = 'a'.repeat(64)
}

const subscribe = subscribersEndpoints.find((e) => e.path === '/subscribe')!

type Journal = {
  mails: string[]
  crees: string[]
  majs: unknown[]
}

/**
 * Faux `req`. `existant` est le document que `find` renverra — null pour
 * une adresse inconnue.
 */
function faireReq(
  corps: unknown,
  options: {
    existant?: Record<string, unknown> | null
    entetes?: Record<string, string>
  } = {},
): { req: never; journal: Journal } {
  const journal: Journal = { mails: [], crees: [], majs: [] }
  const existant = options.existant ?? null

  const req = {
    headers: new Headers({ 'x-real-ip': '203.0.113.1', ...(options.entetes ?? {}) }),
    json: async () => corps,
    payload: {
      findGlobal: async () => ({ emailEnabled: true, siteName: 'Tituba' }),
      find: async () => ({ docs: existant ? [existant] : [] }),
      create: async (args: { data: { email: string } }) => {
        journal.crees.push(args.data.email)
        return { id: 1, ...args.data }
      },
      update: async (args: unknown) => {
        journal.majs.push(args)
        return { id: 1 }
      },
      sendEmail: async (args: { to: string }) => {
        journal.mails.push(args.to)
      },
      logger: { info() {}, warn() {}, error() {} },
    },
  }

  return { req: req as never, journal }
}

/** Remet à zéro tout ce que le module de débit retient pour ce cas. */
function rincer(email: string, ip = '203.0.113.1'): void {
  reset(RATE_PROFILES.subscribe, ip)
  reset(RATE_PROFILES.subscribeEmail, email)
  reset(RATE_PROFILES.subscribeFlood, 'all')
}

async function appeler(
  corps: unknown,
  options?: Parameters<typeof faireReq>[1],
): Promise<{ status: number; body: Record<string, unknown>; journal: Journal }> {
  const { req, journal } = faireReq(corps, options)
  const res = await subscribe.handler!(req)
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, journal }
}

test('une adresse inconnue reçoit un mail de confirmation', async () => {
  rincer('nouvelle@example.com')
  const { status, body, journal } = await appeler({ email: 'nouvelle@example.com' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(journal.mails, ['nouvelle@example.com'])
  assert.deepEqual(journal.crees, ['nouvelle@example.com'])
})

test('le pot de miel rempli ne fait partir aucun mail, et répond comme un succès', async () => {
  rincer('robot@example.com')
  const { status, body, journal } = await appeler({
    email: 'robot@example.com',
    site: 'http://spam.example',
  })
  // Réponse indiscernable d'un succès : un robot ne doit pas apprendre
  // au code de retour quel champ éviter.
  assert.equal(status, 200)
  assert.deepEqual(body, { ok: true })
  assert.deepEqual(journal.mails, [])
  assert.deepEqual(journal.crees, [])
})

test("le plafond par adresse borne ce qu'une même boîte peut recevoir", async () => {
  const cible = 'victime@example.com'
  rincer(cible)
  // Chaque appel vient d'une IP différente : c'est le scénario qu'on
  // veut couvrir, celui où la limitation par IP ne sert à rien.
  const partis: number[] = []
  for (let i = 0; i < RATE_PROFILES.subscribeEmail.max + 2; i++) {
    reset(RATE_PROFILES.subscribe, `198.51.100.${i}`)
    const { journal } = await appeler(
      { email: cible },
      { entetes: { 'x-real-ip': `198.51.100.${i}` } },
    )
    partis.push(journal.mails.length)
  }
  const total = partis.reduce((a, b) => a + b, 0)
  assert.equal(total, RATE_PROFILES.subscribeEmail.max)
})

test('une inscription en attente toute fraîche ne redéclenche pas de mail', async () => {
  const email = 'enattente@example.com'
  rincer(email)
  const { status, body, journal } = await appeler(
    { email },
    {
      existant: {
        id: 7,
        email,
        status: 'pending',
        subscribedAt: new Date(Date.now() - 60_000).toISOString(),
      },
    },
  )
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(journal.mails, [])
  // Ni mise à jour : le jeton en cours reste valable, celui qui a reçu
  // le premier mail peut toujours cliquer dessus.
  assert.deepEqual(journal.majs, [])
})

test('une inscription en attente ancienne redéclenche un mail', async () => {
  const email = 'vieille@example.com'
  rincer(email)
  const { journal } = await appeler(
    { email },
    {
      existant: {
        id: 8,
        email,
        status: 'pending',
        subscribedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    },
  )
  assert.deepEqual(journal.mails, [email])
  assert.equal(journal.majs.length, 1)
})

test('une adresse déjà active ne reçoit rien', async () => {
  const email = 'active@example.com'
  rincer(email)
  const { body, journal } = await appeler(
    { email },
    { existant: { id: 9, email, status: 'active' } },
  )
  assert.deepEqual(body, { ok: true })
  assert.deepEqual(journal.mails, [])
})

test('le coupe-circuit global ferme la route quelle que soit l’IP', async () => {
  reset(RATE_PROFILES.subscribeFlood, 'all')
  // On brûle le plafond global avec des adresses et des IP toutes
  // différentes : aucune des deux autres limitations ne doit suffire à
  // expliquer le refus.
  for (let i = 0; i < RATE_PROFILES.subscribeFlood.max; i++) {
    const ip = `192.0.2.${i % 250}`
    reset(RATE_PROFILES.subscribe, ip)
    reset(RATE_PROFILES.subscribeEmail, `f${i}@example.com`)
    await appeler({ email: `f${i}@example.com` }, { entetes: { 'x-real-ip': ip } })
  }
  reset(RATE_PROFILES.subscribe, '192.0.2.251')
  reset(RATE_PROFILES.subscribeEmail, 'apres@example.com')
  const { status, body, journal } = await appeler(
    { email: 'apres@example.com' },
    { entetes: { 'x-real-ip': '192.0.2.251' } },
  )
  assert.equal(status, 503)
  assert.equal(body.code, 'saturated')
  assert.deepEqual(journal.mails, [])
  reset(RATE_PROFILES.subscribeFlood, 'all')
})

test("l'accès direct est refusé quand le secret de proxy est posé", async () => {
  const avant = process.env.INTERNAL_PROXY_SECRET
  process.env.INTERNAL_PROXY_SECRET = 'b'.repeat(32)
  try {
    rincer('direct@example.com')
    const sans = await appeler({ email: 'direct@example.com' })
    assert.equal(sans.status, 403)
    assert.equal(sans.body.code, 'direct_access')
    assert.deepEqual(sans.journal.mails, [])

    rincer('direct@example.com')
    const avecBonSecret = await appeler(
      { email: 'direct@example.com' },
      { entetes: { 'x-tituba-proxy': 'b'.repeat(32) } },
    )
    assert.equal(avecBonSecret.status, 200)
    assert.deepEqual(avecBonSecret.journal.mails, ['direct@example.com'])
  } finally {
    if (avant === undefined) delete process.env.INTERNAL_PROXY_SECRET
    else process.env.INTERNAL_PROXY_SECRET = avant
  }
})

test('le rythme choisi est enregistré tel quel', async () => {
  rincer('deux@example.com')
  const { req, journal } = faireReq({
    email: 'deux@example.com',
    rythmes: ['newsletter', 'publications'],
  })
  let ecrit: string[] | undefined
  const payload = (req as unknown as { payload: { create: unknown } }).payload
  const creerOriginal = payload.create as (a: {
    data: { email: string; rythmes?: string[] }
  }) => Promise<unknown>
  payload.create = async (a: { data: { email: string; rythmes?: string[] } }) => {
    ecrit = a.data.rythmes
    return creerOriginal(a)
  }
  await subscribe.handler!(req)
  assert.deepEqual(ecrit, ['newsletter', 'publications'])
  assert.deepEqual(journal.mails, ['deux@example.com'])
})

test('un rythme inventé est écarté, et le repli est « chaque parution »', async () => {
  for (const brut of [['patate'], [], 'newsletter', undefined]) {
    rincer('rythme@example.com')
    const { req } = faireReq({ email: 'rythme@example.com', rythmes: brut })
    let ecrit: string[] | undefined
    const payload = (req as unknown as { payload: { create: unknown } }).payload
    payload.create = async (a: { data: { rythmes?: string[] } }) => {
      ecrit = a.data.rythmes
      return { id: 1 }
    }
    await subscribe.handler!(req)
    // Une chaîne seule est acceptée si elle nomme un rythme connu ; tout
    // le reste retombe sur les parutions, jamais sur une liste vide —
    // qui ne recevrait plus rien du tout.
    assert.deepEqual(ecrit, brut === 'newsletter' ? ['newsletter'] : ['publications'])
  }
})

test('une adresse malformée est refusée sans mail', async () => {
  rincer('pas-une-adresse')
  const { status, body, journal } = await appeler({ email: 'pas-une-adresse' })
  assert.equal(status, 400)
  assert.equal(body.code, 'invalid_email')
  assert.deepEqual(journal.mails, [])
})
