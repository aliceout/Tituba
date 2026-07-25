/**
 * Seed dev — charge les données fictives du handoff design dans Payload.
 *
 * Usage : `pnpm seed:dev` (depuis services/payload/) ou directement
 *         `pnpm --dir services/payload seed:dev` depuis la racine.
 *
 * Idempotent : skip les entrées qui existent déjà (matching par slug).
 * Avec flag `--reset` : wipe les collections Posts/Themes/Bibliography/Pages
 * avant d'insérer, pour repartir d'un état propre.
 *
 * Safety : refuse de tourner si NODE_ENV=production (évite d'écraser
 * la base prod par accident, même si le secret POSTGRES_PASSWORD ne
 * matche pas).
 *
 * Source de vérité : Design/design_handoff_carnet/carnet-b-app.jsx
 *  → POLES (8 thèmes), POSTS (13 billets), Article (corps + biblio + lede),
 *  → About (bio Michel + Terrains/Recherche/Publications/Colophon).
 */

import { getPayload } from 'payload';
import config from '../src/payload.config';

const RESET = process.argv.includes('--reset');

if (process.env.NODE_ENV === 'production') {
  console.error('[seed-dev] refus : NODE_ENV=production. Aborting.');
  process.exit(1);
}

// ─── Données ─────────────────────────────────────────────────────

const THEMES = [
  { slug: 'genre-geopolitique', name: 'Genre & géopolitique', description: "Comment le genre devient un opérateur de la politique internationale — et inversement." },
  { slug: 'lgbtqi-international', name: 'LGBTQI+ & international', description: "Vingt ans de diplomatie autour de l'orientation sexuelle et de l'identité de genre, lus depuis le Sud." },
  { slug: 'humanitaire-genre', name: 'Humanitaire & genre', description: "Ce que mes années de coordination humanitaire m'ont enseigné sur les angles morts de l'aide internationale." },
  { slug: 'migrations-exil', name: 'Migrations & exil', description: "Persécutions liées au genre, statut de réfugié·e LGBTQI+, jurisprudence en mouvement." },
  { slug: 'conflits-minorites', name: 'Conflits & minorités', description: "Les minorités de genre dans la guerre — Ukraine, RDC, Centrafrique, ailleurs." },
  { slug: 'theorie-feministe', name: 'Théorie féministe', description: 'Lectures et relectures de la théorie féministe contemporaine.' },
  { slug: 'queer-theory', name: 'Queer theory', description: 'Relectures de la théorie queer américaine et de ses réceptions francophones.' },
  { slug: 'postcolonial', name: 'Postcolonial', description: 'Lectures situées des études postcoloniales.' },
];

// Type local pour le seed — aligné sur la collection Bibliography (cf.
// payload-types.ts → interface Bibliography). Sans cette annotation, TS
// élargit `type: 'book'` en `string` et payload.create({ data: entry })
// rejette à la compilation.
type BibAuthorSeed = {
  lastName: string;
  firstName?: string;
  role: 'author' | 'editor' | 'translator';
};

type BiblioSeed = {
  slug: string;
  authors: BibAuthorSeed[];
  year: number;
  title: string;
  type: 'book' | 'chapter' | 'article' | 'paper' | 'web' | 'other';
  // `source` est required côté collection (avec defaultValue 'manual').
  // Sans cette annotation, TS bascule sur l'overload « draft create »
  // de payload.create() et exige `draft: true`. Les seeds sont toujours
  // des refs saisies à la main.
  source: 'manual';
  publisher?: string;
  place?: string;
  journal?: string;
  volume?: string;
  pages?: string;
};

const BIBLIOGRAPHY: BiblioSeed[] = [
  {
    slug: 'farris-2017',
    authors: [{ lastName: 'Farris', firstName: 'Sara R.', role: 'author' }],
    year: 2017,
    title: "In the Name of Women's Rights. The Rise of Femonationalism",
    type: 'book',
    source: 'manual',
    publisher: 'Duke University Press',
    place: 'Durham',
  },
  {
    slug: 'massad-2007',
    authors: [{ lastName: 'Massad', firstName: 'Joseph', role: 'author' }],
    year: 2007,
    title: 'Desiring Arabs',
    type: 'book',
    source: 'manual',
    publisher: 'University of Chicago Press',
    place: 'Chicago',
  },
  {
    slug: 'puar-2007',
    authors: [{ lastName: 'Puar', firstName: 'Jasbir K.', role: 'author' }],
    year: 2007,
    title: 'Terrorist Assemblages. Homonationalism in Queer Times',
    type: 'book',
    source: 'manual',
    publisher: 'Duke University Press',
    place: 'Durham',
  },
  {
    slug: 'saiz-2014',
    authors: [{ lastName: 'Saiz', firstName: 'Ignacio', role: 'author' }],
    year: 2014,
    title: 'Bracketing Sexuality',
    type: 'article',
    source: 'manual',
    journal: 'Health and Human Rights',
    volume: 'vol. 6, n° 2',
    pages: '43-82',
  },
];

