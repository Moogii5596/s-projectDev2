---
title: "S Project — Баримт бичгийн газрын зураг (INDEX)"
type: "Guide"
status: "Active"
last_updated: 2026-11-10
tags: [index, moc]
---

# S Project — Баримт бичгийн газрын зураг (INDEX)

> **Агент (Claude / Cursor):** эндээс биш [[CONTEXT]]-оос эхэл (нэг хуудас, ажлын төрлөөр унших файл). Энэ INDEX — хүнд зориулсан бүрэн жагсаалт (MOC).
> Одоогийн байдал → [[project-status]] · хувилбарууд → [[01_Development_Roadmap]] · шинэ баримт нэмэхэд тохирох хэсэгт `[[нэр]]` нэмж, `pnpm docs:check` ажиллуул.
> Frontmatter: `type` = PRD · Architecture · Database · Roadmap · Guide · Log; `status` = Draft · Active · Deprecated · Archived. **Archived / Deprecated-ийг хөгжүүлэлтэд уншихгүй.**

## 🧭 Бүтээгдэхүүн (PRD)
- [[PRD-01_Core_Vision]] — бүтээгдэхүүний тойм, актор, ойлголт, модулийн газрын зураг
- [[PRD-06_Vision_Business_Model]] — алсын хараа, бүх салбар, 2 төрлийн сүлжээ, бизнес загвар
- [[PRD-02_Tenant_Tiers]] — байршуулалтын түвшин (shared / dedicated / air-gapped), багц
- [[PRD-03_Functional_Specs]] — одоогийн модулиудын функц, бизнесийн дүрэм
- [[PRD-04_UI_UX_Architecture_Spec]] — UX зарчим (утас, 3 хэл, preview → confirm)
- [[PRD-05_Internal_Social_Feed]] — дотоод Feed (v0.3)

## 🏛 Архитектур
- [[ARCH-00_System_Overview]] — **архитектурын тойм**: одоо ✅ / зорилт 🧭, эрсдэлийн бүртгэл
- [[01_Core_API_Gateway_ReverseProxy_Spec]] — edge → API: Cloudflare, Caddy, guard гинж, хязгаар
- [[ARCH-05_UI_UX_Architecture_Spec]] — frontend шийдвэрүүд
- ADR: [[ADR-001_Tenant_Isolation]] (RLS + dedicated) · [[ADR-003_Users_Login_Permissions]] (хэрэглэгч, нэвтрэлт, эрх) · [[ADR-004_Feed_Architecture]] · [[ADR-005_Org_Connectivity_Domains]] (домэйн, tunnel, нүүр хуудас) · [[ADR-006_HR_Core_Module]] · [[ADR-007_System_Roles_Permissions]] (роль, эрх системийн түвшинд) · [[ADR-008_Sites]] (ажлын байр) · [[ADR-009_Module_Engine]] (**цөм = модулийн хөдөлгүүр**) · [[ADR-010_Tenant_Links]] (байгууллага хоорондын холболт, Draft) · [[ADR-011_Cloud_Hosting]] (**үүлэн хостинг**, 2026-11-11) · [[ADR-002_Hosting]] (пилот PC, Deprecated)

## 🗄 Өгөгдөл ба аюулгүй байдал
- [[01_PostgreSQL_MultiTenant_RLS_Spec]] — tenant тусгаарлалт, DB роль, policy загвар
- [[03_Module_Template]] — шинэ модуль: migration / RLS / NestJS / тест
- Хүснэгт бүр → [[03_DB_Catalog]] (автомат)

## 🧱 Codebase Atlas (`09_Codebase/`, RULE-21)
- [[00_Codebase_Map]] — эхлэх цэг · [[01_Backend_Modules]] · [[04_Frontend_Map]] · [[08_Patterns]]
- 🤖 [[02_API_Catalog]] · [[03_DB_Catalog]] · [[05_Permissions_Catalog]] · [[06_Config_Env]] · [[07_Test_Map]] · [[09_Frontend_Routes]]

## ⚙️ Стек ба орчин
- [[01_Tech_Stack_Decision]] — стек (хувилбар, шалтгаан)
- [[02_Local_Supabase_Docker_Windows]] — local орчин, тест командууд
- [[03_Enterprise_VPC_Deployment]] — VPC / dedicated runbook
- [[06_Cursor_Setup]] · [[08_Engineering_Practices]] (мэргэжлийн стандарт, Draft) · **[[09_Team_Handbook]]** (багийн гарын авлага, Draft) · **[[10_Agent_Team_Workflow]]** (агентын баг, PO-ийн батламж, Draft) — Cursor IDE: rules, commands, ignore, UI тохиргоо · repo үндэс `CLAUDE.md` → [[CONTEXT]] (Claude Code)
- [[04_Pilot_Camp_Windows]] — пилот: нэг Windows машин, `pilot.ps1`, staging, нөөц
- **[[07_Cloud_Deploy]]** — үүлэн deploy runbook (v0.2.5-аас): Supabase Cloud + Render + Vercel, нууцын жагсаалт, «Deploy production»
- [[05_Cloudflare_Tunnel]] — байгууллага холбох

