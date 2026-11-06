---
title: "Codebase Map — хөгжүүлэлтийн эхлэх цэг"
type: "Guide"
status: "Active"
last_updated: 2026-10-13
tags: [codebase, moc, onboarding]
---

# Codebase Map — хөгжүүлэлтийн эхлэх цэг

> **Зорилго:** хөгжүүлэлтийн чат кодыг бүхэлд нь уншихгүйгээр, энэ хавтсын баримтаас бүх контекстээ авна. Код нээх нь зөвхөн **засах гэж буй файл**.
> Гараар: [[00_Codebase_Map]] · [[01_Backend_Modules]] · [[04_Frontend_Map]] · [[08_Patterns]] — код өөрчлөгдөхөд шинэчилнэ (RULE-21).
> Автомат (`pnpm docs:gen`): [[02_API_Catalog]] · [[03_DB_Catalog]] · [[05_Permissions_Catalog]] · [[06_Config_Env]] · [[07_Test_Map]] · [[09_Frontend_Routes]]

## 1. Унших дараалал (хөгжүүлэлтийн чат)

1. [[CONTEXT]] (ажлын төрөл → файл) → [[project-status]] → одоогийн спринтийн tech plan + progress (жишээ нь [[07_v0.2.2_tech_plan]], [[08_v0.2.2_progress]])
2. **Энэ файл** → даалгаварт хамаарах модулийн хэсэг [[01_Backend_Modules]] / [[04_Frontend_Map]]
3. Хэрэгцээгээр **зөвхөн холбогдох хэсгийг**: endpoint → [[02_API_Catalog]], хүснэгт → [[03_DB_Catalog]], эрх → [[05_Permissions_Catalog]], тест → [[07_Test_Map]]
4. Код бичих дүрэм → [[08_Patterns]] (RULE-01~21-ийн хураангуй + жишээ файл), алдааны сургамж → [[lessons_learned]]
5. Кодыг нээх: зөвхөн засах файл + түүний шууд хамаарал. **Хайх гэж бүх модулийг уншихгүй** — каталогоос файл:мөрийг ол.

> Каталог хоцорсон бол (`pnpm docs:check` → ✗) эхлээд `pnpm docs:gen`.

## 2. Repo бүтэц

| Зам | Юу | Дэлгэрэнгүй |
|---|---|---|
| `apps/core-kernel/` | Backend — NestJS + Fastify, Prisma 5 (`prisma/schema/*.prisma` — модуль бүр тусдаа файл, R22; = client л), угтвар `/api/v1` | [[01_Backend_Modules]] |
| `apps/web-shell/` | Frontend — React 18, Vite 6, TanStack Query v5, axios | [[04_Frontend_Map]] |
| `apps/mfe-requisitions/` | Module Federation remote (MR) — `/mfe/*` | [[04_Frontend_Map]] §5 |
| `apps/e2e/` | Playwright E2E + `load-test.ts`, `cluster-check.ts` | [[07_Test_Map]] |
| `packages/i18n/` | Frontend орчуулга `web.{mn,en,zh}.json` | [[04_Frontend_Map]] §4, [[i18n-review]] |
| `packages/shared-types/` | Backend ↔ frontend нийтлэг type | — |
| `packages/prisma-rls-extension/` | Prisma RLS extension | [[ADR-001_Tenant_Isolation]] |
| `supabase/migrations/` | **Schema-ийн ганц эх сурвалж** (MIG-001) — 44+ `.sql` | [[03_DB_Catalog]] |
| `supabase/dev/` | `rls_audit.sql`, `camp_e2e_grant.sql` г.м. dev SQL | [[02_Local_Supabase_Docker_Windows]] |
| `deploy/pilot/` | Пилот: `pilot.ps1`, Caddyfile, `.env.pilot.example` | [[04_Pilot_Camp_Windows]], [[05_Cloudflare_Tunnel]] |
| `docker/`, `docker-compose*.yml` | Docker build (backend Node 22, shell nginx) | [[03_Enterprise_VPC_Deployment]] |
| `scripts/docs/` | `gen-codebase-docs.mjs` — энэ хавтсын автомат каталог | RULE-21 |
| `docs/` | Obsidian vault (энэ) · `docs/_learning/` — сургалт (git-ээс нуусан) | [[INDEX]] |

