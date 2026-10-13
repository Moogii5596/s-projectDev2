---
title: "07_Tech_Stack_and_Environment: Технологийн Сонголтын Баримт Бичиг"
type: "Architecture"
status: "Active"
last_updated: 2026-10-08
tags: [stack]
---

# 07_Tech_Stack_and_Environment: Технологийн Сонголтын Баримт Бичиг

**Хувилбар:** v1.1.0  
**Огноо:** 2026-09-20  
**Өмнөх хувилбар:** v1.1.0 → Section 9 (Хөгжүүлэлтийн Үе Шат) нэмэв.  
**Батлагдсан:** Төслийн архитектор

---

## 1. Батлагдсан Технологийн Стек

### 1.1. Бүрэлдэхүүн хэсгүүдийн хүснэгт

| Бүрэлдэхүүн | Технологи | Хувилбар | Тайлбар |
|---|---|---|---|
| **Хэл** | TypeScript | ^5.4 | Backend + Frontend хоёулаа |
| **Backend Framework** | NestJS | ^10.x | Core Kernel + Module Services |
| **Frontend Framework** | React | ^18.x | UI Shell + Module Federation |
| **Build Tool** | Vite | ^5.x | Frontend build |
| **Database** | PostgreSQL | 15+ | Supabase (local/cloud) |
| **Auth & Realtime** | Supabase | ^2.x | Auth + Realtime subscription |
| **ORM** | Prisma | ^5.x | Type-safe DB access + Migrations |
| **Cache / Pub-Sub** | Redis (ioredis) | ^5.x | Tenant slug cache + Event queue |
| **Testing** | Vitest + Supertest | ^1.x / ^6.x | Unit + Integration test |
| **NestJS Transform** | unplugin-swc + @swc/core | ^1.x / ^1.x | NestJS decorator metadata support (DI-009: esbuild дэмждэггүй) |
| **Monorepo** | Turborepo + pnpm | ^2.x / ^9.x | Workspace management |
| **Module Federation** | @module-federation/vite | ^0.x | Micro-Frontend |
| **Container** | Docker + Docker Compose | latest | Local dev environment |


> ⚠️ **pnpm Strict Mode (RESOLVE-001):** pnpm нь transitive dependency-г шууд ашиглахыг хориглоно.
> Зөвхөн `dependencies`-д жагсаасан package-г import хийж болно. Type-only import-д `import type` ашиглах шаардлагатай.
> Жишээ: `import type { Prisma } from '@prisma/client'` (Prisma transitive dep бол)

---

## 2. Монорепо Бүтэц (Turborepo + pnpm workspaces)

```
s-project/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
│
├── apps/
│   ├── core-kernel/          # NestJS — API Gateway, Auth, Module Registry
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── gateway/
│   │   │   │   ├── dynamic-ingress-router.service.ts
│   │   │   │   └── draining.interceptor.ts
│   │   │   ├── auth/
│   │   │   │   ├── tenant-auth.guard.ts
│   │   │   │   └── tenant-context.interceptor.ts
│   │   │   └── db/
│   │   │       └── prisma-tenant-client.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   │
│   ├── web-shell/            # React + Vite — Core UI Shell
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── slots/        # Module Federation UI Slot-ууд
│   │   └── vite.config.ts
│   │
│   └── modules/
│       └── material-requisition/   # NestJS Module Service (port 4001)
│           ├── src/
│           │   ├── mr.module.ts
│           │   └── services/
│           ├── manifest.json
│           └── package.json
│
├── packages/
│   ├── shared-types/         # Хуваалцсан TypeScript interface-үүд
│   ├── ui-components/        # Хуваалцсан React компонентууд
│   └── prisma-rls-extension/ # Tenant RLS Prisma Extension (npm package)
│
└── supabase/
    ├── config.toml
    └── migrations/
        ├── 0001_initial_schema.sql
        ├── 0002_rls_policies.sql
        └── 0003_force_rls_and_pool_hardening.sql
```

---

## 3. Supabase Local Суулгалт ба Тохиргоо

### 3.1. Суулгах

```bash
# Supabase CLI суулгах
npm install -g supabase

# Төслийн root-д Supabase эхлүүлэх
supabase init

# Docker дээр Supabase local асаах
supabase start
```

