import { createHash } from 'node:crypto'

import type { GlobalConfig } from 'payload'

import { isAdminOrRoot } from '../access/roles'
import { chargerDemo, dechargerDemo } from '../lib/demo'

/** Condensat d'une clé d'aperçu. Le site compare le même calcul. */
export function hacherClef(clef: string): string {
  return createHash('sha256').update(clef.trim(), 'utf8').digest('hex')
}

/**
 * Options de Tituba — branding visuel + réglages de lecture.
 *
 * L'identité (siteName, authorName, baseline, copyright) vit dans le
 * global `Identity`, les profils sociaux dans `Social`, la nav dans
 * `Navigation`, les hero des landings dans `IndexPages`.
 *
 * Le slug reste `site` pour des raisons de stabilité (URL admin, REST
 * API, données existantes) — le label « Options » est purement
 * cosmétique côté sidebar.
 */
export const Site: GlobalConfig = {
  slug: 'site',
  label: 'Options',
  access: {
    read: () => true,
    update: isAdminOrRoot,
  },
  admin: {
    components: {
      views: {
        edit: {
          root: {
            Component: '@/components/admin/SiteEditView#default',
          },
        },
      },
    },
  },
  hooks: {
    /**
     * La clé d'aperçu, avant écriture.
     *
     * Ce global est lisible sans authentification : une clé stockée en
     * clair partirait dans la réponse publique de l'API, où n'importe
     * qui pourrait la lire — et la restriction d'accès ne restreindrait
     * plus rien. On garde donc le condensat, et le champ en clair est
     * vidé aussitôt.
     *
     * La clé n'est donc jamais conservée : c'est la vue d'administration
     * qui la tire au sort, l'affiche une fois, et l'envoie ici pour
     * qu'on n'en garde que l'empreinte. Personne ne peut la relire
     * ensuite — il faut en tirer une nouvelle.
     */
    beforeChange: [
      ({ data }) => {
        const prep = (data as { preparation?: Record<string, unknown> })?.preparation
        if (!prep) return data

        const saisie = String(prep.clefApercu ?? '').trim()
        if (saisie) {
          prep.clefApercuHash = hacherClef(saisie)
          prep.clefApercu = ''
        }
        return data
      },
    ],
    /**
     * Le chargement du jeu de démonstration.
     *
     * Il se déclenche sur le CHANGEMENT de l'interrupteur, pas sur sa
     * valeur : sans cette comparaison, chaque enregistrement des Options
     * — un changement de couleur, par exemple — relancerait le
     * chargement.
     *
     * Le résultat réel est réécrit dans `demoEtat`, et l'interrupteur
     * remis d'aplomb en cas d'échec. Une case qui dit « chargé » alors
     * que rien ne l'est vaut moins que pas de case du tout.
     */
    afterChange: [
      async ({ context, doc, previousDoc, req }) => {
        // L'écriture de l'état ci-dessous repasse par ici. Sans cette
        // sortie, un chargement en échec — qui remet l'interrupteur dans
        // sa position d'avant — serait vu comme un nouveau changement, et
        // déclencherait l'opération inverse.
        if ((context as { skipDemoHook?: boolean })?.skipDemoHook) return doc

        const avant = Boolean(
          (previousDoc as { preparation?: { demoChargee?: boolean } })?.preparation?.demoChargee,
        )
        const apres = Boolean(
          (doc as { preparation?: { demoChargee?: boolean } })?.preparation?.demoChargee,
        )
        if (avant === apres) return doc

        const horodatage = new Date().toLocaleString('fr-FR')
        let etat: string
        let reussi = true
        try {
          const bilan = apres ? await chargerDemo(req.payload) : await dechargerDemo(req.payload)
          etat = `${horodatage} — ${bilan.message}`
        } catch (err) {
          reussi = false
          etat = `${horodatage} — échec : ${(err as Error).message}`
          req.payload.logger.error({ err }, 'demo_toggle_failed')
        }

        await req.payload.updateGlobal({
          slug: 'site',
          overrideAccess: true,
          data: {
            preparation: {
              ...(doc as { preparation?: Record<string, unknown> }).preparation,
              demoChargee: reussi ? apres : avant,
              demoEtat: etat,
            },
          } as never,
          // Sans quoi ce hook se rappellerait lui-même — et l'écriture
          // de l'état relancerait un chargement.
          context: { skipDemoHook: true },
        })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'branding',
      type: 'group',
      label: 'Branding',
      fields: [
        {
          name: 'accentColor',
          type: 'select',
          required: false,
          label: "Couleur d'accentuation",
          defaultValue: '#5a3a7a',
          options: [
            { label: 'Violet (par défaut)', value: '#5a3a7a' },
            { label: 'Rouge sourd', value: '#8a3a3a' },
            { label: 'Bleu encre', value: '#1f3a5a' },
            { label: 'Gris ardoise', value: '#3a3a3a' },
            { label: 'Vert forêt', value: '#2d5a3d' },
          ],
          admin: {
            description:
              "Teinte d'accent appliquée à tout le site (point de la marque, item nav actif, kickers, liens dans les billets, boutons actifs, etc.).",
          },
        },
        {
          name: 'backgroundColor',
          type: 'select',
          required: false,
          label: 'Couleur de fond',
          defaultValue: '#f6f5f1',
          options: [
            { label: 'Ivoire (par défaut)', value: '#f6f5f1' },
            { label: 'Presque-blanc', value: '#fdfcf8' },
            { label: 'Blanc pur', value: '#ffffff' },
            { label: 'Craie', value: '#f1efe8' },
            { label: 'Parchemin', value: '#eee9dd' },
            { label: 'Froid pâle', value: '#e9eaec' },
          ],
          admin: {
            description:
              'Teinte de fond de Tituba — appliquée au body et aux zones neutres (header, footer, fond des billets, fond admin).',
          },
        },
      ],
    },
    {
      name: 'reading',
      type: 'group',
      label: 'Lecture des billets',
      fields: [
        {
          name: 'notesMode',
          type: 'select',
          required: false,
          label: 'Affichage des notes de bas de page',
          defaultValue: 'classic',
          options: [
            { label: "Classique — toutes les notes en pied d'article", value: 'classic' },
            { label: 'En marge — notes alignées à droite du paragraphe', value: 'sidenotes' },
          ],
          admin: {
            description:
              "Le mode classique empile les notes en bas du billet (style académique). Le mode en marge les place dans une colonne à droite, alignée sur le paragraphe qui les appelle (style « Tufte »). S'applique uniformément à tous les publications de Tituba. Cf issue #6.",
          },
        },
      ],
    },
    {
      /**
       * Trois interrupteurs pour la période qui précède l'ouverture.
       *
       * Indépendants et combinables : on peut vouloir un site ouvert mais
       * non indexé, ou fermé et rempli de démonstration. Ce sont des
       * réglages d'exploitation, pas d'apparence — d'où le groupe à part.
       *
       * ATTENTION : ce global est lisible SANS authentification
       * (`access.read: () => true` plus haut), parce que le site public en
       * a besoin à chaque page. Tout ce qu'on met ici est donc visible de
       * quiconque appelle /cms/api/globals/site. C'est la raison pour
       * laquelle la clé d'aperçu n'y est pas stockée en clair.
       */
      name: 'preparation',
      type: 'group',
      label: 'Avant l’ouverture',
      fields: [
        {
          name: 'noindex',
          type: 'checkbox',
          label: 'Demander aux moteurs de ne pas indexer',
          defaultValue: false,
          admin: {
            description:
              'Pose un « noindex » sur toutes les pages, interdit tout le site dans robots.txt et vide le plan du site. Permet de travailler en ligne sans apparaître dans les résultats de recherche. C’est une demande, pas une garantie : un moteur peut l’ignorer, et une page déjà indexée met du temps à disparaître.',
          },
        },
        {
          name: 'accesRestreint',
          type: 'checkbox',
          label: 'Fermer le site, sauf avec le lien d’aperçu',
          defaultValue: false,
          admin: {
            description:
              'Le site répond « en préparation » à tout le monde, sauf à qui arrive par le lien d’aperçu. L’administration reste joignable normalement.',
          },
        },
        {
          /**
           * Saisie en clair, conservée hachée : un hook la remplace par
           * son condensat à l'enregistrement. Sans cela elle partirait
           * dans la réponse publique de l'API, et n'aurait plus rien d'un
           * secret.
           */
          name: 'clefApercu',
          type: 'text',
          label: 'Clé d’aperçu',
          admin: {
            description:
              'Laisser vide et enregistrer pour qu’une clé soit tirée au sort. Le lien complet s’affiche alors une fois — notez-le. Réenregistrer à vide en tire une nouvelle et invalide l’ancienne.',
          },
        },
        {
          name: 'clefApercuHash',
          type: 'text',
          admin: { hidden: true, readOnly: true },
        },
        {
          name: 'demoChargee',
          type: 'checkbox',
          label: 'Charger les données de démonstration',
          defaultValue: false,
          admin: {
            description:
              'Coché, pose un jeu de faux billets, faux comptes et fausses images, pour montrer à quoi ressemble le site rempli. Décoché, les retire — et seulement eux : ce que vous aurez écrit n’y touche pas.',
          },
        },
        {
          name: 'demoEtat',
          type: 'text',
          label: 'État du jeu de démonstration',
          admin: {
            readOnly: true,
            description:
              'Ce qui s’est réellement passé au dernier changement. Écrit par le serveur, jamais à la main.',
          },
        },
      ],
    },
  ],
}
