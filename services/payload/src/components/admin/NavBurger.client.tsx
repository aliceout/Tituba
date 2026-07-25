'use client';

// Burger mobile autonome — même bouton que celui rendu dans
// CarnetTopbar, mais utilisable depuis les vues qui n'utilisent pas
// CarnetTopbar (typiquement Dashboard, qui a son propre hero éditorial
// et ne veut pas d'une topbar grise au-dessus).
//
// Le style .tituba-nav-burger est partagé : invisible ≥ 1441px, visible
// en tablet/mobile (cf custom.scss). Dispatch le même event window
// `tituba-nav-toggle` que Nav.client.tsx écoute pour ouvrir l'overlay.

import React from 'react';

export default function NavBurger(): React.ReactElement {
  return (
    <button
      type="button"
      className="tituba-nav-burger tituba-nav-burger--standalone"
      aria-label="Ouvrir la navigation"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tituba-nav-toggle'));
        }
      }}
    >
      <span aria-hidden="true">☰</span>
    </button>
  );
}
