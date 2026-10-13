---
title: "S Project — Баримт Бичгийн Жагсаалт (INDEX)"
type: "Guide"
status: "Active"
last_updated: 2026-10-13
tags: [index, moc]
---

# S Project — Баримт Бичгийн Жагсаалт (INDEX)

> Шинэчлэгдсэн: 2026-10-13 · **Сүүлийн release: `v0.2.1`** (2026-10-12, пилот энэ хувилбар дээр) · **Хөгжүүлэлт: `v0.2.2`** (хэрэглэгч, ажилтан — [[07_v0.2.2_tech_plan]] · [[08_v0.2.2_progress]])
> Хувилбарын бодлого: [[VERSIONING]] · Changelog: [[CHANGELOG]] · Явц: [[project-status]]

Энэ файл бол vault-ийн **MOC (Map of Content)**. Шинэ баримт үүсгэх бүрт тохирох ангилалд `[[файлын_нэр]]` хэлбэрээр нэмнэ.

---

## 📌 Яаралтай лавлагаа

| Баримт | Агуулга |
|---|---|
| [[00_rules_and_context]] | **RULE-01~20** — Sprint эхлэхдээ ЗААВАЛ уншина |
| [[07_v0.2.2_tech_plan]] · [[08_v0.2.2_progress]] | **Одоогийн спринт** — v0.2.2 (хэрэглэгч, нэвтрэлт, урилга, эрх + HR — [[ADR-006_HR_Core_Module]]) |
| [[PRD-06_Vision_Business_Model]] | Алсын хараа ба бизнес загвар (2026-10-13) |
| [[03_v0.2_full_plan]] | v0.2 бүтэн төлөвлөгөө (v0.2.1–v0.2.4) |
| [[00_Codebase_Map]] | **Codebase Atlas — хөгжүүлэлтийн эхлэх цэг** (кодыг уншихгүйгээр контекст авах) |
| [[lessons_learned]] | **Нэгтгэсэн алдааны сургамж** (ганц үндсэн файл) — §24 = v0.2.2, §23 = баримт (DOC-002) |
| [[project-status]] | Одоогийн явц, тест ажиллуулах заавар |
| [[CHANGELOG]] · [[VERSIONING]] | SemVer changelog · хувилбаржуулалтын бодлого |

---

## 🧭 01 — Бүтээгдэхүүний шаардлага (PRD)

- [[PRD-01_Core_Vision]] — Системийн үндсэн зорилго, ойлголт
- [[PRD-02_Tenant_Tiers]] — Tenant tier, pricing
- [[PRD-03_Functional_Specs]] — Функциональ тодорхойлолт
- [[PRD-04_UI_UX_Architecture_Spec]] — UI/UX шаардлага
- [[PRD-05_Internal_Social_Feed]] — Байгууллагын дотоод Feed (v0.3)
- [[PRD-06_Vision_Business_Model]] — **Алсын хараа, бүх салбар, 2 төрлийн сүлжээ, бизнес загвар, худалдаа** (2026-10-13)

## 🏛 02 — Системийн архитектур

- [[S Project_ Техникийн Архитектурын Нарийвчилсан Тодорхойлолт]] — Техникийн архитектурын нарийвчилсан тодорхойлолт (анхны)
- [[01_Core_API_Gateway_ReverseProxy_Spec]] — API Gateway / Reverse proxy
- [[ARCH-05_UI_UX_Architecture_Spec]] — Frontend архитектур
- **ADR (архитектурын шийдвэр)**
  - [[ADR-001_Tenant_Isolation]] — Tenant тусгаарлалт: shared RLS + Enterprise VPC; §4.1 RLS runtime (`app_user`)
  - [[ADR-003_Users_Login_Permissions]] — Хэрэглэгч, нэвтрэлт, эрхийн загвар (v0.2.2)
  - [[ADR-004_Feed_Architecture]] — Feed архитектур (v0.3)
  - [[ADR-005_Org_Connectivity_Domains]] — Байгууллагын холболт `<байгууллага>.gobiverse.website` + нүүр хуудас (§2.4)
  - [[ADR-006_HR_Core_Module]] — **HR модуль:** ажилтан/хэлтэс/ээлж/ирц Кемпээс үндсэн систем рүү (v0.2.2, 2026-10-13)

## 🗄 03 — Өгөгдлийн загвар ба аюулгүй байдал

