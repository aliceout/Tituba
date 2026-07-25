# carnet-payload

Backend Payload CMS.
Tourne sous Next.js 16 et expose admin sous `/cms/admin`, API REST sous
`/cms/api`, GraphQL sous `/cms/graphql`.

## Lancement local

Ce service est un workspace pnpm enfant. Les scripts `dev`, `build`, etc. lisent
le `.env` racine via `dotenv -e ../../.env`.

```bash
pnpm install     # depuis services/payload/
pnpm dev         # → http://localhost:3001/cms/admin
pnpm generate:types
pnpm generate:importmap
```

Pré-requis : Postgres en route (cf. `compose.dev.yml` à la racine).

## Conventions

- Routes Payload absolues sous `/cms/admin` + `/cms/api` (cf. `payload.config.ts`).
- `assetPrefix: '/cms'` dans `next.config.ts` (chunks `_next/...` servis depuis `/cms/_next/...`).
- DB Postgres configurée par variables d'env séparées (pas d'`URL` URL-encodée).
- Schéma synchronisé à chaque boot via `push: true` (pas de migrations formelles —
  tradeoff conscient, cf. issue v2).

## Auth

Auth custom répliquée du projet 2mains de femmes : invitations par mail
uniquement, 2FA email obligatoire, TOTP optionnel. Le premier user créé sur
une base neuve devient `root` au boot suivant. Voir `src/auth/`.

## Génération des types

Après chaque modification d'une collection ou d'un block :

```bash
pnpm generate:types
```

Met à jour `src/payload-types.ts` (consommé par `src/lib/payload.ts` côté Astro).
