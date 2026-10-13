---
title: "Эрхийн каталог (Кемп RBAC)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [codebase, auth, camp, generated]
---

# Эрхийн каталог (Кемп RBAC)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Эх сурвалж: `apps/core-kernel/src/modules/camp/common/camp-permissions.ts` (код) · migration-ийн `camp_permissions` (нэр) · `camp_seed_default_roles` (`20261013003_camp_roles_v022_seed.sql`, анхдагч роль). Код ба DB ЯГ ижил байх ёстой (`camp-master.integration.spec.ts` тулгана).

Шинэ эрх: (1) migration-д INSERT, (2) `camp-permissions.ts`, (3) хэрэгтэй бол seed роль → `pnpm docs:gen`. Хэрэглэгчийн эцсийн эрх = `camp_user_permissions` (v0.2.2 Блок 1, ганц эх сурвалж). Үндсэн (core) роль — [[03_DB_Catalog]] → Enum. Загвар: [[ADR-003_Users_Login_Permissions]].

## Кемпийн эрх (17)

| Код | Нэр | Хувилбар | CAMP_ADMIN | CAMP_MANAGER | CATERING_ADMIN | EMPLOYEE | Ашигласан файл |
|---|---|---|---|---|---|---|---|
| `camp.settings.manage` | Кемпийн тохиргоо (НӨАТ, ростер, хоол идэх байршил) | V1 | ✅ |  |  |  | `camp-settings.service.ts` |
| `camp.roles.manage` | Роль, эрхийн тохиргоо | V1 | ✅ |  |  |  | `camp-employee-login.service.ts` `camp-rbac.service.ts` `camp-user-access.service.ts` |
| `camp.master.manage` | Мастер өгөгдөл (кемп, байр, өрөө, хэлтэс, баг, байгууллага) | V1 | ✅ |  |  |  | `camp-catalog.service.ts` `departments.handler.ts` `camp-crews.service.ts` `camp-departments.service.ts` `camp-facilities.service.ts` `camp-organizations.service.ts` `camps.service.ts` |
| `camp.contract.manage` | Гэрээ, ажил, үнэ | V2 | ✅ |  |  |  | — |
| `camp.employee.manage` | Ажилтан бүртгэл | V1 | ✅ |  | ✅ |  | `employees.handler.ts` `camp-employees.service.ts` |
| `camp.movement.import` | Ирц (xlsx) импорт | V1 | ✅ | ✅ |  |  | `camp-attendance.service.ts` |
| `camp.shift.adjust` | Ээлжийн зохицуулалт | V1 | ✅ | ✅ |  |  | `camp-shifts.service.ts` |
| `camp.room.manage` | Өрөө хуваарилалт | V1 | ✅ |  | ✅ |  | `camp-rooms.service.ts` `camp-facilities.service.ts` |
| `camp.asset.manage` | Үндсэн хөрөнгө | V1 | ✅ |  | ✅ |  | `camp-assets.service.ts` |
| `camp.maintenance.create` | Засварын хүсэлт үүсгэх | V1 | ✅ | ✅ | ✅ | ✅ | `camp-maintenance.service.ts` |
| `camp.maintenance.parts` | Засварын сэлбэг бүртгэх | V1 | ✅ |  | ✅ |  | `camp-maintenance.service.ts` `maintenance-flow.ts` `camp-snapshot.ts` |
| `camp.maintenance.close` | Засвар хаах (сэлбэгийн зардал батлах) | V1 | ✅ | ✅ |  |  | `camp-maintenance.service.ts` `maintenance-flow.ts` `camp-snapshot.ts` |
| `camp.haul.create` | Бохир ус / хог бүртгэх | V2 |  |  | ✅ |  | — |
| `camp.haul.approve` | Бохир ус / хог батлах | V2 |  | ✅ |  |  | — |
| `camp.meal.order` | Хоолны захиалга өгөх | V2 |  | ✅ |  |  | — |
| `camp.meal.accept` | Хоолны захиалга хүлээн авах | V2 |  |  | ✅ |  | — |
| `camp.report.view` | Зардлын тайлан харах | V2 | ✅ | ✅ | ✅ |  | — |

## Анхдагч роль

| Код | Нэр | Тайлбар | Эрхийн тоо |
|---|---|---|---|
| CAMP_ADMIN | Кемп админ | Тохиргоо, эрх, гэрээ, мастер өгөгдөл, засвар эхлүүлэх/хаах | 13 |
| CAMP_MANAGER | Кемп менежер | Ирц, ээлж, батлах, хоолны захиалга | 7 |
| CATERING_ADMIN | Катеринг админ | Бохир ус/хог, сэлбэг, хоол хүлээн авах | 8 |
| EMPLOYEE | Ажилтан | Өөрийн засварын хүсэлт (дараа: feed, хоолны гомдол, цэс) | 1 |