### 3.2. `supabase start` гарсан port-ууд

```
API URL:        http://localhost:54321
GraphQL URL:    http://localhost:54321/graphql/v1
DB URL:         postgresql://postgres:postgres@localhost:54322/postgres
Studio URL:     http://localhost:54323
Inbucket URL:   http://localhost:54324
JWT secret:     <supabase/config.toml-оос авна>
anon key:       <supabase start гарсан утга>
service_role key: <supabase start гарсан утга>
```

### 3.3. `supabase/config.toml` үндсэн тохиргоо

```toml
[api]
enabled = true
port = 54321
schemas = ["public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323

[auth]
enabled = true
# JWT secret — TenantAuthGuard ашигладаг
jwt_expiry = 3600
enable_signup = true
```

### 3.4. Migration ажиллуулах

```bash
# Migration файлуудыг Supabase local-д ажиллуулах
supabase db push

# Эсвэл шинэ migration үүсгэх
supabase migration new <migration_name>
supabase db push
```

---

## 4. Environment Variables

### 4.1. Core Kernel (`.env.local`)

```bash
# Supabase Local
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<supabase start гарсан service_role key>
SUPABASE_ANON_KEY=<supabase start гарсан anon key>

# Prisma — Supabase local PostgreSQL шууд холболт
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres?connection_limit=20&pool_timeout=10"
DIRECT_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Redis
REDIS_URL=redis://localhost:6379

# App
PORT=3000
NODE_ENV=development
```

### 4.2. Material Requisition Module (`.env.local`)

```bash
# Supabase Local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<supabase start гарсан anon key>

# Prisma
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres?connection_limit=10"
DIRECT_URL="postgresql://postgres:postgres@localhost:54322/postgres"

# Redis
REDIS_URL=redis://localhost:6379

# Module
PORT=4001
MODULE_ID=material-requisition
```

### 4.3. Frontend Web Shell (`.env.local`)

```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<supabase start гарсан anon key>
VITE_API_BASE_URL=
```

---

## 5. `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'apps/modules/*'
  - 'packages/*'
```

---

## 6. `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "db:push": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

---

## 7. Docker Compose (Local Dev)

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # Supabase local нь тусдаа `supabase start` командаар ажиллана
  # Supabase Studio: http://localhost:54323

volumes:
  redis_data:
```

```bash
# Хөгжүүлэлтийн орчин эхлүүлэх дараалал:

# 1. Supabase local асаах (PostgreSQL + Auth + Realtime + Studio)
supabase start

# 2. Redis асаах
docker-compose up -d redis

# 3. Migration ажиллуулах
supabase db push

# 4. Бүх app-уудыг хамт хөгжүүлэх горимд асаах
pnpm dev
```

---

## 8. Технологийн Сонголтын Үндэслэл

### 8.1. Яагаад NestJS?

- TypeScript-д суурилсан, декораторт архитектур (Guard, Interceptor, Injectable) нь Core Kernel-н middleware stack-тэй төгс нийцнэ
- `APP_GUARD` + `APP_INTERCEPTOR` нь бүх route-д автоматаар хамрагдах тул tenant isolation алдаатай хийх боломжгүй
- Dependency Injection нь тест бичихэд ихээхэн тусалдаг

### 8.2. Яагаад Supabase?

- Auth (JWT), Realtime (WebSocket), Storage, Studio — нэг платформд бүгд бэлэн
- Custom WebSocket Gateway бичих шаардлагагүй — Supabase Realtime нь RLS-г автоматаар дагана
- Local dev-д `supabase start` нэг командаар бүрэн орчин асна
- Production-д Supabase Cloud-рүү шилжихэд тохиргоо бараг өөрчлөгдөхгүй

### 8.3. Яагаад Prisma?

- Type-safe query builder — TypeScript-тэй төгс нийцдэг
- `$extends` API нь tenant RLS guard-ийг transparent байдлаар бүх query-д нэмдэг
- Migration management — Supabase migration-тэй хамт ажилладаг

### 8.4. Яагаад Redis?

- Tenant slug → tenant_id cache (subdomain resolution)
- Outbox event queue-ийн pub/sub
- Session cache (хэрэв шаардлагатай бол)

### 8.5. Яагаад Module Federation?

- Plug-in модулиуд Runtime-д Core Shell-д холбогддог
- Тусдаа deploy — нэг модулийг шинэчлэхэд бусдад нөлөөлөхгүй
- Tenant-д зориулж идэвхжүүлэх/идэвхгүй болгох боломжтой

---

## 9. Хөгжүүлэлтийн Үе Шат — Modular Monolith → Microservice

> **Гол зарчим:** Эхлээд хурдан ажиллах, ачаалал нэмэгдэхэд салгах.  
> Архитектурын хилийг эхнээс нь зөв тавибал salga хялбар.

### 9.1. Phase 1 — Modular Monolith (Эхний ээлж)

```
s-project/
└── apps/
    └── core-kernel/          ← Нэг NestJS app
        └── src/
            ├── app.module.ts           ← Бүх модулийг import хийнэ
            ├── gateway/                ← API Gateway, Route Ingress
            ├── auth/                   ← TenantAuthGuard, JWT
            ├── db/                     ← Prisma RLS Extension
            └── modules/
                ├── material-requisition/   ← @Module() — өөрийн Controller, Service, хүснэгт
                └── workflow-engine/        ← @Module() — өөрийн Controller, Service, хүснэгт
