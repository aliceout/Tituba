'use client';

// Zotero auto-sync — déclenche un sync en arrière-plan :
//   - au 1er mount d'une session de navigateur (= fresh data au login)
//   - puis sur les mounts suivants si > 30 min écoulées depuis le
//     dernier sync (typiquement quand l'autrice navigue d'une page
//     admin à l'autre)
//
// Le composant rend `null` (invisible). Erreurs ignorées silencieusement
// — elles sont persistées côté serveur sur `user.zotero.lastSyncError`
// et visibles depuis la page Compte. Pas de toast, pas de spinner :
// l'objectif est de ne pas casser le flux d'écriture.
//
// Stratégie « mount-based » plutôt qu'un setInterval persistant :
// l'admin Carnet a une navigation côté client (Next.js App Router)
// donc chaque clic sur un lien interne re-mount ce composant. Ça
// suffit pour avoir un sync fréquent sans timer en arrière-plan
// quand l'onglet est inactif.
//
// Stockage :
//   - sessionStorage `carnet-zotero-synced` = '1' quand le 1er sync
//     de la session est passé (clear au close-tab → re-sync au login).
//   - localStorage `carnet-zotero-last-sync` = timestamp ms du dernier
//     sync (succès ou échec) — sert à throttler les retries.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'carnet-zotero-synced';
const LAST_SYNC_KEY = 'carnet-zotero-last-sync';
const TICK_INTERVAL_MS = 30 * 60 * 1000;
const SYNC_URL = '/cms/api/users/me/zotero-sync';

export default function ZoteroAutoSync(): null {
  const inProgress = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (inProgress.current) return;

    // Décide s'il faut sync : 1er mount de la session OU > 30 min
    // depuis le dernier sync.
    let lastSync = 0;
    let isFirst = false;
    try {
      isFirst = sessionStorage.getItem(SESSION_KEY) !== '1';
      if (!isFirst) {
        lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
      }
    } catch {
      // sessionStorage/localStorage indisponibles — on tente quand même
    }

    if (!isFirst && Date.now() - lastSync < TICK_INTERVAL_MS) return;

    inProgress.current = true;
    fetch(SYNC_URL, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => {
        // 200 OK : marque la session comme syncée (évite re-déclenchement
        // sur la prochaine navigation de cette même session).
        if (res.ok) {
          try {
            sessionStorage.setItem(SESSION_KEY, '1');
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        inProgress.current = false;
        // Timestamp posé même en échec — sinon chaque navigation
        // ré-essaierait jusqu'à passer, ce qui spammerait le serveur
        // si la clé est révoquée ou Zotero est down.
        try {
          localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      });
  }, [pathname]);

  return null;
}
