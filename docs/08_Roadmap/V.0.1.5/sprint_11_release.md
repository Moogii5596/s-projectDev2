---
title: "Sprint 11 — v0.1.5 Release Hardening"
type: "Roadmap"
status: "Archived"
last_updated: 2026-10-10
tags: [roadmap, v0.1.5]
---

# Sprint 11 — v0.1.5 Release Hardening

> **Зорилго:** v0.1.5 release-д бэлэн болгох — E2E тест, changelog, git tag, Docker update
> **Working dir:** `apps/e2e/` + `docs/` + root
> **Хамаарал:** Sprint 6–10 бүгд дууссан байх

> **Төлөв (2026-10-10) — бодит хэрэгжилт [[01_analysis_and_plan_2026-10-08]] → Phase 6.** Доорх алхмууд анхны төлөвлөгөө (түүхэн):
>
> | Алхам | Бодит |
> |---|---|
> | 11.1.1 dedicated-mode | Unit: `deployment-mode.spec.ts` (17) + guard dedicated ✅ · smoke (6.4.3): slug дутуу → эхлэхгүй, өөр Host → тохируулсан tenant, өөр tenant-ийн хэрэглэгч → 403 ✅ |
> | 11.1.2 advanced-workflow | ✅ `apps/e2e/tests/advanced-workflow.spec.ts` (API) + `workflow-multistep.spec.ts` (UI, 2 алхам). Role нь `APPROVER`/`ADMIN` (DEPT_MANAGER г.м. role системд алга) |
> | 11.1.3 modules | ✅ `apps/e2e/tests/modules-lite.spec.ts` (API + UI) |
> | — multi-tenant | ✅ `multi-tenant.spec.ts` skip-гүй (fixture) |
> | 11.2 CHANGELOG | ✅ `[Unreleased] — v0.1.5` (огноо → 6.4) |
> | 11.3 project-status | ✅ |
> | 11.4 git tag | 6.4.6 — таны компьютер (`git tag -a v0.1.5`) |
> | 11.5 Docker / `.env.example` | ✅ `SYSTEM_DATABASE_URL`, `RATE_LIMIT_*`, `CLUSTER_RESTART_*` (`.env.example`, `docker/.env.vpc.example`, compose) · `docker-compose up` — Docker image build cloud-д шалгаагүй (сүлжээ) → таны компьютер (заавал биш) |
> | 11.6 Index | ✅ |

---

## Алхам 11.1 — E2E Тест Шинэчлэх (Playwright)

Шинэ Sprint 6–10-н feature-уудыг E2E coverage-д нэмэх.

> ⚠️ **АНХААР:** E2E тест бичихийн ӨМНӨ `META чеклист` ([[lessons_learned]]-ийн сүүлийн хэсэг) дандаа дагах!

### Алхам 11.1.1 — dedicated-mode (ADR-001 — schema-isolation spec-ийг орлосон)

- [ ] Backend-ийг `DEPLOYMENT_MODE=dedicated DEDICATED_TENANT_SLUG=test-tenant`-ээр асааж smoke тест:

```typescript
test.describe('Dedicated deployment mode', () => {
  test('Өөр Host header-тэй ч тохируулсан tenant-ийн өгөгдөл харагдана', async ({ request }) => {
    // Host: erp.customer.mn → GET /api/v1/requisitions → 200, test-tenant-ийн MR
  });
  test('DEDICATED_TENANT_SLUG дутуу → backend эхлэхгүй', async () => {
    // process spawn → exit code != 0, "DEDICATED_TENANT_SLUG" алдааны мессеж
  });
});
```

### Алхам 11.1.2 — advanced-workflow.e2e.spec.ts

- [ ] `apps/e2e/src/specs/advanced-workflow.e2e.spec.ts`:

```typescript
test.describe('Advanced Workflow E2E', () => {
  test('10M+ дүнтэй MR → 3 шатны approval flow', async ({ page }) => {
    // MR үүсгэх (10M+)
    // Submit
    // Шат 1: DEPT_MANAGER батлах
    // Шат 2: FINANCE_MANAGER батлах
    // Шат 3: CEO батлах
    // Status: APPROVED
  });

  test('Delegation: орлогч баталж чадна', async ({ browser }) => {
    // User A delegation үүсгэх (User B → орлогч)
    // User A-д ирсэн MR-г User B батлах
    // MR APPROVED болно
  });

  test('SLA report: дуусаагүй approval статистик харагдана', async ({ page }) => {
    // /reports/approval-sla хуудасна зочлох
    // Summary table харагдана
    // Avg completion hours тоо байна
  });
});
```