```

**Шийдвэрүүд:**

- Core Kernel + бүх модулиуд **нэг NestJS app** дотор `@Module()` болгон зохион байгуулагдана
- Модуль бүр **өөрийн** Controller, Service, Prisma model-уудыг агуулна
- Модуль бүр өөрийн хүснэгтүүдтэй — **хөрш модулийн хүснэгт рүү шууд SQL JOIN хийхийг хатуу хориглоно**
- Модуль хоорондын харилцаа: `EventEmitter2` (in-process, синхрон биш)
- Frontend: App Shell + модуль UI-г Module Federation-аар холбоно

**Давуу тал:**
- Нэг `supabase start` + нэг `pnpm dev` — орчин тохируулах хамгийн хурдан арга
- TypeScript type-check, refactor, test нэг codebase дотор
- Deploy нэг container — девелопментын зардал хамгийн бага

---

### 9.2. Phase 2 — Microservice Extraction (Ачаалал нэмэгдэхэд)

```
s-project/
└── apps/
    ├── core-kernel/              ← API Gateway + Auth (port 3000)
    └── modules/
        ├── material-requisition/ ← Тусдаа NestJS app (port 4001)
        └── workflow-engine/      ← Тусдаа NestJS app (port 4002)
```

**Шилжилтийн алхамууд:**

1. `apps/modules/material-requisition/` хавтас болгон гаргах
2. `manifest.json`-н `target_port: 4001` тохируулах — Gateway шинэ хаяг руу чиглүүлнэ
3. `EventEmitter2` (in-process) → **Redis pub/sub** болж солигдоно
   - Event interface өөрчлөгдөхгүй (`workflow.instance.start` гэх мэт CloudEvents)
   - Зөвхөн тээврийн давхарга (transport layer) өөрчлөгдөнө
4. Тусдаа Docker container, тусдаа CI/CD pipeline

**Хамгийн чухал дүрэм — Phase 1-д аль хэдийн баримтлах ёстой:**

```
✅ Зөв:   ModuleA → EventBus → ModuleB  (event-driven)
❌ Буруу: ModuleA → prisma.moduleB_table.findMany()  (шууд DB хандалт)
❌ Буруу: ModuleA → ModuleBService.someMethod()  (шууд Service дуудалт)
```

> Модуль бүр зөвхөн **өөрийн** Prisma model-уудыг ашигладаг байх нь Phase 2-д ямар ч өвдөлтгүй салгах баталгаа юм.

---

### 9.3. Phase Шилжилтийн Шалгуур

| Үзүүлэлт | Phase 1 → Phase 2 шилжих нөхцөл |
|---|---|
| Хүсэлтийн тоо | Модуль 500+ RPS хүрэх |
| Deploy давтамж | Тухайн модуль бусдаас 2x+ олон deploy хийгдэх |
| Баг хэмжээ | Модуль тусдаа баг хариуцах болох |
| Ачааллын шаардлага | Тусдаа scale хийх шаардлага гарах |
