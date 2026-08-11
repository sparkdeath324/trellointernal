# syntax=docker/dockerfile:1

# Multi-stage build producing a small runtime image from Next's standalone
# output.
#
# This is the self-hosting path (Dokploy, Coolify, plain Docker). It runs the
# app against a SQLite file on a mounted volume. The Vercel deployment instead
# sets TURSO_DATABASE_URL and needs none of this — see the README.

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1


# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
    # `next build` renders the pages, which creates a SQLite file. Left in
    # place it would bake a stale database into the image and shadow the
    # mounted volume, so drop it — the real one is created on first request.
    && rm -rf .next/standalone/data


# --- runtime ---------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CRM_DB_PATH=/app/data/crm.db

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# The database lives on a mounted volume; create the mount point up front so
# it is owned by the app user even when the volume is empty.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
