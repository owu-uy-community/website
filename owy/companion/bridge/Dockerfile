# syntax=docker/dockerfile:1
# Owy Companion bridge. Built from the repo root (the pitch clips manifest lives in public/):
#   docker compose -f owy/companion/bridge/compose.yaml up -d --build
# Only what the bridge reads at runtime gets in (Dockerfile.dockerignore is an allowlist):
# no .env files, no firmware secrets — compose passes those in at run time.

FROM node:24-alpine AS deps
WORKDIR /app/owy
RUN npm install -g pnpm@11.10.0
COPY owy/package.json owy/pnpm-lock.yaml owy/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=owy-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store

FROM node:24-alpine
ENV NODE_ENV=production \
    COMPANION_BIND_HOST=0.0.0.0
WORKDIR /app/owy
COPY --from=deps /app/owy/node_modules ./node_modules
COPY owy/package.json owy/tsconfig.json ./
COPY owy/agent ./agent
COPY owy/companion/bridge/src ./companion/bridge/src
COPY owy/companion/bridge/prompts ./companion/bridge/prompts
COPY public/companion-audio/clips/manifest.json /app/public/companion-audio/clips/manifest.json
# The web bridge writes its local-preview rendezvous file here.
RUN mkdir -p companion/.eve && chown node:node companion/.eve
USER node
EXPOSE 3312 3313
# In-process tsx (no wrapper process) so SIGTERM reaches the bridge's own shutdown.
CMD ["node", "--import", "tsx", "companion/bridge/src/main.ts"]
