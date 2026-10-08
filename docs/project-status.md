# S Project — Төслийн Явцын Тэмдэглэл

> Шинэчлэгдсэн: 2026-09-21 | **Одоогийн хувилбар: `v0.1.0`** | **Дараагийн хувилбар: `v0.1.5`**
> SemVer бодлого: `docs/VERSIONING.md` | Changelog: `docs/CHANGELOG.md`

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
**Test user:** `admin@test.mn` / `test1234` (role: approver)

---

## Хувилбарын Явц

| Хувилбар | Нэр | Статус | Огноо |
|----------|-----|--------|-------|
| **`v0.1.0`** | **Tier 1 Core System (MVP + V1)** | **✅ ДУУССАН** | **2026-09-21** |
| `v0.1.5` | Tier 2 Enterprise VPC | 🔜 ДАРААГИЙН | — |
| `v0.2.0` | Tier 3 Air-Gapped / Offline-First | 📋 ТӨЛӨВЛӨСӨН | — |
| `v0.3.0+` | Нэмэлт хөгжүүлэлт | 📋 ИРЭЭДҮЙ | — |
| `v1.0.0` | Public Production Launch | 🎯 ЗОРИЛГО | — |

> **Хуучин дугаарлалт:** v0.1.0~v0.4.0 (Backend, Integration Tests, Frontend MVP, E2E+CI/CD) бүгд нэгдэж **v0.1.0** болсон.  
> Дэлгэрэнгүй: [CHANGELOG.md](./CHANGELOG.md) | [VERSIONING.md](./VERSIONING.md)

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
- **20 хатуу дүрэм** тогтоосон (RULE-01~20, `docs/08_Roadmap/00_rules_and_context.md`)
- `docs/lessons_learned.md` — нэгтгэсэн баримт бичиг

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

## Архитектурын гол шийдлүүд

### TenantAuthGuard flow
```
Bearer JWT → supabase.auth.getUser() → tenantSlug (host header)
  → TenantCacheService (Redis 5min TTL → DB fallback)
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
// ЗААВАЛ нэгдсэн transaction дотор
await prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  return tx.model.findFirst(...);
});
```

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

## Дараагийн алхам — v0.1.5 (Tier 2: Enterprise VPC)

> Одоогийн зорилтот хувилбар: **v0.1.5**  
> Дэлгэрэнгүй: `docs/08_Roadmap/01_Development_Roadmap.md` → "v0.1.5" хэсэг

- [ ] **v0.1.5.1:** Schema-per-tenant / DB-per-tenant isolation
- [ ] **v0.1.5.2:** Advanced approval workflow (мөнгөний хэмжээ, delegation, escalation)
- [ ] **v0.1.5.3:** Performance — Redis caching, cursor pagination, rate limiting
- [ ] **v0.1.5.4:** Inventory, Budget, Vendor, Report модулиуд
- [ ] **v0.1.5.5:** Event Bus integration тест (cross-module chain)

### Ирээдүйн хувилбарууд
- [ ] **v0.2.0:** Air-Gapped / Offline-First (Tier 3)
- [ ] **v0.3.0+:** Plugin marketplace, Public API SDK, Analytics
- [ ] **v1.0.0:** Production Launch — Load test, Security audit, SLA 99.9%
