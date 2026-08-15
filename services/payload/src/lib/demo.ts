/**
 * Le jeu de démonstration : le poser, le retirer.
 *
 * Deux appelants, une seule logique :
 *
 *   - `scripts/seed-test.ts`, en ligne de commande ;
 *   - l'interrupteur « Charger les données de démonstration » des
 *     Options, dont le hook appelle ces mêmes fonctions.
 *
 * Écrire la logique deux fois aurait garanti qu'elles divergent : celle
 * de l'admin aurait posé ce que celle du script ne sait pas retirer.
 *
 * ─── Ce qui rend le retrait sûr ─────────────────────────────────────
 *
 * Chaque document posé ici porte `demo: true`. Le retrait supprime ce
 * qui porte cette marque, et rien d'autre. C'est ce qui permet de
 * décharger la démonstration d'une base où l'on a commencé à écrire
 * pour de vrai, sans avoir à distinguer quoi que ce soit à la main.
 *
 * La version précédente reconnaissait ses billets à leur titre. Ça tient
 * tant que personne n'écrit un vrai billet portant le même, et ça se
 * tait le jour où ça arrive.
 *
 * ─── Les fichiers sont fabriqués ────────────────────────────────────
 *
 * Images unies par sharp, son de synthèse et PDF écrits octet par octet.
 * Aucun réseau, aucun binaire de plus, un résultat identique à chaque
 * exécution — et 308 ko au lieu des 38 Mo des vrais fichiers, qui n'ont
 * rien à faire dans le dépôt.
 */
import fs from 'node:fs'
import path from 'node:path'

import type { Payload } from 'payload'
import sharp from 'sharp'

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
 * En clair et le même pour tous : ce sont de faux comptes. Aller le
 * chercher dans un fichier pour se connecter à un jeu d'essai fait
 * perdre du temps sans rien protéger. Ces comptes ne peuvent pas
 * publier — ils n'existent que pour signer des billets fictifs.
 */
export const MOT_DE_PASSE_DEMO = 'demonstration-tituba'

const PUBLICATIONS = ['articles', 'analyses', 'actus', 'podcasts', 'outils'] as const

/** Toutes les collections que la démonstration remplit, dans l'ordre où
 *  il faut les vider : ce qui pointe avant ce qui est pointé. */
const A_VIDER = [...PUBLICATIONS, 'series', 'tags', 'bibliography', 'media', 'users'] as const

/**
 * Le fichier de données, résolu depuis la racine du service.
 *
 * `process.cwd()` et non un chemin relatif au module : ce fichier est
 * compilé par Next, et sa position dans `.next/` n'a rien à voir avec
 * celle du source. La racine, elle, est la même en développement et dans
 * le conteneur (`WORKDIR /app`).
 */
function lireDonnees(): Donnees {
  const chemin = path.join(process.cwd(), 'scripts', 'data', 'test.json')
  return JSON.parse(fs.readFileSync(chemin, 'utf8')) as Donnees
}

// ─── Fabrication des fichiers ────────────────────────────────────────

