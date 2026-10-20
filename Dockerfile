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

# --- Unit tests with coverage (built only for the unit-test-results target, never for the image) ---
# Runs the template's own `npm test`, adding JUnit results (jest-junit) and Cobertura coverage
# (Jest's own reporter), then writes the test command's exit code beside them. The RUN always
# succeeds, so a failing test keeps its results; the build stops on the exit code afterwards.
FROM builder AS unit-tests
# A test file that does not compile is reported in the JUnit file as an error, not left out.
ENV JEST_JUNIT_OUTPUT_DIR=/unit-test-results/test-coverage/unit-tests \
  JEST_JUNIT_REPORT_TEST_SUITE_ERRORS=true
RUN mkdir -p /unit-test-results/test-coverage/unit-tests /unit-test-results/test-coverage/coverage \
  && npm test -- --coverage --coverageReporters=cobertura \
    --coverageDirectory=/unit-test-results/test-coverage/coverage \
    --reporters=default --reporters=jest-junit; \
  echo $? > /unit-test-results/unit-tests-exit-code

# --- The test results alone, for a local export (--target unit-test-results --output type=local) ---
FROM scratch AS unit-test-results
COPY --from=unit-tests /unit-test-results /

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
