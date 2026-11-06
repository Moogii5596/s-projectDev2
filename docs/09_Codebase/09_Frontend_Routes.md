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
| `/login` | `LoginPage` |  | `App.tsx:44` |
| `/invite/:token` | `SetPasswordPage` |  | `App.tsx:46` |
| `/reset/:token` | `SetPasswordPage` |  | `App.tsx:47` |
| `/forgot` | `ForgotPasswordPage` |  | `App.tsx:48` |
| `/change-password` | `ChangePasswordPage` |  | `App.tsx:53` |
| `/` | `HomeRedirect` |  | `App.tsx:56` |
| `/account/devices` | `DevicesPage` |  | `App.tsx:58` |
| `/feedback` | `FeedbackPage` |  | `App.tsx:59` |
| `/whats-new` | `WhatsNewPage` |  | `App.tsx:60` |
| `/feed` | `FeedPage` |  | `App.tsx:62` |
| `/feed/reports` | `FeedReportsPage` |  | `App.tsx:63` |
| `/requisitions` | `MRListPage` |  | `App.tsx:66` |
| `/requisitions/new` | `MRCreatePage` |  | `App.tsx:67` |
| `/requisitions/:id` | `MRDetailPage` |  | `App.tsx:68` |
| `/admin/approval-sla` | `ApprovalSlaPage` |  | `App.tsx:69` |
| `/admin/workflow-definitions` | `WorkflowDefinitionPage` |  | `App.tsx:70` |
| `/admin/delegations` | `DelegationPage` |  | `App.tsx:71` |
| `/inventory` | `InventoryPage` | модуль `inventory` | `App.tsx:76` |
| `/vendors` | `VendorsPage` | модуль `vendors` | `App.tsx:77` |
| `/reports` | `ReportPage` | модуль `reports` | `App.tsx:78` |
| `/camp/*` | `ModuleGate` | модуль `camp` | `App.tsx:81` |
| `/hr/*` | `ModuleGate` | модуль `hr` | `App.tsx:83` |
| `/settings` | `SettingsPage` | модуль `hr` | `App.tsx:85` |
| `/settings/:section` | `SettingsPage` | модуль `hr` | `App.tsx:86` |
| `/mfe/*` | `Suspense` |  | `App.tsx:90` |
| `*` | `Navigate` |  | `App.tsx:103` |
| `(index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:25` |
| `system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:27` |
| `system/positions` | `Navigate` |  | `modules/camp/CampRoutes.tsx:28` |
| `system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:29` |
| `admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:30` |
| `admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:31` |
| `admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:32` |
| `admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:33` |
| `:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:34` |
| `(index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:35` |
| `rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:36` |
| `meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:37` |
| `meal-orders` | `MealOrdersPage` |  | `modules/camp/CampRoutes.tsx:38` |
| `maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:39` |
| `maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:40` |
| `assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:41` |
| `settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:43` |
| `settings/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:44` |
| `settings/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:45` |
| `settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:46` |
| `facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:47` |
| `employees` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:49` |
| `attendance` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:50` |
| `shifts` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:51` |
| `departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:52` |
| `crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:53` |
| `*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:55` |
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
| `web.en.json` | 1212 |
| `web.mn.json` | 1212 |
| `web.zh.json` | 1212 |
