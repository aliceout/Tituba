'use client';

// Nav.client.tsx — partie client de la nav latérale custom. Reçoit les
// counts pré-calculés du composant server et utilise usePathname()
// pour l'active state qui change quand on navigue (sans full reload).
//
// Fetch /cms/api/users/me au mount pour afficher le footer user
// (displayName + rôle muted) cf maquette
// Design/design_handoff_admin/carnet-admin.html → footer sidebar.
//
// C'est aussi ici qu'on pose data-theme et data-accent sur <html> au
// mount, pour piloter le theming admin (cf custom.scss). data-theme
// est lu depuis localStorage (clé 'admin-theme') ; data-accent vient
// du global Site (Branding → Couleur d'accentuation), fetché en même
// temps que /me.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import ZoteroAutoSync from './ZoteroAutoSync.client';

type Me = {
  user?: {
    id?: number | string;
    email?: string;
    displayName?: string | null;
    role?: string;
  };
};

const ADMIN = '/cms/admin';

// Mapping hex → slug, doit rester aligné avec custom.scss.
const ACCENT_HEX_TO_SLUG: Record<string, string> = {
  '#5a3a7a': 'violet',
  '#8a3a3a': 'rouge',
  '#1f3a5a': 'bleu',
  '#3a3a3a': 'gris',
  '#2d5a3d': 'vert',
};

type Counts = {
  posts: number;
  themes: number;
  tags: number;
  bibliography: number;
  media: number;
  users: number;
  pages: number;
  subscribers: number;
};

export interface Props {
  activePath: string;
  counts: Counts;
  version?: { tag: string; commit: string };
  /**
   * User courant résolu côté serveur (Nav.tsx via payload.auth). On
   * évite ainsi le fetch /me en client → plus de flash sur les sections
   * Config / Utilisateur·ices à chaque navigation.
   */
  initialMe?: Me['user'] | null;
}

