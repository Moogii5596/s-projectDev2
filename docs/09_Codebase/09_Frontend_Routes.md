---
title: "Frontend route-ууд (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [codebase, frontend, generated]
---

# Frontend route-ууд (web-shell)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/web-shell/src/**/*.tsx` дахь `<Route path=… element={<X/>}>`. Модуль асаах: `VITE_MODULES` ([[06_Config_Env]]). Бүтэц, API client, i18n: [[04_Frontend_Map]]. Дэд модулийн (жишээ нь `/camp/*`) route-ууд харьцангуй замтай.

| Зам | Компонент | Нөхцөл | Файл |
|---|---|---|---|
| `/login` | `LoginPage` |  | `App.tsx:31` |
| `/invite/:token` | `SetPasswordPage` |  | `App.tsx:33` |
| `/reset/:token` | `SetPasswordPage` |  | `App.tsx:34` |
| `/forgot` | `ForgotPasswordPage` |  | `App.tsx:35` |
| `/change-password` | `ChangePasswordPage` |  | `App.tsx:40` |
| `/` | `Navigate` |  | `App.tsx:43` |
| `/requisitions` | `MRListPage` |  | `App.tsx:46` |
| `/requisitions/new` | `MRCreatePage` |  | `App.tsx:47` |
| `/requisitions/:id` | `MRDetailPage` |  | `App.tsx:48` |
| `/admin/approval-sla` | `ApprovalSlaPage` |  | `App.tsx:49` |
| `/admin/workflow-definitions` | `WorkflowDefinitionPage` |  | `App.tsx:50` |
| `/admin/delegations` | `DelegationPage` |  | `App.tsx:51` |
| `/inventory` | `InventoryPage` | модуль `inventory` | `App.tsx:56` |
| `/vendors` | `VendorsPage` | модуль `vendors` | `App.tsx:57` |
| `/reports` | `ReportPage` | модуль `reports` | `App.tsx:58` |
| `/camp/*` | `CampRoutes` | модуль `camp` | `App.tsx:61` |
| `/mfe/*` | `Suspense` |  | `App.tsx:65` |
| `*` | `Navigate` |  | `App.tsx:78` |
| `/camp (index)` | `CampHomePage` |  | `modules/camp/CampRoutes.tsx:19` |
| `/camp/system` | `Navigate` |  | `modules/camp/CampRoutes.tsx:21` |
| `/camp/system/:section` | `SystemSettingsPage` |  | `modules/camp/CampRoutes.tsx:22` |
| `/camp/admin/organizations` | `Navigate` |  | `modules/camp/CampRoutes.tsx:23` |
| `/camp/admin/roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:24` |
| `/camp/admin/user-roles` | `Navigate` |  | `modules/camp/CampRoutes.tsx:25` |
| `/camp/admin/asset-categories` | `Navigate` |  | `modules/camp/CampRoutes.tsx:26` |
| `/camp/:campId` | `CampLayout` |  | `modules/camp/CampRoutes.tsx:27` |
| `/camp (index)` | `Navigate` |  | `modules/camp/CampRoutes.tsx:28` |
| `/camp/attendance` | `AttendancePage` |  | `modules/camp/CampRoutes.tsx:29` |
| `/camp/shifts` | `ShiftsPage` |  | `modules/camp/CampRoutes.tsx:30` |
| `/camp/rooms` | `RoomBoardPage` |  | `modules/camp/CampRoutes.tsx:31` |
| `/camp/meals` | `PresencePage` |  | `modules/camp/CampRoutes.tsx:32` |
| `/camp/maintenance` | `MaintenanceListPage` |  | `modules/camp/CampRoutes.tsx:33` |
| `/camp/maintenance/:id` | `MaintenanceDetailPage` |  | `modules/camp/CampRoutes.tsx:34` |
| `/camp/assets` | `AssetsPage` |  | `modules/camp/CampRoutes.tsx:35` |
| `/camp/employees` | `EmployeesPage` |  | `modules/camp/CampRoutes.tsx:36` |
| `/camp/settings` | `Navigate` |  | `modules/camp/CampRoutes.tsx:38` |
| `/camp/settings/:section` | `CampSettingsPage` |  | `modules/camp/CampRoutes.tsx:39` |
| `/camp/facilities` | `Navigate` |  | `modules/camp/CampRoutes.tsx:40` |
| `/camp/departments` | `Navigate` |  | `modules/camp/CampRoutes.tsx:41` |
| `/camp/crews` | `Navigate` |  | `modules/camp/CampRoutes.tsx:42` |
| `/camp/*` | `Navigate` |  | `modules/camp/CampRoutes.tsx:44` |

## Орчуулгын файлууд (`packages/i18n`)

| Файл | Түлхүүр |
|---|---|
| `web.en.json` | 731 |
| `web.mn.json` | 731 |
| `web.zh.json` | 731 |
