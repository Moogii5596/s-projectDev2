---
title: "CONTEXT — агентын эхлэх цэг (нэг хуудас)"
type: "Guide"
status: "Active"
last_updated: 2026-10-17
tags: [context, rules, moc]
---

# CONTEXT — агентын эхлэх цэг

> **Ажил бүрийн эхэнд ЗӨВХӨН энэ файлыг уншина** (Claude болон Cursor ижил). Дараа нь доорх §2-оос даалгаварт хамаарах файлуудыг л нээнэ. Бүх баримтыг, бүх кодыг уншихгүй — context хэмнэх нь энэ vault-ийн гол зорилго.

## 1. Төсөл (30 секундэд)

S Project — гаднаа нийгмийн сүлжээ, цаанаа ERP; бүх салбарт. NestJS + Fastify / Prisma / PostgreSQL (Supabase, RLS) / React + Vite, pnpm monorepo. Пилот: Sino Hydro (Кемп модуль), `sino.gobiverse.website`. **Одоо юу хийгдэж байгаа, дараагийн алхам → [[project-status]] §1–2.**

**Агент:** нэг үед нэг хэрэгсэл. Claude-ийн лимит дуусахад Cursor дээр үргэлжилнэ; лимит reset хийхэд Claude. **Зэрэгцээ биш.** Солих журам → §7.

## 2. Ажлын төрөл → унших файл

| Даалгавар                          | Унших (дарааллаар)                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Спринтийн блок үргэлжлүүлэх        | [[project-status]] → одоогийн tech plan + progress ([[07_v0.2.2_tech_plan]], [[08_v0.2.2_progress]]) → доорх кодын мөр                                                   |
| Backend код                        | [[00_Codebase_Map]] → [[01_Backend_Modules]]-ийн **тухайн хэсэг** → [[02_API_Catalog]] / [[03_DB_Catalog]]-ийн **тухайн хэсэг** → [[08_Patterns]] §2 → зөвхөн засах файл |
| Migration / RLS                    | [[08_Patterns]] §3 → [[03_DB_Catalog]] (тухайн хүснэгт) → [[01_PostgreSQL_MultiTenant_RLS_Spec]] (эргэлзвэл)                                                             |
| Эрх / роль                         | [[05_Permissions_Catalog]] → [[ADR-003_Users_Login_Permissions]]                                                                                                         |
| Frontend                           | [[04_Frontend_Map]] → [[09_Frontend_Routes]] → [[PRD-04_UI_UX_Architecture_Spec]] §2                                                                                     |
| Тест                               | [[07_Test_Map]] (хамаарах файл л) → [[08_Patterns]] §4                                                                                                                   |
| Алдаа засах                        | [[lessons_learned]]-ийн **тухайн бүлэг** → (хэрэгтэй бол) `lessons/LL-*.md`-д `[ID]` хайх                                                                                |
| Пилот / deploy / staging           | [[04_Pilot_Camp_Windows]] (тухайн §) · [[05_Cloudflare_Tunnel]] · [[06_Config_Env]]                                                                                      |
| IDE / Cursor тохиргоо              | [[06_Cursor_Setup]]                                                                                                                                                      |
| Төлөвлөлт / шинэ хувилбар          | [[01_Development_Roadmap]] → [[03_v0.2_full_plan]] → [[00_backlog_and_tech_debt]] → холбогдох PRD / ADR                                                                  |
| Бүтээгдэхүүн / архитектурын асуулт | [[PRD-01_Core_Vision]] · [[ARCH-00_System_Overview]] · [[PRD-06_Vision_Business_Model]]                                                                                  |
| Баримт бичиг засах                 | [[INDEX]] (бүрэн жагсаалт) + энэ файл §5                                                                                                                                 |

## 3. Ажлын дүрэм (Project-ийн заавар)

1. **Төлөвлөгөө эхлээд:** шууд код бичихгүй — `[ ]` checklist төлөвлөгөө гаргаж батлуулна.
2. Код бичсэн хариулт бүрийн төгсгөлд checklist-ийн одоогийн төлөв (`[x]` / `[ ]`).
3. **Өгөхөөс өмнө шалгана:** type-check, lint (шинэ файлд тухайн машин дээр eslint — PROC-012), холбогдох тест. Шалгаагүй кодыг хэрэглэгчээр туршуулахгүй.
4. Алдаа засагдвал → `lessons/LL-*.md` + `pnpm docs:gen` (индекс автомат). Өмнө бүртгэгдсэн алдааг давтахгүй.
5. Файлыг хэрэглэгчийн компьютер дээр (`E:\MoogiiDev\Dev\s-project`) хадгална; commit-ийг хэрэглэгч хийнэ.
6. Хариулт монголоор, товч.

