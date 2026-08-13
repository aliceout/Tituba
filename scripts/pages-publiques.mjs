/**
 * Les pages du site à auditer, en un seul endroit.
 *
 * Partagée par les deux scripts d'accessibilité : ils regardaient
 * chacun leur liste, et celle du plus complet — a11y-deep, qui exécute
 * axe-core dans un vrai navigateur — était restée celle du projet dont
 * Tituba est issu. Vingt-six routes sur vingt-sept renvoyaient 404 :
 * l'audit mesurait vingt-six fois la page « introuvable » et concluait
 * que tout allait bien.
 *
 * Deux sortes d'entrées :
 *
 *  - les routes fixes, qui existent quel que soit le contenu ;
 *  - les routes de contenu, qui ont besoin d'un identifiant réel. Elles
 *    sont découvertes à l'exécution en suivant les liens des index,
 *    plutôt qu'écrites en dur : un identifiant recopié ici deviendrait
 *    faux au premier billet dépublié, et l'audit se remettrait à
 *    mesurer des 404 sans que personne ne le voie.
 */

/** Routes qui ne dépendent d'aucun contenu. */
export const ROUTES_FIXES = [
  '/',
  '/archives/',
  '/formats/',
  '/themes/',
  '/tags/',
  '/auteurices/',
  '/podcasts/',
  '/articles/',
  '/analyses/',
  '/actus/',
  '/outils/',
  '/recherche/',
  '/recherche/?q=genre',
  '/abonnement/',
  '/contact/',
  '/accessibilite/',
  // Le parcours par mail, dans ses états d'erreur — les seuls
  // atteignables sans jeton valide.
  '/abonnement/confirmer/?token=audit',
  '/abonnement/desabonner/?token=audit',
  '/contact/confirmer/?token=audit',
  // La page « introuvable » est une page comme une autre : c'est même
  // celle qu'on voit quand tout va mal.
  '/cette-page-nexiste-pas/',
];

/**
 * Index d'où partir, et forme des liens à y suivre. Un exemplaire par
 * famille suffit : ce sont les gabarits qu'on audite, pas les contenus.
 */
const SONDAGES = [
  { index: '/articles/', motif: /href="(\/articles\/[^"/]+\/)"/g },
  { index: '/analyses/', motif: /href="(\/analyses\/[^"/]+\/)"/g, combien: 2 },
  { index: '/actus/', motif: /href="(\/actus\/[^"/]+\/)"/g },
  { index: '/outils/', motif: /href="(\/outils\/[^"/]+\/)"/g },
  { index: '/podcasts/', motif: /href="(\/series\/[^"/]+\/)"/g, combien: 2 },
  { index: '/themes/', motif: /href="(\/theme\/[^"/]+\/)"/g },
  { index: '/tags/', motif: /href="(\/tag\/[^"/]+\/)"/g },
  { index: '/auteurices/', motif: /href="(\/auteurice\/[^"/]+\/)"/g },
];

/**
 * Complète les routes fixes par un exemplaire de chaque gabarit de
 * contenu, trouvé en lisant les index.
 *
 * Deux analyses plutôt qu'une : seules celles-là portent une image de
 * couverture, et le hero à deux colonnes — cadre du titre collé à la
 * photo — ne se rend nulle part ailleurs.
 */
export async function listerPages(base) {
  const pages = [...ROUTES_FIXES];

  /** Suit un motif dans une page et retient les premières adresses. */
  async function suivre(depuis, motif, combien = 1) {
    let html = '';
    try {
      const r = await fetch(base + depuis);
      if (!r.ok) return [];
      html = await r.text();
    } catch {
      return [];
    }
    const vus = [];
    for (const m of html.matchAll(motif)) {
      if (!vus.includes(m[1])) vus.push(m[1]);
      if (vus.length >= combien) break;
    }
    return vus;
  }

  for (const { index, motif, combien } of SONDAGES) {
    for (const u of await suivre(index, motif, combien)) {
      if (!pages.includes(u)) pages.push(u);
    }
  }

  // L'index des podcasts ne liste que les émissions : un épisode ne se
  // trouve qu'en descendant dans l'une d'elles. Sans ce second saut, le
  // gabarit d'épisode — hero pleine largeur, lecteur, générique — n'est
  // audité nulle part. On part des émissions qu'on vient de découvrir
  // plutôt que d'une adresse écrite en dur, et on s'arrête à la première
  // qui a un épisode : toutes n'en ont pas.
  for (const serie of pages.filter((p) => p.startsWith('/series/'))) {
    const [episode] = await suivre(serie, /href="(\/podcasts\/[^"/]+\/)"/g);
    if (episode) {
      if (!pages.includes(episode)) pages.push(episode);
      break;
    }
  }

  return pages;
}
