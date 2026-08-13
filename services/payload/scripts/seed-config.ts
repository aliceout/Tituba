/**
 * Seed de configuration — de quoi faire exister le site.
 *
 *   pnpm --dir services/payload seed:config
 *
 * C'est le premier geste après `payload migrate` sur une base neuve : la
 * migration crée des tables vides, celui-ci les rend utilisables. À la
 * fin, le site répond, l'administration s'ouvre, et il ne reste qu'à
 * écrire.
 *
 * ─── Ce qu'il pose ──────────────────────────────────────────────────
 *
 *   compte racine    depuis SEED_ROOT_EMAIL / SEED_ROOT_PASSWORD
 *   réglages         identité, apparence, abonnements
 *   thématiques      les dix axes de classement
 *   pages            les cinq pages d'index, plus trois coquilles
 *   navigation       en-tête et pied, une fois les pages en place
 *
 * ─── Ce qu'il ne pose PAS, et c'est la règle ────────────────────────
 *
 * Aucun contenu. Pas un billet, pas un compte d'auteur·ice, pas une
 * image, pas un document. Un site s'installe vide et se remplit depuis
 * l'administration ; un seed qui écrit des textes fabrique une histoire
 * que personne n'a écrite, et qu'on retrouve six mois plus tard en
 * croyant l'avoir voulue.
 *
 * ─── Deux sortes de pages ───────────────────────────────────────────
 *
 * Les cinq pages d'index (`home`, `formats`, `themes`, `archives`,
 * `subscribe`) arrivent avec leur titre et leur chapô. Ce ne sont pas
 * des textes qu'on invente ici : ce sont exactement ceux que le site
 * sert déjà en repli, écrits en dur dans les pages d'index d'Astro. Les
 * poser en base ne crée donc rien — ça rend éditable depuis
 * l'administration ce qui n'existait que dans le code, et c'est bien à
 * ça que sert une page « fixe ». Les laisser vides aurait fait
 * l'inverse : leur titre EST le titre affiché (`fetchIndexPages` mappe
 * `title` sur `heroTitle`), donc une coquille aurait remplacé « Cinq
 * formats, une même exigence » par le mot « formats ».
 *
 * Les trois pages éditoriales — `association`, `charte`,
 * `nous-rejoindre` — arrivent vides et en brouillon : rien à afficher
 * tant que personne ne les a écrites, et un libellé qui n'est qu'une
 * poignée pour les retrouver dans l'administration. Sans elles, l'entrée
 * « association » du menu ne désignerait rien.
 *
 * Le jeu de démonstration — faux comptes, faux billets, fausses images —
 * est dans `seed-test.ts`, qui refuse de tourner en production.
 *
 * ─── Il se relance sans dommage ─────────────────────────────────────
 *
 * Chaque entrée est reconnue à sa clé naturelle : le slug pour une page
 * ou une thématique, le titre pour un billet, l'adresse pour un compte.
 * Ce qui existe est laissé tel quel — jamais écrasé. Une seconde
 * exécution ne recrée rien et n'efface rien, ce qui permet de le relancer
 * après avoir ajouté une thématique sans craindre pour ce qui a déjà été
 * édité depuis l'administration.
 *
 * `--forcer` renverse cette règle pour les réglages et les pages : leur
 * contenu est réécrit depuis le fichier de données. À n'employer que
 * pour remettre un environnement d'essai d'aplomb.
 *
 * ─── D'où viennent les données ──────────────────────────────────────
 *
 * `scripts/data/config.json`, capturé sur une instance configurée plutôt
 * que retranscrit à la main — une retranscription diverge au premier
 * changement, et rien ne le signale. La navigation y désigne ses pages
 * par slug et non par identifiant : les identifiants d'une base neuve ne
 * sont pas ceux d'où la capture a été faite.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

import config from '../src/payload.config'

const FORCER = process.argv.includes('--forcer')

const ici = path.dirname(fileURLToPath(import.meta.url))
const DONNEES = JSON.parse(
  fs.readFileSync(path.join(ici, 'data', 'config.json'), 'utf8'),
) as Donnees

type Bloc = Record<string, unknown>
type Donnees = {
  globals: Record<string, Record<string, unknown>>
  navigation: {
    navHeader: Array<Bloc & { pageSlug?: string }>
    navFooter: Bloc[]
    navFooterCoulisses: Bloc[]
  }
  pages: Array<Bloc & { slug: string }>
  themes: Array<{ slug: string; name: string; description?: string }>
}

let poses = 0
let laisses = 0

function dit(action: 'posé' | 'laissé' | 'réécrit', quoi: string): void {
  if (action === 'laissé') laisses++
  else poses++
  console.log(`  ${action.padEnd(8)} ${quoi}`)
}

const payload = await getPayload({ config })

// ─── Le compte racine ────────────────────────────────────────────────
//
// Lu dans l'environnement, jamais écrit dans le dépôt. Sans les deux
// variables, on s'arrête : un mot de passe par défaut sur le seul compte
// administrateur d'un site qui vient d'ouvrir est une porte laissée
// ouverte, et personne ne pense à la refermer.
//
// La création passe par l'API locale, qui hache le mot de passe comme le
// ferait un formulaire. `payload migrate` a laissé la collection vide, et
// l'écran « créer le premier utilisateur » de Payload ne peut pas servir
// ici : la connexion native est fermée (410) au profit du parcours à deux
// facteurs. Sans ce bloc, on aurait un site sans aucun moyen d'y entrer.
async function poserRacine(): Promise<void> {
  const email = process.env.SEED_ROOT_EMAIL?.trim().toLowerCase()
  const motDePasse = process.env.SEED_ROOT_PASSWORD

  const existants = await payload.find({
    collection: 'users',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existants.totalDocs > 0) {
    dit('laissé', `compte racine — ${existants.totalDocs} compte(s) déjà en place`)
    return
  }

  if (!email || !motDePasse) {
    throw new Error(
      "Aucun compte n'existe et SEED_ROOT_EMAIL / SEED_ROOT_PASSWORD ne sont pas " +
        'renseignés. Sans eux, ce seed créerait un site où personne ne peut entrer — ' +
        'ou pire, un compte au mot de passe connu. Renseignez-les et relancez.',
    )
  }
  if (motDePasse.length < 12) {
    throw new Error(
      `SEED_ROOT_PASSWORD fait ${motDePasse.length} caractères. C'est le seul compte ` +
        "d'un site qui s'ouvre : douze au minimum.",
    )
  }

  await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email,
      password: motDePasse,
      displayName: 'Administration',
      role: 'root',
      status: 'active',
    } as never,
  })
  dit('posé', `compte racine — ${email}`)
}

// ─── Réglages ────────────────────────────────────────────────────────
//
// Un global répond toujours, même si personne ne l'a jamais enregistré :
// Payload rend alors les valeurs par défaut de ses champs. La question
// « a-t-il déjà quelque chose ? » n'a donc pas de réponse utile — la
// navigation, par exemple, arrive avec des entrées par défaut, et un
// contrôle sur leur nombre conclut à tort qu'elle est réglée.
//
// Le seul témoin fiable est `updatedAt` : il n'existe que si une ligne a
// été écrite. Vérifié sur une base neuve — ni `id` ni `updatedAt` tant
// que rien n'a été enregistré.
async function dejaEnregistre(slug: string): Promise<boolean> {
  const actuel = (await payload.findGlobal({ slug: slug as never })) as {
    updatedAt?: string
  }
  return Boolean(actuel?.updatedAt)
}

async function poserGlobals(): Promise<void> {
  for (const [slug, valeurs] of Object.entries(DONNEES.globals)) {
    const dejaRegle = await dejaEnregistre(slug)
    if (dejaRegle && !FORCER) {
      dit('laissé', `réglages ${slug}`)
      continue
    }
    await payload.updateGlobal({
      slug: slug as never,
      data: valeurs as never,
      overrideAccess: true,
    })
    dit(dejaRegle ? 'réécrit' : 'posé', `réglages ${slug}`)
  }
}

// ─── Thématiques ─────────────────────────────────────────────────────
async function poserThemes(): Promise<void> {
  for (const theme of DONNEES.themes) {
    const trouve = await payload.find({
      collection: 'themes',
      where: { slug: { equals: theme.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (trouve.totalDocs > 0) {
      dit('laissé', `thématique ${theme.slug}`)
      continue
    }
    await payload.create({
      collection: 'themes',
      data: theme as never,
      overrideAccess: true,
    })
    dit('posé', `thématique ${theme.slug}`)
  }
}

// ─── Pages ───────────────────────────────────────────────────────────
async function poserPages(): Promise<Map<string, number | string>> {
  const parSlug = new Map<string, number | string>()
  for (const page of DONNEES.pages) {
    const trouve = await payload.find({
      collection: 'pages',
      where: { slug: { equals: page.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existante = trouve.docs[0] as { id: number | string } | undefined

    if (existante && !FORCER) {
      parSlug.set(page.slug, existante.id)
      dit('laissé', `page /${page.slug}`)
      continue
    }
    if (existante) {
      await payload.update({
        collection: 'pages',
        id: existante.id,
        data: page as never,
        overrideAccess: true,
      })
      parSlug.set(page.slug, existante.id)
      dit('réécrit', `page /${page.slug}`)
      continue
    }
    const creee = await payload.create({
      collection: 'pages',
      data: page as never,
      overrideAccess: true,
    })
    parSlug.set(page.slug, creee.id)
    dit('posé', `page /${page.slug}`)
  }
  return parSlug
}

// ─── Navigation ──────────────────────────────────────────────────────
//
// Après les pages, forcément : ses entrées éditoriales les désignent. Le
// fichier de données les nomme par slug ; on rétablit ici l'identifiant
// que la base vient d'attribuer.
async function poserNavigation(pages: Map<string, number | string>): Promise<void> {
  if ((await dejaEnregistre('navigation')) && !FORCER) {
    dit('laissé', 'navigation')
    return
  }

  const manquantes: string[] = []
  const navHeader = DONNEES.navigation.navHeader.map((item) => {
    const { pageSlug, ...reste } = item
    if (!pageSlug) return reste
    const id = pages.get(pageSlug)
    if (id === undefined) manquantes.push(pageSlug)
    return { ...reste, page: id }
  })

  // Une entrée d'en-tête qui pointe dans le vide ne se voit pas : le menu
  // se rend, le lien est simplement absent. On préfère le dire.
  if (manquantes.length > 0) {
    console.warn(
      `  ⚠ navigation : page(s) introuvable(s) — ${manquantes.join(', ')}. ` +
        "L'entrée correspondante ne sera pas rendue.",
    )
  }

  await payload.updateGlobal({
    slug: 'navigation',
    data: {
      navHeader,
      navFooter: DONNEES.navigation.navFooter,
      navFooterCoulisses: DONNEES.navigation.navFooterCoulisses,
    } as never,
    overrideAccess: true,
  })
  dit('posé', 'navigation')
}

// ─── Déroulé ─────────────────────────────────────────────────────────

console.log(
  FORCER
    ? '\nSeed de configuration — mode --forcer : réglages et pages réécrits.\n'
    : '\nSeed de configuration — ce qui existe est laissé tel quel.\n',
)

await poserRacine()
await poserGlobals()
await poserThemes()
const pages = await poserPages()
await poserNavigation(pages)

console.log(`\n${poses} entrée(s) posée(s), ${laisses} laissée(s) en place.`)
if (poses > 0) {
  console.log("Le site a de quoi répondre. L'administration est sur /cms/admin.")
}

process.exit(0)
