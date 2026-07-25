// Nav latérale custom — remplace la nav native Payload (qui empile
// les collections à plat) par la structure éditoriale du handoff :
//
//   Carnet.                          (brand Source Serif 22px)
//
//   CONTENU
//     Billets        (47)
//     Thèmes          (8)
//     Bibliographie (128)
//     Médias         (24)
//
//   PAGES
//     Pages éditoriales
//
//   RÉGLAGES
//     Utilisateurs    (3)
//     Site (global)
//
// Réf : Design/design_handoff_admin/README.md § 5 « Sidebar / nav ».
//
// Composant server : on fetch les counts via getPayload + find avec
// limit:1 (Payload renvoie totalDocs sans charger les docs). Le
// pathname actif est passé au composant client qui marque l'item.

import React from 'react';
import { getPayload } from 'payload';
import { headers } from 'next/headers';

import config from '@/payload.config';
import NavClient from './Nav.client';

async function fetchCount(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection:
    | 'posts'
    | 'themes'
    | 'tags'
    | 'bibliography'
    | 'media'
    | 'users'
    | 'pages'
    | 'subscribers',
): Promise<number> {
  try {
    const res = await payload.find({
      collection,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    return res.totalDocs;
  } catch {
    return 0;
  }
}

export default async function Nav(): Promise<React.ReactElement> {
  const payload = await getPayload({ config });

  const [posts, themes, tags, bibliography, media, users, pages, subscribers] =
    await Promise.all([
      fetchCount(payload, 'posts'),
      fetchCount(payload, 'themes'),
      fetchCount(payload, 'tags'),
      fetchCount(payload, 'bibliography'),
      fetchCount(payload, 'media'),
      fetchCount(payload, 'users'),
      fetchCount(payload, 'pages'),
      fetchCount(payload, 'subscribers'),
    ]);

  // Pathname courant (server-side via les headers Next) pour l'active state.
  // x-pathname est défini par un middleware Next ; en l'absence, on récupère
  // referer comme fallback.
  const hdrs = await headers();
  const activePath = hdrs.get('x-pathname') || hdrs.get('referer') || '';

  // User courant — authentifié à partir des cookies de la requête. On
  // résout ici (server) plutôt qu'en client (useEffect + fetch) pour
  // éviter le flash où les sections Config + Utilisateur·ices
  // (admin/root only) apparaissent en sautillant à chaque navigation
  // après hydratation.
  let me: { id?: number | string; email?: string; displayName?: string | null; role?: string } | null = null;
  try {
    const auth = await payload.auth({ headers: hdrs });
    if (auth?.user) {
      me = {
        id: auth.user.id,
        email: (auth.user as { email?: string }).email,
        displayName: (auth.user as { displayName?: string | null }).displayName ?? null,
        role: (auth.user as { role?: string }).role,
      };
    }
  } catch {
    /* non authentifié — la nav est rendue sans bloc footer user */
  }

  // GIT_TAG / GIT_COMMIT sont injectés au build du container Payload
  // (cf. Dockerfile + CI). Fallback 'dev' pour le développement local.
  // Affichés en mono dans le footer de la sidebar pour qu'on sache
  // toujours quelle version tourne.
  const version = {
    tag: process.env.GIT_TAG ?? 'dev',
    commit: process.env.GIT_COMMIT ?? 'dev',
  };

  return (
    <NavClient
      activePath={activePath}
      counts={{ posts, themes, tags, bibliography, media, users, pages, subscribers }}
      version={version}
      initialMe={me}
    />
  );
}
