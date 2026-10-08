# S Project — Баримт Бичгийн Жагсаалт

> Шинэчлэгдсэн: 2026-09-21 | **Одоогийн хувилбар: `v0.4.0`**

---

## 📌 Яаралтай лавлагаа (Хамгийн их хэрэглэгддэг)

| Файл | Агуулга |
|------|---------|
| `docs/08_Roadmap/00_rules_and_context.md` | **RULE-01~20** — Sprint эхлэхдээ ЗААВАЛ уншина |
| `docs/lessons_learned.md` | **Нэгтгэсэн алдааны сургамж** — 20+ тохиолдол, бүтэцтэй |
| `docs/project-status.md` | Одоогийн явц, `v0.4.0` |
| `docs/CHANGELOG.md` | SemVer changelog v0.1.0 → v0.4.0 |
| `docs/VERSIONING.md` | Хувилбаржуулалтын бодлого |

---

## 📁 Кодын репо баримт (`s-project/docs/`)

### Явцын баримт бичиг

| Файл | Агуулга |
|------|---------|
| `docs/project-status.md` | Одоогийн явц, хувилбар, архитектурын гол шийдлүүд |
| `docs/CHANGELOG.md` | SemVer стандарт changelog `v0.1.0 → v0.4.0` ✨ |
| `docs/VERSIONING.md` | `v0.x.x` хувилбаржуулалтын бодлого, дүрэм ✨ |
| `docs/lessons_learned.md` | **Нэгтгэсэн** алдааны сургамж (MVP + Sprint 5) ✨ |
| `docs/lessons_learned_MVP.md` | Нарийвчилсан MVP алдааны тэмдэглэл (архив) |

### Даалгаврын баримт бичиг

| Файл | Агуулга |
|------|---------|
| `docs/tasks/task.md` | Ерөнхий даалгаврын жагсаалт |
| `docs/tasks/taskmvp4.md` | MVP4 даалгаварууд |
| `docs/tasks/taskmvp5.md` | MVP5 даалгаварууд ✅ |

---

## 📁 Sprint баримт бичиг (`docs/08_Roadmap/`)

| Файл | Агуулга | Хувилбар | Статус |
|------|---------|----------|--------|
| `00_rules_and_context.md` | **RULE-01~20**, Codebase state | v0.4.0 | ✅ Шинэчлэгдсэн |
| `sprint_0_foundation.md` | Pre-flight fix | v0.5.0 | 🔜 |
| `sprint_1_ingress.md` | Dynamic Route Ingress | v0.6.0 | 🔜 |
| `sprint_2_workflow.md` | Workflow Engine | v0.7.0 | 🔜 |
| `sprint_3_eventbus.md` | Event Bus + DLQ | v0.8.0 | 🔜 |
| `sprint_4_onboarding.md` | MFE + Tenant Onboarding | v0.9.0 | 🔜 |
| `sprint_5_production.md` | E2E & CI/CD | v0.4.0 | ✅ Дууссан |
| `02_v1_sprint_implementation_plan.md` | Sprint индекс | — | ✅ |

---

## 📁 Бүтцийн баримт бичгүүд (`S Project/` root)

### 01 — Бүтээгдэхүүний шаардлага
- `PRD-01_Core_Vision.md` — Системийн үндсэн зорилго, ойлголт
- `PRD-02_Tenant_Tiers.md` — Tenant tier, pricing
- `PRD-03_Functional_Specs.md` — Функциональ тодорхойлолт
- `PRD-04_UI_UX_Architecture_Spec.md` — UI/UX архитектур

### 02 — Системийн архитектур
- `01_Core_API_Gateway_ReverseProxy_Spec.md` — API Gateway
- `ARCH-05_UI_UX_Architecture_Spec.md` — Frontend архитектур
- `ADR-001_Tenant_Isolation.md` — **Tenant тусгаарлалтын шийдвэр** (RLS + Enterprise VPC dedicated deploy) ✨

### 03 — Өгөгдлийн загвар ба аюулгүй байдал
- `01_PostgreSQL_MultiTenant_RLS_Spec.md` — RLS policy
- `02_core_kernel_schema.md` — Prisma schema
- `03_Module_Template.md` — **Шинэ модуль нэмэх загвар** (migration/RLS, NestJS, тест шалгах хуудас) ✨

### 04 — Модулийн SDK
- `01_Shared_Event_Bus_Contract_Spec.md` — Event bus

### 06 — Аюулгүй байдлын сайжруулалт
- `FIX-01` RLS Connection Pool
- `FIX-02` Transactional Outbox DLQ
- `FIX-03` Pessimistic Lock Approval
- `FIX-04` Conflict Resolution 3-Way Diff

### 07 — Технологийн стек
- `01_Tech_Stack_Decision.md`
- `03_Enterprise_VPC_Deployment.md` — Enterprise VPC (`DEPLOYMENT_MODE=dedicated`) байршуулах runbook ✨
- `02_Local_Supabase_Docker_Windows.md` — Supabase + Redis-г Docker дээр асаах, port, `.env`, Windows алдаанууд

### 08 — Хөгжүүлэлтийн төлөвлөгөө
- `01_Development_Roadmap.md`

---

## 🚀 MVP / Sprint Явц

| Хувилбар | Нэр | Статус | Үндсэн зүйл |
|----------|-----|--------|-------------|
| `v0.1.0` | MVP 1–3 | ✅ Дууссан | Auth, DB, RLS, MR backend |
| `v0.2.0` | MVP 4 | ✅ Дууссан | Integration tests, RULE-01~13 |
| `v0.3.0` | MVP 5 | ✅ Дууссан | Frontend UI, Submit/Approve/Reject |
| `v0.4.0` | Sprint 5 | ✅ **Одоогийн** | E2E Playwright, CI/CD, Docker |
| `v0.5.0` | Sprint 0 | 🔜 | Pre-flight fix |
| `v1.0.0` | Production | 🎯 Зорилго | Full production release |

✨ = 2026-09-21 шинэчлэгдсэн/нэмэгдсэн файл
