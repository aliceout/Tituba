/**
 * Résolution de la navigation du header — routes Astro fixes fusionnées
 * avec la config Payload (Navigation → navHeader, blocks réordonnables).
 *
 * Vit ici et non dans Header.astro parce que c'est de la logique pure
 * (aucun markup) : la page fait un fetch, elle ne devrait pas aussi
 * porter cinquante lignes de résolution de config.
 *
 * Si Payload est down ou que les globals sont vides, on retombe sur un
 * set par défaut (Archives, Thèmes, Abonnement) — équivalent au
 * comportement historique avant que le header soit configurable.
 */
import { fetchCollection, fetchIdentity, fetchIndexPages, fetchNavigation } from './payload';
import { PUBLICATIONS, PUBLICATION_ORDER } from './publications';
import { stripHeroMarkers } from './site';

export type NavItem = { href: string; label: string; matchPaths: string[] };
export type ThemeLink = { slug: string; name: string };
type IndexTarget = 'archives' | 'themes' | 'subscribe';

// ─── Pages d'index (routes Astro fixes) ────────────────────────────
// Mappées ici plutôt que côté Payload parce que le `matchPaths` (qui
// détermine quand l'onglet est « actif ») dépend de la structure des
// routes Astro — donc du code, pas du contenu.
const INDEX_TARGETS: Record<IndexTarget, NavItem> = {
  archives: { href: '/archives/', label: 'Archives', matchPaths: ['/archives'] },
  themes: { href: '/themes/', label: 'Thèmes', matchPaths: ['/themes', '/theme'] },
  // Le libellé dit « Nous suivre », l'URL reste /abonnement/ : une
  // racine publiée ne se renomme pas sans casser les liens déjà
  // partagés, et le chemin n'apparaît nulle part à l'écran.
  subscribe: {
    href: '/abonnement/',
    label: 'Nous suivre',
    matchPaths: ['/abonnement', '/rss'],
  },
};
const INDEX_HREFS = new Set(Object.values(INDEX_TARGETS).map((t) => t.href));
const DEFAULT_NAV_ITEMS: NavItem[] = [
  INDEX_TARGETS.archives,
  INDEX_TARGETS.themes,
  INDEX_TARGETS.subscribe,
];

// ─── Types côté globals (subset de payload-types) ──────────────────
type PagePopulated = { slug?: string; title?: string; eyebrow?: string | null };
type NavItemEntry = {
  blockType: 'navItem';
  kind?: 'index' | 'editorial';
  indexTarget?: IndexTarget;
  page?: PagePopulated | number | string | null;
  label?: string | null;
};
type IdentityGlobal = { siteName?: string };
type NavigationGlobal = { navHeader?: Array<NavItemEntry | { blockType?: string }> | null };
type IndexPagesGlobal = {
  archives?: { enabled?: boolean };
  themes?: { enabled?: boolean };
  subscribe?: { enabled?: boolean };
};

export interface HeaderNav {
  siteName: string;
  itemsAvant: NavItem[];
  itemsApres: NavItem[];
  navThemes: ThemeLink[];
  homeActive: boolean;
  formatsActive: boolean;
  themesActive: boolean;
  searchActive: boolean;
  isActive: (item: NavItem) => boolean;
}

