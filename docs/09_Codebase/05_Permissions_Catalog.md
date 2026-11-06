---
title: "Эрхийн каталог (core RBAC)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-06
tags: [codebase, auth, rbac, generated]
---

# Эрхийн каталог (core RBAC)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/core-kernel/src/modules/core/permissions/permission-registry.ts` (код) · migration-ийн `core_permissions` (нэр) · `core_seed_default_roles` (`20261106005_core_rbac_adr007.sql`, анхдагч роль). Код ба DB ЯГ ижил байх ёстой (`camp-master.integration.spec.ts` тулгана).

Шинэ эрх: (1) migration-д `INSERT INTO core_permissions`, (2) `permission-registry.ts`, (3) хэрэгтэй бол seed роль → `pnpm docs:gen`. Хэрэглэгчийн эцсийн эрх = `core_user_permissions` (ганц эх сурвалж). Роль, эрх системийн түвшинд — [[ADR-007_System_Roles_Permissions]]. Үндсэн (core) роль — [[03_DB_Catalog]] → Enum. Загвар: [[ADR-003_Users_Login_Permissions]].

## Эрх (18)

| Код | Нэр | Хувилбар | CAMP_ADMIN | CAMP_MANAGER | CATERING_ADMIN | EMPLOYEE | Ашигласан файл |
|---|---|---|---|---|---|---|---|
| `camp.settings.manage` | Кемпийн тохиргоо (НӨАТ, ростер, хоол идэх байршил) | V1 | ✅ |  |  |  | `camp-settings.service.ts` |
| `camp.master.manage` | Мастер өгөгдөл (кемп, байр, өрөө, хэлтэс, баг, байгууллага) | V1 | ✅ |  |  |  | `camp-catalog.service.ts` `facilities.handlers.ts` `camp-facilities.service.ts` `camps.service.ts` `core-organizations.service.ts` `departments.handler.ts` `positions.handler.ts` `hr-crews.service.ts` `hr-departments.service.ts` `hr-positions.service.ts` |
| `camp.contract.manage` | Гэрээ, ажил, үнэ | V2 | ✅ |  |  |  | — |
| `hr.employee.manage` | Ажилтан бүртгэл | V1 | ✅ |  | ✅ |  | `hr-attendance.service.ts` `hr-employees.service.ts` `employees.handler.ts` |
| `hr.employee.terminate` | Ажлаас гаргах, дахин ажилд авах | V1 | ✅ |  |  |  | `hr-employee-lifecycle.service.ts` `former-employees.handler.ts` |
| `hr.attendance.import` | Ирц (xlsx) импорт | V1 | ✅ | ✅ |  |  | `hr-attendance.service.ts` |
| `hr.shift.adjust` | Ээлжийн зохицуулалт | V1 | ✅ | ✅ |  |  | `hr-shifts.service.ts` |
| `camp.room.manage` | Өрөө хуваарилалт | V1 | ✅ |  | ✅ |  | `camp-rooms.service.ts` `facilities.handlers.ts` `room-allocations.handler.ts` `camp-facilities.service.ts` |
| `camp.asset.manage` | Үндсэн хөрөнгө | V1 | ✅ |  | ✅ |  | `camp-assets.service.ts` |
| `camp.maintenance.create` | Засварын хүсэлт үүсгэх | V1 | ✅ | ✅ | ✅ | ✅ | `camp-maintenance.service.ts` |
| `camp.maintenance.parts` | Засварын сэлбэг бүртгэх | V1 | ✅ |  | ✅ |  | `camp-maintenance.service.ts` `maintenance-flow.ts` `camp-snapshot.ts` |
| `camp.maintenance.close` | Засвар хаах (сэлбэгийн зардал батлах) | V1 | ✅ | ✅ |  |  | `camp-maintenance.service.ts` `maintenance-flow.ts` `camp-snapshot.ts` |
| `camp.haul.create` | Бохир ус / хог бүртгэх | V2 |  |  | ✅ |  | — |
| `camp.haul.approve` | Бохир ус / хог батлах | V2 |  | ✅ |  |  | — |
| `camp.meal.order` | Хоолны захиалга өгөх | V2 |  | ✅ |  |  | — |
| `camp.meal.accept` | Хоолны захиалга хүлээн авах | V2 |  |  | ✅ |  | — |
| `camp.report.view` | Зардлын тайлан харах | V2 | ✅ | ✅ | ✅ |  | — |
| `feed.content.moderate` | Feed модерац (пост, сэтгэгдэл устгах, report) | V1 |  |  |  |  | `feed.service.ts` |

## Анхдагч роль

| Код | Нэр | Тайлбар | Эрхийн тоо |
|---|---|---|---|
| CAMP_ADMIN | Кемп админ | Тохиргоо, гэрээ, мастер өгөгдөл, засвар эхлүүлэх/хаах | 13 |
| CAMP_MANAGER | Кемп менежер | Ирц, ээлж, батлах, хоолны захиалга | 7 |
| CATERING_ADMIN | Катеринг админ | Бохир ус/хог, сэлбэг, хоол хүлээн авах | 8 |
| EMPLOYEE | Ажилтан | Өөрийн засварын хүсэлт (дараа: feed, хоолны гомдол, цэс) | 1 |

## Хуучин код (alias, ADR-007 — v0.2.4-т устгана)

| Хуучин | Шинэ |
|---|---|
| `camp.employee.manage` | `hr.employee.manage` |
| `camp.employee.terminate` | `hr.employee.terminate` |
| `camp.movement.import` | `hr.attendance.import` |
| `camp.shift.adjust` | `hr.shift.adjust` |