type NavItem = {
  label: string;
  href: string;
  count?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export default function NavClient({ activePath: serverActive, counts, version, initialMe }: Props): React.ReactElement {
  // Pathname côté client (mis à jour par le routeur Next quand on
  // navigue sans full reload). On préfère l'état client une fois
  // hydraté ; sinon on retombe sur la valeur serveur (header).
  const clientPath = usePathname();
  const activePath = clientPath || serverActive;

  // État ouvert/fermé du burger sur mobile. La nav est masquée par CSS
  // en dessous de 900px ; quand `navOpen` est vrai, on lui ajoute la
  // classe `is-open` qui la rend visible en overlay (cf. custom.scss).
  // Le bouton burger qui contrôle ce state vit dans le CarnetTopbar
  // (pour être visuellement dans la topbar plutôt qu'en overlay) — la
  // communication passe par un event window custom.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    function onToggle() {
      setNavOpen((v) => !v);
    }
    window.addEventListener('carnet-nav-toggle', onToggle);
    return () => window.removeEventListener('carnet-nav-toggle', onToggle);
  }, []);

  // Ferme la nav automatiquement à chaque navigation (sinon elle reste
  // ouverte et masque la nouvelle page).
  useEffect(() => {
    setNavOpen(false);
  }, [activePath]);

  // User courant pour le footer (nom + rôle) — résolu côté serveur
  // dans Nav.tsx (payload.auth + cookies) et passé en prop. Plus de
  // useState/useEffect ici : la nav rend dès le premier paint avec les
  // sections role-gated dans le bon état, plus de flash après hydratation.
  const me = initialMe ?? null;

  // URL du front public pour le lien « Voir le site ↗ ». En prod
  // l'admin et le front sont sur le même domaine (admin sur
  // /cms/admin/*, front sur /), donc `/` suffit. En dev, Payload
  // tourne sur :3001 et Astro sur :4321 → on rewrite vers :4321.
  // Fallback `/` pendant le SSR (avant useEffect) pour éviter le
  // hydration mismatch.
  const [siteUrl, setSiteUrl] = useState<string>('/');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { hostname, protocol } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      setSiteUrl(`${protocol}//${hostname}:4321/`);
    } else {
      setSiteUrl('/');
    }
  }, []);

  // Theme courant (light/dark) — controlled state pour le toggle.
  // Init depuis localStorage, fallback sur prefers-color-scheme.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    let initial: 'light' | 'dark' = 'light';
    try {
      const saved = localStorage.getItem('admin-theme');
      if (saved === 'dark' || saved === 'light') {
        initial = saved;
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initial = 'dark';
      }
    } catch {
      /* localStorage indisponible — fallback light */
    }
    document.documentElement.setAttribute('data-theme', initial);
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('admin-theme', next);
    } catch {
      /* idem */
    }
    setTheme(next);
  }

  // Accent depuis le global Site (Branding) → posé sur <html>
  // comme data-accent (mapping hex → slug). custom.scss lit cet attribut
  // pour appliquer la teinte à toute l'admin.
  useEffect(() => {
    fetch('/cms/api/globals/site?depth=0', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((site: { branding?: { accentColor?: string } } | null) => {
        const hex = site?.branding?.accentColor;
        const slug = hex ? ACCENT_HEX_TO_SLUG[hex] : undefined;
        document.documentElement.setAttribute('data-accent', slug ?? 'violet');
      })
      .catch(() => {
        document.documentElement.setAttribute('data-accent', 'violet');
      });
  }, []);

  const userName = me?.displayName?.trim() || me?.email?.split('@')[0] || '—';
  const rawRole = me?.role ?? '';
  // Libellés inclusifs des rôles, affichés dans le footer de la sidebar.
  // Source des rôles bruts : services/payload/src/access/roles.ts.
  const ROLE_LABEL: Record<string, string> = {
    root: 'root',
    admin: 'administrateur·ice',
    editor: 'éditeur·ice',
  };
  const userRole = ROLE_LABEL[rawRole] ?? rawRole;

  // Accès aux sections Config + Utilisateur·ices : réservés aux rôles
  // qui peuvent gérer le site (admin/root). Un editor ne voit que
  // Contenu + Mon compte.
  const isPrivileged = rawRole === 'admin' || rawRole === 'root';

  const sections: NavSection[] = [
    {
      label: 'Contenu',
      items: [
        { label: 'Billets', href: `${ADMIN}/collections/posts`, count: counts.posts },
        { label: 'Thèmes', href: `${ADMIN}/collections/themes`, count: counts.themes },
        { label: 'Bibliographie', href: `${ADMIN}/collections/bibliography`, count: counts.bibliography },
        { label: 'Tags', href: `${ADMIN}/collections/tags`, count: counts.tags },
        { label: 'Médias', href: `${ADMIN}/collections/media`, count: counts.media },
        { label: 'Pages éditoriales', href: `${ADMIN}/collections/pages`, count: counts.pages },
      ],
    },
    ...(isPrivileged
      ? [
          {
            label: 'Config',
            items: [
              { label: 'Identité', href: `${ADMIN}/globals/identity` },
              { label: 'Options', href: `${ADMIN}/globals/site` },
              { label: 'Abonnements', href: `${ADMIN}/globals/subscriptions` },
              { label: 'Pages principales', href: `${ADMIN}/globals/index-pages` },
              { label: 'Navigation', href: `${ADMIN}/globals/navigation` },
            ],
          },
        ]
      : []),
    {
      label: 'Réglages',
      items: [
        ...(isPrivileged
          ? [
              {
                label: 'Utilisateur·ices',
                href: `${ADMIN}/collections/users`,
                count: counts.users,
              },
              {
                label: 'Abonné·es',
                href: `${ADMIN}/collections/subscribers`,
                count: counts.subscribers,
              },
            ]
          : []),
        { label: 'Mon compte', href: `${ADMIN}/account` },
      ],
    },
  ];

  function isActive(href: string): boolean {
    if (!activePath) return false;
    if (activePath === href) return true;
    return activePath.startsWith(href + '/');
  }

  return (
    <>
      {/* Backdrop : ferme la nav au clic en dehors. Visible uniquement
          quand la nav est ouverte. Le bouton burger qui ouvre la nav
          est rendu par CarnetTopbar pour s'intégrer dans la topbar
          plutôt que flotter par-dessus. */}
      {navOpen && (
        <div
          className="carnet-nav-backdrop"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}

      <nav
        className={navOpen ? 'carnet-nav is-open' : 'carnet-nav'}
        aria-label="Navigation principale"
      >
      {/* Auto-sync Zotero invisible : se déclenche au login et toutes
          les 30 min de navigation. Cf ZoteroAutoSync.client.tsx. */}
      <ZoteroAutoSync />

      <Link href={ADMIN} className="carnet-nav__brand">
        Carnet<span className="dot">.</span>
      </Link>
      {/* Top row : « Voir le site » à gauche + actions icônes à
          droite (theme toggle + logout). Compacte tout en haut, libère
          le footer pour ne montrer que user/rôle. */}
      <div className="carnet-nav__top-row">
        <a
          href={siteUrl}
          className="carnet-nav__view-site"
          target="_blank"
          rel="noreferrer"
          suppressHydrationWarning
        >
          Voir le site
          <span aria-hidden="true" className="arrow">↗</span>
        </a>
        <div className="carnet-nav__top-actions">
          <button
            type="button"
            className="carnet-nav__theme-toggle"
            aria-label={
              theme === 'dark'
                ? 'Passer en thème clair'
                : 'Passer en thème sombre'
            }
            title="Basculer le thème"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
          <a
            href={`${ADMIN}/logout`}
            className="carnet-nav__logout-icon"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </a>
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.label} className="carnet-nav__section">
          <div className="carnet-nav__section-label">{section.label}</div>
          {section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive(item.href)
                  ? 'carnet-nav__link carnet-nav__link--active'
                  : 'carnet-nav__link'
              }
            >
              <span className="carnet-nav__link-label">{item.label}</span>
              {typeof item.count === 'number' && (
                <span className="carnet-nav__link-count">{item.count}</span>
              )}
            </Link>
          ))}
        </div>
      ))}

      <div className="carnet-nav__spacer" />

      {me && (
        <div className="carnet-nav__footer">
          <div className="carnet-nav__user">
            <div className="carnet-nav__user-name">{userName}</div>
            {userRole && (
              <div className="carnet-nav__user-role">
                <span className="carnet-nav__user-role-prefix">Rôle :</span> {userRole}
              </div>
            )}
          </div>
          {version && (
            <div
              className="carnet-nav__version"
              title={`Version : ${version.tag} · commit ${version.commit}`}
            >
              {version.tag} · {version.commit}
            </div>
          )}
        </div>
      )}
      </nav>
    </>
  );
}