## 3. Хүсэлтийн урсгал (backend)

```
HTTP (Caddy → :3000 / пилот :3100)
 └─ configure-app.ts (common/http)   — глобал угтвар api/v1, ValidationPipe, multipart (main.ts ба БҮХ integration тест үүнийг дуудна)
     └─ TenantAuthGuard (auth/, APP_GUARD — RULE-07)
         · JWT (Supabase) → Host/slug → tenant (tenant-slug.ts; dedicated горимд DEDICATED_TENANT_SLUG)
         · membership cache (tenant-cache.service.ts, SEC-001) · @SkipAuth() → алгасна
         · must_change_password → зөвхөн @AllowPasswordChangeRequired route
     └─ TenantRateLimitGuard (APP_GUARD) · TenantContextInterceptor · DrainingInterceptor (gateway/) · I18nInterceptor (хэл, байгууллагын орчуулга) — бүгд app.module.ts-д глобал
         └─ Controller (зөвхөн params/DTO, reqUser(req)) → Service
             └─ inTenantTx (db/tenant-tx.ts; Кемп — modules/camp/common/camp-tx.ts, ижил нэртэй) — set_config('app.tenant_id') + бүх query НЭГ tx (RULE-03/04)
                 └─ Prisma → DATABASE_URL = app_user (NOBYPASSRLS) → RLS policy `tenant_isolation_*`
                 └─ Outbox мөр (event-bus) → OutboxPoller → Redis publish / DLQ
```

- **Хоёр DB холболт:** `DATABASE_URL` = `app_user` (RLS идэвхтэй, бүх tenant ажил) · `SYSTEM_DATABASE_URL` = `postgres` (tenant lookup, login, outbox, onboarding, тест бэлтгэл) — `db/system-prisma.service.ts`.
- **Хэрэглэгчийн ID:** `req.user.id` = Supabase **authId** ≠ `core_users.id` → FK-д `resolveUserId` (RULE-13).
- **Алдаа:** `common/i18n/app-error.ts` — код + параметр (`camp.err.assets.11`), мессеж `common/i18n/messages.ts` (mn/en/zh).

## 4. Хаанаас олох вэ

| Хэрэгцээ | Хаана |
|---|---|
| Endpoint байгаа эсэх, ямар service, ямар эрх | [[02_API_Catalog]] |
| Хүснэгт, багана, FK, RLS policy, enum, SQL функц | [[03_DB_Catalog]] |
| Кемпийн эрхийн код, анхдагч роль | [[05_Permissions_Catalog]] |
| `.env` хувьсагч, pnpm команд | [[06_Config_Env]] |
| Аль тест юуг шалгадаг, команд | [[07_Test_Map]] |
| Frontend route → хуудас | [[09_Frontend_Routes]] |
| Модулийн зорилго, гол файл, хамаарал | [[01_Backend_Modules]] · [[04_Frontend_Map]] |
| Шинэ модуль / endpoint / migration / тест бичих загвар | [[08_Patterns]] · [[03_Module_Template]] |
| Архитектурын шийдвэр (яагаад) | ADR: [[ADR-001_Tenant_Isolation]], [[ADR-003_Users_Login_Permissions]], [[ADR-005_Org_Connectivity_Domains]], [[ADR-006_HR_Core_Module]] |
| Орчин асаах, тест ажиллуулах | [[02_Local_Supabase_Docker_Windows]] |
| Пилот / staging дээр шинэчлэх | [[04_Pilot_Camp_Windows]] |
| Өмнө гарсан алдаа | [[lessons_learned]] |

## 5. Хөгжүүлэлтийн орчин (товч)

- Windows + Docker Desktop (Supabase local 54321–54323, Redis 6379) · PowerShell **5.1** (`pwsh` байхгүй) · pnpm workspaces + Turborepo.
- Backend `:3000`, frontend `:5173` (Vite proxy `/api` → 3000, RULE-19).
- Гол командууд: `pnpm dev`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm lint`, `pnpm type-check`, `pnpm supabase:reset`, `pnpm db:generate`, **`pnpm docs:gen` / `pnpm docs:check`** — бүрэн жагсаалт [[06_Config_Env]].
