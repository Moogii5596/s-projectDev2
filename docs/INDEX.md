# S Project — Баримт Бичгийн Жагсаалт

> Шинэчлэгдсэн: 2026-10-10 (v0.1.5 release бэлтгэл) | **Одоогийн хувилбар: `v0.1.5`** (2026-10-10)
> Хувилбарын дугаарлалт: `docs/VERSIONING.md` (хуучин v0.1.0~v0.4.0 нэрлэлт нэгдэж `v0.1.0` болсон)

---

## 📌 Яаралтай лавлагаа (Хамгийн их хэрэглэгддэг)

| Файл | Агуулга |
|------|---------|
| `docs/08_Roadmap/00_rules_and_context.md` | **RULE-01~20** — Sprint эхлэхдээ ЗААВАЛ уншина |
| `docs/08_Roadmap/V.0.1.5/01_analysis_and_plan_2026-10-08.md` | **Одоогийн төлөвлөгөө** — Phase 0–6, шийдвэрүүд, шалгалтын тоо |
| `docs/lessons_learned.md` | **Нэгтгэсэн алдааны сургамж** (ганц үндсэн файл) — §11–19 = v0.1.5 (RLS, SEC-001~004, EVT, TEST, PROC) |
| `docs/project-status.md` | Одоогийн явц, тест ажиллуулах заавар, backlog |
| `docs/CHANGELOG.md` | SemVer changelog — `[Unreleased] v0.1.5` (⚠️ зан төлөвийн өөрчлөлт) |
| `docs/VERSIONING.md` | Хувилбаржуулалтын бодлого |

---

## 📁 Кодын репо баримт (`s-project/docs/`)

### Явцын баримт бичиг

| Файл | Агуулга |
|------|---------|
| `docs/project-status.md` | Одоогийн явц, хувилбар, архитектурын гол шийдлүүд, тест командууд |
| `docs/CHANGELOG.md` | SemVer стандарт changelog |
| `docs/VERSIONING.md` | `v0.x.x` хувилбаржуулалтын бодлого, дүрэм |
| `docs/lessons_learned.md` | **Нэгтгэсэн** алдааны сургамж (root `lessons_learned.md` = заагч) |
| `docs/lessons_learned_MVP.md` | Нарийвчилсан MVP алдааны тэмдэглэл (архив) |

### Аюулгүй байдал / үйл ажиллагаа (v0.1.5)

| Файл | Агуулга |
|------|---------|
| `docs/02_System_Architecture/ADR-001_Tenant_Isolation.md` | Tenant тусгаарлалт (B) + **§4.1 RLS runtime** (`app_user` / `SYSTEM_DATABASE_URL`) |
| `docs/03_Data_Models_and_Security/03_Module_Template.md` | Шинэ модуль: migration/RLS, `inTenantTx`, тест |
| `docs/07_Tech_Stack_and_Environment/02_Local_Supabase_Docker_Windows.md` | Local орчин, `.env`, **тест командууд** (unit / integration / e2e + fixture) |
| `docs/07_Tech_Stack_and_Environment/03_Enterprise_VPC_Deployment.md` | VPC runbook, **§5.5 app_user нууц үг + RLS аудит** |
| `supabase/dev/rls_audit.sql` | RLS аудит (зөвхөн уншина) |

---

## 📁 Sprint баримт бичиг (`docs/08_Roadmap/`)

| Хавтас / файл | Агуулга | Хувилбар | Статус |
|------|---------|----------|--------|
| `00_rules_and_context.md` | **RULE-01~20**, Codebase state | — | ✅ |
| `01_Development_Roadmap.md` | Урт хугацааны roadmap | — | — |
| `V.0.1.0/` (`sprint_0` … `sprint_5`, `02_v1_sprint_implementation_plan.md`) | Tier 1 Core System | `v0.1.0` | ✅ Дууссан |
| `V.0.1.5/00_index.md` | Sprint 6–11 индекс, явцын хуваарь | `v0.1.5` | ✅ Дууссан |
| `V.0.1.5/01_analysis_and_plan_2026-10-08.md` | Шинжилгээ + Phase 0–6 (бодит хэрэгжилт) | `v0.1.5` | ✅ |
| `V.0.1.5/sprint_6` … `sprint_11` | Анхны sprint төлөвлөгөө (sprint_6 орлогдсон — ADR-001) | `v0.1.5` | түүхэн |

---

## 📁 Кемп модуль (`docs/08_Roadmap/camp_module/`) — V1 ✅ 2026-10-10

| Файл | Агуулга |
|------|---------|
| `01_plan_and_erd.md` | **Одоогийн** төлөвлөгөө + ERD v4, шийдвэрүүд (D1–D8), шатны checklist (V1 дууссан, V2 хойшлуулсан) |
| `01_plan_and_erd.v1.md` … `.v3.md` | ERD-ийн өмнөх хувилбарууд (архив) |
| `supabase/dev/camp_e2e_grant.sql` | E2E-ийн урьдчилсан нөхцөл (admin@test.mn → Кемп админ) |
| `apps/e2e/tests/camp*.spec.ts` | Кемпийн e2e (тохиргоо/мастер, өдөр тутмын ажиллагаа, хөрөнгө/засвар) |
| `lessons_learned.md` §15 | Кемп модулийн алдааны сургамж |

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

## 🚀 Хувилбарын явц (SemVer — `VERSIONING.md`)

| Хувилбар | Нэр | Статус |
|----------|-----|--------|
| `v0.1.0` | Tier 1 Core System (MVP 1–5 + Sprint 0–5 нэгдсэн) | ✅ Дууссан |
| `v0.1.5` | Tier 2 Enterprise VPC (+ Кемп V1, Budget/Inventory/Vendor/Report) | ✅ 2026-10-10 |
| `v0.2.0` | Tier 3 Air-Gapped | 📋 |
| `v1.0.0` | Production | 🎯 Зорилго |

✨ = 2026-09-21 шинэчлэгдсэн/нэмэгдсэн файл
