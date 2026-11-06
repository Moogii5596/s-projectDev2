---
title: "Frontend route-ууд (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-06
tags: [codebase, frontend, generated]
---

# Frontend route-ууд (web-shell)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/web-shell/src/**/*.tsx` дахь `<Route path=… element={<X/>}>`. Модуль асаах: `VITE_MODULES` ([[06_Config_Env]]). Бүтэц, API client, i18n: [[04_Frontend_Map]]. Дэд модулийн (жишээ нь `/camp/*`) route-ууд харьцангуй замтай.

| Зам | Компонент | Нөхцөл | Файл |
|---|---|---|---|
| `/login` | `LoginPage` |  | `App.tsx:41` |
| `/invite/:token` | `SetPasswordPage` |  | `App.tsx:43` |
| `/reset/:token` | `SetPasswordPage` |  | `App.tsx:44` |
| `/forgot` | `ForgotPasswordPage` |  | `App.tsx:45` |
| `/change-password` | `ChangePasswordPage` |  | `App.tsx:50` |
| `/` | `HomeRedirect` |  | `App.tsx:53` |
| `/feedback` | `FeedbackPage` |  | `App.tsx:54` |
| `/whats-new` | `WhatsNewPage` |  | `App.tsx:55` |
| `/requisitions` | `MRListPage` |  | `App.tsx:58` |
| `/requisitions/new` | `MRCreatePage` |  | `App.tsx:59` |
| `/requisitions/:id` | `MRDetailPage` |  | `App.tsx:60` |
| `/admin/approval-sla` | `ApprovalSlaPage` |  | `App.tsx:61` |
| `/admin/workflow-definitions` | `WorkflowDefinitionPage` |  | `App.tsx:62` |
| `/admin/delegations` | `DelegationPage` |  | `App.tsx:63` |
| `/inventory` | `InventoryPage` | модуль `inventory` | `App.tsx:68` |
| `/vendors` | `VendorsPage` | модуль `vendors` | `App.tsx:69` |
| `/reports` | `ReportPage` | модуль `reports` | `App.tsx:70` |
| `/camp/*` | `ModuleGate` | модуль `camp` | `App.tsx:73` |
| `/hr/*` | `ModuleGate` | модуль `hr` | `App.tsx:75` |
| `/settings` | `SettingsPage` | модуль `hr` | `App.tsx:77` |
| `/settings/:section` | `SettingsPage` | модуль `hr` | `App.tsx:78` |
| `/mfe/*` | `Suspense` |  | `App.tsx:82` |
| `*` | `Navigate` |  | `App.tsx:95` |
| `(index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:24` |
| `system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:26` |
| `system/positions` | `Navigate` |  | `modules/camp/CampRoutes.tsx:27` |
| `system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:28` |
| `admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:29` |
| `admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:30` |
| `admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:31` |
| `admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:32` |
| `:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:33` |
| `(index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:34` |
| `rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:35` |
| `meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:36` |
| `maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:37` |
| `maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:38` |
| `assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:39` |
| `settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:41` |
| `settings/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:42` |
| `settings/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:43` |
| `settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:44` |
| `facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:45` |
| `employees` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:47` |
| `attendance` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:48` |
| `shifts` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:49` |
| `departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:50` |
| `crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:51` |
| `*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:53` |
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
| `web.en.json` | 1052 |
| `web.mn.json` | 1052 |
| `web.zh.json` | 1052 |
