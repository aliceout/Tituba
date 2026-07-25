import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { Users } from './collections/Users';
import { Media } from './collections/Media';
import { Posts } from './collections/Posts';
import { Themes } from './collections/Themes';
import { Tags } from './collections/Tags';
import { Bibliography } from './collections/Bibliography';
import { Pages } from './collections/Pages';
import { Subscribers } from './collections/Subscribers';
import { Site } from './globals/Site';
import { Navigation } from './globals/Navigation';
import { IndexPages } from './globals/IndexPages';
import { Identity } from './globals/Identity';
import { Subscriptions } from './globals/Subscriptions';
import { authEndpoints } from './auth/endpoints';
import { zoteroEndpoints } from './zotero/endpoints';
import { postsSearchEndpoint } from './endpoints/posts-search';
import { subscribersEndpoints } from './endpoints/subscribers';
import { extendPostsSearchVector } from './db/extend-posts-search-vector';
import { buildEmailAdapter } from './auth/transport';
import { startCleanupJob } from './auth/cleanup';
import { bootstrapRootUser } from './auth/bootstrap';
import { startPendingCleanup } from './auth/pending-store';
import { startRateLimitCleanup } from './auth/rate-limit';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

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

// Endpoint custom de recherche fulltext (FTS Postgres) branché sur la
// collection posts → exposé sous /cms/api/posts/search. Cf
// endpoints/posts-search.ts.
const postsBaseEndpoints = Array.isArray(Posts.endpoints) ? Posts.endpoints : [];
const PostsWithEndpoints = {
  ...Posts,
  endpoints: [...postsBaseEndpoints, postsSearchEndpoint],
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
    PostsWithEndpoints,
    Themes,
    Tags,
    Bibliography,
    Pages,
    UsersWithEndpoints,
    Media,
    SubscribersWithEndpoints,
  ],
  globals: [Site, Navigation, IndexPages, Identity, Subscriptions],
  editor: lexicalEditor(),
  email: buildEmailAdapter(),
  secret: process.env.PAYLOAD_SECRET || '',
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
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number.parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      database: process.env.POSTGRES_DB,
    },
    push: process.env.NODE_ENV !== 'production',
    // Étend le schéma Drizzle généré par Payload pour y déclarer la
    // colonne `posts.search_vector` (tsvector, FTS Postgres) + son
    // index GIN. Sans ça, `push: true` la verrait comme inconnue et
    // proposerait de la drop à chaque boot dev.
    afterSchemaInit: [extendPostsSearchVector],
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
