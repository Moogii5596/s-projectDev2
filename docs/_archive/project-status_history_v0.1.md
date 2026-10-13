---
title: "project-status — түүх (v0.1.0 → v0.1.5, Кемп V1)"
type: "Log"
status: "Archived"
last_updated: 2026-10-13
tags: [status, archive]
---

> 🗄 2026-10-13-нд [[project-status]]-оос салгасан түүх (тестийн үр дүн, v0.1.x төлөв, архитектурын хуучин тайлбар). Одоогийн: [[project-status]], код → [[00_Codebase_Map]].


# S Project — Төслийн Явцын Тэмдэглэл

> Шинэчлэгдсэн: 2026-10-13 | **Сүүлийн release: `v0.2.1`** (пилот энэ хувилбар дээр) | **Хөгжүүлэлт: `v0.2.2`** ([[08_v0.2.2_progress]]) | v0.1 хаагдсан (2026-10-11)
> Код ойлгох: [[00_Codebase_Map]] (Codebase Atlas, `pnpm docs:gen`) · Баримт бичиг: `docs/` = Obsidian vault — эхлэх цэг [[INDEX]] (frontmatter + `[[wiki-link]]`, 2026-10-13)
> SemVer бодлого: [[VERSIONING]] | Changelog: [[CHANGELOG]]

---

## Технологийн стек

| Давхарга | Технологи |
|----------|-----------|
| Backend | NestJS + Fastify, TypeScript |
| ORM | Prisma 5, PostgreSQL |
| Auth | Supabase Auth (JWT) |
| Frontend | React 18, Vite 6, TanStack Query v5 |
| State | React Query + Zustand |
| Realtime | Supabase Realtime WebSocket |
| Cache | Redis (ioredis) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Орчны тохиргоо (local dev)

```
Backend:   http://localhost:3000  (NestJS, prefix: api/v1)
Frontend:  http://localhost:5173  (Vite dev server)
Supabase:  http://localhost:54321 (Auth)
           http://localhost:54322 (PostgreSQL)
           http://localhost:54323 (Studio)
Redis:     redis://localhost:6379
```

**Tenant:** `test-tenant` (id: `00000000-0000-0000-0000-000000000003`)
**Test user:** `admin@test.mn` / `test1234` (role: approver) — `pnpm dev:test-user`-ээр Auth-тай холбоно.
> ⚠️ [SEC-004]-ийн дараа MR үүсгэгч өөрөө батлахгүй — гараар шалгахад 2 дахь хэрэглэгч (APPROVER/ADMIN) хэрэгтэй.
> E2E өөрийн хэрэглэгчдийг (REQUESTER / APPROVER / ADMIN, 3 tenant) автоматаар үүсгэж устгадаг (доор «Тест ажиллуулах»).

**DB холболт (Phase 4.8):** `DATABASE_URL` = `app_user` (NOBYPASSRLS → RLS идэвхтэй), `SYSTEM_DATABASE_URL` = `postgres`
(tenant lookup, login, outbox, escalation г.м. бүх tenant-ийн ажил). Апп асахад лог: `DB role "app_user" — RLS идэвхтэй`.

---

## Хувилбарын Явц

| Хувилбар | Нэр | Статус | Огноо |
|----------|-----|--------|-------|
| **`v0.1.0`** | **Tier 1 Core System (MVP + V1)** | **✅ ДУУССАН** | **2026-09-21** |
| `v0.1.5` | Tier 2 Enterprise VPC | ✅ ДУУССАН | 2026-10-10 |
| `v0.1.6.1` | Кемп пилот (Sino Hydro, нэг Windows машин) — v0.1-ийн сүүлийн | ✅ ДУУССАН | 2026-10-10 |
| `v0.2.0` | Пилотын санал, олон хэл (mn/en/zh), бөөнөөр оруулах, upgrade/staging | ✅ ДУУССАН | 2026-10-11 |
| `v0.2.1` | Хоолны тооцоо албан тушаалаар, мониторинг, нэвтрэлтийн хамгаалалт | ✅ ДУУССАН (пилот энэ хувилбар дээр) | 2026-10-12 |
| **`v0.2.2`** | **Хэрэглэгч ба ажилтан (ADR-003) + HR модуль (ADR-006)** | **🔄 ХӨГЖҮҮЛЭЛТ** | — |
| `v0.2.3` · `v0.2.4` | Хөрөнгө, ээлж, гэрээ + үнэ · Кемп V2 + эцсийн release ([[03_v0.2_full_plan]]) | 📝 ТӨЛӨВЛӨСӨН | — |
| `v0.3.0` | Байгууллагын дотоод Feed (PRD-05, ADR-004) | 📝 УРЬДЧИЛСАН | — |
| `v0.4.0+` | Чат · Air-Gapped (шийдэгдээгүй) · нэмэлт | 📋 ИРЭЭДҮЙ | — |
| `v1.0.0` | Public Production Launch | 🎯 ЗОРИЛГО | — |

