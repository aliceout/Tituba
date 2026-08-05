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
import { headers } from 'next/headers';

import config from '@/payload.config';
import NavBurger from './NavBurger.client';
import { stripHeroMarkers } from '@/lib/hero-markers';

type Props = {
  // Payload v3 fournit user + permissions + initPageResult au server view.
  // On les ignore ici pour l'instant — on récupère le user via la session
  // au prochain fetch si besoin. À terme, lire de props si la signature
  // se stabilise dans Payload.
  user?: { displayName?: string | null; email?: string };
};

/**
 * Les cinq formats de publication, avec ce qu'il faut pour compter,
 * relier et nommer. L'ordre est celui du menu.
 */
const FORMATS = [
  { slug: 'articles', singular: 'article de recherche', plural: 'articles de recherche' },
  { slug: 'analyses', singular: "billet d'analyse", plural: "billets d'analyse" },
  { slug: 'actus', singular: "billet d'actu", plural: "billets d'actu" },
  { slug: 'podcasts', singular: 'podcast', plural: 'podcasts' },
  { slug: 'outils', singular: 'outil', plural: 'outils' },
] as const;

type FormatSlug = (typeof FORMATS)[number]['slug'];

type PubRow = {
  id: number | string;
  numero?: number;
  title: string;
  updatedAt?: string;
  publishedAt?: string;
  collection: FormatSlug;
};

