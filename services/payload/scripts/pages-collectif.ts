/**
 * Écrit les deux pages éditoriales du parcours « nous rejoindre » :
 * la charte, puis la page qui explique comment on entre dans le
 * collectif.
 *
 * Usage : `pnpm --dir services/payload tsx scripts/pages-collectif.ts`
 *
 * Écrites en brouillon (`draft: true`) : ce sont des textes qui
 * engagent l'association, ils doivent être relus dans l'admin avant
 * d'être en ligne. Relancer le script réécrit les pages existantes —
 * il est donc sans danger, mais il ÉCRASE les retouches faites depuis
 * l'admin. À ne rejouer qu'en connaissance de cause.
 *
 * La charte est publiée à part et la page « Nous rejoindre » y renvoie
 * avant de proposer d'écrire : on ne demande pas à quelqu'un d'adhérer
 * à des positions qu'il n'a pas eu l'occasion de lire.
 */
import { getPayload } from 'payload';
import config from '../src/payload.config';

// ─── Fabrique de nœuds Lexical ───────────────────────────────────────
// Les formes attendues sont celles que rend src/lib/lexical.ts côté
// site : paragraph, heading, list/listitem, link, quote.

type Noeud = Record<string, unknown>;

const COMMUN = { version: 1, direction: 'ltr' as const, format: '' as const, indent: 0 };

function txt(text: string, gras = false): Noeud {
  return {
    type: 'text',
    text,
    // 1 = bold dans le masque de format Lexical.
    format: gras ? 1 : 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  };
}

function lien(text: string, url: string): Noeud {
  return {
    type: 'link',
    ...COMMUN,
    fields: { url, newTab: false, linkType: 'custom' },
    children: [txt(text)],
  };
}

/** Paragraphe. Accepte du texte simple ou une suite de fragments. */
function p(...contenu: (string | Noeud)[]): Noeud {
  return {
    type: 'paragraph',
    ...COMMUN,
    children: contenu.map((c) => (typeof c === 'string' ? txt(c) : c)),
  };
}

function h(niveau: 'h2' | 'h3', text: string): Noeud {
  return { type: 'heading', tag: niveau, ...COMMUN, children: [txt(text)] };
}

function liste(...items: (string | Noeud[])[]): Noeud {
  return {
    type: 'list',
    listType: 'bullet',
    tag: 'ul',
    start: 1,
    ...COMMUN,
    children: items.map((item, i) => ({
      type: 'listitem',
      value: i + 1,
      ...COMMUN,
      children: [
        {
          type: 'paragraph',
          ...COMMUN,
          children: typeof item === 'string' ? [txt(item)] : item,
        },
      ],
    })),
  };
}

function racine(...noeuds: Noeud[]) {
  return { root: { type: 'root', ...COMMUN, children: noeuds } };
}

/** Un bloc dépliant : le titre reste visible, le contenu s'ouvre sur place. */
function depliant(titre: string, ...noeuds: Noeud[]) {
  return {
    blockType: 'depliant' as const,
    titre,
    ouvert: false,
    content: racine(...noeuds),
  };
}

/** Une section « prose » de page. */
function section(titre: string | null, ...noeuds: Noeud[]) {
  return { blockType: 'prose' as const, titre: titre ?? undefined, content: racine(...noeuds) };
}

// ─── La charte ───────────────────────────────────────────────────────

