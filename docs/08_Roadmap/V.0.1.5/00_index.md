# V.0.1.5 — Sprint Implementation Plan Index

> Үүсгэсэн: 2026-09-21 | Шинэчлэгдсэн: 2026-10-10
> **Энэ файл бүх sprint файлуудын индекс юм.**
> Claude Sprint ажил эхлэхдээ хэрэгтэй файлаа тусад нь уншина — context хэмнэнэ.

---

## Хувилбарын Тойм

**v0.1.5 = Tier 2: Enterprise VPC**
Том байгууллагуудад тусдаа isolated орчинд байршуулах зориулалттай.

| Шаардлага | v0.1.0 байдал | v0.1.5 зорилго |
|-----------|---------------|-----------------|
| Tenant isolation | RLS (shared DB) | RLS + Enterprise VPC тусдаа DB/deploy (ADR-001) |
| Approval workflow | Multi-level, fixed | Amount-based routing + delegation + escalation |
| Performance | No cache | Redis caching + cursor pagination + rate limiting |
| Modules | MR only | + Inventory, Budget, Vendor, Report |
| Event testing | Unit тест | Cross-module chain integration тест |

---

## Файлуудын Бүтэц

| Файл | Агуулга | Хамаарал |
|------|---------|----------|
| `00_index.md` | Энэ файл — индекс, явцын хуваарь | — |
| `01_analysis_and_plan_2026-10-08.md` | Шинжилгээ + Phase 0–6 төлөвлөгөө, шийдвэр B | **Эхэлж унших** |
| `sprint_6_schema_isolation.md` | ⛔ Орлогдсон — ADR-001 (түүхэн лавлагаа) | — |
| `sprint_7_advanced_workflow.md` | Sprint 7: Amount routing, delegation, escalation | Sprint 6 дараа |
| `sprint_8_performance.md` | Sprint 8: Redis cache, cursor pagination, rate limit | Sprint 7 зэрэгцэж болно |
| `sprint_9_modules.md` | Sprint 9: Inventory, Budget, Vendor, Report | Sprint 6 + 7 дараа |
| `sprint_10_event_bus_testing.md` | Sprint 10: Cross-module event chain тест | Sprint 9 дараа |
| `sprint_11_release.md` | Sprint 11: Release hardening, tag, changelog | Хамгийн сүүл |

---

## Claude-д Зориулсан Зааварчилгаа

**Sprint эхлэхдээ:**
1. `V.0.1.0/00_rules_and_context.md` уншина (RULE-01~20 — өөрчлөгдөөгүй!)
2. Тухайн sprint-ийн файлыг уншина
3. `docs/lessons_learned.md` шалгана (**ганц үндсэн файл**; root-ийнх нь заагч) (давтагдах алдаанаас зайлсхийх)

**Жишээ: Sprint 7 дээр ажиллах бол:**
```
уншина: V.0.1.0/00_rules_and_context.md + sprint_7_advanced_workflow.md + lessons_learned.md
ХЭРЭГГҮЙ: sprint_6, sprint_8, sprint_9, sprint_10, sprint_11
```

---

## Явцын Хуваарь

```
Sprint 6  │ Tenant Isolation (B)       │ [x] ✅ ADR-001 хэрэгжсэн — 2026-10-08 (dedicated mode)
Sprint 7  │ Advanced Approval Workflow │ [x] ✅ Дууссан (кодоор баталгаажсан 2026-10-08)
Sprint 8  │ Performance & Scaling      │ [x] ✅ Дууссан — DoD 4/4 баталгаажсан 2026-10-08 (p99 57ms, 3360 req/s)
Sprint 9  │ 4 Нэмэлт Модуль           │ [x] ✅ Budget + Inventory/Vendor/Report (хөнгөн) + frontend — 2026-10-10 (Phase 4, 6.0)
          │  + RLS runtime / аюулгүй  │ [x] ✅ app_user + SYSTEM_DATABASE_URL (4.8), SEC-002/003 (4.9), SEC-004 (6.0b)
Sprint 10 │ Event Bus Integration Test │ [x] ✅ Outbox засвар + гинж тест — 2026-10-10 (Phase 5)
Sprint 11 │ Release Hardening          │ [x] ✅ E2E (6.1) · баримт (6.2) · цэвэрлэгээ (6.3) · CI + 0.1.5 (6.4) — 2026-10-10
```

---

## Техникийн Суурь (бодит бүтэц, 2026-10-10)

```
apps/core-kernel/
  src/
    auth/           ← TenantAuthGuard (membership, token cache), TenantCacheService, TenantContextInterceptor (RULE-07)
    db/             ← PrismaTenantClientService (DATABASE_URL), SystemPrismaService (SYSTEM_DATABASE_URL), tenant-tx.ts (inTenantTx)
    gateway/        ← DynamicIngressRouterService, DrainingInterceptor
    config/         ← deployment-mode, rate-limit, cluster-restart, prisma-log, env.config
    modules/        ← material-requisition (mr-approval.ts), workflow, event-bus, budget, inventory, vendor, report,
                      mr-lifecycle, camp, tenant-admin, route-ingress, health
    scripts/        ← dev:test-user, e2e:fixture
  prisma/schema.prisma   ← public schema (schema-per-tenant цуцлагдсан — ADR-001)
  test/             ← *.integration.spec.ts (helpers/db-urls.ts, redis-mock.ts)
supabase/
  migrations/       ← YYYYMMDDNNN_*.sql · dev/ (rls_audit, seed_perf_10k_mr, camp_e2e_grant)
apps/web-shell/src/ ← pages/, modules/{camp,inventory,vendor,report}/, lib/ (цэвэр функц + vitest)
apps/e2e/           ← tests/*.spec.ts, global-setup/teardown (fixture), helpers/fixture.ts
packages/           ← shared-types, prisma-rls-extension
```

> Шинэ модуль нэмэх загвар: `docs/03_Data_Models_and_Security/03_Module_Template.md`

---

## Хугацааны Тооцоо

```
Sprint 6:  3–4 session  (Schema isolation нь нарийн — Prisma multi-schema нюанс)
Sprint 7:  3–4 session  (Amount routing + delegation + escalation = 3 тусдаа систем)
Sprint 8:  2–3 session  (Redis + pagination = 2 module, харьцангуй хялбар)
Sprint 9:  5–6 session  (4 module × нэг бүр NestJS + Prisma + React + тест)
Sprint 10: 2   session  (Integration тест — код биш тест бичих)
Sprint 11: 1   session  (Release шууд)
─────────────────────────────────────────────
Нийт:      16–20 session (~3 долоо хоног)
```