async function fetchCount(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: string,
  where?: Record<string, unknown>,
): Promise<number> {
  const res = await payload.find({
    collection: collection as never,
    where: where as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return res.totalDocs;
}

/**
 * Interroge les cinq collections et fusionne le résultat.
 *
 * On ne peut pas s'en remettre à l'endpoint SQL unifié ici : ce
 * composant est rendu côté serveur au sein de Payload, une requête HTTP
 * vers sa propre API serait un aller-retour inutile. Cinq `find`
 * limités à 3 documents restent négligeables.
 */
async function findAcrossFormats(
  payload: Awaited<ReturnType<typeof getPayload>>,
  where: Record<string, unknown>,
  sort: string,
  limit: number,
): Promise<{ docs: PubRow[]; total: number }> {
  const results = await Promise.all(
    FORMATS.map(async (f) => {
      const res = await payload.find({
        collection: f.slug as never,
        where: where as never,
        sort,
        limit,
        depth: 0,
        overrideAccess: true,
      });
      return {
        total: res.totalDocs,
        docs: (res.docs as PubRow[]).map((d) => ({ ...d, collection: f.slug })),
      };
    }),
  );
  const total = results.reduce((acc, r) => acc + r.total, 0);
  const key = sort.replace(/^-/, '') as 'updatedAt' | 'publishedAt';
  const desc = sort.startsWith('-');
  const docs = results
    .flatMap((r) => r.docs)
    .sort((a, b) => {
      const av = new Date(a[key] ?? 0).getTime();
      const bv = new Date(b[key] ?? 0).getTime();
      return desc ? bv - av : av - bv;
    })
    .slice(0, limit);
  return { docs, total };
}

export default async function Dashboard({ user }: Props): Promise<React.ReactElement> {
  const payload = await getPayload({ config });

  // Compteurs par format (publiés seulement) + total des thématiques.
  const [counts, themes] = await Promise.all([
    Promise.all(FORMATS.map((f) => fetchCount(payload, f.slug, { draft: { equals: false } }))),
    fetchCount(payload, 'themes'),
  ]);

  /**
   * Part signée par la personne connectée, sur l'ensemble publié.
   *
   * Le total seul ne dit rien de sa place dans le travail collectif ;
   * c'est le rapport qui la situe. Compté sur les cinq formats et sur
   * les seules publications en ligne — les brouillons ont déjà leur
   * ligne juste au-dessus.
   *
   * L'identifiant vient de la session et non de la prop `user`, qui ne
   * porte que le nom d'affichage et l'adresse.
   */
  // Conservé format par format, et non seulement en somme : la bande de
  // compteurs affiche un nombre par format, et chacun a besoin du sien.
  let signesParFormat: number[] = FORMATS.map(() => 0);
  // Distingue « la personne n'a rien signé » de « on n'a pas pu le
  // savoir ». Sans ce drapeau, une session illisible afficherait
  // « 0/6 » — un fait faux, là où l'absence de rapport n'aurait rien
  // affirmé du tout.
  let partConnue = false;
  try {
    const auth = await payload.auth({ headers: await headers() });
    const moi = auth?.user?.id;
    if (moi != null) {
      signesParFormat = await Promise.all(
        FORMATS.map((f) =>
          fetchCount(payload, f.slug, {
            draft: { equals: false },
            'authors.user': { equals: moi },
          }),
        ),
      );
      partConnue = true;
    }
  } catch {
    // Session illisible : on retombe sur le seul total. Un compte faux
    // serait pire qu'un compte absent.
  }

  const draftsRes = await findAcrossFormats(payload, { draft: { equals: true } }, '-updatedAt', 3);
  const drafts = draftsRes.docs;

  const now = new Date().toISOString();
  const scheduledRes = await findAcrossFormats(
    payload,
    { draft: { equals: false }, publishedAt: { greater_than: now } },
    'publishedAt',
    3,
  );
  const scheduled = scheduledRes.docs;

  // Fallback : displayName → premier mot du displayName, sinon partie
  // locale de l'email, sinon vide (le rendu masque alors le prénom et
  // affiche un simple « Bonjour. »).
  const userName =
    stripHeroMarkers(user?.displayName ?? '').split(' ')[0] || user?.email?.split('@')[0] || '';

  const totalDrafts = draftsRes.total;
  const totalScheduled = scheduledRes.total;

  return (
    <div className="tituba-dashboard">
      <header className="tituba-dashboard__header">
        <div className="tituba-dashboard__kicker-row">
          <NavBurger />
          <div className="tituba-kicker">Tituba · admin</div>
        </div>
        <h1 className="tituba-h1 tituba-dashboard__hello">
          {userName ? (
            <>
              Bonjour <em>{userName}</em>.
            </>
          ) : (
            <>Bonjour.</>
          )}
        </h1>
        {/* Rien à signaler, rien d'écrit. La phrase qui annonçait
            l'absence de brouillon et de publication planifiée occupait
            une ligne pour ne rien apprendre — et les deux colonnes plus
            bas le disent déjà, chacune à sa place. Le <p> lui-même n'est
            pas rendu, sinon sa marge subsisterait. */}
        {(totalDrafts > 0 || totalScheduled > 0) && (
          <p className="tituba-dashboard__lede">
            {totalDrafts > 0 && (
              <>
                {totalDrafts} brouillon{totalDrafts > 1 ? 's' : ''} en cours
                {totalScheduled > 0 && ', '}
              </>
            )}
            {totalScheduled > 0 && (
              <>
                {totalScheduled} publication{totalScheduled > 1 ? 's' : ''} planifiée
                {totalScheduled > 1 ? 's' : ''}
              </>
            )}
          </p>
        )}
      </header>

      <section className="tituba-dashboard__stats" aria-label="Statistiques">
        {FORMATS.map((f, i) => (
          <div className="tituba-dashboard__stat" key={f.slug}>
            {/* Le grand chiffre est celui de la personne connectée, le
                total du collectif le suit en petit. Un rapport plutôt
                que deux nombres empilés : il se lit d'un coup, et la
                pastille garde deux lignes.
                Le zéro s'affiche ici, contrairement à une ligne « dont 0
                de vous » : dans un rapport, il n'est pas un reproche
                mais une donnée — « 0/4 » dit simplement où l'on en est.
                Le total seul reprend la main si la part n'a pas pu être
                établie : mieux vaut ne rien affirmer qu'affirmer zéro. */}
            {partConnue ? (
              <span className="n">
                {signesParFormat[i] ?? 0}
                <span className="tot">/{counts[i]}</span>
              </span>
            ) : (
              <span className="n">{counts[i]}</span>
            )}
            <span className="lbl">{counts[i] > 1 ? f.plural : f.singular}</span>
          </div>
        ))}
        <div className="tituba-dashboard__stat">
          <span className="n">{themes}</span>
          <span className="lbl">thématique{themes > 1 ? 's' : ''}</span>
        </div>
      </section>

      <div className="tituba-dashboard__cols">
        <section className="tituba-dashboard__col">
          <h2 className="tituba-dashboard__col-h">Brouillons en cours</h2>
          {drafts.length === 0 ? (
            <p className="tituba-dashboard__empty">Aucun brouillon.</p>
          ) : (
            <ul className="tituba-dashboard__list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <a href={`/cms/admin/collections/${d.collection}/${d.id}`}>
                    {d.numero !== undefined && (
                      <span className="tituba-mono">n° {String(d.numero).padStart(3, '0')}</span>
                    )}
                    <span className="t">{stripHeroMarkers(d.title)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tituba-dashboard__col">
          <h2 className="tituba-dashboard__col-h">Planifié à publier</h2>
          {scheduled.length === 0 ? (
            <p className="tituba-dashboard__empty">Aucune publication planifiée.</p>
          ) : (
            <ul className="tituba-dashboard__list">
              {scheduled.map((s) => (
                <li key={s.id}>
                  <a href={`/cms/admin/collections/${s.collection}/${s.id}`}>
                    {s.numero !== undefined && (
                      <span className="tituba-mono">n° {String(s.numero).padStart(3, '0')}</span>
                    )}
                    <span className="t">{stripHeroMarkers(s.title)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="tituba-dashboard__shortcuts" aria-label="Raccourcis">
        <h2 className="tituba-dashboard__col-h">Raccourcis</h2>
        <div className="tituba-dashboard__shortcuts-grid">
          {FORMATS.map((f) => (
            <a
              className="tituba-dashboard__shortcut"
              href={`/cms/admin/collections/${f.slug}/create`}
              key={f.slug}
            >
              <span className="lbl tituba-mono">#{f.slug}</span>
              <span className="t">Nouveau : {f.singular}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