type SeedPost = {
  numero: number;
  slug: string;
  title: string;
  type: 'analyse' | 'note' | 'fiche';
  themeSlugs: string[];
  publishedAt: string; // ISO YYYY-MM-DD
  lede: string;
  bodyParagraphs: BodyNode[];
  biblioSlugs?: string[];
  draft?: boolean;
};

/**
 * Node de body : on supporte un mode "rich paragraph" qui contient une
 * liste de fragments inline — texte simple, footnote, ou biblio inline
 * (référence vers une entrée Bibliography par slug).
 */
type InlineFragment =
  | { kind: 'text'; text: string }
  | { kind: 'footnote'; content: string }
  | { kind: 'biblio'; biblioSlug: string; prefix?: string; suffix?: string };

type BodyNode =
  | { kind: 'p'; text: string }
  | { kind: 'pr'; fragments: InlineFragment[] }
  | { kind: 'h2'; text: string }
  | { kind: 'blockquote'; text: string };

const POSTS: SeedPost[] = [
  {
    numero: 42,
    slug: 'homonationalisme-diplomatie',
    title: "L'homonationalisme a-t-il une diplomatie ? Retour sur dix ans de discours sur les droits LGBTQI+ aux Nations unies",
    type: 'analyse',
    themeSlugs: ['genre-geopolitique', 'lgbtqi-international'],
    publishedAt: '2026-04-14',
    lede: "En 2011, le Conseil des droits de l'homme adoptait sa première résolution sur l'orientation sexuelle. Quinze ans plus tard, l'instrumentalisation de cet acquis dessine une ligne de fracture qui traverse aussi bien le « bloc occidental » que ses contestataires.",
    biblioSlugs: ['farris-2017', 'massad-2007', 'puar-2007', 'saiz-2014'],
    bodyParagraphs: [
      {
        kind: 'pr',
        fragments: [
          {
            kind: 'text',
            text: "Lorsque le Conseil des droits de l'homme des Nations unies adopte, en juin 2011, sa résolution 17/19 sur l'orientation sexuelle et l'identité de genre, le geste paraît modeste : un texte court, voté à une majorité étroite (23 voix contre 19), demandant un rapport au Haut-Commissariat. Ce vote constitue pourtant le précédent ; tout ce que je veux examiner ici en découle ou s'y oppose",
          },
          {
            kind: 'footnote',
            content:
              "Sur le contexte du vote, voir Saiz (2014), p. 47 sq. — référence essentielle pour comprendre la stratégie sud-africaine.",
          },
          { kind: 'text', text: '.' },
        ],
      },
      {
        kind: 'pr',
        fragments: [
          {
            kind: 'text',
            text: "Quinze ans plus tard, le paysage diplomatique a basculé. La défense des droits LGBTQI+ est devenue, tour à tour, un marqueur d'identité occidentale, une monnaie dans les rapports Nord-Sud, un enjeu de polarisation interne dans les démocraties libérales, et un vecteur d'instrumentalisation tant par certains États « progressistes » que par leurs adversaires déclarés",
          },
          {
            kind: 'footnote',
            content:
              "Je reprends, en la déplaçant, la formule de Puar (2007) sur l'« assemblage » homonationaliste.",
          },
          { kind: 'text', text: '.' },
        ],
      },
      { kind: 'h2', text: 'I — La résolution comme acte fondateur' },
      {
        kind: 'p',
        text: "Il faut revenir à la séquence elle-même. Le projet sud-africain, soutenu par le Brésil, prend forme dans un contexte où l'Afrique du Sud post-apartheid se rêve médiatrice morale du Sud global. La résolution n'aurait pas la même portée si elle avait été portée par la France ou les Pays-Bas : c'est précisément l'origine non occidentale du texte qui rend son adoption politiquement coûteuse pour les opposants.",
      },
      {
        kind: 'pr',
        fragments: [
          {
            kind: 'text',
            text: "On peut objecter que cette généalogie a été rapidement effacée. Dès 2013, le Free and Equal campaign du Haut-Commissariat est porté par des voix essentiellement anglo-saxonnes ",
          },
          { kind: 'biblio', biblioSlug: 'massad-2007', prefix: 'cf.' },
          {
            kind: 'text',
            text: ". La diplomatie américaine, sous Obama puis Biden, fait des droits LGBTQI+ un axe explicite de sa politique étrangère",
          },
          {
            kind: 'footnote',
            content:
              "Voir le Presidential Memorandum on International Initiatives to Advance the Human Rights of LGBT Persons, 6 décembre 2011.",
          },
          {
            kind: 'text',
            text: ". La France, plus tardivement et plus discrètement, lui emboîte le pas.",
          },
        ],
      },
      {
        kind: 'blockquote',
        text: "Le pinkwashing n'est pas le mensonge d'un État qui maquillerait sa violence ; c'est le travail quotidien de redéfinition de ce que vaut, internationalement, la qualité d'État de droit.",
      },
      { kind: 'h2', text: 'II — Trois discours, trois États' },
      {
        kind: 'pr',
        fragments: [
          {
            kind: 'text',
            text: "Pour rendre tangible cette mécanique, il faut comparer trois cas. Le premier est celui d'Israël, qui a fait des droits LGBTQI+ un argument central de sa brand identity internationale dès le milieu des années 2000. Le deuxième est celui des Pays-Bas, dont la diplomatie gay-friendly est plus ancienne et plus institutionnalisée mais infléchie depuis 2024. Le troisième est celui de la Fédération de Russie, qui mobilise depuis 2013 le rejet des « valeurs LGBTQ » comme étendard d'une diplomatie « anti-impérialiste » à destination du Sud global",
          },
          {
            kind: 'footnote',
            content:
              "Sur la séquence russe, voir l'analyse en cours dans le billet « Quand les marges remontent au centre ».",
          },
          { kind: 'text', text: '.' },
        ],
      },
      {
        kind: 'pr',
        fragments: [
          {
            kind: 'text',
            text: "Ce dernier point mérite qu'on s'y arrête. Le récit russe est efficace précisément parce qu'il s'appuie sur l'asymétrie hégémonique du discours pro-LGBTQI+ — comme l'a montré ",
          },
          { kind: 'biblio', biblioSlug: 'puar-2007' },
          {
            kind: 'text',
            text: " : si ce discours apparaît comme un produit d'exportation occidental, son rejet apparaît comme un acte de souveraineté. C'est cette ambiguïté que mes terrains en Centrafrique et en RDC m'ont forcée à prendre au sérieux.",
          },
        ],
      },
      { kind: 'h2', text: 'III — La fracture sud-américaine' },
      {
        kind: 'p',
        text: "Reste un cas qui ne rentre dans aucune des deux cases précédentes : celui de l'Amérique latine, où des États au profil très différent (Argentine, Brésil, Chili, Colombie, Mexique) ont, à des moments différents, porté les mêmes textes au Conseil des droits de l'homme — sans qu'on puisse parler d'un « bloc » homogène, ni d'un alignement net sur l'agenda nord-américain.",
      },
    ],
  },
  {
    numero: 41,
    slug: 'directive-2024-1346',
    title: "Sortir de l'« exception » : le statut de réfugié·e LGBTQI+ après la directive 2024/1346",
    type: 'analyse',
    themeSlugs: ['migrations-exil', 'lgbtqi-international'],
    publishedAt: '2026-04-02',
    lede: "La directive européenne adoptée en décembre 2024 réécrit, sans le dire, les conditions d'examen de la persécution liée au genre. Lecture critique.",
    bodyParagraphs: [
      { kind: 'p', text: "La directive 2024/1346, adoptée en décembre 2024 dans le cadre du Pacte européen sur la migration et l'asile, modifie en profondeur les conditions d'examen des demandes fondées sur la persécution liée au genre — sans que cette inflexion ait été nommée comme telle dans les débats." },
      { kind: 'p', text: "L'enjeu est moins juridique que politique : c'est dans les considérants, pas dans le dispositif, que se loge le déplacement. Cette analyse propose une lecture serrée du texte à la lumière de la jurisprudence CJUE des dix dernières années." },
    ],
  },
  {
    numero: 9,
    slug: 'pinkwashing',
    title: 'Pinkwashing : généalogie, usages, contre-usages',
    type: 'fiche',
    themeSlugs: ['lgbtqi-international'],
    publishedAt: '2026-04-01',
    lede: 'Synthèse outillée pour étudiant·es et journalistes. Mise à jour régulière.',
    bodyParagraphs: [
      { kind: 'p', text: "Le terme « pinkwashing » désigne l'instrumentalisation des droits LGBTQI+ comme façade pour détourner l'attention d'autres violations. Cette fiche en propose une généalogie, des usages contemporains et quelques contre-usages." },
      { kind: 'h2', text: 'Origine du terme' },
      { kind: 'p', text: "Le mot apparaît au début des années 2000 dans le contexte de la critique de Tel-Aviv comme « gay-friendly capital », popularisé par Sarah Schulman dans les années 2010." },
    ],
  },
  {
    numero: 17,
    slug: 'farris-relecture',
    title: "Sara R. Farris, In the Name of Women's Rights (Duke UP, 2017) — relecture",
    type: 'note',
    themeSlugs: ['theorie-feministe'],
    publishedAt: '2026-03-28',
    lede: "Huit ans après sa parution, le concept de fémonationalisme reste l'un des plus opératoires pour penser les usages politiques du féminisme.",
    biblioSlugs: ['farris-2017'],
    bodyParagraphs: [
      { kind: 'p', text: "Relire Farris en 2026, après le démantèlement progressif des conquis sociaux dans plusieurs pays européens, c'est mesurer la lucidité de son diagnostic et l'usure de certains de ses concepts." },
      { kind: 'p', text: "Le fémonationalisme — l'instrumentalisation politique des droits des femmes par des forces nationalistes — n'est plus un objet émergent : c'est devenu un mode de gouvernement majoritaire dans plusieurs États européens. Cette note propose un point d'étape." },
    ],
  },
  {
    numero: 40,
    slug: 'wps-1325',
    title: 'Femmes, paix, sécurité : la résolution 1325 a vingt-cinq ans, et après ?',
    type: 'analyse',
    themeSlugs: ['humanitaire-genre'],
    publishedAt: '2026-03-18',
    lede: "Ce qu'on a obtenu, ce qu'on a perdu, et ce que la résolution n'a jamais voulu dire.",
    bodyParagraphs: [
      { kind: 'p', text: "Adoptée en octobre 2000, la résolution 1325 du Conseil de sécurité a fondé l'agenda Femmes, paix et sécurité. Vingt-cinq ans plus tard, le bilan est ambivalent." },
      { kind: 'p', text: "On peut compter les acquis (mainstreaming dans les missions onusiennes, plans nationaux d'action) et les pertes (recul des plans dans plusieurs pays, instrumentalisation contre les droits sexuels et reproductifs)." },
    ],
  },
  {
    numero: 16,
    slug: 'puar-vingt-ans',
    title: 'Jasbir K. Puar, Terrorist Assemblages, vingt ans après',
    type: 'note',
    themeSlugs: ['queer-theory'],
    publishedAt: '2026-03-14',
    lede: "Relire Puar à l'âge de la guerre permanente.",
    biblioSlugs: ['puar-2007'],
    bodyParagraphs: [
      { kind: 'p', text: "Vingt ans après Terrorist Assemblages, l'« homonationalisme » est devenu un terme courant dans la littérature militante anglophone. Sa transposition francophone a été plus heurtée." },
      { kind: 'p', text: "Cette note revient sur ce que la traduction française a perdu, ce qu'elle a déplacé, et pourquoi le concept reste opératoire pour penser les diplomaties LGBTQI+ contemporaines." },
    ],
  },
  {
    numero: 7,
    slug: 'persecution-genre',
    title: 'Persécution liée au genre : cadres juridiques internationaux',
    type: 'fiche',
    themeSlugs: ['migrations-exil'],
    publishedAt: '2026-03-07',
    lede: 'Convention de Genève, directive qualification, jurisprudence CJUE et CNDA.',
    bodyParagraphs: [
      { kind: 'p', text: "Cette fiche thématique synthétise les cadres juridiques internationaux applicables aux persécutions liées au genre : Convention de Genève (1951), directive qualification (2024/1346), jurisprudence CJUE et CNDA." },
      { kind: 'h2', text: 'Convention de Genève' },
      { kind: 'p', text: "L'article 1 A 2 de la Convention de 1951 reconnaît la persécution liée à l'« appartenance à un certain groupe social » — interprétation qui a évolué pour inclure le genre et l'orientation sexuelle." },
    ],
  },
  {
    numero: 39,
    slug: 'centrafrique-terrains',
    title: "Centrafrique 2014–2018 : terrains d'une humanitaire qui ne savait pas encore",
    type: 'analyse',
    themeSlugs: ['humanitaire-genre'],
    publishedAt: '2026-03-04',
    lede: 'Note réflexive, à mi-chemin entre carnet de terrain et auto-analyse.',
    bodyParagraphs: [
      { kind: 'p', text: "Quatre années en Centrafrique, comme coordinatrice humanitaire, sans grille théorique pour penser ce que le genre faisait à ce que je voyais. Cette note revient sur cette aveuglement-là." },
      { kind: 'p', text: "Pas un mea culpa, pas un manifeste : un essai d'auto-analyse, à mi-chemin entre carnet de terrain et écriture réflexive située." },
    ],
  },
  {
    numero: 15,
    slug: 'massoumi',
    title: 'Massoumi & al., Islamophobia, Race and Global Politics (2020)',
    type: 'note',
    themeSlugs: ['postcolonial'],
    publishedAt: '2026-02-21',
    lede: "Relecture à l'aune des débats français récents.",
    bodyParagraphs: [
      { kind: 'p', text: "Cinq ans après sa parution, l'ouvrage collectif de Massoumi, Mills et Miller sur l'islamophobie globale mérite d'être relu à l'aune des débats français récents — particulièrement la séquence post-2024." },
      { kind: 'p', text: "Cette note recense les arguments du livre, en discute la portée et propose quelques limites." },
    ],
  },
  {
    numero: 38,
    slug: 'ukraine-marges',
    title: 'Quand les marges remontent au centre : minorités de genre dans la guerre russo-ukrainienne',
    type: 'analyse',
    themeSlugs: ['conflits-minorites'],
    publishedAt: '2026-02-12',
    lede: 'Notes de terrain et de lecture sur ce que la guerre fait aux minorités de genre.',
    bodyParagraphs: [
      { kind: 'p', text: "Mes deux années de coordination humanitaire en Ukraine (2023-2025) m'ont donné un accès partiel mais direct à ce que la guerre fait aux minorités de genre — d'un côté comme de l'autre de la ligne de front." },
      { kind: 'p', text: "Cet article tente de mettre en dialogue ces observations de terrain avec la littérature naissante sur les minorités sexuelles dans les conflits armés contemporains." },
    ],
  },
  {
    numero: 14,
    slug: 'palomares',
    title: 'Élise Palomares & Aurélie Damamme dir., Genre et migrations (PUR, 2025)',
    type: 'note',
    themeSlugs: ['migrations-exil'],
    publishedAt: '2026-02-03',
    lede: 'Une synthèse française très attendue sur la dimension de genre des migrations contemporaines.',
    bodyParagraphs: [
      { kind: 'p', text: "Le volume dirigé par Palomares et Damamme propose la première synthèse francophone substantielle sur la dimension de genre des migrations depuis l'ouvrage de Catherine Quiminal au début des années 2000." },
      { kind: 'p', text: "Cette note recense les apports principaux du volume, identifie quelques manques et discute la cohérence d'ensemble du projet collectif." },
    ],
  },
  {
    numero: 6,
    slug: 'wps-chronologie',
    title: 'Femmes, paix, sécurité — chronologie des résolutions onusiennes',
    type: 'fiche',
    themeSlugs: ['conflits-minorites', 'humanitaire-genre'],
    publishedAt: '2026-02-22',
    lede: 'Chronologie commentée, mise à jour à chaque session du Conseil.',
    bodyParagraphs: [
      { kind: 'p', text: "Cette fiche dresse la chronologie commentée des résolutions onusiennes relevant de l'agenda Femmes, paix et sécurité, de la 1325 (2000) aux résolutions les plus récentes." },
      { kind: 'p', text: "Mise à jour à chaque session du Conseil de sécurité." },
    ],
  },
  {
    numero: 37,
    slug: 'antigenre-international',
    title: "L'« anti-genre » a une diplomatie : du Vatican à Budapest, en passant par Genève",
    type: 'analyse',
    themeSlugs: ['genre-geopolitique'],
    publishedAt: '2026-01-24',
    lede: "Cartographie d'un mouvement transnational qui a appris à parler le langage des droits humains.",
    bodyParagraphs: [
      { kind: 'p', text: "Le mouvement « anti-genre » n'est plus un assemblage de groupes religieux marginaux : c'est une diplomatie articulée, qui a appris à parler le langage des droits humains et à mobiliser les fora multilatéraux." },
      { kind: 'p', text: "Cet article cartographie le réseau transnational qui s'est constitué autour du Vatican, des organisations conservatrices nord-américaines, et de leurs relais à Budapest, Varsovie ou Genève." },
    ],
  },
];