const CHARTE = {
  slug: 'charte',
  title: 'La charte de *Tituba*',
  lede:
    'Ce que nous sommes, ce que nous défendons, et comment nous travaillons. Ce texte engage le collectif : il est le socle à partir duquel nous publions.',
  sections: [
    section(
      'Qui nous sommes',
      p(
        'TITUBA est une association féministe intersectionnelle, inclusive et décoloniale. Nous souhaitons lutter contre les discriminations et les oppressions systémiques, contre les violences sexistes et sexuelles, et pour l’égalité de genre. Nous souhaitons défendre la justice sociale et environnementale, et nous mobiliser pour la reconnaissance et l’éradication des inégalités structurelles, qu’elles soient liées au genre, à l’orientation sexuelle, à la construction sociale de la race, à la classe, ou à la colonialité.',
      ),
      p(
        'Ces luttes ne peuvent se mener qu’en incluant les personnes racisées, les personnes LGBTQIA+, et l’ensemble des personnes confronté·es à des oppressions multiples.',
      ),
      p(
        'Nous souhaitons porter des luttes joyeuses, qui laissent leur place au care, à la liberté et à la créativité, et qui portent un regard renouvelé sur la coopération et la solidarité. Nous voulons nous organiser de manière équitable, afin que chaque personne qui participe au collectif puisse s’épanouir et se libérer des rapports et mécanismes de domination.',
      ),
    ),
    section(
      'Ce que nous défendons',
      p(
        'Les luttes et les perspectives féministes sont plurielles, et nous tenons à cette pluralité. Certaines positions ne relèvent cependant pas pour nous du débat : elles constituent le socle à partir duquel nous travaillons, et nous les défendons dans l’ensemble de nos publications comme au sein du collectif.',
      ),
      liste(
        [
          txt('Travail du sexe. ', true),
          txt(
            'Nous nous opposons au principe abolitionniste. Nous soutenons les revendications portées par les travailleur·euses du sexe elleux-mêmes, à commencer par la reconnaissance de leurs droits et la fin des politiques qui les précarisent et les exposent aux violences.',
          ),
        ],
        [
          txt('Personnes trans. ', true),
          txt(
            'Il n’y a pas de féminisme sans les personnes trans : les femmes trans sont des femmes, les hommes trans sont des hommes. Nous défendons le droit à l’autodétermination du genre, et nous nous opposons aux courants qui excluent les personnes trans des luttes féministes.',
          ),
        ],
        [
          txt('Droits sexuels et reproductifs. ', true),
          txt(
            'Nous défendons l’autonomie de chaque personne sur son corps : l’accès libre et effectif à l’avortement, à la contraception, à l’information et aux soins, sans condition ni contrôle.',
          ),
        ],
        [
          txt('Validisme. ', true),
          txt(
            'Nous défendons le droit des personnes handicapées à décider pour elleux-mêmes, contre les approches médicales et caritatives qui parlent à leur place. Le validisme est un système de domination à part entière, qui se combine aux autres : l’accessibilité n’est pas une faveur, mais une condition de la participation.',
          ),
        ],
        [
          txt('Refus du fémonationalisme. ', true),
          txt(
            'Nous refusons que le féminisme serve de prétexte à des politiques racistes ou islamophobes. Aucun combat pour l’égalité de genre ne peut se mener contre les personnes racisées, ni décider à leur place de ce qui les émancipe.',
          ),
        ],
        [
          txt('Exil et migration. ', true),
          txt(
            'Nous défendons la liberté de circulation et d’installation, et l’ouverture de routes sûres. La fermeture des frontières et les politiques migratoires qui l’organisent sont à l’origine des violences et des morts qui frappent les personnes en exil, avec des conséquences spécifiques pour les femmes et les minorités de genre. Aucun droit ne peut être conditionné à un statut administratif.',
          ),
        ],
        [
          txt('Écoféminisme. ', true),
          txt(
            'Nous considérons que l’exploitation des femmes et des minorités de genre et celle du vivant procèdent des mêmes logiques de domination et d’appropriation. Il n’y a pas de justice sociale sans justice environnementale, ni l’inverse.',
          ),
        ],
        [
          txt('Contre les idées réactionnaires. ', true),
          txt(
            'Nous nous opposons aux idées conservatrices, réactionnaires et fascisantes, ainsi qu’aux mouvements qui les portent. Nous ne leur offrons pas d’espace, ni dans nos publications, ni au sein du collectif.',
          ),
        ],
      ),
    ),
    section(
      'Ce que nous faisons',
      p(
        'Par l’information, la sensibilisation, l’accompagnement technique, la formation, la réflexion et l’action, nous souhaitons lutter contre toutes les formes d’oppressions, de violences et de discriminations, en particulier liées au genre. Nous souhaitons aussi favoriser et rendre visibles les luttes, les réflexions, les travaux et les initiatives de nos membres et des actrices et acteurs féministes intersectionnel·les.',
      ),
      p('Cela peut concrètement prendre la forme des actions suivantes :'),
      liste(
        'groupes de travail et réunions, internes ou publiques, sur les sujets que les membres jugent nécessaires ;',
        'ateliers pratiques, groupes de parole, ateliers de sensibilisation et de formation, en ligne comme en présentiel ;',
        'missions d’appui technique, de formation et d’accompagnement de structures (associations, collectivités locales, etc.) sur l’égalité de genre, la prévention des violences sexistes et sexuelles, et les autres thématiques que nous portons ;',
        'création et diffusion de contenus — articles de recherche, billets d’actualité et d’analyse, podcasts, outils — sur des formats écrits, audiovisuels ou autres ;',
        'organisation d’événements culturels ;',
        'participation à des réseaux locaux, nationaux et internationaux, sur les questions théoriques comme pratiques.',
      ),
    ),
    section(
      'Notre fonctionnement',
      p(
        'Nous fonctionnons de façon horizontale, sans direction, par consensus. Personne ne tranche à la place du collectif : en cas de désaccord manifeste, nous ne faisons pas. Nous tenons à rester vigilant·es aux rapports de pouvoir susceptibles de se jouer au sein des collectifs, et souhaitons travailler à équilibrer le pouvoir entre nos membres.',
      ),
      p(
        'Nous tenons à une pluralité de formats et de profils, avec la volonté de sortir du milieu académique fermé, d’effacer les cloisonnements, et de créer des ponts entre les milieux académique et militant. La liberté et la créativité que nous revendiquons dans nos luttes, nous souhaitons les retrouver dans nos formats, avec une valorisation égale de tous les savoirs et de tous les contenus.',
      ),
      p(
        'Notre fonctionnement est collectif et entièrement bénévole : personne n’est rémunéré·e, et il n’y a aucune rémunération à attendre de son engagement. Nous tenons à ce qu’il soit fondé sur une confiance mutuelle. Chaque membre est libre de la forme de son engagement, tant en quantité de rendus qu’en temps donné. La seule contrepartie demandée : toute personne publiée et relue s’engage en retour à une forme de réciprocité, dans le respect du rythme de chacun·e à pouvoir l’accorder.',
      ),
      p(
        'Les violences sexistes et sexuelles ne s’arrêtent pas à la porte des collectifs militants, et nous ne nous croyons pas immunisé·es. La parole des victimes prime : par défaut, ce sont elles que nous protégeons, et c’est à la personne mise en cause de se retirer, pas à celle qui parle. Sur ce point, notre règle de consensus ne s’applique pas — un désaccord au sein du collectif ne peut pas servir à ne rien faire, parce que ne rien faire revient toujours à protéger la personne mise en cause.',
      ),
    ),
    section(
      'Nos engagements',
      liste(
        [
          txt('Nous situer avant de nommer. ', true),
          txt('Nous nous opposons à une prétendue neutralité.'),
        ],
        [
          txt('« Rien sur nous, pour nous, sans nous ». ', true),
          txt(
            'Nous nous engageons à systématiquement tenir compte des intérêts des personnes concernées. Cela suppose de nous renseigner sur les positionnements existants des collectifs de personnes concernées, de questionner les normes et les idées dominantes, de nous interroger sur l’implication de nos propos, et de solliciter le retour de personnes concernées sur nos textes, opinions et analyses avant de les publier. Ces positions ne s’accordent pas toujours entre elles, et les personnes concernées ne décident pas à notre place : ce que nous publions reste notre responsabilité.',
          ),
        ],
        [
          txt('Laisser une place au débat. ', true),
          txt(
            'Les luttes et perspectives féministes sont plurielles, et nous acceptons et souhaitons défendre cette pluralité de points de vue comme telle. Notre collectif doit être un lieu d’apprentissage, de remise en question et d’expérimentation, que nous voulons fondé sur l’écoute, l’effort de compréhension, le respect des sensibilités de chacun·e, et le droit à l’erreur.',
          ),
        ],
        [
          txt('Partage et réutilisation des contenus. ', true),
          txt(
            'Tout ce que nous créons et diffusons est produit et diffusé sous licence Creative Commons CC BY-NC-ND 4.0, afin d’en permettre le partage et la diffusion la plus large possible.',
          ),
        ],
        [
          txt('Langue. ', true),
          txt(
            'Durant la première phase de lancement, nous travaillons et diffusons en français, conscient·es de l’histoire coloniale et dominante de cette langue. Dans un second temps, nous nous engageons à traduire et rendre accessibles nos contenus dans d’autres langues, et à permettre aux auteur·ices qui le souhaitent de publier dans d’autres langues.',
          ),
        ],
        [
          txt('Accessibilité. ', true),
          txt(
            'L’écriture académique ou journalistique n’étant pas accessible à tous et toutes, nous nous engageons à rendre nos contenus lisibles et accessibles au plus grand nombre. Cette exigence vaut aussi pour nos supports eux-mêmes, à commencer par notre site, que nous voulons accessible aux personnes handicapées.',
          ),
        ],
        [
          txt('Approche systémique de la radicalité. ', true),
          txt(
            'Nous souhaitons adresser les systèmes de discrimination, pas seulement leurs phénomènes visibles. Chaque situation discriminatoire ou inéquitable doit nous amener à questionner les mécanismes sociaux, sociétaux et politiques sous-jacents.',
          ),
        ],
      ),
    ),
    section(
      'Nous rejoindre',
      p(
        'Nous sommes ouvert·es à toute personne partageant ces valeurs et souhaitant s’engager, quelle qu’en soit la forme : membre actif ou active, adhérent·e, ou sympathisant·e. Il n’est pas nécessaire d’être universitaire, chercheureuse ou expert·e pour nous rejoindre : nous voulons valoriser à égalité tous les savoirs, toutes les expériences et tous les formats d’engagement.',
      ),
      p(
        'Si vous vous retrouvez dans ce texte, ',
        lien('la page « Nous rejoindre »', '/nous-rejoindre/'),
        txt(' explique comment cela se passe concrètement.'),
      ),
    ),
  ],
};

