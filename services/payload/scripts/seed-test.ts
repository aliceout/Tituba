/**
 * Seed de test — le jeu de démonstration.
 *
 *   pnpm --dir services/payload seed:test
 *   pnpm --dir services/payload seed:test:reset   (efface d'abord)
 *
 * Tout ce qu'il pose est faux : comptes, billets, épisodes, images. Il
 * sert à avoir un site peuplé — pour regarder une mise en page, éprouver
 * un parcours, faire tourner les audits d'accessibilité, qui ont besoin
 * de pages réelles à visiter.
 *
 * La configuration du site, elle, n'est pas ici : elle est dans
 * `seed-config.ts`, et il faut l'avoir passé avant — les billets se
 * rattachent à des thématiques, que celui-là pose.
 *
 * ─── Il refuse de tourner en production ─────────────────────────────
 *
 * Deux verrous plutôt qu'un. `NODE_ENV=production` arrête tout — mais
 * c'est une variable qu'on oublie de renseigner, et un `--reset` lancé
 * sur la mauvaise base ne se rattrape pas. Le second ne demande rien à
 * personne : avant d'effacer, il compare ce qui est en base au jeu de
 * démonstration, et refuse s'il trouve une publication qu'il ne saurait
 * pas reposer.
 *
 * ─── Les fichiers sont fabriqués, pas transportés ───────────────────
 *
 * Les fichiers pointés par ce jeu pèsent 38 Mo sur le disque de
 * développement — ils ne sont pas dans le dépôt, et n'ont rien à y
 * faire. Le seed les recrée : images unies par sharp, déjà dépendance du
 * projet, son de synthèse et PDF écrits octet par octet. 308 ko en tout.
 * Aucun réseau, aucun binaire de plus, un résultat identique à chaque
 * exécution.
 *
 * Ils sont laids et c'est voulu : une image de démonstration doit se
 * reconnaître au premier coup d'œil comme une image de démonstration.
 *
 * ─── D'où viennent les données ──────────────────────────────────────
 *
 * `scripts/data/test.json`, capturé sur l'instance de développement.
 * Les relations y sont exprimées en clés naturelles — une thématique par
 * son slug, un compte par son adresse, un fichier par un nom symbolique
 * — parce qu'une base neuve n'attribue pas les mêmes identifiants.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '../src/payload.config'

const RESET = process.argv.includes('--reset')

if (process.env.NODE_ENV === 'production') {
  console.error(
    '\nRefus : NODE_ENV vaut « production ». Ce seed pose de fausses données ;\n' +
      "sur une base réelle, elles se mêleraient aux vraies sans qu'on puisse les\n" +
      'distinguer ensuite.\n',
  )
  process.exit(1)
}

const ici = path.dirname(fileURLToPath(import.meta.url))
const DONNEES = JSON.parse(fs.readFileSync(path.join(ici, 'data', 'test.json'), 'utf8')) as Donnees

type Doc = Record<string, unknown>
type Publication = Doc & {
  title: string
  themeSlugs?: string[]
  tagSlugs?: string[]
  authorEmails?: string[]
  biblioSlugs?: string[]
  serieSlug?: string
  imageNom?: string
  audioNom?: string
}
type Donnees = {
  auteurices: Array<{
    email: string
    displayName?: string | null
    bio?: string | null
    citationFormat?: string | null
    photoNom?: string
  }>
  tags: Array<{ name: string; slug: string }>
  series: Array<Doc & { slug: string }>
  bibliography: Array<Doc & { slug: string }>
  publications: Record<string, Publication[]>
  fichiers: Array<{ nom: string; role: 'image' | 'audio' | 'document' }>
}

/**
 * Mot de passe des comptes de démonstration.
 *
 * En clair et le même pour tous : ce sont de faux comptes, sur une base
 * de test, et un mot de passe qu'on doit aller chercher dans un fichier
 * pour se connecter à un jeu d'essai fait perdre du temps sans rien
 * protéger. Le seed refuse de tourner en production ; c'est là qu'est la
 * garde, pas ici.
 */
const MOT_DE_PASSE_DEMO = 'demonstration-tituba'

const COLLECTIONS_PUBLICATIONS = ['articles', 'analyses', 'actus', 'podcasts', 'outils'] as const

const payload = await getPayload({ config })

let poses = 0
let laisses = 0
function dit(action: 'posé' | 'laissé', quoi: string): void {
  if (action === 'laissé') laisses++
  else poses++
  console.log(`  ${action.padEnd(7)} ${quoi}`)
}