export async function resolveHeaderNav(pathname: string): Promise<HeaderNav> {
  // Thématiques du menu déroulant. Chargées depuis Payload pour que la
  // liste suive l'admin sans redéploiement ; en cas d'échec le menu
  // disparaît simplement, le reste du header continue de fonctionner.
  let navThemes: ThemeLink[] = [];
  try {
    navThemes = await fetchCollection<ThemeLink>('themes', {
      limit: 100,
      depth: 0,
      sort: 'name',
      select: ['slug', 'name'],
    });
  } catch (err) {
    console.warn('[navigation] fetchCollection(themes) failed:', (err as Error).message);
  }

  let siteName = 'Tituba';
  let items: NavItem[] = DEFAULT_NAV_ITEMS;
  let indexEnabled: Record<IndexTarget, boolean> = {
    archives: true,
    themes: true,
    subscribe: true,
  };
  try {
    const identity = await fetchIdentity<IdentityGlobal>();
    siteName = identity.siteName?.trim() || siteName;
  } catch (err) {
    console.warn('[navigation] fetchIdentity failed, using defaults:', (err as Error).message);
  }
  try {
    const ip = await fetchIndexPages<IndexPagesGlobal>();
    indexEnabled = {
      archives: ip.archives?.enabled !== false,
      themes: ip.themes?.enabled !== false,
      subscribe: ip.subscribe?.enabled !== false,
    };
  } catch (err) {
    console.warn(
      '[navigation] fetchIndexPages failed, using defaults:',
      (err as Error).message,
    );
  }
  try {
    const nav = await fetchNavigation<NavigationGlobal>();
    const configured = nav.navHeader ?? [];
    if (configured.length > 0) {
      items = configured.flatMap((entry): NavItem[] => {
        if (entry.blockType !== 'navItem') return [];
        const e = entry as NavItemEntry;
        if (e.kind === 'index') {
          const target = e.indexTarget;
          if (!target || !INDEX_TARGETS[target]) return [];
          // Le menu déroulant « Thématiques » couvre déjà /themes/ et
          // chaque thématique : garder l'onglet ferait doublon. On le
          // filtre ici plutôt que de compter sur la config Payload, pour
          // qu'il ne puisse pas réapparaître au prochain réglage de nav.
          if (target === 'themes') return [];
          if (!indexEnabled[target]) return [];
          const base = INDEX_TARGETS[target];
          const label = e.label?.trim() || base.label;
          return [{ ...base, label }];
        }
        if (e.kind === 'editorial') {
          // depth=1 → relationship populé en objet. Si la page a été
          // supprimée mais l'entrée nav pas nettoyée, page = id orphelin :
          // on skip silencieusement.
          if (!e.page || typeof e.page !== 'object') return [];
          const slug = e.page.slug;
          if (!slug) return [];
          const label =
            e.label?.trim() ||
            e.page.eyebrow?.trim() ||
            (e.page.title ? stripHeroMarkers(e.page.title).trim() : '') ||
            slug;
          return [{ href: `/${slug}/`, label, matchPaths: [`/${slug}`] }];
        }
        return [];
      });
    } else {
      // Pas de config → defaults filtrés par les enabled.
      items = DEFAULT_NAV_ITEMS.filter((it) => {
        if (it === INDEX_TARGETS.themes) return false;
        const target = (Object.keys(INDEX_TARGETS) as IndexTarget[]).find(
          (t) => INDEX_TARGETS[t] === it,
        );
        return target ? indexEnabled[target] : true;
      });
    }
  } catch (err) {
    console.warn(
      '[navigation] fetchNavigation failed, using defaults:',
      (err as Error).message,
    );
  }

  // Les onglets pilotés depuis Payload se répartissent de part et d'autre
  // des deux menus déroulants : une page éditoriale est une destination et
  // précède les menus, une page d'index est un service et les suit.
  const itemsAvant = items.filter((it) => !INDEX_HREFS.has(it.href));
  const itemsApres = items.filter((it) => INDEX_HREFS.has(it.href));

  const searchActive = pathname === '/recherche' || pathname.startsWith('/recherche/');
  const isActive = (item: NavItem) =>
    item.matchPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // L'onglet d'accueil reste toujours en première position, hardcodé :
  // c'est la racine du site, on ne le pilote pas depuis l'admin.
  const homeActive = pathname === '/';

  // Le menu « Formats » est actif dès qu'on lit une publication, quelle
  // que soit sa collection.
  const formatsActive = PUBLICATION_ORDER.some(
    (c) =>
      pathname === PUBLICATIONS[c].routePrefix ||
      pathname.startsWith(PUBLICATIONS[c].routePrefix + '/'),
  );
  // Le menu « Thématiques » couvre la vue d'ensemble et les pages
  // individuelles.
  const themesActive = pathname.startsWith('/theme');

  return {
    siteName,
    itemsAvant,
    itemsApres,
    navThemes,
    homeActive,
    formatsActive,
    themesActive,
    searchActive,
    isActive,
  };
}
