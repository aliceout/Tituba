/**
 * Dérivations propres à l'accueil — quelle publication est « à la une »,
 * quel podcast poser à côté, quelles cinq entrées au sommaire.
 *
 * Vit ici plutôt que dans index.astro : ce sont des fonctions pures sur
 * des données déjà chargées, pas de la logique de page.
 */
import type { FeedDoc } from './payload';

/**
 * Repère éditorial de la une, « printemps 2026 ». Dérivé de la date de
 * publication plutôt que saisi : c'est une indication de fraîcheur, pas
 * un champ à tenir à jour dans l'admin.
 */
export function saison(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const m = d.getMonth();
  const nom =
    m >= 2 && m <= 4 ? 'printemps' : m >= 5 && m <= 7 ? 'été' : m >= 8 && m <= 10 ? 'automne' : 'hiver';
  // L'hiver de janvier-février appartient à la saison ouverte en
  // décembre de l'année précédente.
  const annee = nom === 'hiver' && m <= 1 ? d.getFullYear() - 1 : d.getFullYear();
  return `${nom} ${annee} →`;
}

/**
 * À la une, dernier podcast (pour le carré posé à côté), et sommaire
 * (les cinq dernières, la une exclue — sans ce filtre elle apparaîtrait
 * deux fois à trente centimètres d'écart).
 */
export function deriveUne(posts: FeedDoc[], featured: FeedDoc[]) {
  // À défaut de coche « Mettre à la une » (ou fetch en échec), la plus
  // récente prend la place : le bloc structure le haut de page, le
  // laisser vide creuserait un trou entre le hero et le sommaire.
  const une = featured[0] ?? posts[0] ?? null;

  // `posts` est déjà trié par date décroissante côté SQL, le premier
  // podcast trouvé est donc le plus récent. On écarte celui qui occupe
  // déjà la une : rien n'empêche un épisode d'être mis à la une, et il
  // se retrouverait alors affiché deux fois côte à côte.
  const dernierPodcast =
    posts.find((p) => p.collection === 'podcasts' && !(une && p.id === une.id)) ?? null;

  const sommaire = posts
    .filter((p) => !(une && p.collection === une.collection && p.id === une.id))
    .slice(0, 5);

  return { une, dernierPodcast, sommaire };
}
