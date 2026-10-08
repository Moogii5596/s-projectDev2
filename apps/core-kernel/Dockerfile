# ── Stage 1: Builder ──────────────────────────────────────────
# Node 22+ шаардлагатай: @supabase/supabase-js realtime client native WebSocket ашигладаг
FROM node:22-alpine AS builder

# Prisma engine-ийн зөв OpenSSL хувилбарыг detect хийхэд шаардлагатай
RUN apk add --no-cache openssl

RUN npm install -g pnpm@9.12.0

WORKDIR /app

# Workspace файлууд
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY tsconfig.json ./

# Package.json-үүд (layer cache-д)
COPY apps/core-kernel/package.json ./apps/core-kernel/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/prisma-rls-extension/package.json ./packages/prisma-rls-extension/

# Dependencies суулгах
RUN pnpm install --frozen-lockfile

# Source код хуулах
COPY apps/core-kernel/ ./apps/core-kernel/
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/prisma-rls-extension/ ./packages/prisma-rls-extension/

# Prisma client үүсгэх
RUN cd apps/core-kernel && npx prisma generate
RUN if [ ! -d /app/node_modules/.prisma ]; then \
      SRC=$(find /app/node_modules/.pnpm /app/apps -maxdepth 8 -type d -name '.prisma' 2>/dev/null | head -1); \
      if [ -n "$SRC" ]; then \
        mkdir -p /app/node_modules/.prisma && cp -rn "$SRC"/. /app/node_modules/.prisma/; \
      else \
        echo "ERROR: .prisma not found after prisma generate"; exit 1; \
      fi; \
    fi
  RUN CLIENT_SRC=$(find /app/node_modules/.pnpm -type d -path '*/node_modules/@prisma/client' | head -1); \
    if [ -z "$CLIENT_SRC" ]; then echo "ERROR: generated Prisma client not found"; exit 1; fi; \
    mkdir -p /app/generated-prisma-client && cp -rn "$CLIENT_SRC"/. /app/generated-prisma-client/
  RUN ENGINE_SRC=$(find /app/node_modules -type d -path '*/.prisma/client' | head -1); \
    if [ -z "$ENGINE_SRC" ]; then echo "ERROR: generated Prisma engine client not found"; exit 1; fi; \
    mkdir -p /app/generated-prisma-engine && cp -rn "$ENGINE_SRC"/. /app/generated-prisma-engine/

# Build
RUN pnpm --filter @s-project/core-kernel build

# ── Stage 2: Production ───────────────────────────────────────
FROM node:22-alpine AS production

# Prisma engine-д шаардлагатай OpenSSL
RUN apk add --no-cache openssl

RUN npm install -g pnpm@9.12.0

WORKDIR /app

ENV NODE_ENV=production

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

COPY apps/core-kernel/package.json ./apps/core-kernel/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/prisma-rls-extension/package.json ./packages/prisma-rls-extension/

COPY --from=builder /app/node_modules ./node_modules
# pnpm workspace: apps/core-kernel-ийн шууд dependency-үүд энд symlink болно
COPY --from=builder /app/apps/core-kernel/node_modules ./apps/core-kernel/node_modules

COPY --from=builder /app/apps/core-kernel/dist ./apps/core-kernel/dist

WORKDIR /app/apps/core-kernel

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/src/main.js"]