// ─── Fabrication des fichiers ────────────────────────────────────────

/** Teinte stable tirée du nom : deux exécutions donnent la même image. */
function teinte(nom: string): number {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/**
 * Une image unie, barrée de son nom. 1600×900 pour une couverture,
 * carrée pour un portrait — les deux formats que le site met en page
 * différemment, et sur lesquels un cadrage se voit.
 */
async function fabriquerImage(nom: string): Promise<Buffer> {
  const portrait = nom.includes('portrait')
  const [l, h] = portrait ? [800, 800] : [1600, 900]
  const t = teinte(nom)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${h}">
    <rect width="100%" height="100%" fill="hsl(${t} 34% 62%)"/>
    <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="hsl(${t} 40% 38%)" stroke-width="16"/>
    <text x="50%" y="48%" font-family="sans-serif" font-size="${Math.round(l / 14)}"
          fill="hsl(${t} 45% 22%)" text-anchor="middle">DÉMONSTRATION</text>
    <text x="50%" y="60%" font-family="monospace" font-size="${Math.round(l / 26)}"
          fill="hsl(${t} 45% 28%)" text-anchor="middle">${nom}</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

/**
 * Trois secondes de la4, en WAV.
 *
 * Écrit à la main plutôt que par un encodeur : produire du MP3 demande
 * un binaire externe, que personne n'a envie d'installer pour entendre
 * si un lecteur démarre. Le WAV figure dans les types acceptés par la
 * médiathèque, et le lecteur du site le lit comme le reste.
 */
function fabriquerAudio(): Buffer {
  const echantillonnage = 22_050
  const secondes = 3
  const total = echantillonnage * secondes
  const donnees = Buffer.alloc(total * 2)
  for (let i = 0; i < total; i++) {
    // Une enveloppe qui décroît, pour que ça ne ressemble pas à une
    // alarme : le son sert à vérifier une progression, pas à réveiller.
    const enveloppe = 1 - i / total
    const v = Math.sin((2 * Math.PI * 440 * i) / echantillonnage) * 12_000 * enveloppe
    donnees.writeInt16LE(Math.round(v), i * 2)
  }
  const entete = Buffer.alloc(44)
  entete.write('RIFF', 0)
  entete.writeUInt32LE(36 + donnees.length, 4)
  entete.write('WAVE', 8)
  entete.write('fmt ', 12)
  entete.writeUInt32LE(16, 16) // taille du bloc de format
  entete.writeUInt16LE(1, 20) // PCM
  entete.writeUInt16LE(1, 22) // mono
  entete.writeUInt32LE(echantillonnage, 24)
  entete.writeUInt32LE(echantillonnage * 2, 28) // octets par seconde
  entete.writeUInt16LE(2, 32) // alignement de bloc
  entete.writeUInt16LE(16, 34) // bits par échantillon
  entete.write('data', 36)
  entete.writeUInt32LE(donnees.length, 40)
  return Buffer.concat([entete, donnees])
}

/**
 * Un PDF d'une page, portant son nom.
 *
 * Écrit à la main, comme le son : le format tient en cinq objets, et
 * ajouter une bibliothèque de génération de PDF au projet pour fabriquer
 * une page de démonstration serait payer cher un fichier que personne ne
 * lira. La longueur du flux est comptée plutôt que devinée — un décalage
 * d'un octet suffit à rendre le fichier illisible.
 */
function fabriquerDocument(nom: string): Buffer {
  const contenu = `BT /F1 22 Tf 70 700 Td (DEMONSTRATION) Tj ET\nBT /F1 12 Tf 70 670 Td (${nom}) Tj ET`
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contenu, 'latin1')} >>\nstream\n${contenu}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const decalages: number[] = []
  objets.forEach((o, i) => {
    decalages.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const debutXref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  for (const d of decalages) pdf += `${String(d).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

const EXTENSIONS = { image: 'jpg', audio: 'wav', document: 'pdf' } as const
const TYPES_MIME = {
  image: 'image/jpeg',
  audio: 'audio/wav',
  document: 'application/pdf',
} as const

/**
 * Titre du média — et non son nom de fichier — comme clé.
 *
 * Payload renumérote un fichier dont le nom est déjà pris sur le disque :
 * `image-1.jpg` devient `image-8.jpg` si les précédents n'ont pas été
 * nettoyés. Une reconnaissance par nom de fichier ne retrouve donc rien,
 * et chaque exécution empile un jeu de plus — vingt médias après trois
 * passages, là où on en attendait dix. Le titre, lui, est écrit par le
 * seed et personne d'autre n'y touche.
 */
const titreMedia = (nom: string): string => `Démonstration — ${nom}`

async function poserFichiers(): Promise<Map<string, number | string>> {
  const parNom = new Map<string, number | string>()
  for (const { nom, role } of DONNEES.fichiers) {
    const nomFichier = `${nom}.${EXTENSIONS[role]}`
    const trouve = await payload.find({
      collection: 'media',
      where: { title: { equals: titreMedia(nom) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existant = trouve.docs[0] as { id: number | string } | undefined
    if (existant) {
      parNom.set(nom, existant.id)
      dit('laissé', `fichier ${nomFichier}`)
      continue
    }

    const data =
      role === 'audio'
        ? fabriquerAudio()
        : role === 'document'
          ? fabriquerDocument(nom)
          : await fabriquerImage(nom)
    const cree = await payload.create({
      collection: 'media',
      overrideAccess: true,
      data: {
        title: titreMedia(nom),
        // Obligatoire sur une image, sans objet sur un son ou un
        // document : la collection le valide selon le type réel du
        // fichier.
        alt: role === 'image' ? `Image de démonstration ${nom}, aplat de couleur` : undefined,
      } as never,
      file: {
        data,
        name: nomFichier,
        mimetype: TYPES_MIME[role],
        size: data.length,
      },
    })
    parNom.set(nom, cree.id)
    dit('posé', `fichier ${nomFichier} (${(data.length / 1024).toFixed(0)} ko)`)
  }
  return parNom
}

// ─── Auteur·ices ─────────────────────────────────────────────────────

async function poserAuteurices(
  fichiers: Map<string, number | string>,
): Promise<Map<string, number | string>> {
  const parEmail = new Map<string, number | string>()
  for (const a of DONNEES.auteurices) {
    const trouve = await payload.find({
      collection: 'users',
      where: { email: { equals: a.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existant = trouve.docs[0] as { id: number | string } | undefined
    if (existant) {
      parEmail.set(a.email, existant.id)
      dit('laissé', `compte ${a.email}`)
      continue
    }
    const cree = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: a.email,
        password: MOT_DE_PASSE_DEMO,
        displayName: a.displayName ?? undefined,
        bio: a.bio ?? undefined,
        citationFormat: a.citationFormat ?? undefined,
        photo: a.photoNom ? fichiers.get(a.photoNom) : undefined,
        role: 'editor',
        status: 'active',
      } as never,
    })
    parEmail.set(a.email, cree.id)
    dit('posé', `compte ${a.email}`)
  }
  return parEmail
}

// ─── Taxonomies et références ────────────────────────────────────────

async function poserParSlug<T extends { slug: string }>(
  collection: 'tags' | 'bibliography' | 'series',
  entrees: T[],
  prepare: (e: T) => Doc,
  libelle: (e: T) => string,
): Promise<Map<string, number | string>> {
  const parSlug = new Map<string, number | string>()
  for (const e of entrees) {
    const trouve = await payload.find({
      collection,
      where: { slug: { equals: e.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existant = trouve.docs[0] as { id: number | string } | undefined
    if (existant) {
      parSlug.set(e.slug, existant.id)
      laisses++
      continue
    }
    const cree = await payload.create({
      collection,
      data: prepare(e) as never,
      overrideAccess: true,
    })
    parSlug.set(e.slug, cree.id)
    poses++
  }
  console.log(`  ${entrees.length} ${libelle(entrees[0] ?? ({} as T))}`)
  return parSlug
}

// ─── Déroulé ─────────────────────────────────────────────────────────

/**
 * Refuse d'effacer ce que ce seed n'a pas posé.
 *
 * `NODE_ENV` est le premier verrou, mais il n'est pas fiable : c'est une
 * variable qu'on oublie de renseigner, et un `--reset` lancé sur la
 * mauvaise base ne se rattrape pas. Celui-ci ne demande rien à personne
 * — il compare les titres présents à ceux du jeu de démonstration. Un
 * seul billet inconnu, et on s'arrête : quelqu'un a écrit ici.
 *
 * Le seed de configuration pose lui aussi un billet, réel celui-là. Il
 * est donc attendu, et n'empêche pas l'effacement.
 */
async function verifierQueRienDeVraiNeSeraEfface(): Promise<void> {
  const connus = new Set<string>()
  for (const liste of Object.values(DONNEES.publications)) {
    for (const p of liste) connus.add(p.title)
  }
  // Le billet du seed de configuration : il n'est pas de ce jeu, mais on
  // sait d'où il vient. Lu dans son fichier plutôt que recopié ici.
  try {
    const conf = JSON.parse(fs.readFileSync(path.join(ici, 'data', 'config.json'), 'utf8')) as {
      actus?: Array<{ title: string }>
    }
    for (const a of conf.actus ?? []) connus.add(a.title)
  } catch {
    /* pas de fichier de configuration : rien à ajouter aux titres connus */
  }

  const inconnus: string[] = []
  for (const c of COLLECTIONS_PUBLICATIONS) {
    const { docs } = await payload.find({
      collection: c,
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs as Array<{ title?: string }>) {
      if (d.title && !connus.has(d.title)) inconnus.push(`${c} — ${d.title}`)
    }
  }

  if (inconnus.length > 0) {
    console.error(
      `\nRefus d'effacer : ${inconnus.length} publication(s) ne viennent pas du jeu\n` +
        'de démonstration. Cette base contient du travail que ce seed ne saurait pas\n' +
        'reposer :\n',
    )
    for (const i of inconnus.slice(0, 10)) console.error(`  ${i}`)
    if (inconnus.length > 10) console.error(`  … et ${inconnus.length - 10} autre(s)`)
    console.error('\nRelancez sans --reset, ou visez une autre base.\n')
    process.exit(1)
  }
}

