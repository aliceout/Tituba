/**
 * Retire les rattachements en double dans la bibliographie des billets.
 *
 * Usage : `pnpm --dir services/payload tsx scripts/dedoublonne-biblio.ts`
 *         (ajouter `--ecrire` pour appliquer ; sans, il ne fait que dire)
 *
 * L'import de document rattachait une référence autant de fois qu'elle
 * était citée : onze notes renvoyant à la même source produisaient onze
 * rattachements. La bibliographie du billet affichait alors onze fois la
 * même entrée — et onze éléments portant le même `id` dans le HTML, si
 * bien que les renvois numérotés du corps pointaient tous sur le premier.
 *
 * Le défaut est corrigé à la source (cf. `onLier` dans
 * PublicationEditView.client.tsx) ; ce script répare ce qui a été écrit
 * avant. Il est sans effet une fois passé.
 *
 * L'ordre est conservé : la première occurrence reste à sa place, les
 * suivantes disparaissent. C'est lui qui donne leur numéro aux entrées.
 */
// La configuration lit ses secrets depuis le .env de la racine, comme
// les autres scripts de ce dossier.
import { getPayload } from 'payload'

import config from '../src/payload.config'

const COLLECTIONS = ['articles', 'analyses', 'actus', 'podcasts', 'outils'] as const
const ECRIRE = process.argv.includes('--ecrire')

const payload = await getPayload({ config })

let touches = 0
let retires = 0

for (const collection of COLLECTIONS) {
  const { docs } = await payload.find({
    collection,
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
  })

  for (const doc of docs) {
    const liste = ((doc as { bibliography?: unknown[] }).bibliography ?? []) as Array<
      number | string | { id: number | string }
    >
    if (liste.length < 2) continue

    const vus = new Set<string>()
    const propre = liste.filter((entree) => {
      const cle = String(typeof entree === 'object' && entree ? entree.id : entree)
      if (vus.has(cle)) return false
      vus.add(cle)
      return true
    })
    if (propre.length === liste.length) continue

    const enTrop = liste.length - propre.length
    touches++
    retires += enTrop
    console.log(
      `${collection}/${(doc as { publicId?: string }).publicId ?? doc.id} : ` +
        `${liste.length} → ${propre.length} (${enTrop} en trop)`,
    )

    if (ECRIRE) {
      await payload.update({
        collection,
        id: doc.id,
        data: {
          bibliography: propre.map((e) => (typeof e === 'object' && e ? e.id : e)),
        } as never,
        overrideAccess: true,
        // Pas de nouvelle version pour une réparation technique : elle
        // encombrerait l'historique éditorial sans rien y dire.
        draft: false,
      })
    }
  }
}

console.log(
  touches === 0
    ? '\nAucun doublon.'
    : `\n${touches} billet(s), ${retires} rattachement(s) en trop` +
        (ECRIRE ? ' — retirés.' : ' — relancer avec --ecrire pour les retirer.'),
)

process.exit(0)