> **Хуучин дугаарлалт:** v0.1.0~v0.4.0 (Backend, Integration Tests, Frontend MVP, E2E+CI/CD) бүгд нэгдэж **v0.1.0** болсон.  
> Дэлгэрэнгүй: [[CHANGELOG]] | [[VERSIONING]]

---

## v0.1.0-д Дууссан зүйлс (MVP + V1 нэгдсэн)

### 📦 Backend Foundation (v0.1.0-н нэг хэсэг)
- Multi-tenant PostgreSQL + Supabase RLS
- TenantAuthGuard (JWT → tenant slug → tenantId)
- Material Requisition CRUD (create/read/update/delete)
- Submit → Approve → Reject approval flow
- Outbox pattern (event-driven)
- Prisma schema + migrations 0001~0003

### 📦 Integration Tests (v0.1.0-н нэг хэсэг)
- RLS leakage tests (dual PrismaClient pattern)
- Auth guard integration tests
- MR CRUD + approval flow tests
- **20 хатуу дүрэм** тогтоосон (RULE-01~20, [[00_rules_and_context]])
- [[lessons_learned]] — нэгтгэсэн баримт бичиг

### 📦 Frontend MVP (v0.1.0-н нэг хэсэг)
- Login UI → /requisitions redirect
- MR жагсаалт (pagination)
- MR үүсгэх form
- MR дэлгэрэнгүй харах
- Submit / Approve / Reject товчлуур
- Realtime WebSocket (бусад tab шинэчлэгдэнэ)

### 📦 E2E & CI/CD Hardening ✅ 2026-09-21 (v0.1.0 — ДУУСГАХ)
- Playwright E2E: **9 passed, 2 skipped** (multi-tenant тест `MULTI_TENANT_E2E` env шаарддаг — зориудаар skip)
  - `auth.spec.ts` — login/logout/redirect ✅
  - `requisition-flow.spec.ts` — Create→Submit→Approve, Create→Submit→Reject, жагсаалт ✅
  - `workflow-multistep.spec.ts` — state machine + health API ✅
- GitHub Actions `ci.yml` — PR trigger CI pipeline ✅
- Docker multi-stage build — backend (Node 22 Alpine) + shell (nginx) ✅
- E2E тест бичихийн META чеклист тогтоосон

---

## v0.1.5 — Төлөв (2026-10-10)

| Хэсэг | Төлөв |
|---|---|
| Tenant isolation — ADR-001 (B): shared RLS + Enterprise VPC (`DEPLOYMENT_MODE=dedicated`) | ✅ |
| RLS runtime: `app_user` + `SYSTEM_DATABASE_URL`, `inTenantTx`, `rls_audit.sql` | ✅ |
| Advanced workflow: amount_rules, олон алхам + quorum, SLA, escalation, delegation (API); MR батлалт workflow-оор [SEC-004] | ✅ |
| Performance: Redis cache, cursor, rate limit, auth token cache, cluster backoff | ✅ |
| Модулиуд: Budget, Inventory-lite, Vendor-lite, Report-lite (+ web-shell `/inventory`, `/vendors`, `/reports`) | ✅ |
| Event bus: transactional outbox (SKIP LOCKED, тогтвортой CloudEvent id, retry → DLQ) | ✅ |
| Кемп модуль V1 | ✅ (доор) |
| Release: баримт (6.2), цэвэрлэгээ (6.3), CI засвар + хувилбар 0.1.5 + шалгалт (6.4) | ✅ |

### Тест ажиллуулах

