---
title: "Frontend зураглал (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [codebase, frontend, camp, i18n]
---

# Frontend зураглал (web-shell)

> Эх: `apps/web-shell/src/`. Route → хуудас: [[09_Frontend_Routes]] (автомат). Backend endpoint: [[02_API_Catalog]]. Эхлэх цэг: [[00_Codebase_Map]].
> Стек: React 18 · Vite 6 · TanStack Query v5 (+ react-virtual) · axios · react-router 6 · react-i18next · Tailwind 3 · Supabase JS (session) · Module Federation (`@module-federation/vite`). Шинэ UI сан нэмэхгүй — Tailwind (gray/blue) хэв маяг.

## 1. Бүтэц

| Хавтас | Юу |
|---|---|
| `App.tsx` | Route мод: нийтийн (`/login`, `/invite/:token`, `/reset/:token`, `/forgot`) → `ProtectedRoute` → `Layout` → модулиуд (`isEnabled(...)`) |
| `api/` | `client.ts` — axios (`VITE_API_BASE_URL` хоосон бол same-origin → Vite proxy, RULE-19; токен, хэл, 401 → `lib/unauthorized.ts`, нууц үг солих → `lib/password-change.ts`) · `auth.ts` (server sign-in, урилга, нууц үг) · `me.ts` · `requisitions.ts` · `workflow.ts` · `i18n.ts` |
| `components/` | `Layout`, `ProtectedRoute`, `LanguageSwitcher`, `StatusBadge`, `RejectModal`, `ErrorMessage`, `LoadingSpinner`, `MfeDisabled` |
| `hooks/` | `useAuth`, `useMe`, `useMR`, `useMRRealtime` (Supabase Realtime — амжилтгүй бол чимээгүй), `useI18nSync` |
| `lib/` | `supabase.ts` (session; пилотод same-origin `/auth/v1`) · `modules.ts` (`APP_MODULES`, `VITE_MODULES` задлах, нүүр зам) · `roles.ts` (core role, `canWrite` = OWNER/ADMIN) · `mr-approval.ts` |
| `config/enabled-modules.ts` | `ENABLED_MODULES`, `HOME_PATH`, `isEnabled()` |
| `pages/` | MR (`MRList/Create/DetailPage`), workflow админ (`ApprovalSla`, `WorkflowDefinition`, `Delegation`), auth (`Login`, `SetPassword`, `ForgotPassword`, `ChangePassword`) |
| `modules/<name>/` | Модуль бүр өөрийн `api`, хуудас, `lib` — §2–§3 |
| `i18n/index.ts` | i18next тохиргоо — §4 |
| `test/setup.ts` | vitest setup (тест: [[07_Test_Map]]) |

## 2. Кемп модуль (`modules/camp/`)

- `CampRoutes.tsx` — `/camp/*` доторх route (харьцангуй зам) · `components/CampLayout.tsx` — кемп сонголт, цэс.
- `api/camp-api.ts` — **`campApi` объект** (бүх Кемпийн endpoint-ийн ганц client, ~110 функц) + `api/types.ts` (backend DTO-тай **ТАМ АДИЛ** нэр — RULE-20).
- `hooks/useCampPermissions.ts` — `campKeys` (query key-ийн ганц эх сурвалж) + `me/permissions` → товч/цэс нуух · `hooks/useCampMutation.ts` — mutation + холбогдох query-г invalidate, алдааг `ErrorBox`-оор.
- `components/` — `ui.tsx` (`Button`, `PageHeader`, `Card`, `Field`, `Badge`, `Loading`, `Empty`, `ErrorBox`, `Modal`, `Table`, `ActiveBadge`, `NoAccess` — шинэ хуудсанд эдгээрийг ашигла), `ImportDialog` (Excel импорт preview → confirm), `EmployeePicker`, `ShiftPattern`.
- `pages/` — `CampHomePage`, `SystemSettingsPage` (`/camp/system/:section` — байгууллага, роль, хэрэглэгчийн эрх, орчуулга г.м. хэсгүүд), мастер (`Facilities`, `Departments`, `Crews`, `Employees`, `Organizations`, `Catalog`, `PositionSettings`), ажиллагаа (`Attendance`, `Shifts`, `Presence`, `RoomBoard`), хөрөнгө (`AssetCategories`, `Assets`), засвар (`MaintenanceList/Detail`), `CampSettings`, `Roles`, `UserRoles`, `Translations`.
- `lib/` — цэвэр функц (unit тесттэй, `lib/tests`): `dates`, `calendar`, `stays`, `presence`, `meals`, `money`, `room-range` (backend `room-range.ts`-тэй ИЖИЛ дүрэм), `shift-pattern`, `maintenance`, `permissions`, `errors` (`apiErrorMessage`), `labels`, `grid`, `download`, `last-camp`, `effective`, `asset-location`.

## 3. Бусад модуль
- `modules/inventory/`, `modules/vendor/`, `modules/report/` — `api.ts` + нэг хуудас (`VITE_MODULES`-д `inventory`, `vendors`, `reports`).
- MR — `pages/MR*` + `hooks/useMR*`; MFE remote — `apps/mfe-requisitions` (`/mfe/*`, `MfeDisabled` fallback).

## 4. Олон хэл (i18n)
- Анхдагч орчуулга: `packages/i18n/web.{mn,en,zh}.json` (**хавтгай түлхүүр**, хувьсагч `{name}` — backend-тэй ижил). Түлхүүрийн тоо: [[09_Frontend_Routes]] → Орчуулгын файлууд.
- Байгууллагын засвар: `GET /api/v1/i18n/web/:lang` (≤60с cache) → `applyOverrides` (засах UI: `TranslationsPage`).
- Хэлний сонголт: профайл (`core_users.locale`) → төхөөрөмж (localStorage) → **монгол**.
- Шинэ текст: гурван json-д хамт нэм (mn заавал; en/zh ноорог байж болно — [[i18n-review]]). Backend мессеж — `common/i18n/messages.ts`.

## 5. Модуль асаах ба build
- `VITE_MODULES` (`all` | `camp` | таслалаар) — цэс/route/нүүр зам (`lib/modules.ts`). Пилот = `camp`. Бусад `VITE_*`: [[06_Config_Env]].
- Dev: `:5173`, `/api` → `:3000` proxy. Build → nginx (docker) эсвэл пилотын Caddy (static).

## 6. Шинэ хуудас нэмэх (товч)
1. Backend DTO-г шалга ([[02_API_Catalog]] → service → `*.dto.ts`) → `api/types.ts`-д ижил нэртэй type (RULE-20).
2. `campApi`-д функц → query key-г `campKeys`-д → `useQuery` / `useCampMutation`.
3. Хуудас `pages/` → route `CampRoutes.tsx` → цэс `CampLayout.tsx` (эрхээр нуух — `useCampPermissions`).
4. Текст → `packages/i18n/web.*.json`. Цэвэр логик → `lib/` + unit тест.
5. `pnpm docs:gen` (route каталог) · энэ файлыг шинэчил (RULE-21).