/**
 * Efface ce que ce seed a posé, et rien d'autre.
 *
 * Un effacement par collection entière était plus simple à écrire, et
 * emportait le billet d'actu du seed de configuration — celui-là est
 * réel, et le seed de test ne le repose pas. On vise donc par clé : le
 * titre pour une publication, le nom de fichier pour un média, le slug
 * pour le reste.
 */
async function effacerLesConnus(
  collection:
    (typeof COLLECTIONS_PUBLICATIONS)[number] | 'series' | 'tags' | 'bibliography' | 'media',
  champ: string,
  valeurs: string[],
): Promise<void> {
  if (valeurs.length === 0) return
  const { docs } = await payload.find({
    collection,
    where: { [champ]: { in: valeurs } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  for (const d of docs) {
    await payload.delete({ collection, id: d.id, overrideAccess: true })
  }
  if (docs.length > 0) console.log(`  effacé  ${docs.length} ${collection}`)
}

async function vider(): Promise<void> {
  await verifierQueRienDeVraiNeSeraEfface()

  // Les publications d'abord : elles pointent vers tout le reste, et
  // Postgres refuserait de retirer une référence encore rattachée.
  for (const c of COLLECTIONS_PUBLICATIONS) {
    await effacerLesConnus(
      c,
      'title',
      (DONNEES.publications[c] ?? []).map((p) => p.title),
    )
  }
  await effacerLesConnus(
    'series',
    'slug',
    DONNEES.series.map((s) => s.slug),
  )
  await effacerLesConnus(
    'tags',
    'slug',
    DONNEES.tags.map((t) => t.slug),
  )
  await effacerLesConnus(
    'bibliography',
    'slug',
    DONNEES.bibliography.map((b) => b.slug),
  )
  await effacerLesConnus(
    'media',
    'filename',
    DONNEES.fichiers.map((f) => `${f.nom}.${EXTENSIONS[f.role]}`),
  )
  // Les comptes de démonstration seulement : jamais le compte racine,
  // qui n'est pas de ce jeu et dont la disparition fermerait l'admin.
  for (const a of DONNEES.auteurices) {
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: a.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs)
      await payload.delete({ collection: 'users', id: d.id, overrideAccess: true })
  }
}

async function resoudre(
  p: Publication,
  refs: {
    themes: Map<string, number | string>
    tags: Map<string, number | string>
    auteurices: Map<string, number | string>
    biblio: Map<string, number | string>
    series: Map<string, number | string>
    fichiers: Map<string, number | string>
  },
): Promise<Doc> {
  const {
    themeSlugs,
    tagSlugs,
    authorEmails,
    biblioSlugs,
    serieSlug,
    imageNom,
    audioNom,
    ...corps
  } = p
  const garde = <T>(v: T | undefined): T | undefined => v

  // Les ressources d'un outil portent chacune leur fichier, imbriqué —
  // un cas que la traduction générale des relations ne voit pas, parce
  // qu'il n'est pas à la racine du document. Oublié, il fait échouer
  // l'insertion sur une clé étrangère vers un média inexistant.
  const resources = Array.isArray(corps.resources)
    ? (corps.resources as Array<Record<string, unknown>>).map((r) => {
        const { fichierNom, ...reste } = r as { fichierNom?: string }
        return { ...reste, fichier: fichierNom ? refs.fichiers.get(fichierNom) : undefined }
      })
    : undefined

  return {
    ...corps,
    ...(resources ? { resources } : {}),
    themes: (themeSlugs ?? []).map((s) => refs.themes.get(s)).filter(Boolean),
    tags: (tagSlugs ?? []).map((s) => refs.tags.get(s)).filter(Boolean),
    authors: (authorEmails ?? []).map((e) => refs.auteurices.get(e)).filter(Boolean),
    bibliography: (biblioSlugs ?? []).map((s) => refs.biblio.get(s)).filter(Boolean),
    series: garde(serieSlug ? refs.series.get(serieSlug) : undefined),
    image: garde(imageNom ? refs.fichiers.get(imageNom) : undefined),
    audio: garde(audioNom ? refs.fichiers.get(audioNom) : undefined),
    // Déjà « notifié » : un seed n'est pas une parution, et sans cette
    // date le hook d'alerte enverrait un mail par billet posé.
    notificationsSentAt: new Date().toISOString(),
  }
}

console.log(
  RESET
    ? '\nSeed de test — mode --reset : le jeu existant est effacé d’abord.\n'
    : '\nSeed de test — ce qui existe est laissé tel quel.\n',
)

// Sans thématiques, rien ne se rattache : le seed de configuration n'est
// pas une option, c'est un préalable. On le dit plutôt que de poser des
// billets orphelins.
const themesExistants = await payload.find({
  collection: 'themes',
  limit: 0,
  depth: 0,
  overrideAccess: true,
})
if (themesExistants.totalDocs === 0) {
  console.error(
    "Aucune thématique en base. Lancez d'abord `pnpm seed:config` : les billets\n" +
      "de démonstration s'y rattachent, et sans elles ils seraient classés nulle part.\n",
  )
  process.exit(1)
}

if (RESET) await vider()

const fichiers = await poserFichiers()
const auteurices = await poserAuteurices(fichiers)

const tags = await poserParSlug(
  'tags',
  DONNEES.tags as Array<{ slug: string; name: string }>,
  (t) => t,
  () => 'mot(s)-clé(s)',
)
const biblio = await poserParSlug(
  'bibliography',
  DONNEES.bibliography as Array<Doc & { slug: string }>,
  (b) => b,
  () => 'référence(s) bibliographique(s)',
)

const themes = new Map<string, number | string>()
for (const t of (
  await payload.find({ collection: 'themes', limit: 100, depth: 0, overrideAccess: true })
).docs as Array<{ id: number | string; slug: string }>) {
  themes.set(t.slug, t.id)
}

const series = await poserParSlug(
  'series',
  DONNEES.series,
  (s) => {
    const { themeSlugs, imageNom, ...reste } = s as Doc & {
      themeSlugs?: string[]
      imageNom?: string
    }
    return {
      ...reste,
      themes: (themeSlugs ?? []).map((x) => themes.get(x)).filter(Boolean),
      image: imageNom ? fichiers.get(imageNom) : undefined,
    }
  },
  () => 'série(s)',
)

const refs = { themes, tags, auteurices, biblio, series, fichiers }

for (const collection of COLLECTIONS_PUBLICATIONS) {
  const liste = DONNEES.publications[collection] ?? []
  for (const p of liste) {
    const trouve = await payload.find({
      collection,
      where: { title: { equals: p.title } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (trouve.totalDocs > 0) {
      dit('laissé', `${collection} « ${p.title.slice(0, 44)} »`)
      continue
    }
    await payload.create({
      collection,
      data: (await resoudre(p, refs)) as never,
      overrideAccess: true,
    })
    dit('posé', `${collection} « ${p.title.slice(0, 44)} »`)
  }
}

console.log(`\n${poses} entrée(s) posée(s), ${laisses} laissée(s) en place.`)
console.log(`Comptes de démonstration : mot de passe « ${MOT_DE_PASSE_DEMO} ».`)

process.exit(0)
