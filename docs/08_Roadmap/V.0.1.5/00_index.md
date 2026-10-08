# V.0.1.5 — Sprint Implementation Plan Index

> Үүсгэсэн: 2026-09-21 | Шинэчлэгдсэн: 2026-10-08
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
Sprint 8  │ Performance & Scaling      │ [x] ✅ Дууссан — 2026-09-22 (load-test DoD 4 зүйл үлдсэн)
Sprint 9  │ 4 Нэмэлт Модуль           │ [ ] ⏳ Хүлээгдэж байна
Sprint 10 │ Event Bus Integration Test │ [ ] ⏳ Хүлээгдэж байна
Sprint 11 │ Release Hardening          │ [ ] ⏳ Хүлээгдэж байна
```

---

## Техникийн Суурь (v0.1.0-оос өвлөнө)

Дараах бүтэц **өөрчлөгдөхгүй**, sprint бүр нь дээр нь давхарлана:

```
apps/core-kernel/
  src/
    auth/           ← TenantAuthGuard, TenantContextInterceptor (RULE-07)
    gateway/        ← DynamicIngressRouterService, DrainingInterceptor
    workflow/       ← WorkflowEngineModule, WorkflowService
    events/         ← OutboxPoller, EventBusService, DLQ
    modules/        ← MaterialRequisitionModule (← шинэ модулиуд эндэд нэмэгдэнэ)
    tenant/         ← TenantOnboardingService, RBAC
  prisma/
    schema.prisma   ← @@schema() нэмэгдэнэ (v0.1.5)
supabase/
  migrations/       ← YYYYMMDD_*.sql (нэмэгдэнэ)
apps/web-shell/
  src/
    pages/          ← шинэ хуудасууд нэмэгдэнэ
packages/
  design-system/   ← хуваалцсан компонентууд
```

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