// Identité fictive utilisée par le seed dev — à remplacer par les
// vraies valeurs depuis l'admin Payload (global Site + page About)
// après le premier boot. Les données ci-dessous existent uniquement
// pour donner du contenu visible en local.
const ABOUT_SECTIONS_PARAGRAPHS: Record<string, BodyNode[]> = {
  bio: [
    {
      kind: 'p',
      text: "J'ai passé dix ans dans le secteur humanitaire international avant de basculer vers la recherche en sciences sociales. Je termine cette année un master en études de genre, et un projet doctoral prend forme autour de l'instrumentalisation politique des droits LGBTQI+ dans les rapports internationaux.",
    },
    {
      kind: 'p',
      text: "Ce carnet est l'atelier visible de ce travail : notes datées, citables, ouvertes. Il prend la suite, d'une certaine manière, du modèle Hypothèses, qui a suspendu les nouvelles ouvertures fin 2024.",
    },
  ],
  terrains: [
    {
      kind: 'p',
      text: "Plusieurs terrains successifs en zones de crise et de post-conflit, comme coordinateur·ice humanitaire entre 2014 et 2025 : prévention des violences basées sur le genre, programmes d'urgence et de protection, supervision d'équipes en milieu instable.",
    },
  ],
  recherche: [
    {
      kind: 'p',
      text: "M1 études de genre soutenu en juin 2026. M2 prévu pour la rentrée 2026, avec un mémoire intitulé « Géopolitique des droits LGBTQI+ : entre instrumentalisation et émancipation ». Un projet doctoral est en construction, inscription envisagée à la rentrée 2027.",
    },
  ],
  publications: [
    {
      kind: 'p',
      text: "Un essai à paraître en 2027 sur l'instrumentalisation politique des droits LGBTQI+. Manuscrit en cours.",
    },
  ],
  colophon: [
    {
      kind: 'p',
      text: "Site auto-hébergé via Payload CMS dockerisé, frontend Astro SSR. Polices Source Serif 4, Inter et JetBrains Mono, servies depuis @fontsource (équivalent Bunny Fonts privacy-first, sans tracking). Aucun pisteur. Aucune dépendance JavaScript externe pour la lecture. Code source ouvert sous AGPLv3. Contenu sous licence CC BY-NC-SA 4.0.",
    },
  ],
};

