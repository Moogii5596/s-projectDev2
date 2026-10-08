# S Project — Multi-Tenant Supply Chain Platform

## Эхлүүлэх (Quick Start)

### 1. Урьдчилсан шаардлага
- Node.js 20+
- pnpm 9+
- Docker Desktop
- Supabase CLI

```bash
# pnpm суулгах
npm install -g pnpm@9.12.0

# Supabase CLI суулгах
npm install -g supabase@latest
```

### 2. Клон хийж эхлүүлэх

```bash
# Dependencies суулгах
pnpm install

# .env файл үүсгэх
cp .env.example .env
```

### 3. Supabase local ажиллуулах

```bash
# Supabase Docker containers асаах
pnpm supabase:start

# Credentials авах (DATABASE_URL гэх мэт)
supabase status

# .env-д байгаа утгуудыг supabase status гаралтаар солих
```

### 4. Хөгжүүлэлтийн орчин

```bash
# Redis-г Docker-т ажиллуулах
docker-compose -f docker-compose.dev.yml up -d

# Prisma client үүсгэх
pnpm db:generate

# Migration ажиллуулах
pnpm db:push

# Development server асаах
pnpm dev
```

### 5. Тест ажиллуулах

```bash
# Unit тестүүд
pnpm test

# Integration тестүүд (Supabase ажиллаж байх ёстой)
pnpm test:integration

# Coverage
pnpm --filter @s-project/core-kernel test:coverage
```

## Архитектур

```
s-project/
├── apps/
│   ├── core-kernel/     # NestJS API Gateway (port 3000)
│   └── web-shell/       # React + Vite Frontend (port 5173)
├── packages/
│   ├── shared-types/    # TypeScript interface-үүд
│   └── prisma-rls-extension/  # Tenant RLS Prisma Extension
└── supabase/
    └── migrations/      # SQL migration файлууд
```

## Технологийн стек

| Давхарга | Технологи |
|----------|-----------|
| Backend | NestJS + TypeScript |
| Frontend | React + Vite |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Cache | Redis (ioredis) |
| Auth | Supabase Auth |
| Test | Vitest + Supertest |
| Monorepo | Turborepo + pnpm |