// ─── Nous rejoindre ──────────────────────────────────────────────────

const REJOINDRE = {
  slug: 'nous-rejoindre',
  title: 'Nous *rejoindre*',
  lede:
    'Il n’est pas nécessaire d’être universitaire, chercheur·euse ou expert·e pour écrire avec nous. Nous valorisons à égalité tous les savoirs, toutes les expériences et tous les formats d’engagement.',
  sections: [
    section(
      'Commencez par la charte',
      p(
        'Notre ',
        lien('charte', '/charte/'),
        txt(
          ' dit ce que nous sommes, ce que nous défendons et comment nous travaillons. Certaines des positions qu’elle porte ne relèvent pas du débat chez nous : elles sont le socle à partir duquel nous publions.',
        ),
      ),
      p(
        'Nous vous demandons de la lire avant de nous écrire. Ce n’est pas une formalité : c’est ce qui nous évite, à vous comme à nous, une conversation qui se termine mal au bout de trois échanges.',
      ),
    ),
    section(
      'Ce que veut dire « rejoindre »',
      p(
        'Trois formes, et vous choisissez la vôtre : membre actif·ve si vous voulez écrire et participer au fonctionnement du collectif, adhérent·e si vous voulez le soutenir, sympathisant·e si vous voulez suivre et donner un coup de main à l’occasion.',
      ),
      p(
        'La suite de cette page décrit surtout la première, parce que c’est celle qui demande des explications.',
      ),
    ),
    depliant(
      'Les positions qui ne se discutent pas',
      p(
        'Les luttes féministes sont plurielles, et nous tenons à cette pluralité. Ces huit points-là font exception : ils ne sont pas ouverts au débat chez nous, et c’est à partir d’eux que nous publions.',
      ),
      liste(
        [
          txt('Travail du sexe. ', true),
          txt(
            'Nous nous opposons au principe abolitionniste et soutenons les revendications portées par les travailleur·euses du sexe elleux-mêmes.',
          ),
        ],
        [
          txt('Personnes trans. ', true),
          txt(
            'Les femmes trans sont des femmes, les hommes trans sont des hommes. Nous défendons le droit à l’autodétermination du genre.',
          ),
        ],
        [
          txt('Droits sexuels et reproductifs. ', true),
          txt(
            'L’autonomie de chaque personne sur son corps : avortement, contraception, information et soins, sans condition ni contrôle.',
          ),
        ],
        [
          txt('Validisme. ', true),
          txt(
            'Un système de domination à part entière. L’accessibilité n’est pas une faveur, mais une condition de la participation.',
          ),
        ],
        [
          txt('Refus du fémonationalisme. ', true),
          txt(
            'Le féminisme ne peut pas servir de prétexte à des politiques racistes ou islamophobes.',
          ),
        ],
        [
          txt('Exil et migration. ', true),
          txt(
            'Liberté de circulation et d’installation. Aucun droit ne peut être conditionné à un statut administratif.',
          ),
        ],
        [
          txt('Écoféminisme. ', true),
          txt('Il n’y a pas de justice sociale sans justice environnementale, ni l’inverse.'),
        ],
        [
          txt('Contre les idées réactionnaires. ', true),
          txt('Nous ne leur offrons pas d’espace, ni dans nos publications, ni dans le collectif.'),
        ],
      ),
      p(
        'Chacun de ces points est développé dans ',
        lien('la charte', '/charte/'),
        txt(', avec ce qui l’entoure : ce que nous faisons, comment nous nous organisons, et ce à quoi nous nous engageons.'),
      ),
    ),
    section(
      'Comment cela se passe',
      p(
        'Nous fonctionnons par cooptation — non pour filtrer les diplômes, mais parce qu’un collectif horizontal repose sur la confiance, et que la confiance se construit en se rencontrant.',
      ),
      liste(
        [
          txt('Vous nous écrivez. ', true),
          txt(
            'Quelques paragraphes sur vous : d’où vous parlez, ce sur quoi vous avez envie de travailler, ce que vous cherchez ici. Ni CV ni lettre de motivation.',
          ),
        ],
        [
          txt('Nous nous rencontrons, ', true),
          txt('à au moins deux membres. C’est une conversation, pas un entretien.'),
        ],
        [
          txt('Vous entrez dans la dynamique collective ', true),
          txt('au rythme et sous la forme qui vous conviennent.'),
        ],
      ),
    ),
    section(
      'Comment nous travaillons',
      liste(
        [
          txt('Un point régulier. ', true),
          txt(
            'On y dit les sujets sur lesquels on a envie d’écrire et les directions qu’on veut prendre. Les sujets y sont pré-validés, et le calendrier de publication décidé ensemble.',
          ),
        ],
        [
          txt('Par consensus. ', true),
          txt(
            'Personne ne tranche à la place du collectif : en cas de désaccord manifeste, nous ne faisons pas.',
          ),
        ],
        [
          txt('Une relecture, et sa réciproque. ', true),
          txt(
            'Au moment où un sujet est validé, une personne se désigne pour le relire. Qui est publié·e et relu·e s’engage à relire à son tour, au rythme qu’iel peut y consacrer. C’est la seule contrepartie que nous demandons.',
          ),
        ],
        [
          txt('Vous êtes libre de votre engagement, ', true),
          txt('en quantité comme en temps. Personne ne compte les lignes.'),
        ],
        [
          txt('Tout est bénévole. ', true),
          txt(
            'Personne n’est rémunéré·e, et il n’y a aucune rémunération à attendre de son engagement.',
          ),
        ],
      ),
    ),
    section(
      'Nous écrire',
      p(
        'Vous avez lu la charte et vous vous y retrouvez ? ',
        lien('Écrivez-nous', '/contact/?objet=collectif'),
        txt(
          ' en choisissant l’objet « Nous rejoindre ». Dites-nous d’où vous parlez et ce qui vous intéresse — c’est tout ce dont nous avons besoin pour commencer.',
        ),
      ),
    ),
  ],
};

// ─── Écriture ────────────────────────────────────────────────────────

async function main() {
  const payload = await getPayload({ config });

  for (const page of [CHARTE, REJOINDRE]) {
    const existante = await payload.find({
      collection: 'pages',
      where: { slug: { equals: page.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const data = {
      slug: page.slug,
      title: page.title,
      lede: page.lede,
      sections: page.sections,
      kind: 'libre',
      // Brouillon : ces textes engagent l'association, ils passent par
      // une relecture dans l'admin avant d'être en ligne.
      draft: true,
    };

    if (existante.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: (existante.docs[0] as { id: number | string }).id,
        data: data as never,
        overrideAccess: true,
      });
      console.log(`[pages-collectif] mise à jour : ${page.slug}`);
    } else {
      await payload.create({
        collection: 'pages',
        data: data as never,
        overrideAccess: true,
      });
      console.log(`[pages-collectif] créée : ${page.slug}`);
    }
  }

  console.log(
    '\nLes deux pages sont en BROUILLON. Relisez-les dans l’admin, puis publiez-les.',
  );
  process.exit(0);
}

void main();
