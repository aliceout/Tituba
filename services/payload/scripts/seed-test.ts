/**
 * Seed de test — le jeu de démonstration, en ligne de commande.
 *
 *   pnpm --dir services/payload seed:test            pose
 *   pnpm --dir services/payload seed:test --retirer  retire
 *
 * La logique n'est pas ici : elle est dans `src/lib/demo.ts`, partagée
 * avec l'interrupteur « Charger les données de démonstration » des
 * Options. Deux implémentations auraient fini par diverger — celle de
 * l'admin posant ce que celle du script ne sait pas retirer.
 *
 * Ce fichier ne fait que trois choses : décider si l'on a le droit de
 * tourner, ouvrir une instance Payload, et rendre compte.
 *
 * ─── Le garde-fou de production ─────────────────────────────────────
 *
 * Refuse `NODE_ENV=production`, sauf `--en-production` explicite. Le
 * jeu est fait pour montrer un site rempli avant son ouverture ; poser
 * de faux billets sur un site en service se remarque, mais toujours
 * trop tard. Le drapeau existe parce que ce cas est légitime — montrer
 * la mise en page à quelqu'un avant d'écrire — et parce qu'un refus
 * qu'on ne peut pas lever se contourne par des moyens pires.
 *
 * Le retrait, lui, n'a jamais besoin de permission : retirer de faux
 * billets d'une base de production est toujours une bonne idée.
 */
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { chargerDemo, dechargerDemo, MOT_DE_PASSE_DEMO } from '../src/lib/demo'

const RETIRER = process.argv.includes('--retirer') || process.argv.includes('--reset')
const EN_PRODUCTION = process.argv.includes('--en-production')

if (!RETIRER && process.env.NODE_ENV === 'production' && !EN_PRODUCTION) {
  console.error(
    '\nRefus : NODE_ENV vaut « production ».\n\n' +
      'Ce seed pose de fausses données ; sur une base en service, elles se\n' +
      "mêleraient aux vraies. Si c'est bien ce que vous voulez — montrer la\n" +
      'mise en page avant la première parution — relancez avec --en-production.\n' +
      'Les données seront marquées, et `--retirer` les enlèvera toutes.\n',
  )
  process.exit(1)
}

const payload = await getPayload({ config })

try {
  const bilan = RETIRER ? await dechargerDemo(payload) : await chargerDemo(payload)
  console.log(`\n${bilan.message}`)
  if (!RETIRER && bilan.poses > 0) {
    console.log(`Comptes de démonstration : mot de passe « ${MOT_DE_PASSE_DEMO} ».`)
  }
} catch (err) {
  console.error(`\nÉchec : ${(err as Error).message}\n`)
  process.exit(1)
}

process.exit(0)