| Команд | Юу | Шаардлага | Сүүлийн үр дүн |
|---|---|---|---|
| `pnpm test` | Unit (core-kernel + web-shell) | — (сервергүй) | 514 + 45 ✅ |
| `pnpm test:integration` | NestJS + бодит DB | `pnpm supabase:start`, `.env` | 15 файл / 155 ✅ |
| `pnpm test:e2e` | Playwright (backend + web-shell-ийг өөрөө асаана) | Supabase, `.env` | 47 ✅ (0 skip) |
| `pnpm --filter e2e exec tsx tests/load-test.ts` | Load (100 conn) | backend асаалттай, 10k seed | p99 57ms (local) / 90ms (`app_user`, cloud) |

- E2E fixture: Playwright globalSetup → `pnpm --filter @s-project/core-kernel e2e:fixture setup` (3 tenant + 13 хэрэглэгч, token) → `apps/e2e/.fixture.json`; globalTeardown бүгдийг устгана. Зөвхөн local.
- Нэг ажиллалтад ~50 нэвтрэлт → `supabase/config.toml` `[auth.rate_limit] sign_in_sign_ups = 500` (өөрчилсний дараа `pnpm supabase:stop` → `pnpm supabase:start`).
- Кемп e2e: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ).

### Backlog (v0.1.5-ийн дараа)
Delegation-ийг MR батлалттай холбох · `WorkflowService.approveStep/rejectStep` (ашиглагдахгүй) · escalation (`escalationEnabled`, order 1-ээс гэж үздэг, алхам алгасах утга) · MR үүсгэх UI-д нэгж үнэ · frontend component тест · санах ойн Redis mock · давхар RESTRICTIVE policy

---

## Кемп модуль — V1 ✅ ДУУССАН (2026-10-10) · V2 хүлээгдэж буй

> Төлөвлөгөө/ERD v4: [[01_plan_and_erd]] · Changelog: `[Unreleased]` → «Кемп модуль V1»

| Хэсэг | Төлөв |
|---|---|
| Шат 1 — DB (8 migration, RLS = PERMISSIVE TO app_user [RLS-004]) | ✅ |
| Шат 2 — Эрх, мастер өгөгдөл, тохиргоо | ✅ |
| Шат 3 — Ирц (xlsx импорт), ээлж, өрөө, хоолны суурь тоо | ✅ |
| Шат 4 — Хөрөнгө, засвар + сэлбэг, засвар хаахад зардал | ✅ |
| Шат 8 — Frontend (web-shell `/camp/*`, 3 багц) | ✅ e2e 20/20, vitest 27 |
| Шат 9 — Баримт | ✅ |
| Шат 5–7 — Гэрээ/үнэ, бохир ус/хог + хоолны захиалга, зардлын тайлан | ⏸ V2 (D8) — DB/Prisma/эрхийн код бэлэн |

**E2E урьдчилсан нөхцөл:** `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ) — файлын толгойд Windows-ын ажиллуулах заавар [ENV-009].
**Кемп модулийн хүрээ:** backend `apps/core-kernel/src/modules/camp/`, frontend `apps/web-shell/src/modules/camp/`, e2e `apps/e2e/tests/camp*.spec.ts`.

---

## Архитектурын гол шийдлүүд

### TenantAuthGuard flow
```
Bearer JWT → supabase.auth.getUser() (Redis token cache, SHA-256, ≤60с) → tenantSlug (host header; dedicated → DEDICATED_TENANT_SLUG)
  → TenantCacheService (Redis 5min TTL → SYSTEM DB fallback)
  → membership (core_users, is_active) — гишүүн биш → 403 [SEC-001]
  → request.user = { id: authId, tenantId, tenantSlug }
