# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22.12.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

FROM base AS deps-dev
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Development / test image: includes dev dependencies and the test suite.
FROM base AS dev
ARG GIT_COMMIT=unknown
ENV NODE_ENV=development GIT_COMMIT=${GIT_COMMIT}
COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]

# Production image: runtime dependencies and source only, read-only for the app user.
FROM base AS prod
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production GIT_COMMIT=${GIT_COMMIT}
COPY --from=deps-prod /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