const ABOUT_PAGE = {
  slug: 'about',
  title: 'Michel Rose',
  description:
    "Coordinateur·ice humanitaire en reconversion vers la recherche en études de genre — Carnet de notes de travail.",
  eyebrow: 'À propos',
  lede: "Coordinateur·ice humanitaire en reconversion vers la recherche en études de genre. Ce carnet rassemble mes notes de travail.",
  sections: [
    { kind: 'prose', titre: '', paragraphs: ABOUT_SECTIONS_PARAGRAPHS.bio },
    { kind: 'prose', titre: 'Terrains', paragraphs: ABOUT_SECTIONS_PARAGRAPHS.terrains },
    { kind: 'prose', titre: 'Recherche', paragraphs: ABOUT_SECTIONS_PARAGRAPHS.recherche },
    { kind: 'prose', titre: 'Publications', paragraphs: ABOUT_SECTIONS_PARAGRAPHS.publications },
    { kind: 'prose', titre: 'Colophon', paragraphs: ABOUT_SECTIONS_PARAGRAPHS.colophon },
  ] as Array<{ kind: 'prose'; titre: string; paragraphs: BodyNode[] }>,
};

// Globals seedés. Le global Site n'héberge plus que branding +
// reading (cf split Identity / Navigation / Subscriptions / IndexPages
// dans commit 8e0f417). On seede chaque global avec ses defaults
// de démo plutôt que de chercher à reconstruire l'ancien SITE_GLOBAL.

