# syntax=docker/dockerfile:1
# Multi-stage build — NODE-D15 (pinned node:22-alpine), NODE-D21 (non-root, omit dev deps).

FROM --platform=$TARGETARCH node:22-alpine AS base
WORKDIR /app

# --- Full dependencies (incl. devDeps) for the build ---
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- Compile TypeScript -> dist (nest build) ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Production dependencies only (NODE-D21: npm ci --omit=dev) ---
FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Slim runtime image ---
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Non-root user (uid/gid 1001).
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs config.*.json ./

USER nodejs

EXPOSE <port-number>

# Hits the root health path (NODE-D12). Uses Node's http (no extra packages).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:<port-number>/health/startup',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