## 🗺 Төлөвлөгөө
- [[01_Development_Roadmap]] — **хувилбарын ганц жагсаалт** + шийдвэрийн бүртгэл
- [[00_rules_and_context]] — RULE-01~21 бүтэн текст
- `v0.2.x` 🔄: [[03_v0.2_full_plan]] · [[00_backlog_and_tech_debt]] (ID + төлөв) · [[07_v0.2.2_tech_plan]] · [[08_v0.2.2_progress]] · **[[11_v0.2_completion_master_plan]]** (v0.2.4…v0.2.10) · **[[09_v0.2.3_tech_plan]]** · **[[12_v0.2.3_data_import]]** (Блок D — Sino өгөгдөл импорт) · [[10_v0.2.4_tech_plan]] · **[[13_v0.2.5_tech_plan]]** (үүлэн хостинг)
  - Архив: [[01_plan_draft]] (Deprecated) · [[02_v0.2.0_tech_plan]] · [[04_v0.2.1_tech_plan]] · [[05_v0.2.1_progress]] · [[06_v0.2.1_PIL-07_report]]
- `v0.3` 📝: [[00_plan_draft]] (дотоод Feed)
- Кемп модуль: [[01_plan_and_erd]] (ERD v4, V1 ✅, V2 📋) · архив [[01_plan_and_erd.v1]] · [[01_plan_and_erd.v2]] · [[01_plan_and_erd.v3]]
- UI концепц: [[08_Roadmap/_design_mockups/README|_design_mockups]]

## 🏕 Пилот (Sino Hydro)
- [[12_v0.2.3_data_import]] — Sino-гийн Excel → импортын файл (`scripts/data-migration/sino`), дараалал, дүрэм
- [[pilot-test-guide]] — өгөгдөл оруулах, туршилт, дуусах шалгуур · [[pilot-feedback]] — санал · [[i18n-review]] — орчуулга, нэр томьёо

## 📒 Бүртгэл
- [[project-status]] — одоо / дараагийн алхам · [[CHANGELOG]] · [[VERSIONING]]
- [[lessons_learned]] — **алдааны индекс** (🤖, `lessons/LL-*.md`-ээс) · [[LL-99_Changelog]] · хуучин MVP: [[lessons_learned_MVP]]

## 🎓 Сургалт (`_learning/` — тусдаа private repo, gitignore)
- [[_learning/README|_learning/README]] · [[_learning/dev/00_roadmap|00_roadmap]] · хичээл [[_learning/dev/02_git/02-1_git|02-1_git]] · заавар [[_learning/user-guides/00_getting-started|00_getting-started]] · загвар [[_learning/_template_lesson|_template_lesson]], [[_learning/_template_guide|_template_guide]]

## 🗂 Архив (хөгжүүлэлтэд уншихгүй)
- 2026-09-ийн анхны spec: [[ARCH-00_Original_Concept.v1]] · [[PRD-01_Core_Vision.v1]] · [[PRD-02_Tenant_Tiers.v1]] · [[PRD-03_Functional_Specs.v1]] · [[PRD-04_UI_UX_Architecture_Spec.v1]] · [[ARCH-05_UI_UX_Architecture_Spec.v1]] · [[01_Core_API_Gateway_ReverseProxy_Spec.v1]] · [[01_PostgreSQL_MultiTenant_RLS_Spec.v1]] · [[01_Tech_Stack_Decision.v1]] · [[02_core_kernel_schema.v1]] · [[Risk_Assessment_2026-09.v1]]
- Хуучин хэсгүүд: [[01_Development_Roadmap_v1]] · [[project-status_history_v0.1]] · [[00_rules_codebase_v0.1]]
- `v0.1.5`: [[00_index]] · [[01_analysis_and_plan_2026-10-08]] · [[sprint_6_schema_isolation]] · [[sprint_7_advanced_workflow]] · [[sprint_8_performance]] · [[sprint_9_modules]] · [[sprint_10_event_bus_testing]] · [[sprint_11_release]]
- `v0.1.0`: [[02_v1_sprint_implementation_plan]] · [[sprint_0_foundation]] · [[sprint_1_ingress]] · [[sprint_2_workflow]] · [[sprint_3_eventbus]] · [[sprint_4_onboarding]] · [[sprint_5_production]]

## 🧩 Vault-д алга (олдвол нэмнэ)
- [ ] `04_Module_SDK/01_Shared_Event_Bus_Contract_Spec.md` — event bus гэрээ · [ ] `06_*/FIX-01~04` (RLS pool, outbox DLQ, pessimistic lock, 3-way diff)
