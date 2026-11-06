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
| `/login` | `LoginPage` |  | `App.tsx:39` |
| `/invite/:token` | `SetPasswordPage` |  | `App.tsx:41` |
| `/reset/:token` | `SetPasswordPage` |  | `App.tsx:42` |
| `/forgot` | `ForgotPasswordPage` |  | `App.tsx:43` |
| `/change-password` | `ChangePasswordPage` |  | `App.tsx:48` |
| `/` | `Navigate` |  | `App.tsx:51` |
| `/feedback` | `FeedbackPage` |  | `App.tsx:52` |
| `/whats-new` | `WhatsNewPage` |  | `App.tsx:53` |
| `/requisitions` | `MRListPage` |  | `App.tsx:56` |
| `/requisitions/new` | `MRCreatePage` |  | `App.tsx:57` |
| `/requisitions/:id` | `MRDetailPage` |  | `App.tsx:58` |
| `/admin/approval-sla` | `ApprovalSlaPage` |  | `App.tsx:59` |
| `/admin/workflow-definitions` | `WorkflowDefinitionPage` |  | `App.tsx:60` |
| `/admin/delegations` | `DelegationPage` |  | `App.tsx:61` |
| `/inventory` | `InventoryPage` | модуль `inventory` | `App.tsx:66` |
| `/vendors` | `VendorsPage` | модуль `vendors` | `App.tsx:67` |
| `/reports` | `ReportPage` | модуль `reports` | `App.tsx:68` |
| `/camp/*` | `CampRoutes` | модуль `camp` | `App.tsx:71` |
| `/hr/*` | `HrRoutes` | модуль `hr` | `App.tsx:73` |
| `/mfe/*` | `Suspense` |  | `App.tsx:77` |
| `*` | `Navigate` |  | `App.tsx:90` |
| `/camp (index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:24` |
| `/camp/system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:26` |
| `/camp/system/positions` | `Navigate` |  | `modules/camp/CampRoutes.tsx:27` |
| `/camp/system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:28` |
| `/camp/admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:29` |
| `/camp/admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:30` |
| `/camp/admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:31` |
| `/camp/admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:32` |
| `/camp/:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:33` |
| `/camp (index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:34` |
| `/camp/rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:35` |
| `/camp/meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:36` |
| `/camp/maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:37` |
| `/camp/maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:38` |
| `/camp/assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:39` |
| `/camp/settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:41` |
| `/camp/settings/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:42` |
| `/camp/settings/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:43` |
| `/camp/settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:44` |
| `/camp/facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:45` |
| `/camp/employees` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:47` |
| `/camp/attendance` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:48` |
| `/camp/shifts` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:49` |
| `/camp/departments` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:50` |
| `/camp/crews` | `LegacyHrRedirect` |  | `modules/camp/CampRoutes.tsx:51` |
| `/camp/*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:53` |
| `/hr (index)` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:26` |
| `/hr/positions` | `HrHomePage` |  | `modules/hr/HrRoutes.tsx:27` |
| `/hr/:campId` | `HrLayout` |  | `modules/hr/HrRoutes.tsx:28` |
| `/hr (index)` | `Navigate` |  | `modules/hr/HrRoutes.tsx:29` |
| `/hr/employees` | `EmployeesPage` |  | `modules/hr/HrRoutes.tsx:30` |
| `/hr/employees/:employeeId` | `EmployeeProfilePage` |  | `modules/hr/HrRoutes.tsx:31` |
| `/hr/departments` | `DepartmentsPage` |  | `modules/hr/HrRoutes.tsx:32` |
| `/hr/crews` | `CrewsPage` |  | `modules/hr/HrRoutes.tsx:33` |
| `/hr/shifts` | `ShiftsPage` |  | `modules/hr/HrRoutes.tsx:34` |
| `/hr/attendance` | `AttendancePage` |  | `modules/hr/HrRoutes.tsx:35` |
| `/hr/import` | `HrImportPage` |  | `modules/hr/HrRoutes.tsx:36` |
| `/hr/positions` | `HrPositionsPage` |  | `modules/hr/HrRoutes.tsx:37` |
| `/hr/users` | `HrUsersPage` |  | `modules/hr/HrRoutes.tsx:38` |
| `/hr/*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:39` |
| `/hr/*` | `Navigate` |  | `modules/hr/HrRoutes.tsx:41` |

## Орчуулгын файлууд (`packages/i18n`)

| Файл | Түлхүүр |
|---|---|
| `web.en.json` | 1024 |
| `web.mn.json` | 1024 |
| `web.zh.json` | 1024 |
