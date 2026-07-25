'use client';

// Topbar normalisée — seule barre supérieure utilisée dans tout l'admin
// Carnet (list views, edit views, vue Édition Posts). Hauteur fixe 56px,
// sticky top, border-bottom — cf .carnet-topbar dans custom.scss.
//
// Props :
//   crumbs   : tableau d'items { label, href? }. Sans href = item courant
//              (rendu en gras .cur). Le séparateur `/` est inséré
//              automatiquement entre les items.
//   status   : optionnel — élément JSX libre placé juste après les
//              crumbs (typiquement <span className="carnet-status …">
//              dans les vues edit).
//   children : zone actions à droite (boutons Sauvegarder / Publier /
//              Nouveau X / Exporter / etc., plus indicateurs « dirty »
//              ou « sauvegardé il y a X min »).

import React from 'react';
import Link from 'next/link';

export type Crumb = {
  label: React.ReactNode;
  href?: string;
};

export default function CarnetTopbar({
  crumbs,
  status,
  children,
  suppressHydrationWarningOnActions,
}: {
  crumbs: Crumb[];
  status?: React.ReactNode;
  children?: React.ReactNode;
  // PostEditView a un state initial qui diverge entre SSR et client
  // après mount → besoin de supprimer le warning React 19 sur
  // l'attribut disabled. Optionnel, défaut false.
  suppressHydrationWarningOnActions?: boolean;
}): React.ReactElement {
  return (
    <header className="carnet-topbar">
      {/* Burger mobile — visible uniquement ≤ 900px (CSS). Dispatch un
          event window que Nav.client.tsx écoute pour toggle l'overlay.
          Placé en début de topbar (à gauche) puisque la nav slide
          depuis la gauche, convention UX habituelle. */}
      <button
        type="button"
        className="carnet-nav-burger"
        aria-label="Ouvrir la navigation"
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('carnet-nav-toggle'));
          }
        }}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <div className="carnet-topbar__crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span className="sep" aria-hidden="true">
                /
              </span>
            )}
            {c.href ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <span className="cur">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {status}
      <div className="carnet-topbar__spacer" />
      {children && (
        <div
          className="carnet-topbar__actions"
          suppressHydrationWarning={suppressHydrationWarningOnActions}
        >
          {children}
        </div>
      )}
    </header>
  );
}