### Алхам 11.1.3 — modules.e2e.spec.ts

- [ ] `apps/e2e/src/specs/modules.e2e.spec.ts`:

```typescript
test.describe('Module Integration E2E', () => {
  test('Inventory: бараа нэмэх → MR approve → reservation харагдана', async ({ page }) => {
    // /inventory/items → шинэ бараа нэмэх
    // MR үүсгэж тэр бараа оруулах
    // Submit → Approve
    // /inventory/items/:id → reserved_qty нэмэгдсэн
  });

  test('Budget: хязгаараас давсан MR submit → алдааны мэдэгдэл', async ({ page }) => {
    // Budget allocation тохируулах (100,000)
    // 200,000-н MR үүсгэх → submit дарах
    // "Төсвийн хязгаар хүрсэн байна" мэдэгдэл харагдана
  });

  test('Report: MR summary Excel export', async ({ page }) => {
    // /reports → MR Summary хуудас
    // Export товч дарах
    // .xlsx файл татагдана
  });
});
```

---

## Алхам 11.2 — CHANGELOG.md Шинэчлэх

- [ ] [[CHANGELOG]]-д v0.1.5 хэсэг нэмэх:

```markdown
## [v0.1.5] — YYYY-MM-DD — Tier 2: Enterprise VPC ✅

### Нэмэгдсэн
- **Enterprise VPC (ADR-001):** `DEPLOYMENT_MODE=dedicated` + `DEDICATED_TENANT_SLUG`,
  `docker/docker-compose.vpc.yml`, bootstrap SQL, runbook (schema-per-tenant цуцлагдсан)
- **Advanced Approval Workflow:** Amount-based routing (1M/10M threshold),
  Delegation (орлогч), SLA deadline + escalation (15 минут scheduler),
  Workflow definition admin UI, SLA analytics endpoint
- **Redis Caching Layer:** MR жагсаалт + workflow definition cache,
  `AppCacheModule`, tenant-aware cache invalidation
- **Cursor-Based Pagination:** `encodeCursor/decodeCursor`, `CursorPaginationResult<T>`,
  Frontend `useInfiniteQuery` integration
- **Rate Limiting per Tenant:** `TenantThrottlerGuard`, Redis store, 429 + Retry-After
- **NestJS Cluster Mode:** `NODE_CLUSTER_WORKERS` env, auto-restart on crash
- **Inventory Module:** Warehouse, InventoryItem CRUD, MR approval → auto-reserve
- **Budget Module:** Period/Allocation, MR submit budget check, commitment tracking
- **Vendor Module:** Vendor CRUD, Quote creation + acceptance
- **Report Module:** MR summary, SLA analytics, Budget utilization, Excel export
- **Event Bus Integration Tests:** Cross-module chain тест, idempotency тест, DLQ тест
  — `pnpm test:integration` нэг командаар

### Шинэчлэгдсэн
- `workflow_definitions.steps_config` → amount_rules + escalation_enabled + delegation_enabled
- Sprint 6 schema-per-tenant код + migration буцаагдсан (`20261008001_revert_schema_per_tenant.sql`)
- `MaterialRequisitionService.submit()` → budget check + amount-based routing

### Засагдсан
- (sprint явцад гарсан алдаанууд энд бичигдэнэ)

### Тест
- Vitest unit тест: 80%+ coverage (шинэ модулиудад)
- Supertest integration тест: endpoint бүр
- Deployment mode тест: dedicated/shared guard + env validation
- Cross-module chain integration тест: 20+ тест
- E2E (Playwright): dedicated mode, advanced workflow, modules
- Load test: 100 concurrent, p99 < 500ms
```

---

## Алхам 11.3 — project-status.md Шинэчлэх

- [ ] [[project-status]]-д v0.1.5 ДУУССАН гэж тэмдэглэх:

