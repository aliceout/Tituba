'use client';

// Composant invisible : pingue /me/touch toutes les 5 minutes tant que
// l'onglet est ouvert. Permet au cleanup serveur de détecter une vraie
// inactivité (onglet fermé / appareil mis en veille / user parti).

import { useEffect } from 'react';

const PING_INTERVAL_MS = 5 * 60 * 1000;

export default function SessionKeepalive(): null {
  useEffect(() => {
    let cancelled = false;
    function ping() {
      if (cancelled || document.hidden) return;
      void fetch('/cms/api/users/me/touch', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => { /* silencieux */ });
    }
    ping();
    const handle = setInterval(ping, PING_INTERVAL_MS);
    function onVisibility() {
      if (!document.hidden) ping();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return null;
}
