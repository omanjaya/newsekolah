# syntax=docker/dockerfile:1
# Build context must be the monorepo root: docker build -f apps/web/Dockerfile .

FROM node:24-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @newsekolah/web...

FROM deps AS build
COPY openapi ./openapi
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
# Build the workspace dependencies (api-client, ui, schemas, i18n, ui-tokens,
# config) before web: their package "exports" point at compiled dist/ output,
# so web cannot resolve them until they are built. The "..." selector includes
# web and its dependencies, and pnpm runs the builds in topological order.
RUN pnpm --filter "@newsekolah/web..." build

FROM node:24-alpine AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1
CMD ["node", "apps/web/server.js"]
