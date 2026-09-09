# ==========================================
# Oxycare Diagnostics - Multi-stage Dockerfile
# Optimized for Dokploy / Docker Deployment
# ==========================================

# Stage 1: Build Frontend and Backend
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install stable pnpm matching workspace version
RUN npm install -g pnpm@10.33.3

# Copy package manifests for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc* ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/diagnostic-center/package.json ./artifacts/diagnostic-center/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY scripts/package.json ./scripts/

# Install dependencies with approved build scripts
RUN pnpm install

# Copy source tree
COPY . .

# Build all workspace packages
ENV NODE_ENV=production
RUN pnpm run build

# Stage 2: Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

# Copy root configurations and runtime node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=builder /app/artifacts/diagnostic-center/dist ./artifacts/diagnostic-center/dist
COPY --from=builder /app/artifacts/diagnostic-center/package.json ./artifacts/diagnostic-center/package.json
COPY --from=builder /app/lib ./lib

# Healthcheck for Dokploy / Docker Swarm / Traefik
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5001) + '/api/healthz', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

EXPOSE 5001

CMD ["node", "artifacts/api-server/dist/index.mjs"]
