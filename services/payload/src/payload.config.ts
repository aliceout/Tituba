import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import type { Config } from 'payload';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { Users } from './collections/Users';
import { Media } from './collections/Media';
import { Articles } from './collections/Articles';
import { Analyses } from './collections/Analyses';
import { Actus } from './collections/Actus';
import { Podcasts } from './collections/Podcasts';
import { Outils } from './collections/Outils';
import { Themes } from './collections/Themes';
import { Series } from './collections/Series';
import { Tags } from './collections/Tags';
import { Bibliography } from './collections/Bibliography';
import { Pages } from './collections/Pages';
import { Subscribers } from './collections/Subscribers';
import { Site } from './globals/Site';
import { Navigation } from './globals/Navigation';
import { Identity } from './globals/Identity';
import { Subscriptions } from './globals/Subscriptions';
import { authEndpoints } from './auth/endpoints';
import { zoteroEndpoints } from './zotero/endpoints';
import { publicationsSearchEndpoint } from './endpoints/publications-search';
import {
  publicationsAuthorsEndpoint,
  publicationsCountsEndpoint,
  publicationsFeedEndpoint,
} from './endpoints/publications-feed';
import { subscribersEndpoints } from './endpoints/subscribers';
import { unsplashEndpoints } from './endpoints/unsplash';
import { contactEndpoints } from './endpoints/contact';
import { importBibliographieEndpoint } from './endpoints/import-bibliographie';
import { importDocumentEndpoint } from './endpoints/import-document';
import { extendPublicationsSearchVector } from './db/extend-publications-search-vector';
import { buildEmailAdapter } from './auth/transport';
import { startCleanupJob } from './auth/cleanup';
import { bootstrapRootUser } from './auth/bootstrap';
import { startPendingCleanup } from './auth/pending-store';
import { startRateLimitCleanup } from './auth/rate-limit';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Le secret, ou rien.
 *
 * Il valait `process.env.PAYLOAD_SECRET || ''` : sans variable
 * d'environnement, Payload démarrait avec la chaîne vide pour clé. Tout
 * fonctionnait — connexion, admin, site — mais chaque cookie de session,
 * chaque jeton de confirmation d'abonnement et chaque signature de lien
 * de désabonnement étaient alors calculés avec un secret que le monde
 * entier connaît. Une panne bruyante au démarrage vaut mieux qu'une
 * application qui tourne en paraissant sûre.
 *
 * Le seuil de 32 caractères n'est pas décoratif : un secret court se
 * retrouve par force brute, et c'est exactement le genre de valeur qu'on
 * pose « en attendant » avec quatre lettres.
 *
 * ─── L'exception de la construction d'image ─────────────────────────
 *
 * `next build` importe cette configuration pour recenser les routes. Il
 * ne signe rien — mais il n'a pas non plus de secret, et cette exigence
 * a d'abord fait échouer la construction de l'image :
 *
 *   Failed to collect page data for /cms/api/[...slug]
 *
 * D'où l'exception, bornée à la phase de construction, que Next annonce
 * lui-même (`NEXT_PHASE`, posé dans next/dist/build/index.js). Elle ne
 * peut pas fuir jusqu'à l'exécution : cette fonction est rappelée au
 * démarrage de chaque process, et le conteneur qui sert le site n'a pas
 * cette variable. Le secret de complaisance ne franchit donc jamais la
 * frontière de l'image.
 */
const EN_CONSTRUCTION = process.env.NEXT_PHASE === 'phase-production-build';

function secretRequis(): string {
  const secret = process.env.PAYLOAD_SECRET?.trim();
  if (!secret && EN_CONSTRUCTION) {
    return 'construction-sans-secret-rien-ne-sera-signe-avec-ceci';
  }
  if (!secret) {
    throw new Error(
      'PAYLOAD_SECRET est absent. Payload signe avec lui les sessions, les ' +
        'jetons de confirmation et les liens de désabonnement : sans lui, ces ' +
        'signatures ne valent rien. Renseignez-le avant de démarrer.',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `PAYLOAD_SECRET fait ${secret.length} caractères, il en faut au moins 32. ` +
        'Un secret court se retrouve par force brute, et avec lui toutes les ' +
        'signatures du site.',
    );
  }
  return secret;
}

// URL publique du site — convention Infisical : la valeur d'ADDRESS
// est juste le domaine (sans schème). On préfixe https:// si manquant
// pour fournir des URLs valides à Payload (serverURL, cors, csrf).
const RAW_ADDRESS = process.env.ADDRESS || 'http://localhost:3001';
const ADDRESS = /^https?:\/\//.test(RAW_ADDRESS)
  ? RAW_ADDRESS
  : `https://${RAW_ADDRESS}`;