const IDENTITY_GLOBAL = {
  siteName: 'Carnet',
  authorName: 'Michel Rose',
  baseline:
    'Carnet de recherche de Michel Rose. Genre, géopolitique, droits LGBTQI+, humanitaire, migrations. Auto-hébergé. Sans pisteur.',
  copyrightLine: 'carnet.example.com · CC BY-NC-SA 4.0',
};

const NAVIGATION_GLOBAL = {
  navFooter: [
    { label: 'Thèmes', href: '/themes/', external: false },
    { label: 'Archives', href: '/archives/', external: false },
    { label: 'Admin', href: '/cms/admin', external: false },
  ],
};

// ─── Lexical body builder ────────────────────────────────────────

/**
 * Construit un objet Lexical depuis une liste de nœuds simples.
 * Format Payload Lexical : root.children[].type ∈
 * { paragraph, heading, quote, inlineBlock, block, text }.
 *
 * Le type 'pr' (rich paragraph) supporte des fragments inline mixés
 * (text + footnote + biblio_inline) — utile pour insérer des notes
 * et références dans le flux d'écriture du seed.
 *
 * `biblioIdBySlug` est requis si le body contient des fragments
 * 'biblio' (sinon ils seront skippés silencieusement).
 */
function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

function textNode(text: string) {
  return {
    type: 'text',
    text,
    version: 1,
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
  };
}