## 4. Хатуу кодын дүрэм (бүтэн текст [[00_rules_and_context]])

- **DB:** schema = `supabase/migrations/*.sql` (`prisma db push` ✖, MIG-001) · ID `uuid_generate_v7()` (R11) · UUID бүрт `@db.Uuid` (R05) · enum өөрчлөх дараалал (R15) · migration дугаарыг хэрэгжүүлэх үед өгнө (MIG-002).
- **RLS:** tenant өгөгдөл үргэлж `inTenantTx(prisma, tenantId, tx => …)` дотор (R03/R04; `SET LOCAL` ✖) · шинэ хүснэгт → `SELECT camp_apply_tenant_rls('t')` (R12) · `SYSTEM_DATABASE_URL` зөвхөн системийн ажилд.
- **NestJS:** глобал guard → `APP_GUARD` + `useExisting` (R07) · Prisma enum `@prisma/client`-ээс (R02) · `import type` (R09) · FK-д `core_users.id` (`resolveUserId`, `req.user.id` = authId) (R13) · `$use` raw guard (R14).
- **API:** DTO нэр frontend-тэй ТАМ АДИЛ (R20) · pagination type (R17) · алдаа = `code` + `params`, мессеж mn/en/zh.
- **Тест:** vitest + unplugin-swc (R08) · `overrideProvider` зөвхөн байгаад (R01) · prototype patch ✖ (R10) · `await app?.close()` (R06) · RLS тест dual client (R16) · integration `pool: 'forks'` (R18).
- **Frontend:** Vite proxy (R19) · `ui.tsx` компонент, шинэ UI сан ✖.
- **Баримт:** код өөрчилсөн блокийн төгсгөлд `pnpm docs:gen` → `pnpm docs:check` ✓ + [[01_Backend_Modules]] / [[04_Frontend_Map]] (R21).

## 5. Мэдээллийн ганц эх сурвалж (хуулахгүй — линк хий)

| Мэдээлэл                             | Хаана                                      |
| ------------------------------------ | ------------------------------------------ |
| Одоогийн ажил, дараагийн алхам       | [[project-status]]                         |
| Агент солих (Claude ↔ Cursor)        | энэ файл §7                                |
| Хувилбарын жагсаалт, шийдвэрийн түүх | [[01_Development_Roadmap]]                 |
| Ажлын ID (C-/PIL-/V2-…) ба төлөв     | [[00_backlog_and_tech_debt]]               |
| Блокийн явц                          | спринтийн progress (`08_v0.2.2_progress`)  |
| Кодын бүтэц                          | `09_Codebase/` (🤖 каталог автомат)        |
| Алдааны сургамж                      | `lessons/LL-*.md` → 🤖 [[lessons_learned]] |
| Шийдвэрийн "яагаад"                  | ADR / PRD                                  |
| Өөрчлөлтийн түүх                     | [[CHANGELOG]]                              |

## 6. Уншихгүй (зөвхөн тусгайлан хэрэгтэй үед)

`status: Archived / Deprecated` бүх файл · `docs/_archive/`, `08_Roadmap/_archive/` · `V.0.1.0/`, `V.0.1.5/` · [[CHANGELOG]] бүтнээр · `lessons/LL-*.md` бүтнээр · [[lessons_learned_MVP]].

## 7. Агент солих (Claude ↔ Cursor)

Чат түүх нөгөө хэрэгсэлд очихгүй. Үнэн = git + [[project-status]] + спринтийн progress.

**Гарахдаа** (лимит дуусах / хэрэгсэл солих):

1. Хийсэн алхмыг progress-ийн checklist-д `[x]` / `[ ]` болгоно; блок дууссан бол `/close-block` ([[08_Patterns]] §6).
2. Блок **дуусаагүй** бол progress дээр «Зогссон цэг»: юу хийгдсэн, үлдсэн алхам, хөндсөн файлууд (1–5 мөр).
3. Алдаа засагдсан бол `lessons/LL-*.md`. `docs:gen` / `docs:check` боломжтой бол ажиллуулна.
4. Commit-ийг хэрэглэгч хийнэ.

**Орохдоо** (нөгөө хэрэгсэл):

1. Энэ файл → [[project-status]] §1–2 → одоогийн progress.
2. `git status` / `git diff` — commit хийгээгүй өөрчлөлт байвал тэндээс үргэлжилнэ.
3. Ижил блок дээр хоёр дахь агент **эхлүүлэхгүй**.