// On branche les endpoints d'auth (invitations, 2FA, profil) sur la
// collection users. Payload les expose alors sous /cms/api/users/<path>.
const baseEndpoints = Array.isArray(Users.endpoints) ? Users.endpoints : [];
const UsersWithEndpoints = {
  ...Users,
  endpoints: [...baseEndpoints, ...authEndpoints, ...zoteroEndpoints],
  admin: {
    ...Users.admin,
    components: {
      ...(Users.admin?.components ?? {}),
      beforeListTable: ['@/components/auth/InviteUserButton#default'],
    },
  },
};

// Endpoints publics du flow d'alertes mail (subscribe, confirm,
// unsubscribe). Exposés sous /cms/api/subscribers/<path>. Cf
// endpoints/subscribers.ts.
const subscribersBaseEndpoints = Array.isArray(Subscribers.endpoints)
  ? Subscribers.endpoints
  : [];
const SubscribersWithEndpoints = {
  ...Subscribers,
  endpoints: [...subscribersBaseEndpoints, ...subscribersEndpoints],
};

export default buildConfig({
  // Admin sous /cms/admin via la file structure (src/app/cms/(payload)).
  // Routes Payload absolues — pas de basePath Next.js (ça casse les
  // chemins d'assets, cf payloadcms/payload#10534).
  routes: {
    admin: '/cms/admin',
    api: '/cms/api',
    graphQL: '/cms/graphql',
    graphQLPlayground: '/cms/graphql-playground',
  },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, 'app/cms/(payload)'),
      importMapFile: path.resolve(
        dirname,
        'app/cms/(payload)/admin/importMap.js',
      ),
    },
    components: {
      // Nav latérale custom — remplace la nav native (collections à plat)
      // par la structure éditoriale Contenu / Pages / Réglages avec
      // counts à droite. Cf Design/design_handoff_admin/README.md § 5.
      Nav: '@/components/admin/Nav#default',
      // Login overridé pour gérer le 2FA en deux étapes.
      views: {
        login: {
          Component: '@/components/auth/LoginView#default',
        },
        // Page d'acceptation d'invitation : /cms/admin/invitation/:token
        invitation: {
          Component: '@/components/auth/InvitationAcceptView#default',
          path: '/invitation/:token',
        },
        // Dashboard custom — remplace l'écran d'accueil natif Payload
        // par le hero éditorial du handoff (kicker + h1 + 4 stats +
        // brouillons + planifiés + raccourcis).
        dashboard: {
          Component: '@/components/admin/Dashboard#default',
        },
        // /cms/admin/account — vue Mon compte custom. Même pattern
        // que les list views custom : remplace entièrement le rendu
        // natif Payload, fetch via /cms/api/users/me, save via PATCH
        // /cms/api/users/[id], embed le panneau Sécurité existant
        // (2FA + trusted devices).
        account: {
          Component: '@/components/admin/AccountView#default',
        },
      },
      // Keepalive injecté en barre d'actions globale → tourne sur toutes
      // les pages de l'admin tant qu'un onglet est ouvert.
      actions: ['@/components/auth/SessionKeepalive#default'],
    },
  },
  collections: [
    Articles,
    Analyses,
    Actus,
    Podcasts,
    Outils,
    Themes,
    Series,
    Tags,
    Bibliography,
    Pages,
    UsersWithEndpoints,
    Media,
    SubscribersWithEndpoints,
  ],
  globals: [Site, Navigation, Identity, Subscriptions],
  // Endpoints montés à la racine et non sur une collection : ils
  // portent tous les trois sur les cinq formats à la fois. Les
  // rattacher à l'un d'eux donnerait des URLs trompeuses — un
  // /cms/api/articles/search qui renvoie aussi des podcasts.
  //   GET /cms/api/search              recherche plein texte unifiée
  //   GET /cms/api/publications        flux fusionné, paginé en SQL
  //   GET /cms/api/publications/counts compteurs par thématique / tag
  //   GET /cms/api/publications/authors auteur·ices internes + compteur
  //   GET  /cms/api/unsplash/search      recherche Unsplash (picker admin)
  //   POST /cms/api/unsplash/import      télécharge + auto-héberge un choix
  endpoints: [
    publicationsSearchEndpoint,
    publicationsFeedEndpoint,
    publicationsCountsEndpoint,
    publicationsAuthorsEndpoint,
    ...unsplashEndpoints,
    ...contactEndpoints,
    importDocumentEndpoint,
    importBibliographieEndpoint,
  ],
  editor: lexicalEditor(),
  email: buildEmailAdapter(),
  secret: secretRequis(),
  /**
   * Plafond du parseur multipart, toutes collections confondues.
   *
   * Calibré sur le plus gros fichier légitime — un épisode de podcast.
   * C'est volontairement grossier : le contrôle fin, celui qui dépend du
   * type, est dans Media (une image de 200 Mo passe ici, pas là-bas).
   * Ce plafond-ci sert à ce qu'un transfert sans fin s'arrête avant
   * d'avoir rempli le disque, pas à trier.
   *
   * `abortOnLimit` coupe et répond 413. Sans lui, Payload accepterait le
   * fichier tronqué et l'enregistrerait comme s'il était complet — un
   * épisode coupé au milieu, sans que rien ne le signale.
   *
   * `limits` n'apparaît pas dans le type de Payload, qui ne décrit qu'une
   * partie des options ; l'objet est passé tel quel à busboy, chez qui
   * la clé existe. D'où l'élargissement de type, et non un `as never`
   * qui masquerait le reste.
   */
  upload: {
    abortOnLimit: true,
    responseOnLimit: 'Fichier trop lourd : 300 Mo au maximum.',
    limits: { fileSize: 300 * 1024 * 1024 },
  } as Config['upload'] & { limits: { fileSize: number } },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Postgres via fields séparés (évite les problèmes d'URL-encoding
  // quand POSTGRES_PASSWORD a des caractères spéciaux).
  //
  // Workflow schéma :
  //  - Dev (NODE_ENV !== production) : `push: true` → Drizzle sync le
  //    schéma à chaque boot Payload, pas besoin de penser aux migrations.
  //  - Prod (NODE_ENV = production) : `push: false` → Drizzle refuse le
  //    push (protection contre la perte de données). Les tables sont
  //    créées/modifiées via les fichiers SQL dans src/migrations/,
  //    appliqués au boot du container par `payload migrate` (cf. CMD du
  //    Dockerfile).
  //
  // Les migrations sont générées automatiquement par le hook git
  // pre-commit (.husky/pre-commit) à chaque modif de schéma — tu n'as
  // pas à lancer `payload migrate:create` à la main.
  db: postgresAdapter({
    pool: {
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      // `||` et non `??` : une variable présente mais vide — ce que
      // produit une ligne `POSTGRES_HOST=` copiée du modèle — passerait
      // le test de nullité et donnerait un hôte vide à la connexion.
      host: process.env.POSTGRES_HOST || 'localhost',
      // Même raison qu'au-dessus : `POSTGRES_PORT=` vide donnerait NaN,
      // et une connexion qui échoue sans dire pourquoi.
      port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB,
    },
    push: process.env.NODE_ENV !== 'production',
    // Étend le schéma Drizzle généré par Payload pour y déclarer la
    // colonne `search_vector` (tsvector, FTS Postgres) + son index GIN
    // sur chacune des cinq tables de publication. Sans ça, `push: true`
    // les verrait comme inconnues et proposerait de les drop à chaque
    // boot dev.
    afterSchemaInit: [extendPublicationsSearchVector],
  }),
  serverURL: ADDRESS,
  // CORS : restreint aux domaines connus. En dev on autorise les
  // ports locaux courants (Astro 4321, Payload 3001) ; en prod on
  // autorise uniquement le domaine du site.
  cors: [
    ADDRESS,
    'http://localhost:4321',
    'http://localhost:3001',
  ].filter((url): url is string => Boolean(url)),
  // CSRF : Payload utilise cette liste pour valider les requêtes
  // mutantes (POST/PATCH/DELETE) côté admin et auth.
  csrf: [
    ADDRESS,
    'http://localhost:4321',
    'http://localhost:3001',
  ].filter((url): url is string => Boolean(url)),
  sharp,
  plugins: [],
  onInit: async (payload) => {
    // Promotion idempotente du premier user historique en root (cas d'une
    // base existant avant l'ajout du système de rôles).
    await bootstrapRootUser(payload);
    // Démarre le job de cleanup et les nettoyages mémoire (rate limit,
    // pending logins). Idempotent : appel multiple sans effet.
    startCleanupJob(payload);
    startPendingCleanup();
    startRateLimitCleanup();
  },
});