function buildLexicalBody(
  nodes: BodyNode[],
  biblioIdBySlug?: Map<string, number | string>,
) {
  const children = nodes.flatMap((node) => {
    if (node.kind === 'h2') {
      return [
        {
          type: 'heading',
          tag: 'h2',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [textNode(node.text)],
        },
      ];
    }
    if (node.kind === 'blockquote') {
      return [
        {
          type: 'quote',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [textNode(node.text)],
        },
      ];
    }
    if (node.kind === 'p') {
      return [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [textNode(node.text)],
        },
      ];
    }
    // node.kind === 'pr' : rich paragraph avec fragments inline
    const inlineChildren = node.fragments
      .map((f) => {
        if (f.kind === 'text') return textNode(f.text);
        if (f.kind === 'footnote') {
          return {
            type: 'inlineBlock',
            version: 1,
            fields: {
              id: randomId(),
              blockName: '',
              blockType: 'footnote',
              content: f.content,
            },
          };
        }
        if (f.kind === 'biblio') {
          const entryId = biblioIdBySlug?.get(f.biblioSlug);
          if (entryId === undefined) {
            console.warn(
              `[seed-dev] biblio_inline skipped : slug ${f.biblioSlug} introuvable`,
            );
            return null;
          }
          return {
            type: 'inlineBlock',
            version: 1,
            fields: {
              id: randomId(),
              blockName: '',
              blockType: 'biblio_inline',
              entry: entryId,
              prefix: f.prefix ?? null,
              suffix: f.suffix ?? null,
            },
          };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return [
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        children: inlineChildren,
      },
    ];
  });

  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children,
    },
  };
}

