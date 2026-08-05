/**
 * Insertion d'un billet d'actu — l'arrêt britannique sur la définition
 * du mot « femme » dans l'Equality Act, et le code d'application qui en
 * découle.
 *
 * Script à usage unique, comme seed-podcast-audio : le corps d'un billet
 * est du Lexical, qui ne se saisit pas commodément à la main dans une
 * requête. Relançable sans dommage — il ne crée rien s'il trouve déjà un
 * billet portant ce titre.
 *
 * Les faits qu'il contient sont sourcés (arrêt du 16 avril 2025 ; code
 * de l'EHRC déposé le 21 mai 2026). Ils restent à revérifier avant
 * publication : un billet d'actu vieillit vite, et celui-ci porte une
 * date d'entrée en vigueur qui pourrait avoir bougé.
 *
 *   pnpm tsx scripts/seed-actu-uksc.ts
 */
import 'dotenv/config';
import { getPayload } from 'payload';

import config from '../src/payload.config';

const TITRE = '*Sexe biologique* : un an après l’arrêt britannique, le code d’application arrive';

const LEDE =
  'En avril 2025, la Cour suprême du Royaume-Uni jugeait que le mot « femme » de l’Equality Act désigne le sexe biologique. Treize mois plus tard, le texte qui traduit cette décision en règles opposables vient d’être déposé devant le Parlement — et c’est là que la portée se joue.';

type Noeud = { kind: 'h2' | 'p'; text: string };

const CORPS: Noeud[] = [
  {
    kind: 'p',
    text: 'Le 16 avril 2025, dans For Women Scotland Ltd v The Scottish Ministers, cinq juges ont tranché à l’unanimité : les mots « homme », « femme » et « sexe » de l’Equality Act 2010 renvoient au sexe biologique. Un certificat de reconnaissance de genre — le GRC britannique — ne modifie donc pas le sexe d’une personne au sens de cette loi. La décision a été lue partout comme une définition juridique de ce qu’est une femme. Elle n’en est pas une, et c’est la première clé.',
  },
  { kind: 'h2', text: 'Une interprétation, pas une définition' },
  {
    kind: 'p',
    text: 'La Cour ne s’est pas prononcée sur ce qu’est une femme. Elle a répondu à une question de technique légistique : quand le Parlement a écrit « sexe » en 2010, entendait-il le sexe tel que modifié par un GRC ? Elle a dit non. C’est de l’interprétation de la loi, pas de l’ontologie — et l’arrêt lui-même met en garde contre une lecture en termes de victoire d’un groupe sur un autre, rappelant que les personnes trans restent protégées par la caractéristique « gender reassignment ».',
  },
  {
    kind: 'p',
    text: 'Distinguer les deux registres n’est pas une nuance de juriste. C’est ce qui permet de voir qu’un même mot ne recouvre pas la même chose selon le texte où il figure, et qu’une décision sur l’Equality Act ne dit rien du droit de la santé, de l’état civil ou du droit pénal.',
  },
  { kind: 'h2', text: 'Le terrain décisif est ailleurs' },
  {
    kind: 'p',
    text: 'Un arrêt fixe une interprétation ; il n’écrit pas les règles d’usage. Ce sont elles qui décident qui entre où. Le code de bonnes pratiques révisé de l’Equality and Human Rights Commission, déposé devant le Parlement le 21 mai 2026, énonce que les services non mixtes se fondent sur le sexe biologique et que les personnes trans ne doivent pas accéder à ceux destinés à l’autre sexe. Une fois en vigueur, ce code a valeur statutaire.',
  },
  {
    kind: 'p',
    text: 'Deuxième clé : sur ce type de question, le texte qui produit les effets n’est presque jamais celui qui fait les titres. Il arrive un an après, par voie administrative, et se discute dans des consultations que personne ne couvre.',
  },
  { kind: 'h2', text: 'Protégé et exclu' },
  {
    kind: 'p',
    text: 'Le dispositif tient une position que le sens commun lit comme contradictoire : une personne trans reste protégée contre la discrimination fondée sur le parcours de transition, et se voit réglementairement écartée de certains espaces. Juridiquement, les deux coexistent — l’Equality Act protège une caractéristique sans garantir l’accès à tout service.',
  },
  {
    kind: 'p',
    text: 'Troisième clé : ne pas lire « protégé » et « exclu » comme un paradoxe, mais regarder ce que chaque terme couvre exactement. C’est dans cet écart que se joueront les contentieux annoncés.',
  },
];

function texte(t: string) {
  return {
    type: 'text',
    text: t,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    version: 1,
  };
}

function corpsLexical(noeuds: Noeud[]) {
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children: noeuds.map((n) =>
        n.kind === 'h2'
          ? {
              type: 'heading',
              tag: 'h2',
              version: 1,
              direction: 'ltr' as const,
              format: '' as const,
              indent: 0,
              children: [texte(n.text)],
            }
          : {
              type: 'paragraph',
              version: 1,
              direction: 'ltr' as const,
              format: '' as const,
              indent: 0,
              children: [texte(n.text)],
            },
      ),
    },
  };
}

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  const existant = await payload.find({
    collection: 'actus',
    where: { title: { equals: TITRE } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existant.docs.length > 0) {
    console.log(`déjà présent : #${existant.docs[0].id} — rien à faire`);
    return;
  }

  // Thématique « Genre et justice » si elle existe : c'est celle des
  // actus voisines. Absente, le billet part sans thématique plutôt que
  // d'en inventer une.
  const themes = await payload.find({
    collection: 'themes',
    where: { name: { like: 'justice' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const themeId = themes.docs[0]?.id;

  const doc = await payload.create({
    collection: 'actus',
    data: {
      title: TITRE,
      lede: LEDE,
      body: corpsLexical(CORPS) as never,
      themes: themeId ? [themeId] : [],
      publishedAt: new Date().toISOString(),
      // Publié d'emblée : le billet est complet et sourcé, et le laisser
      // en brouillon obligerait à aller le décocher pour le voir.
      draft: false,
    },
    overrideAccess: true,
  });

  console.log(`billet créé : #${doc.id} — /actus/${(doc as { publicId?: string }).publicId}/`);
  console.log(`thématique : ${themeId ? themes.docs[0].name : 'aucune trouvée'}`);
}

void main().then(() => process.exit(0));
