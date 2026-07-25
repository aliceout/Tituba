# Carnet

Carnet de recherche personnel auto-hébergé, équivalent self-hosted d'un carnet
Hypothèses. Astro SSR + Payload, dockerisé, sans pisteur.

## Stack

- **Astro 6** (SSR Node standalone) — site public
- **Payload CMS v3** (Next.js 16 + Lexical) — admin + API sous `/cms/*`
- **Postgres 16** — bind mount, `push: true` (pas de migration formelle)
- Tout dockerisé. Zéro build CI sur le serveur.

## Dev

Prérequis : Node 22+, pnpm 10+, Docker.

```bash
# Secrets (Dev Setup VS Code ou infisical CLI)
# Arbo Infisical Cloud : /services/carnet/{payload,postgres,smtp,web}.
# La racine /services/carnet contient les clés communes (ADDRESS, etc.).
infisical export --env=dev --path=/services/carnet --format=dotenv > .env

# Deps
pnpm install
pnpm --dir services/payload install

# Postgres + Mailpit en bg
docker compose -f compose.dev.yml up -d

# Dev servers (un terminal par)
pnpm dev:api    # Payload → http://localhost:3001/cms/admin
pnpm dev:web    # Astro   → http://localhost:4321
```

Mailpit (capture des mails d'auth en local) : <http://localhost:8025>.

À chaque modif de schéma Payload :

```bash
pnpm --dir services/payload generate:types
pnpm --dir services/payload generate:importmap
```

Seed de démo (idempotent, refuse en prod) : `pnpm --dir services/payload seed:dev`

## Tests & CI

La CI (`.github/workflows/build.yml`) lance, sur PR comme sur push `main` :
lint frontend + backend, type-check Astro, tests unitaires Payload, et
build SSR smoke. Pour rejouer ces vérifs en local avant de pousser :

```bash
pnpm lint                               # ESLint frontend (Astro + TS)
pnpm --dir services/payload lint        # ESLint backend (Payload + react-hooks)
pnpm check                              # Astro check (TS .astro + .ts)
pnpm --dir services/payload test        # Tests Node natifs (node --test)
pnpm build                              # Build SSR Astro (smoke)
```

Tests Payload : ajoute des fichiers `*.test.ts` à côté du module testé
(modèle : `src/lib/extract-lexical-text.test.ts`, `src/zotero/mapping.test.ts`).
Le runner `node --test` les ramasse via le glob `src/**/*.test.ts`. Les
modules avec dépendance DB ne sont pas testables ici — la CI tourne
sans Postgres pour rester rapide ; pour tester un module qui touche
la DB, on monte un container éphémère.

Lint : flat config ESLint v9 des deux côtés (`eslint.config.mjs`).
Le backend Payload utilise `typescript-eslint` + `eslint-plugin-react-hooks`
plutôt que `eslint-config-next`, qui a un bug de structure circulaire
avec ESLint v9 (cf. vercel/next.js#68334).

## Prod

Push sur `main` → GitHub Actions build les images → push GHCR → webhook VPS →
[`scripts/deploy.sh`](scripts/deploy.sh) régénère le `.env`, pull les
nouvelles images, `docker compose up -d`.

Sample nginx (TLS terminé en amont, ports pilotés par Infisical
`prod /services/carnet/web`) :

```nginx
server {
  listen 443 ssl http2;
  server_name <ton-domaine>;
  ssl_certificate     /etc/letsencrypt/live/<ton-domaine>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<ton-domaine>/privkey.pem;

  location /cms/ { proxy_pass http://127.0.0.1:${PORT_PAYLOAD}; }
  location /     { proxy_pass http://127.0.0.1:${PORT_SITE}; }
}
```

Setup initial du VPS (1×) : cloner le repo, écrire les creds Infisical
Universal Auth dans `~/.config/infisical/carnet.env`, lancer
`./scripts/deploy.sh`. Cf. [`compose.yml`](compose.yml) pour les ports
internes / volumes.

### Forker sans Infisical

Notre setup utilise Infisical Cloud (même instance côté CI et côté VPS,
arbo `/services/carnet/<sub>`) pour les secrets, mais c'est optionnel.
Si tu fork le Carnet, deux modes sont détectés à l'exécution :

**Côté CI** ([`build.yml`](.github/workflows/build.yml)) — si le GH
secret `INFISICAL_API_URL` est posé, le workflow fetch tout depuis
Infisical. Sinon, il lit un GH secret `ADDRESS` directement (ex.
`carnet.toi.org`). C'est tout ce qu'il faut côté CI : un seul secret
GitHub.

**Côté VPS** ([`scripts/deploy.sh`](scripts/deploy.sh)) — si la CLI
`infisical` est installée ET que `~/.config/infisical/carnet.env`
existe, le script régénère le `.env` à chaque deploy. Sinon, il
suppose qu'un `.env` complet est déjà présent à la racine du repo
sur le VPS et le respecte tel quel. À toi de le poser à la main (ou
via Bitwarden / pass / ansible-vault / tout autre gestionnaire).

Les variables minimales à fournir dans le `.env` manuel :
`POSTGRES_PASSWORD`, `PAYLOAD_SECRET`, `ADDRESS`, `PORT_PAYLOAD`,
`PORT_SITE`, plus les `SMTP_*` pour les mails. Cf.
[`compose.yml`](compose.yml) pour la liste complète des variables
référencées.

## Structure

```
src/                       App Astro SSR (pages, components, layouts)
services/payload/          CMS Payload (Next.js + Postgres) → /cms/admin
public/                    Assets statiques
scripts/deploy.sh          Déploiement VPS
compose.yml                Compose prod (db, payload, site)
compose.dev.yml            Compose dev (postgres + mailpit)
.env.example               Vars d'env consommées par la stack
```

## Backup

Données persistantes en bind mount sous `$DATA_DIR` (= `$HOME/data/carnet/`
par défaut) :

- `$DATA_DIR/postgres/` — DB Payload
- `$DATA_DIR/payload-media/` — uploads

Backup recommandé via `restic` cron côté VPS (hors compose). Restore manuel :

```bash
docker compose down
restic restore <snapshot-id> --target /
docker compose up -d
```

## Migrations

`postgres-adapter` en mode `push: true` : schéma DB synchronisé avec le code
à chaque boot. **Pas de migration à générer.**

Trade-off conscient : data peu critique (contenu éditorial), schéma sous
code review (toute évolution passe par PR), single-user. Voir
[issue #18](https://github.com/aliceout/carnet/issues/18) pour le débat
v2 sur les migrations formelles.

## Charte

Tokens dans [`src/styles/global.css`](src/styles/global.css). Couleur
d'accent et fond éditables depuis `/cms/admin/globals/site` (section
*Branding*) — palette de 5 teintes accent + 6 teintes fond.

Polices self-hostées via `@fontsource` : Source Serif 4 (corps), Inter
(UI), JetBrains Mono (technique).

## Sobriété, accessibilité, RGPD

WCAG AA visé. Aucun Google Fonts, aucun tracker, aucun cookie tiers. Sitemap
auto, OG par page, mentions légales + politique confidentialité présentes.
Pas de pop-up cookies — rien à consentir.

## Licence

Code : **AGPL-3.0** ([`LICENSE`](LICENSE)). Contenu (billets) :
**CC BY-NC-SA 4.0**.