// ─── Run ─────────────────────────────────────────────────────────

async function findBySlug(payload: Awaited<ReturnType<typeof getPayload>>, collection: string, slug: string) {
  const res = await payload.find({
    collection: collection as never,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs[0];
}

async function wipeCollection(payload: Awaited<ReturnType<typeof getPayload>>, collection: string) {
  const res = await payload.find({
    collection: collection as never,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  for (const doc of res.docs) {
    await payload.delete({
      collection: collection as never,
      id: (doc as { id: number | string }).id,
      overrideAccess: true,
    });
  }
  console.log(`[seed-dev] wiped ${res.docs.length} entries from ${collection}`);
}

async function main() {
  console.log('[seed-dev] booting Payload...');
  const payload = await getPayload({ config });

  if (RESET) {
    console.log('[seed-dev] --reset : wiping content collections');
    await wipeCollection(payload, 'posts');
    await wipeCollection(payload, 'bibliography');
    await wipeCollection(payload, 'themes');
    await wipeCollection(payload, 'pages');
  }

  // 1. Themes
  const themeIdBySlug = new Map<string, number | string>();
  for (const theme of THEMES) {
    const existing = await findBySlug(payload, 'themes', theme.slug);
    if (existing) {
      themeIdBySlug.set(theme.slug, (existing as { id: number | string }).id);
      console.log(`[seed-dev] SKIP theme ${theme.slug} (existe)`);
      continue;
    }
    const created = await payload.create({
      collection: 'themes',
      data: theme,
      overrideAccess: true,
    });
    themeIdBySlug.set(theme.slug, (created as { id: number | string }).id);
    console.log(`[seed-dev] +theme ${theme.slug}`);
  }

  // 2. Bibliography
  const biblioIdBySlug = new Map<string, number | string>();
  for (const entry of BIBLIOGRAPHY) {
    const existing = await findBySlug(payload, 'bibliography', entry.slug);
    if (existing) {
      biblioIdBySlug.set(entry.slug, (existing as { id: number | string }).id);
      console.log(`[seed-dev] SKIP biblio ${entry.slug} (existe)`);
      continue;
    }
    const created = await payload.create({
      collection: 'bibliography',
      data: entry,
      overrideAccess: true,
    });
    biblioIdBySlug.set(entry.slug, (created as { id: number | string }).id);
    console.log(`[seed-dev] +biblio ${entry.slug}`);
  }

  // 3. Posts
  for (const post of POSTS) {
    const existing = await findBySlug(payload, 'posts', post.slug);
    if (existing) {
      console.log(`[seed-dev] SKIP post ${post.slug} (existe)`);
      continue;
    }
    const themeIds = post.themeSlugs
      .map((s) => themeIdBySlug.get(s))
      .filter((id): id is number | string => id !== undefined);
    const biblioIds = (post.biblioSlugs ?? [])
      .map((s) => biblioIdBySlug.get(s))
      .filter((id): id is number | string => id !== undefined);
    await payload.create({
      collection: 'posts',
      data: {
        numero: post.numero,
        slug: post.slug,
        title: post.title,
        type: post.type,
        themes: themeIds as number[],
        publishedAt: post.publishedAt,
        lede: post.lede,
        body: buildLexicalBody(post.bodyParagraphs, biblioIdBySlug),
        bibliography: biblioIds as number[],
        draft: post.draft ?? false,
      },
      overrideAccess: true,
    });
    console.log(`[seed-dev] +post n°${post.numero} ${post.slug}`);
  }

  // 4. Page À propos — avec sections Prose
  const existingAbout = await findBySlug(payload, 'pages', ABOUT_PAGE.slug);
  if (existingAbout) {
    console.log(`[seed-dev] SKIP page ${ABOUT_PAGE.slug} (existe)`);
  } else {
    const proseSections = ABOUT_PAGE.sections.map((s) => ({
      blockType: 'prose' as const,
      titre: s.titre || undefined,
      content: buildLexicalBody(s.paragraphs),
    }));
    await payload.create({
      collection: 'pages',
      data: {
        slug: ABOUT_PAGE.slug,
        title: ABOUT_PAGE.title,
        description: ABOUT_PAGE.description,
        eyebrow: ABOUT_PAGE.eyebrow,
        lede: ABOUT_PAGE.lede,
        sections: proseSections,
      },
      overrideAccess: true,
    });
    console.log(`[seed-dev] +page ${ABOUT_PAGE.slug} (${proseSections.length} sections)`);
  }

  // 5. Globals Identity + Navigation (cf split commit 8e0f417). Site
  // garde ses defaults branding + reading auto-posés à la première
  // lecture, idem pour Subscriptions et IndexPages — pas besoin de
  // seed explicite pour ceux-là en dev.
  await payload.updateGlobal({
    slug: 'identity',
    data: IDENTITY_GLOBAL,
    overrideAccess: true,
  });
  console.log('[seed-dev] +global identity');
  await payload.updateGlobal({
    slug: 'navigation',
    data: NAVIGATION_GLOBAL,
    overrideAccess: true,
  });
  console.log('[seed-dev] +global navigation');

  console.log('[seed-dev] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-dev] erreur :', err);
  process.exit(1);
});
