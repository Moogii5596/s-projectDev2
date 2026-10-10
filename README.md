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

# Supabase CLI — root devDependency, `pnpm install`-ээр хамт суулгагдана
# ⚠️ npm install -g supabase ажиллахгүй (CLI дэмждэггүй)
```

> **Шинэ машин дээр анх тохируулах** (Windows: Docker, Node, ExecutionPolicy, 3 `.env`-г автоматаар үүсгэх скрипт, алдаанууд): `docs/07_Tech_Stack_and_Environment/02_Local_Supabase_Docker_Windows.md`

### 2. Клон хийж эхлүүлэх

```bash
# Dependencies суулгах
pnpm install

# .env файлууд: .env, apps/core-kernel/.env, apps/web-shell/.env
# Supabase асаасны дараа үүсгэнэ — key-ууд `pnpm supabase status -o env`-ээс
# (ANON_KEY / SERVICE_ROLE_KEY = eyJ…; sb_publishable_/sb_secret_ БИШ)
# Автомат скрипт: docs/07_Tech_Stack_and_Environment/02_Local_Supabase_Docker_Windows.md §1.5
```

### 3. Supabase local ажиллуулах

```bash
# Supabase Docker containers асаах
pnpm supabase:start

# JWT key-ууд авах (.env-д)
pnpm supabase status -o env

# .env-д байгаа утгуудыг supabase status гаралтаар солих
```

### 4. Хөгжүүлэлтийн орчин

```bash
# Redis-г Docker-т ажиллуулах
docker-compose -f docker-compose.dev.yml up -d

# Prisma client үүсгэх (migration-уудыг supabase:start өөрөө хэрэглэсэн — Prisma `db push` хэрэглэхгүй [MIG-001]; шинэ migration: `pnpm db:migrate`)
pnpm db:generate

# admin@test.mn-ийг Supabase Auth-д үүсгэж core_users-тэй холбох (supabase:reset бүрийн дараа)
pnpm dev:test-user

# Development server асаах
pnpm dev
```

### 5. Тест ажиллуулах

```bash
# Unit тестүүд (сервергүй, ~10с)
pnpm test

# Integration тестүүд (Supabase ажиллаж байх ёстой)
pnpm test:integration

# E2E (Playwright) — backend + web-shell-ийг өөрөө асааж, тестийн tenant/хэрэглэгчдийг үүсгээд устгана
pnpm playwright:install   # анх удаа
pnpm test:e2e

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
