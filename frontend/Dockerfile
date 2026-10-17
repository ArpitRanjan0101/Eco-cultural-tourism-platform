# syntax=docker/dockerfile:1.7
# Targets: dev (dev server, lint, unit tests) · prod (standalone runtime) · e2e (Playwright smoke tests).
# BuildKit cache mounts keep the npm cache and Next's build cache between builds (DECISIONS W27).
ARG NODE_IMAGE=node:22.23.2-bookworm-slim
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NEXT_TELEMETRY_DISABLED=1
# npm 10.9.x (bundled with Node 22) crashes resolving this dependency tree (`edgesOut` of null); pin the npm
# that generated package-lock.json so lockfile generation and `npm ci` always use the same version.
RUN --mount=type=cache,target=/root/.npm npm install -g npm@11.21.0

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Development image: dev server, lint and unit/component tests. Source is bind-mounted by compose.dev.yml.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
# Volumes mounted here start from the image's ownership, so the non-root dev server can write its cache.
RUN mkdir -p .next && chown node:node .next
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production build. The token below is a canary, not a secret: the build fails if it appears in any
# client-visible file (DECISIONS W19). This stage is never shipped; prod copies only the build output.
FROM base AS build
ENV NODE_ENV=production \
    INTERNAL_SERVICE_TOKEN=bundle-canary-7f3d9a1c5e8b2f4a6d0c9e1b3a5f7d2c
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build && npm run check:bundle

# Production runtime: standalone server only, non-root, no dev dependencies.
FROM ${NODE_IMAGE} AS prod
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

# Browser smoke tests. Installs only the test runner (its version must equal the image tag), not the app.
FROM ${PLAYWRIGHT_IMAGE} AS e2e
WORKDIR /e2e
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
RUN --mount=type=cache,target=/root/.npm npm init -y > /dev/null && npm install --save-exact @playwright/test@1.63.0 @axe-core/playwright@4.13.0
COPY playwright.config.js ./
COPY src/tests/e2e ./src/tests/e2e
CMD ["npx", "playwright", "test"]
