// Dashboard custom — remplace l'écran d'accueil natif Payload (qui
// affiche juste les CollectionCards) par le hero éditorial du handoff.
//
// Réf : Design/design_handoff_admin/README.md § 3 « Dashboard ».
//
// Composant 100 % server : on fetch les stats via Local API Payload
// (getPayload + count/find avec overrideAccess) et on rend du HTML
// directement. Aucun client JS (la dashboard est read-only — les
// raccourcis sont juste des <a href> vers les routes Payload natives).

import React from 'react';
import { getPayload } from 'payload';

import config from '@/payload.config';
import NavBurger from './NavBurger.client';

type Props = {
  // Payload v3 fournit user + permissions + initPageResult au server view.
  // On les ignore ici pour l'instant — on récupère le user via la session
  // au prochain fetch si besoin. À terme, lire de props si la signature
  // se stabilise dans Payload.
  user?: { displayName?: string | null; email?: string };
};

async function fetchCount(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: 'posts' | 'themes' | 'bibliography',
  where?: Record<string, unknown>,
): Promise<number> {
  const res = await payload.find({
    collection,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return res.totalDocs;
}

export default async function Dashboard({ user }: Props): Promise<React.ReactElement> {
  const payload = await getPayload({ config });

  // Stats publiées (draft: false) + total des thèmes
  const [analyses, notes, fiches, themes] = await Promise.all([
    fetchCount(payload, 'posts', { type: { equals: 'analyse' }, draft: { equals: false } }),
    fetchCount(payload, 'posts', { type: { equals: 'note' }, draft: { equals: false } }),
    fetchCount(payload, 'posts', { type: { equals: 'fiche' }, draft: { equals: false } }),
    fetchCount(payload, 'themes'),
  ]);

  // Brouillons en cours (3 derniers édités)
  const draftsRes = await payload.find({
    collection: 'posts',
    where: { draft: { equals: true } } as never,
    sort: '-updatedAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  });
  const drafts = draftsRes.docs as Array<{
    id: number | string;
    numero?: number;
    title: string;
    type: string;
    updatedAt: string;
  }>;

  // Planifié à publier (publishedAt > now et draft=false)
  const now = new Date().toISOString();
  const scheduledRes = await payload.find({
    collection: 'posts',
    where: {
      draft: { equals: false },
      publishedAt: { greater_than: now },
    } as never,
    sort: 'publishedAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  });
  const scheduled = scheduledRes.docs as Array<{
    id: number | string;
    numero?: number;
    title: string;
    publishedAt: string;
  }>;

  // Fallback : displayName → premier mot du displayName, sinon partie
  // locale de l'email, sinon vide (le rendu masque alors le prénom et
  // affiche un simple « Bonjour. »).
  const userName =
    (user?.displayName ?? '').split(' ')[0] || user?.email?.split('@')[0] || '';

  const totalDrafts = draftsRes.totalDocs;
  const totalScheduled = scheduledRes.totalDocs;

  return (
    <div className="carnet-dashboard">
      <header className="carnet-dashboard__header">
        <div className="carnet-dashboard__kicker-row">
          <NavBurger />
          <div className="carnet-kicker">Carnet · admin</div>
        </div>
        <h1 className="carnet-h1 carnet-dashboard__hello">
          {userName ? (
            <>
              Bonjour <em>{userName}</em>.
            </>
          ) : (
            <>Bonjour.</>
          )}
        </h1>
        <p className="carnet-dashboard__lede">
          {totalDrafts > 0 && (
            <>
              {totalDrafts} brouillon{totalDrafts > 1 ? 's' : ''} en cours
              {totalScheduled > 0 && ', '}
            </>
          )}
          {totalScheduled > 0 && (
            <>
              {totalScheduled} billet{totalScheduled > 1 ? 's' : ''} planifié
              {totalScheduled > 1 ? 's' : ''}
            </>
          )}
          {totalDrafts === 0 && totalScheduled === 0 && (
            <>Aucun brouillon en cours, aucun billet planifié.</>
          )}
        </p>
      </header>

      <section className="carnet-dashboard__stats" aria-label="Statistiques">
        <div className="carnet-dashboard__stat">
          <span className="n">{analyses}</span>
          <span className="lbl">analyse{analyses > 1 ? 's' : ''} publiée{analyses > 1 ? 's' : ''}</span>
        </div>
        <div className="carnet-dashboard__stat">
          <span className="n">{notes}</span>
          <span className="lbl">note{notes > 1 ? 's' : ''} de lecture</span>
        </div>
        <div className="carnet-dashboard__stat">
          <span className="n">{fiches}</span>
          <span className="lbl">fiche{fiches > 1 ? 's' : ''} thématique{fiches > 1 ? 's' : ''}</span>
        </div>
        <div className="carnet-dashboard__stat">
          <span className="n">{themes}</span>
          <span className="lbl">thème{themes > 1 ? 's' : ''}</span>
        </div>
      </section>

      <div className="carnet-dashboard__cols">
        <section className="carnet-dashboard__col">
          <h2 className="carnet-dashboard__col-h">Brouillons en cours</h2>
          {drafts.length === 0 ? (
            <p className="carnet-dashboard__empty">Aucun brouillon.</p>
          ) : (
            <ul className="carnet-dashboard__list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <a href={`/cms/admin/collections/posts/${d.id}`}>
                    {d.numero !== undefined && (
                      <span className="carnet-mono">n° {String(d.numero).padStart(3, '0')}</span>
                    )}
                    <span className="t">{d.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="carnet-dashboard__col">
          <h2 className="carnet-dashboard__col-h">Planifié à publier</h2>
          {scheduled.length === 0 ? (
            <p className="carnet-dashboard__empty">Aucun billet planifié.</p>
          ) : (
            <ul className="carnet-dashboard__list">
              {scheduled.map((s) => (
                <li key={s.id}>
                  <a href={`/cms/admin/collections/posts/${s.id}`}>
                    {s.numero !== undefined && (
                      <span className="carnet-mono">n° {String(s.numero).padStart(3, '0')}</span>
                    )}
                    <span className="t">{s.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="carnet-dashboard__shortcuts" aria-label="Raccourcis">
        <h2 className="carnet-dashboard__col-h">Raccourcis</h2>
        <div className="carnet-dashboard__shortcuts-grid">
          <a className="carnet-dashboard__shortcut" href="/cms/admin/collections/posts/create">
            <span className="lbl carnet-mono">⌘N</span>
            <span className="t">Nouveau billet</span>
          </a>
          <a className="carnet-dashboard__shortcut" href="/cms/admin/collections/posts/create">
            <span className="lbl carnet-mono">#note</span>
            <span className="t">Nouvelle note de lecture</span>
          </a>
          <a className="carnet-dashboard__shortcut" href="/cms/admin/collections/posts/create">
            <span className="lbl carnet-mono">#fiche</span>
            <span className="t">Nouvelle fiche thématique</span>
          </a>
        </div>
      </section>
    </div>
  );
}