```

### APP_GUARD / APP_INTERCEPTOR pattern (RULE-07)
```typescript
// AppModule.providers — нэг instance, бүх route-д хэрэглэгдэнэ
{ provide: APP_GUARD, useExisting: TenantAuthGuard },
{ provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
// Controller дээр @UseGuards / @UseInterceptors ХЭРЭГГҮЙ
// MaterialRequisitionModule.imports-д AuthModule БАЙХГҮЙ
```
> ✅ APP_GUARD v0.1.0-д бүрэн хэрэгжсэн — RULE-07 баримтална.

### resolveUserId pattern (RULE-13)
```
authId (Supabase UUID) → core_users.findFirst({ authId, tenantId })
  → core_users.id (PostgreSQL UUID) → FK reference
```
> Seed script нь `auth.users` болон `core_users` **хоёуланг** үүсгэх ёстой.

### RLS context (RULE-04)
```typescript
// ЗААВАЛ нэгдсэн transaction дотор — helper: src/db/tenant-tx.ts
await inTenantTx(prisma, tenantId, async (tx) => tx.model.findFirst({ where: { id, tenantId } }));
// = prisma.$transaction(tx => { set_config('app.tenant_id', tenantId, true); ... })
```
> `app_user`-ээр холбогдоход context-гүй query 0 мөр буцаана (алдаа биш!) — шинэ модуль: [[03_Module_Template]].

### Vite proxy (CORS-гүй) (RULE-19)
```
VITE_API_BASE_URL=''  →  relative URL  →  Vite proxy /api → localhost:3000
```

### vitest + NestJS (RULE-08)
```
unplugin-swc → emitDecoratorMetadata дэмжинэ → NestJS DI зөв ажиллана
esbuild (default) → decorator metadata дэмждэггүй → БҮХИЙ Л injection undefined
```

---

## Одоогийн ажил — v0.2.2 (хэрэглэгч ба ажилтан)

> Төлөвлөгөө: [[07_v0.2.2_tech_plan]] · Явц: [[08_v0.2.2_progress]] · Шийдвэр: [[ADR-003_Users_Login_Permissions]], [[ADR-006_HR_Core_Module]]

- [x] Блок 1: эрхийн ганц эх сурвалж (`camp_user_permissions`) — `4e11cd6`
- [x] Блок 2: утас/username нэвтрэлт, server sign-in — `94a749d`
- [x] Блок 2.5: домэйн — `sino.gobiverse.website` (Cloudflare Tunnel, [[ADR-005_Org_Connectivity_Domains]]) — `d116772`
- [x] Блок 3: урилга, хэрэглэгч үүсгэх, нууц үг сэргээх — `c88086d`
- [ ] HR модуль — ажилтан/хэлтэс/ээлж/ирц/гэрээт байгууллага Кемпээс HR руу ([[ADR-006_HR_Core_Module]])
- [ ] Блок 4: хэрэглэгч удирдах UI · [ ] Блок 5: профайл/ажлаас гарах · [ ] Блок 6: release

---

## v0.1.5 — Хэрэгжилт (архив)

> Дэлгэрэнгүй: [[01_Development_Roadmap]] → "v0.1.5" хэсэг

- [x] **v0.1.5.1:** Tenant isolation — **ADR-001 (B, 2026-10-08):** shared = RLS, Enterprise VPC = тусдаа DB/deploy (`DEPLOYMENT_MODE=dedicated`)
- [x] **v0.1.5.2:** Advanced approval workflow (мөнгөний хэмжээ, delegation, escalation)
- [x] **v0.1.5.3:** Performance — Redis caching, cursor pagination, rate limiting
- [x] **v0.1.5.4:** Inventory, Budget, Vendor, Report модулиуд (хөнгөн + frontend)
- [x] **v0.1.5.5:** Event Bus integration тест (cross-module chain) + outbox засвар
- [x] **v0.1.5.6:** E2E (fixture, multi-tenant, олон алхамт батлалт, модулиуд) · баримт, цэвэрлэгээ, CI · ✅ **`v0.1.5` (2026-10-10)**
- [x] **Кемп модуль V1** (2026-10-10) · [ ] **Кемп модуль V2** — Шат 5–7 ([[01_plan_and_erd]] → «V2»)

> Дэлгэрэнгүй төлөвлөгөө: [[01_analysis_and_plan_2026-10-08]]

### Ирээдүйн хувилбарууд
- [x] **v0.2.0** (2026-10-11) · [x] **v0.2.1** (2026-10-12) · [ ] **v0.2.2–v0.2.4** — [[03_v0.2_full_plan]]
- [ ] **v0.3.0:** Байгууллагын дотоод Feed — [[00_plan_draft]]
- [ ] **v0.4.0+:** Чат · Air-Gapped (хэрэгтэй эсэх шийдэгдээгүй)
- [ ] **v1.0.0:** Production Launch — Load test, Security audit, SLA 99.9%
