# Payload CMS — image runtime (non-standalone) avec CLI dispo pour les
# migrations au boot. Le standalone Next.js ne trace pas le CLI payload,
# donc on ne pourrait pas appliquer les migrations sans copier source +
# node_modules complets dans l'image. Plutôt que de bidouiller, on garde
# une image classique : tous les node_modules + sources + .next embarqués.

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app


FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile


FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm run build


FROM base AS runner
WORKDIR /app

# GIT_COMMIT / GIT_TAG injectés au build (cf. .github/workflows/build.yml).
# Lus à l'exécution par la page Site (Payload admin) via process.env.
ARG GIT_COMMIT=dev
ARG GIT_TAG=dev

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    GIT_COMMIT=$GIT_COMMIT \
    GIT_TAG=$GIT_TAG

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# .next compilé + node_modules complet (CLI payload accessible via .bin/payload)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
# scripts/ inclut migrate-to-payload.ts qu'on lance ad-hoc via
# `docker exec ... npx tsx scripts/migrate-to-payload.ts` pour
# (ré)importer du contenu Sveltia depuis content/.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/cms/api/access > /dev/null 2>&1 || exit 1

# Migrate (idempotent : no-op si déjà à jour) puis start. Les binaires
# .bin/* sont des shell wrappers pnpm — on les appelle directement.
CMD ["sh", "-c", "./node_modules/.bin/payload migrate && ./node_modules/.bin/next start -p 3001"]