- [[01_PostgreSQL_MultiTenant_RLS_Spec]] — RLS policy
- [[02_core_kernel_schema]] — ⛔ анхны schema spec (Deprecated → [[03_DB_Catalog]])
- [[03_Module_Template]] — Шинэ модуль нэмэх загвар (migration/RLS, `inTenantTx`, тест)
- [[S Project - System Risk Assessment & Audit Report]] — Эрсдэлийн үнэлгээ, аудитын тайлан (05_AI_Implementation_Prompts)

## ⚙️ 07 — Технологийн стек ба орчин

- [[01_Tech_Stack_Decision]] — Технологийн сонголт
- [[02_Local_Supabase_Docker_Windows]] — Local орчин (Supabase + Redis, Docker, Windows), `.env`, тест командууд
- [[03_Enterprise_VPC_Deployment]] — Enterprise VPC runbook (`DEPLOYMENT_MODE=dedicated`), §5.5 app_user + RLS аудит
- [[04_Pilot_Camp_Windows]] — Кемп пилот: нэг Windows машин, `deploy/pilot/pilot.ps1`, нөөц/сэргээлт
- [[05_Cloudflare_Tunnel]] — Байгууллага холбох: Cloudflare Tunnel ([[ADR-005_Org_Connectivity_Domains]])

## 🧱 09 — Codebase Atlas (`09_Codebase/`)

> Хөгжүүлэлтийн чат кодыг дахин дахин уншихгүй — эндээс контекст авна (RULE-21). `pnpm docs:gen` / `pnpm docs:check`.

- [[00_Codebase_Map]] — **эхлэх цэг:** унших дараалал, repo бүтэц, хүсэлтийн урсгал, "хаанаас олох вэ"
- [[01_Backend_Modules]] — модуль бүрийн зорилго, гол файл, хүснэгт, эрх (Кемпийн 11 дэд модуль)
- [[04_Frontend_Map]] — web-shell бүтэц, Кемп UI, i18n, шинэ хуудас нэмэх
- [[08_Patterns]] — RULE хураангуй + жишээ файл (endpoint, migration, тест), DoD
- 🤖 Автомат: [[02_API_Catalog]] (endpoint → service → эрх) · [[03_DB_Catalog]] (хүснэгт, багана, RLS) · [[05_Permissions_Catalog]] · [[06_Config_Env]] · [[07_Test_Map]] · [[09_Frontend_Routes]]

## 🗺 08 — Roadmap ба спринт

- [[00_rules_and_context]] — RULE-01~20, codebase state
- [[01_Development_Roadmap]] — Урт хугацааны roadmap

### `v0.2.x` — 🔄 Идэвхтэй
| Баримт | Төрөл |
|---|---|
| [[00_backlog_and_tech_debt]] | v0.1-ээс үлдсэн ажил + техникийн өр (ID-тай бүртгэл) |
| [[01_plan_draft]] | v0.2 урьдчилсан төлөвлөгөө (D1–D3) |
| [[02_v0.2.0_tech_plan]] | v0.2.0 — олон хэл, бөөнөөр оруулах, хурдан UX |
| [[03_v0.2_full_plan]] | v0.2 бүтэн төлөвлөгөө (v0.2.1–v0.2.4) |
| [[04_v0.2.1_tech_plan]] · [[05_v0.2.1_progress]] · [[06_v0.2.1_PIL-07_report]] | v0.2.1 төлөвлөгөө · явц · PIL-07 тайлан |
| [[07_v0.2.2_tech_plan]] · [[08_v0.2.2_progress]] | **v0.2.2** — хэрэглэгч, нэвтрэлт, урилга, эрх |

### `v0.3` — 📝 Урьдчилсан
- [[00_plan_draft]] — Байгууллагын дотоод Feed ([[PRD-05_Internal_Social_Feed]], [[ADR-004_Feed_Architecture]])

### Кемп модуль
- [[01_plan_and_erd]] — **Одоогийн** төлөвлөгөө + ERD v4, шийдвэр D1–D8 (V1 ✅, V2 хүлээгдэж буй)
- Архив: [[01_plan_and_erd.v1]] · [[01_plan_and_erd.v2]] · [[01_plan_and_erd.v3]]
- Кодын лавлагаа: `supabase/dev/camp_e2e_grant.sql`, `apps/e2e/tests/camp*.spec.ts`; алдааны сургамж — [[lessons_learned]] §15

### Пилот (Sino Hydro)
- [[pilot-test-guide]] — Өгөгдөл оруулах / туршилтын заавар + дуусах шалгуур
- [[pilot-feedback]] — Санал, асуудлын бүртгэл
- [[i18n-review]] — Орчуулгын хяналт (en/zh), нэр томьёо

### UI загвар
- [[08_Roadmap/_design_mockups/README|_design_mockups/README]] — дэлгэцийн концепц загварууд (`*.dc.html`)