/** Teinte stable tirée du nom : deux exécutions donnent la même image. */
function teinte(nom: string): number {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

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

/** Trois secondes de la4, en WAV — de quoi éprouver le lecteur. */
function fabriquerAudio(): Buffer {
  const echantillonnage = 22_050
  const total = echantillonnage * 3
  const donnees = Buffer.alloc(total * 2)
  for (let i = 0; i < total; i++) {
    const enveloppe = 1 - i / total
    const v = Math.sin((2 * Math.PI * 440 * i) / echantillonnage) * 12_000 * enveloppe
    donnees.writeInt16LE(Math.round(v), i * 2)
  }
  const entete = Buffer.alloc(44)
  entete.write('RIFF', 0)
  entete.writeUInt32LE(36 + donnees.length, 4)
  entete.write('WAVE', 8)
  entete.write('fmt ', 12)
  entete.writeUInt32LE(16, 16)
  entete.writeUInt16LE(1, 20)
  entete.writeUInt16LE(1, 22)
  entete.writeUInt32LE(echantillonnage, 24)
  entete.writeUInt32LE(echantillonnage * 2, 28)
  entete.writeUInt16LE(2, 32)
  entete.writeUInt16LE(16, 34)
  entete.write('data', 36)
  entete.writeUInt32LE(donnees.length, 40)
  return Buffer.concat([entete, donnees])
}

/** Un PDF d'une page, portant son nom. Cinq objets suffisent. */
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
 * Titre du média — et non son nom de fichier — comme clé de
 * reconnaissance : Payload renumérote un fichier dont le nom est déjà
 * pris sur le disque (`image-1.jpg` devient `image-8.jpg`), si bien
 * qu'une recherche par nom de fichier ne retrouve jamais rien.
 */
const titreMedia = (nom: string): string => `Démonstration — ${nom}`

// ─── Chargement ──────────────────────────────────────────────────────

export type Bilan = { poses: number; laisses: number; message: string }

export async function chargerDemo(payload: Payload): Promise<Bilan> {
  const D = lireDonnees()
  let poses = 0
  let laisses = 0

  // Sans thématiques, rien ne se rattache : les billets seraient posés
  // sans classement, et invisibles des pages qui les listent.
  const themesExistants = await payload.find({
    collection: 'themes',
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  if (themesExistants.totalDocs === 0) {
    throw new Error(
      'Aucune thématique en base : lancez le seed de configuration avant de charger la démonstration.',
    )
  }

  // Fichiers
  const fichiers = new Map<string, number | string>()
  for (const { nom, role } of D.fichiers) {
    const trouve = await payload.find({
      collection: 'media',
      where: { title: { equals: titreMedia(nom) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existant = trouve.docs[0] as { id: number | string } | undefined
    if (existant) {
      fichiers.set(nom, existant.id)
      laisses++
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
        alt: role === 'image' ? `Image de démonstration ${nom}, aplat de couleur` : undefined,
        demo: true,
      } as never,
      file: {
        data,
        name: `${nom}.${EXTENSIONS[role]}`,
        mimetype: TYPES_MIME[role],
        size: data.length,
      },
    })
    fichiers.set(nom, cree.id)
    poses++
  }

  // Auteur·ices
  const auteurices = new Map<string, number | string>()
  for (const a of D.auteurices) {
    const trouve = await payload.find({
      collection: 'users',
      where: { email: { equals: a.email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existant = trouve.docs[0] as { id: number | string } | undefined
    if (existant) {
      auteurices.set(a.email, existant.id)
      laisses++
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
        demo: true,
      } as never,
    })
    auteurices.set(a.email, cree.id)
    poses++
  }

  // Taxonomies et références, reconnues à leur slug
  async function poserParSlug(
    collection: 'tags' | 'bibliography' | 'series',
    entrees: Array<Doc & { slug: string }>,
    prepare: (e: Doc & { slug: string }) => Doc,
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
        data: { ...prepare(e), demo: true } as never,
        overrideAccess: true,
      })
      parSlug.set(e.slug, cree.id)
      poses++
    }
    return parSlug
  }

  const tags = await poserParSlug('tags', D.tags as Array<Doc & { slug: string }>, (t) => t)
  const biblio = await poserParSlug('bibliography', D.bibliography, (b) => b)

  const themes = new Map<string, number | string>()
  const tousThemes = await payload.find({
    collection: 'themes',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const t of tousThemes.docs as Array<{ id: number | string; slug: string }>) {
    themes.set(t.slug, t.id)
  }

  const series = await poserParSlug('series', D.series, (s) => {
    const { themeSlugs, imageNom, ...reste } = s as Doc & {
      themeSlugs?: string[]
      imageNom?: string
    }
    return {
      ...reste,
      themes: (themeSlugs ?? []).map((x) => themes.get(x)).filter(Boolean),
      image: imageNom ? fichiers.get(imageNom) : undefined,
    }
  })

  // Publications
  for (const collection of PUBLICATIONS) {
    for (const p of D.publications[collection] ?? []) {
      const trouve = await payload.find({
        collection,
        where: { title: { equals: p.title } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (trouve.totalDocs > 0) {
        laisses++
        continue
      }
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

      // Les ressources d'un outil portent chacune leur fichier, imbriqué :
      // un cas que la traduction générale des relations ne voit pas, et
      // qui fait échouer l'insertion sur une clé étrangère.
      const resources = Array.isArray(corps.resources)
        ? (corps.resources as Array<Record<string, unknown>>).map((r) => {
            const { fichierNom, ...reste } = r as { fichierNom?: string }
            return { ...reste, fichier: fichierNom ? fichiers.get(fichierNom) : undefined }
          })
        : undefined

      await payload.create({
        collection,
        overrideAccess: true,
        data: {
          ...corps,
          ...(resources ? { resources } : {}),
          themes: (themeSlugs ?? []).map((s) => themes.get(s)).filter(Boolean),
          tags: (tagSlugs ?? []).map((s) => tags.get(s)).filter(Boolean),
          authors: (authorEmails ?? []).map((e) => auteurices.get(e)).filter(Boolean),
          bibliography: (biblioSlugs ?? []).map((s) => biblio.get(s)).filter(Boolean),
          series: serieSlug ? series.get(serieSlug) : undefined,
          image: imageNom ? fichiers.get(imageNom) : undefined,
          audio: audioNom ? fichiers.get(audioNom) : undefined,
          demo: true,
          // Déjà « notifié » : poser un jeu d'essai n'est pas une
          // parution, et sans cette date le hook d'alerte enverrait un
          // mail par billet posé.
          notificationsSentAt: new Date().toISOString(),
        } as never,
      })
      poses++
    }
  }

  return {
    poses,
    laisses,
    message:
      poses === 0
        ? `Déjà en place — ${laisses} entrée(s) trouvées, rien à poser.`
        : `${poses} entrée(s) posée(s)${laisses > 0 ? `, ${laisses} déjà présente(s)` : ''}.`,
  }
}

// ─── Déchargement ────────────────────────────────────────────────────

/**
 * Retire ce qui porte la marque, et rien d'autre.
 *
 * L'ordre compte : une thématique ou un média encore rattaché à un
 * billet ne peut pas être supprimé, Postgres refuse. On retire donc les
 * publications d'abord, ce qui libère tout le reste.
 */
export async function dechargerDemo(payload: Payload): Promise<Bilan> {
  let retires = 0
  const details: string[] = []

  for (const collection of A_VIDER) {
    const { docs } = await payload.find({
      collection,
      where: { demo: { equals: true } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) {
      await payload.delete({ collection, id: d.id, overrideAccess: true })
    }
    if (docs.length > 0) {
      retires += docs.length
      details.push(`${docs.length} ${collection}`)
    }
  }

  return {
    poses: 0,
    laisses: 0,
    message:
      retires === 0
        ? 'Rien à retirer — aucune donnée de démonstration en base.'
        : `${retires} entrée(s) retirée(s) : ${details.join(', ')}.`,
  }
}
