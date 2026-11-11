---
title: "Frontend route-ууд (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-11
tags: [codebase, frontend, generated]
---

# Frontend route-ууд (web-shell)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/web-shell/src/**/*.tsx` дахь `<Route path=… element={<X/>}>`. Модуль асаах: `VITE_MODULES` ([[06_Config_Env]]). Бүтэц, API client, i18n: [[04_Frontend_Map]]. Дэд модулийн (жишээ нь `/camp/*`) route-ууд харьцангуй замтай.

| Зам | Компонент | Нөхцөл | Файл |
|---|---|---|---|
| `(index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:27` |
| `system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:29` |
| `system/positions` | `Navigate` |  | `modules/camp/CampRoutes.tsx:30` |
| `system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:31` |
| `admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:32` |
| `admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:33` |
| `admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:34` |
| `admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:35` |
| `:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:36` |
| `(index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:37` |
| `rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:38` |
| `meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:39` |
| `meal-orders` | `MealOrdersPage` |  | `modules/camp/CampRoutes.tsx:40` |
| `contracts` | `ContractsPage` |  | `modules/camp/CampRoutes.tsx:41` |
| `contracts/:contractId` | `ContractDetailPage` |  | `modules/camp/CampRoutes.tsx:42` |
| `maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:43` |
| `maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:44` |
| `assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:45` |
| `settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:47` |
| `settings/contract-catalog` | `Navigate` |  | `modules/camp/CampRoutes.tsx:48` |
| `settings/exchange-rates` | `Navigate` |  | `modules/camp/CampRoutes.tsx:49` |
| `settings/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:50` |
| `settings/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:51` |
| `settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:52` |
| `facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:53` |
| `employees` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:55` |
| `attendance` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:56` |
| `shifts` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:57` |
| `departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:58` |
| `crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:59` |
| `*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:61` |
| `(index)` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:26` |
| `positions` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:27` |
| `:campId` | `HrLayout` |  | `modules/hr/HrRoutes.tsx:28` |
| `(index)` | `Navigate` |  | `modules/hr/HrRoutes.tsx:29` |
| `employees` | `EmployeesPage` |  | `modules/hr/HrRoutes.tsx:30` |
| `employees/:employeeId` | `EmployeeProfilePage` |  | `modules/hr/HrRoutes.tsx:31` |
| `departments` | `DepartmentsPage` |  | `modules/hr/HrRoutes.tsx:32` |
| `crews` | `CrewsPage` |  | `modules/hr/HrRoutes.tsx:33` |
| `shifts` | `ShiftsPage` |  | `modules/hr/HrRoutes.tsx:34` |
| `attendance` | `AttendancePage` |  | `modules/hr/HrRoutes.tsx:35` |
| `import` | `HrImportPage` |  | `modules/hr/HrRoutes.tsx:36` |
| `positions` | `HrPositionsPage` |  | `modules/hr/HrRoutes.tsx:37` |
| `users` | `HrUsersPage` |  | `modules/hr/HrRoutes.tsx:38` |
| `*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:39` |
| `*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:41` |

## Орчуулгын файлууд (`packages/i18n`)

| Файл | Түлхүүр |
|---|---|
| `terms.en.json` | 245 |
| `terms.mn.json` | 245 |
| `terms.zh.json` | 245 |
| `web.en.json` | 1703 |
| `web.mn.json` | 1703 |
| `web.zh.json` | 1703 |