### `v0.1.5` — ✅ Архив
- [[00_index]] — Sprint 6–11 индекс
- [[01_analysis_and_plan_2026-10-08]] — Шинжилгээ + Phase 0–6 (бодит хэрэгжилт)
- [[sprint_6_schema_isolation]] (ADR-001-ээр орлогдсон) · [[sprint_7_advanced_workflow]] · [[sprint_8_performance]] · [[sprint_9_modules]] · [[sprint_10_event_bus_testing]] · [[sprint_11_release]]

### `v0.1.0` — ✅ Архив
- [[02_v1_sprint_implementation_plan]]
- [[sprint_0_foundation]] · [[sprint_1_ingress]] · [[sprint_2_workflow]] · [[sprint_3_eventbus]] · [[sprint_4_onboarding]] · [[sprint_5_production]]

## 🎓 Сургалтын материал (`_learning/` — тусдаа private repo, git-ээс нуусан)

- [[_learning/README|_learning/README]] — Бүтэц, хичээлийн жагсаалт, дүрэм
- [[00_roadmap]] — 3 сарын суралцах замын зураг (IT инженер)
- **Хичээл (dev):** [[02-1_git]] — Git (+ A4 PDF)
- **Хэрэглэгчийн заавар:** [[00_getting-started]] — Бүртгүүлэх ба нэвтрэх (ноорог)
- Загвар: [[_template_lesson]] · [[_template_guide]] · PDF: `_learning/_build/build_pdf.py`

## 📒 Бүртгэл (Log)

- [[project-status]] — Явцын тэмдэглэл
- [[CHANGELOG]] — SemVer changelog
- [[lessons_learned]] — Нэгтгэсэн алдааны сургамж (root `lessons_learned.md` = заагч)
- [[lessons_learned_MVP]] — MVP алдааны нарийвчилсан тэмдэглэл (архив)

---

## 🚀 Хувилбарын явц

| Хувилбар | Нэр | Статус |
|---|---|---|
| `v0.1.0` | Tier 1 Core System | ✅ 2026-09-21 |
| `v0.1.5` | Tier 2 Enterprise VPC (+ Кемп V1, Budget/Inventory/Vendor/Report) | ✅ 2026-10-10 |
| `v0.1.6.1` | Кемп пилот (v0.1-ийн сүүлийн) | ✅ 2026-10-10 |
| `v0.2.0` | Пилотын санал, олон хэл, бөөнөөр оруулах | ✅ 2026-10-11 |
| `v0.2.1` | Хоолны тооцоо, мониторинг, нэвтрэлтийн хамгаалалт | ✅ 2026-10-12 |
| `v0.2.2` | Хэрэглэгч, ажилтан, нэвтрэлт, урилга | 🔄 Хөгжүүлэлт |
| `v0.3.0` | Байгууллагын дотоод Feed | 📝 |
| `v1.0.0` | Production | 🎯 |

---

## 🏷 Frontmatter стандарт

Бүх `.md` файлын эхэнд:

```yaml
---
title: "<Файлын нэр>"
type: "PRD | Architecture | Database | Roadmap | Guide | Log"
status: "Draft | Active | Deprecated | Archived"
last_updated: YYYY-MM-DD
tags: [module_name, sprint_v]
---
```

- `Log` — цаг хугацааны бүртгэл (CHANGELOG, progress, тайлан, lessons_learned) — 2026-10-13 нэмсэн
- `Archived` — дууссан хувилбарын түүхэн баримт (`v0.1.0`, `v0.1.5`, `_archive/`) — 2026-10-13 нэмсэн
- Линк: зөвхөн `[[файлын_нэр]]` (vault дотор файлын нэр давхардахгүй байх ёстой). Кодын зам (`apps/...`) backtick-ээр үлдэнэ.

---

## 🧩 Ирээдүйд нэмэгдэх / Олж хуулах (Missing Specs)

Эдгээр баримт өмнөх INDEX-д дурдагдсан боловч vault-д **байхгүй**. Олдвол тохирох хавтаст хуулаад дээрх ангилалд `[[...]]` линк нэмнэ.

- [ ] `04_Module_SDK/01_Shared_Event_Bus_Contract_Spec.md` — Event bus гэрээ
- [ ] `06_*/FIX-01` — RLS Connection Pool
- [ ] `06_*/FIX-02` — Transactional Outbox DLQ
- [ ] `06_*/FIX-03` — Pessimistic Lock Approval
- [ ] `06_*/FIX-04` — Conflict Resolution 3-Way Diff
