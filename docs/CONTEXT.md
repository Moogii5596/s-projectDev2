---
title: "CONTEXT — юу хаана байна (агентын зураглал)"
type: "Guide"
status: "Active"
last_updated: 2026-11-10
tags: [context, moc]
---

# CONTEXT — юу хаана байна

> **Ажлын дүрэм** (урсгал, дууссан гэх шалгуур, эрсдэлтэй үйлдэл, кодын хатуу дүрэм) → repo-ийн root дахь `AGENTS.md` — бүх агентад нэг.
> Энэ файл зөвхөн зураглал: даалгаварт **аль файлыг** унших. Бүх баримт, бүх кодыг уншихгүй — зөвхөн хамаарах хэсгийг.

## 1. Эхлэх
Одоо юу хийгдэж байгаа = одоогийн хувилбарын tech plan (`docs/08_Roadmap/V.0.2/`-ийн хамгийн сүүлийн `*_tech_plan.md`, checkbox + «Зогссон цэг»). Release-ийн түвшний төлөв → [[project-status]].

## 2. Даалгавар → унших файл

| Даалгавар | Унших (дарааллаар, зөвхөн хамаарах хэсэг) |
|---|---|
| Блок хэрэгжүүлэх | tech plan (тухайн блок) → доорх мөрүүд |
| Backend | [[00_Codebase_Map]] → [[01_Backend_Modules]] → [[02_API_Catalog]] / [[03_DB_Catalog]] → [[08_Patterns]] §2 → засах файл |
| Migration / RLS | [[08_Patterns]] §3 → [[03_DB_Catalog]] (тухайн хүснэгт) → [[01_PostgreSQL_MultiTenant_RLS_Spec]] (эргэлзвэл) |
| Эрх / роль | [[05_Permissions_Catalog]] → [[ADR-007_System_Roles_Permissions]] |
| Frontend | [[04_Frontend_Map]] → [[09_Frontend_Routes]] → [[PRD-04_UI_UX_Architecture_Spec]] §2 |
| Тест | [[07_Test_Map]] → [[08_Patterns]] §4 |
| Алдаа засах | [[lessons_learned]] (индекс) → тухайн `lessons/LL-*.md` |
| Пилот / deploy / staging | **[[ADR-011_Cloud_Hosting]]** (v0.2.5-аас) · **[[07_Cloud_Deploy]]** (runbook) · [[04_Pilot_Camp_Windows]] · [[05_Cloudflare_Tunnel]] (v0.2.5 хүртэл) · [[06_Config_Env]] |
| Баг, үүрэг, PO-ийн батламж, урсгал | [[10_Agent_Team_Workflow]] · [[09_Team_Handbook]] (нэр томьёо, Ready/Done, git, release) |
| IDE тохиргоо | [[06_Cursor_Setup]] |
| Төлөвлөлт / шинэ хувилбар | [[01_Development_Roadmap]] → [[11_v0.2_completion_master_plan]] → [[00_backlog_and_tech_debt]] → PRD / ADR |
| Бүтээгдэхүүн / архитектур | [[ADR-009_Module_Engine]] (цөм ↔ модуль) · [[ADR-010_Tenant_Links]] (B2B холболт) · [[PRD-01_Core_Vision]] · [[ARCH-00_System_Overview]] · [[PRD-06_Vision_Business_Model]] |
| Кодын дүрмийн тайлбар | [[00_rules_and_context]] (RULE-01…22, шалтгаан) · [[08_Patterns]] (жишээ файл) |
| Баримт засах | [[INDEX]] |

## 3. Мэдээллийн ганц эх сурвалж (хуулахгүй — линк)

| Мэдээлэл | Хаана | Хэзээ шинэчлэх |
|---|---|---|
| Блокийн явц, «Зогссон цэг» | одоогийн tech plan | блок бүр |
| Release-ийн төлөв, дараагийн хувилбар | [[project-status]] | release |
| Хувилбарын жагсаалт, шийдвэрийн түүх | [[01_Development_Roadmap]] | release |
| Ажлын ID (C-/PIL-/V2-…) ба төлөв | [[00_backlog_and_tech_debt]] | release |
| Өөрчлөлтийн түүх | [[CHANGELOG]] | release |
| Кодын каталог | `09_Codebase/` (🤖 `pnpm docs:gen`) | автомат |
| Алдааны сургамж | `lessons/LL-*.md` → 🤖 [[lessons_learned]] | давтагдах алдаа |
| Шийдвэрийн «яагаад» | ADR / PRD | шийдвэр гарахад |

## 4. Уншихгүй
`status: Archived / Deprecated` файлууд · `docs/_archive/`, `08_Roadmap/_archive/` · `V.0.1.0/`, `V.0.1.5/` · `docs/_learning/` (тусдаа repo) · [[CHANGELOG]] бүтнээр · `lessons/LL-*.md` бүтнээр · [[lessons_learned_MVP]].
