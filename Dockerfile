# Image d'Axion Partners — QA-T04 (REQ-QA-019, REQ-QA-020).
#
# - L'entrée (`docker-entrypoint.sh`) migre en BLOQUANT avant de lancer le serveur.
# - Le HEALTHCHECK interroge `/api/readyz`, jamais `/api/livez` : une sonde de vie déclarerait
#   saine une instance qui ne sait pas servir (base, cache, environnement ou migration en défaut).
#   La sonde de la plateforme pointe sur le même chemin.
# - L'environnement est jugé au démarrage du serveur (`register()` de `src/instrumentation.ts`) :
#   une variable requise absente le fait sortir en code non nul. Liste : `docs/env.md`.
# - Aucune variable d'environnement n'est posée ici hors `NODE_ENV` : elles viennent de la plateforme.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS construction
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec next build

FROM base AS execution
ENV NODE_ENV=production
COPY --from=construction --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/readyz').then((r) => process.exit(r.status === 200 ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
