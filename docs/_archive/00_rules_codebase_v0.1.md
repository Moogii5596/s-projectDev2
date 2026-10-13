---
title: "00_rules_and_context — хуучин хэсгүүд (v0.1.0 codebase, MVP)"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-13
tags: [rules, archive]
---

# 00_rules_and_context — хуучин хэсгүүд (архив)

> 🗄 2026-10-13-нд [[00_rules_and_context]]-оос салгасан. Одоогийн codebase: [[00_Codebase_Map]].

## 📁 CODEBASE БАЙДАЛ — v0.1.0-ийн агшин (хуучин нэр v0.4.0, Sprint 5-ын дараа, 2026-09-21) — ⛔ DEPRECATED

> ⛔ **Хуучирсан (түүх).** Одоогийн байдал: [[00_Codebase_Map]], [[01_Backend_Modules]], [[03_DB_Catalog]]. Энэ хэсгийг хөгжүүлэлтэд ашиглахгүй.

**`apps/` дотор байгаа:**
- `core-kernel/` — NestJS API (port 3000)
- `web-shell/` — React + Vite (port 5173)
- `mfe-requisitions/` эсвэл `modules/material-requisition/` — байгаа бол шалгах

**`apps/core-kernel/src/` дотор байгаа:**
- `app/app.module.ts` — зөвхөн `AuthModule` import, **APP_GUARD бүртгэгдээгүй** (Sprint 0-д засна!)
- `auth/auth.module.ts` — `@Global()`, exports: `TenantAuthGuard`, `TenantContextInterceptor`, `TenantCacheService`, `AuthService`
- `auth/tenant-auth.guard.ts` — JWT баталгаажуулалт, Redis tenant cache
- `auth/tenant-context.interceptor.ts` — AsyncLocalStorage tenant context
- `db/prisma-tenant-client.ts` — `tenantStorage`, `prisma` (RLS extension)
- `modules/material-requisition/` — CRUD + submit/approve/reject
- **БАЙХГҮЙ**: `gateway/`, `modules/workflow/`, `modules/event-bus/`, `modules/route-ingress/`, `modules/tenant-admin/`

**`prisma/schema.prisma` дотор байгаа моделиуд:**
- `Tenant` — id, slug, name, tier (TierType), isActive, connectionUri, storageQuotaMb
- `CoreUser` — id, tenantId, authId (Supabase UUID) ✅, email, fullName, role, status
- `MrHeader` — id, tenantId, reqNumber, requesterId, departmentId, **workflowInstanceId БАЙХГҮЙ**, status, totalAmount, version
- `MrItem` — id, tenantId, headerId, lineNumber, itemId, quantity, unitPrice, version
- `OutboxEvent` — id, tenantId, aggregateType, aggregateId, eventType, payload, status (OutboxStatus), retryCount, nextRetryAt, publishedAt
- `ApprovalLog` — id, tenantId, headerId, actorId, action, comment, actedAt
- **OutboxStatus enum**: `PENDING, PUBLISHED, FAILED, DEAD_LETTERED` (→ Sprint 0-д `DLQ` болгоно)
- **БАЙХГҮЙ моделиуд**: `InstalledModule`, `WorkflowDefinition`, `WorkflowInstance`, `WorkflowStepLog`, `IdempotencyKey`, `TenantRoute`, `DlqEvent`

**`supabase/migrations/` дотор байгаа:**
- `0001_initial_schema.sql` — tenants, core_users
- `0002_rls_policies.sql` — RLS тохируулга
- `0003_force_rls_and_pool_hardening.sql` — FORCE RLS
- `0005_approval_flow.sql` — approval_logs, **ГЭХДЭЭ**:
  - `uuid_generate_v4()` ашигласан (RULE-11 зөрчил → Sprint 0-д засна)
  - `app.current_tenant_id` ашигласан (буруу нэр → `app.tenant_id` болгох)

**`package.json` devDependencies:**
- `unplugin-swc` ✅ аль хэдийн суулгасан
- `@swc/core` ✅ аль хэдийн суулгасан

---

## ✅ MVP — Дууссан (Лавлагаа)

- [x] Multi-tenant PostgreSQL + Supabase RLS
- [x] TenantAuthGuard (JWT → tenantSlug → tenantId)
- [x] Material Requisition CRUD
- [x] Submit → Approve → Reject flow
- [x] Outbox pattern — retry_count, next_retry_at, DEAD_LETTERED статустай
- [x] RLS leakage integration tests
- [x] Frontend: Login, MR list/create/detail, Realtime WebSocket
- [x] E2E: Playwright 9/9 passed, GitHub Actions CI, Docker multi-stage

---

## 🔑 CLAUDE-Д ЗОРИУЛСАН ГАРЫН АВЛАГА

**Sprint эхлэхдээ:**
1. `sprint_N_<name>.md` файлыг уншина (зөвхөн хэрэгтэй sprint)
2. Migration SQL → `supabase/migrations/YYYYMMDD_<name>.sql` үүсгэ
3. Prisma schema өөрчлөлт хий
4. Service / Controller / Module файлууд үүсгэ (inline code ашиглана)
5. Unit тест бичнэ

**Тест алдаатай бол:**
- `SECURITY_ALERT` → tenantStorage.run() wrap дутуу — RULE-03/04 шалгах
- `Cannot read properties of undefined` in DI → RULE-07 `useExisting` шалгах; RULE-08 `unplugin-swc` шалгах
- `Failed to load url` in Vite → RULE-09 `import type` шалгах
- `actor_id FK violation` → RULE-13 `resolveUserId()` дутуу
- `JS heap out of memory` in Prisma → RULE-14 middleware guard дутуу
- `operator does not exist` in migration → RULE-15 enum өөрчлөх дараалал буруу
- `map is not a function` in frontend → RULE-17 pagination wrapper шалгах
- `CORS error` in frontend → RULE-19 `VITE_API_BASE_URL` хоосон байна уу?
- `400 Bad Request` DTO mismatch → RULE-20 field names шалгах

**Файлуудын байршил:**
| Файл | Агуулга |
|------|---------|
| [[00_rules_and_context]] | Энэ файл — RULE-01~20, Codebase state, MVP |
| [[sprint_0_foundation]] | Sprint 0 — Pre-flight fix |
| [[sprint_1_ingress]] | Sprint 1 — Dynamic Route Ingress |
| [[sprint_2_workflow]] | Sprint 2 — Workflow Engine |
| [[sprint_3_eventbus]] | Sprint 3 — Event Bus + DLQ |
| [[sprint_4_onboarding]] | Sprint 4 — MFE + Tenant Onboarding |
| [[sprint_5_production]] | Sprint 5 — E2E & CI/CD ✅ |
| [[VERSIONING]] | SemVer бодлого |
| [[CHANGELOG]] | Хувилбарын өөрчлөлтийн жагсаалт |

*RULE хэсэг: 2026-09-21 · толгой шинэчилсэн: 2026-10-13 (v0.2.2)*