```markdown
| `v0.1.5` | Tier 2 Enterprise VPC | ✅ ДУУССАН | YYYY-MM-DD |
| `v0.2.0` | Tier 3 Air-Gapped / Offline-First | 🔜 ДАРААГИЙН | — |
```

---

## Алхам 11.4 — Git Tag

- [ ] Tag үүсгэх:

```bash
git add -A
git commit -m "chore: v0.1.5 release — Tier 2 Enterprise VPC

- Schema-per-tenant isolation
- Advanced approval workflow (amount-based, delegation, escalation)
- Performance: Redis cache, cursor pagination, rate limiting
- 4 new modules: Inventory, Budget, Vendor, Report
- Event bus integration tests (cross-module chain)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git tag -a v0.1.5 -m "v0.1.5: Tier 2 Enterprise VPC release"
git push origin main --tags
```

---

## Алхам 11.5 — Docker + docker-compose Шинэчлэх

- [ ] `docker-compose.yml`-д шинэ env var-ууд нэмэх:

```yaml
services:
  core-kernel:
    environment:
      NODE_CLUSTER_WORKERS: "4"
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      THROTTLE_TTL_SHORT: "1000"
      THROTTLE_LIMIT_SHORT: "10"
```

- [ ] `docker-compose.prod.yml` шинэчлэх (rate limit, cluster, Redis config)
- [ ] `.env.example` шинэчлэх — шинэ env var-уудыг нэмэх:

```env
# v0.1.5-д нэмэгдсэн
DEPLOYMENT_MODE=shared          # ADR-001 (✅ нэмэгдсэн 2026-10-08)
NODE_CLUSTER_WORKERS=4
THROTTLE_TTL_SHORT=1000
THROTTLE_LIMIT_SHORT=10
CACHE_TTL_DEFAULT=300
CACHE_TTL_WORKFLOW_DEF=600
```

---

## Алхам 11.6 — V.0.1.5 Index Шинэчлэх

- [ ] [[00_index]] явцын хуваарийг шинэчлэх:

```markdown
Sprint 6  │ Schema/DB Isolation        │ [x] ✅ Дууссан — YYYY-MM-DD
Sprint 7  │ Advanced Approval Workflow │ [x] ✅ Дууссан — YYYY-MM-DD
Sprint 8  │ Performance & Scaling      │ [x] ✅ Дууссан — YYYY-MM-DD
Sprint 9  │ 4 Нэмэлт Модуль           │ [x] ✅ Дууссан — YYYY-MM-DD
Sprint 10 │ Event Bus Integration Test │ [x] ✅ Дууссан — YYYY-MM-DD
Sprint 11 │ Release Hardening          │ [x] ✅ Дууссан — YYYY-MM-DD
```

---

## Шалгуур (Definition of Done — v0.1.5 бүрэн)

- [ ] `pnpm test` — unit + integration тест бүгд green
- [ ] `pnpm test:integration` — cross-module chain тест green
- [ ] `pnpm test:load` — 100 concurrent, p99 < 500ms, error 0%
- [ ] E2E Playwright — schema isolation, advanced workflow, modules тест green
- [ ] CI GitHub Actions pipeline green (PR merge хийхэд)
- [ ] `docker-compose up` — бүх service амжилттай асна
- [ ] `git tag v0.1.5` тэмдэглэгдсэн, GitHub-д push хийгдсэн
- [ ] CHANGELOG.md v0.1.5 хэсэг бүрэн бичигдсэн
- [ ] lessons_learned.md sprint 6–11-н шинэ алдаанууд бүртгэгдсэн

---

## Дараагийн Алхам — v0.2.0 (Air-Gapped)

v0.1.5 release дууссаны дараа `docs/08_Roadmap/V.0.2.0/` хавтас үүсгэж:

```
v0.2.0 Sprint-үүд:
  Sprint 12: Edge Node (Service Worker PWA, SQLite/PGlite)
  Sprint 13: Cryptographic Sync (Ed25519, sync_idempotency_ledger)
  Sprint 14: 3-Way Diff Conflict Resolution
  Sprint 15: Offline Network Simulation тест
  Sprint 16: v0.2.0 Release
```
