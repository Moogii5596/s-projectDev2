# v1.0 Sprint Implementation Plan — Index

> Үүсгэсэн: 2026-09-21 | Шинэчлэгдсэн: 2026-09-21  
> **Энэ файл бүх sprint файлуудын индекс юм.**  
> Claude Sprint ажил эхлэхдээ хэрэгтэй файлаа тусад нь уншина — context хэмнэнэ.

---

## Файлуудын бүтэц

| Файл | Агуулга | Хэмжээ |
|------|---------|--------|
| `00_rules_and_context.md` | RULE-01~13 + Codebase state + MVP | ~7KB |
| `sprint_0_foundation.md` | Sprint 0: Pre-flight fix (app.module, migration 0006) | ~7KB |
| `sprint_1_ingress.md` | Sprint 1: Dynamic Route Ingress (DynamicIngressRouter, DrainingInterceptor) | ~12KB |
| `sprint_2_workflow.md` | Sprint 2: Workflow Engine (resolveUserId, PessimisticLock, Idempotency) | ~17KB |
| `sprint_3_eventbus.md` | Sprint 3: Event Bus + DLQ (CloudEvents, OutboxPoller, Redis) | ~11KB |
| `sprint_4_onboarding.md` | Sprint 4: MFE + Tenant Onboarding | ~6KB |
| `sprint_5_production.md` | Sprint 5: E2E & CI/CD hardening | ~4KB |

---

## Claude-д зориулсан зааварчилгаа

**Sprint эхлэхдээ:**
1. `00_rules_and_context.md` уншина (RULE-01~13)
2. Тухайн sprint-ийн файлыг уншина
3. Бусад файл унших шаардлагагүй

**Жишээ: Sprint 2 дээр ажиллах бол:**
```
уншина: 00_rules_and_context.md + sprint_2_workflow.md (~24KB)
ХЭРЭГГҮЙ: sprint_0, sprint_1, sprint_3, sprint_4, sprint_5
```

## Явцын хуваарь

```
Sprint 0 │ Pre-flight Fix           │ [x] ✅ Дууссан — 2026-09-21
Sprint 1 │ Dynamic Route Ingress    │ [x] ✅ Дууссан — 2026-09-21
Sprint 2 │ Workflow Engine          │ [x] ✅ Дууссан — 2026-09-21
Sprint 3 │ Event Bus + DLQ          │ [x] ✅ Дууссан — 2026-09-21
Sprint 4 │ MFE + Tenant Onboarding  │ [x] ✅ Дууссан — 2026-09-21
Sprint 5 │ E2E & CI/CD              │ [x] ✅ Дууссан — 2026-09-21
```

*Шинэчлэгдсэн: 2026-09-21 — Sprint 5 хаагдлаа (E2E 9/9 passed + Docker build ✅)*
