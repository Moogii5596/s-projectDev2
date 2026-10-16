---
title: "Frontend route-ууд (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-16
tags: [codebase, frontend, generated]
---

# Frontend route-ууд (web-shell)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/web-shell/src/**/*.tsx` дахь `<Route path=… element={<X/>}>`. Модуль асаах: `VITE_MODULES` ([[06_Config_Env]]). Бүтэц, API client, i18n: [[04_Frontend_Map]]. Дэд модулийн (жишээ нь `/camp/*`) route-ууд харьцангуй замтай.

| Зам | Компонент | Нөхцөл | Файл |
|---|---|---|---|
| `/login` | `LoginPage` |  | `App.tsx:32` |
| `/invite/:token` | `SetPasswordPage` |  | `App.tsx:34` |
| `/reset/:token` | `SetPasswordPage` |  | `App.tsx:35` |
| `/forgot` | `ForgotPasswordPage` |  | `App.tsx:36` |
| `/change-password` | `ChangePasswordPage` |  | `App.tsx:41` |
| `/` | `Navigate` |  | `App.tsx:44` |
| `/requisitions` | `MRListPage` |  | `App.tsx:47` |
| `/requisitions/new` | `MRCreatePage` |  | `App.tsx:48` |
| `/requisitions/:id` | `MRDetailPage` |  | `App.tsx:49` |
| `/admin/approval-sla` | `ApprovalSlaPage` |  | `App.tsx:50` |
| `/admin/workflow-definitions` | `WorkflowDefinitionPage` |  | `App.tsx:51` |
| `/admin/delegations` | `DelegationPage` |  | `App.tsx:52` |
| `/inventory` | `InventoryPage` | модуль `inventory` | `App.tsx:57` |
| `/vendors` | `VendorsPage` | модуль `vendors` | `App.tsx:58` |
| `/reports` | `ReportPage` | модуль `reports` | `App.tsx:59` |
| `/camp/*` | `CampRoutes` | модуль `camp` | `App.tsx:62` |
| `/hr/*` | `HrRoutes` | модуль `hr` | `App.tsx:64` |
| `/mfe/*` | `Suspense` |  | `App.tsx:68` |
| `*` | `Navigate` |  | `App.tsx:81` |
| `/camp (index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:21` |
| `/camp/system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:23` |
| `/camp/system/positions` | `Navigate` |  | `modules/camp/CampRoutes.tsx:24` |
| `/camp/system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:25` |
| `/camp/admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:26` |
| `/camp/admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:27` |
| `/camp/admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:28` |
| `/camp/admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:29` |
| `/camp/:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:30` |
| `/camp (index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:31` |
| `/camp/rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:32` |
| `/camp/meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:33` |
| `/camp/maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:34` |
| `/camp/maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:35` |
| `/camp/assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:36` |
| `/camp/settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:38` |
| `/camp/settings/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:39` |
| `/camp/settings/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:40` |
| `/camp/settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:41` |
| `/camp/facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:42` |
| `/camp/employees` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:44` |
| `/camp/attendance` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:45` |
| `/camp/shifts` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:46` |
| `/camp/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:47` |
| `/camp/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:48` |
| `/camp/*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:50` |
| `/hr (index)` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:22` |
| `/hr/positions` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:23` |
| `/hr/:campId` | `HrLayout` |  | `modules/hr/HrRoutes.tsx:24` |
| `/hr (index)` | `Navigate` |  | `modules/hr/HrRoutes.tsx:25` |
| `/hr/employees` | `EmployeesPage` |  | `modules/hr/HrRoutes.tsx:26` |
| `/hr/departments` | `DepartmentsPage` |  | `modules/hr/HrRoutes.tsx:27` |
| `/hr/crews` | `CrewsPage` |  | `modules/hr/HrRoutes.tsx:28` |
| `/hr/shifts` | `ShiftsPage` |  | `modules/hr/HrRoutes.tsx:29` |
| `/hr/attendance` | `AttendancePage` |  | `modules/hr/HrRoutes.tsx:30` |
| `/hr/import` | `HrImportPage` |  | `modules/hr/HrRoutes.tsx:31` |
| `/hr/positions` | `HrPositionsPage` |  | `modules/hr/HrRoutes.tsx:32` |
| `/hr/users` | `HrUsersPage` |  | `modules/hr/HrRoutes.tsx:33` |
| `/hr/*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:34` |
| `/hr/*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:36` |

## Орчуулгын файлууд (`packages/i18n`)

| Файл | Түлхүүр |
|---|---|
| `web.en.json` | 829 |
| `web.mn.json` | 829 |
| `web.zh.json` | 829 |
