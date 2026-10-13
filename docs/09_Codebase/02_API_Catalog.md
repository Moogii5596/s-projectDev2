---
title: "API каталог (core-kernel)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-13
tags: [codebase, api, generated]
---

# API каталог (core-kernel)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Нийт **162** endpoint, 23 controller. Угтвар: `/api/v1`. Нэвтрэлт: бүх route анхдагчаар `TenantAuthGuard` (JWT → tenant) — 🌐 = `@SkipAuth()` (нэвтрэлтгүй).

**Эрх** багана: controller-ийн дуудсан service метод (+ түүний дуудсан нэг түвшний `this.*` туслах метод) дахь `CAMP_PERMISSIONS.*` — олон код = аль нэг нь / нөхцөлтэй байж болно. `(TABLE)` = үйлдлийн хүснэгтээс яг тухайн үйлдлийн эрх (жишээ нь засварын `TRANSITIONS`). `гишүүн` = зөвхөн кемпийн гишүүнчлэл (`requireAccess`), `—` = шууд олдсонгүй (core role / tenant л) → service-ийг шалга. Эрхийн жагсаалт: [[05_Permissions_Catalog]] · модулийн тайлбар: [[01_Backend_Modules]].

## Агуулга

- [[#app]] — 1
- [[#auth]] — 8
- [[#common/i18n]] — 7
- [[#modules/budget]] — 6
- [[#modules/camp/assets]] — 10
- [[#modules/camp/attendance]] — 20
- [[#modules/camp/audit]] — 1
- [[#modules/camp/catalog]] — 8
- [[#modules/camp/data]] — 7
- [[#modules/camp/maintenance]] — 12
- [[#modules/camp/master]] — 26
- [[#modules/camp/rbac]] — 24
- [[#modules/camp/settings]] — 5
- [[#modules/health]] — 1
- [[#modules/inventory]] — 3
- [[#modules/material-requisition/controllers]] — 8
- [[#modules/report]] — 2
- [[#modules/route-ingress]] — 2
- [[#modules/tenant-admin]] — 1
- [[#modules/vendor]] — 3
- [[#modules/workflow]] — 7

## app

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/healthz` | `AppController.healthz` → `—` | — | 🌐 `app.controller.ts:12` |

## auth

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| POST | `/api/v1/auth/register` | `AuthController.register` → `AuthService.getMe` | — | `auth.controller.ts:53` |
| POST | `/api/v1/auth/login` | `AuthController.login` → `AuthService.login` | — | `auth.controller.ts:68` |
| POST | `/api/v1/auth/sign-in` | `AuthController.signIn` → `SignInService.signIn` | — | 🌐 `auth.controller.ts:84` |
| GET | `/api/v1/auth/invites/:token` | `AuthController.inspectInvite` → `InviteService.inspect` | — | 🌐 `auth.controller.ts:91` |
| POST | `/api/v1/auth/invites/:token/accept` | `AuthController.acceptInvite` → `InviteService.accept` | — | 🌐 `auth.controller.ts:99` |
| POST | `/api/v1/auth/forgot-password` | `AuthController.forgotPassword` → `InviteService.forgot` | — | 🌐 `auth.controller.ts:107` |
| POST | `/api/v1/auth/change-password` | `AuthController.changePassword` → `SignInService.changePassword` | — | AllowPasswordChangeRequired `auth.controller.ts:115` |
| GET | `/api/v1/auth/me` | `AuthController.me` → `AuthService.getMe` | — | AllowPasswordChangeRequired UseGuards(TenantAuthGuard) UseInterceptors `auth.controller.ts:124` |

## common/i18n

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/i18n/web/:lang` | `I18nController.web` → `I18nOverridesService.webMessages` | — | `i18n.controller.ts:44` |
| PATCH | `/api/v1/i18n/me/locale` | `I18nController.setLocale` → `—` | — | `i18n.controller.ts:58` |
| GET | `/api/v1/i18n/admin/export` | `I18nController.export` → `I18nOverridesService.exportXlsx` | — | `i18n.controller.ts:68` |
| POST | `/api/v1/i18n/admin/preview` | `I18nController.preview` → `I18nOverridesService.preview` | — | `i18n.controller.ts:79` |
| POST | `/api/v1/i18n/admin/apply` | `I18nController.apply` → `I18nOverridesService.apply` | — | `i18n.controller.ts:96` |
| GET | `/api/v1/i18n/admin/overrides` | `I18nController.list` → `I18nOverridesService.listOverrides` | — | `i18n.controller.ts:101` |
| GET | `/api/v1/i18n/admin/history` | `I18nController.history` → `I18nOverridesService.history` | — | `i18n.controller.ts:106` |

## modules/budget

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/budget/periods` | `BudgetController.listPeriods` → `BudgetService.listPeriods` | — | `budget.controller.ts:28` |
| POST | `/api/v1/budget/periods` | `BudgetController.createPeriod` → `BudgetService.createPeriod` | — | `budget.controller.ts:34` |
| GET | `/api/v1/budget/allocations` | `BudgetController.listAllocations` → `BudgetService.listAllocations` | — | `budget.controller.ts:40` |
| POST | `/api/v1/budget/allocations` | `BudgetController.createAllocation` → `BudgetService.createAllocation` | — | `budget.controller.ts:46` |
| PATCH | `/api/v1/budget/allocations/:id` | `BudgetController.updateAllocation` → `BudgetService.updateAllocation` | — | `budget.controller.ts:52` |
| POST | `/api/v1/budget/check` | `BudgetController.check` → `BudgetService.check` | — | `budget.controller.ts:63` |

## modules/camp/assets

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/asset-categories` | `CampAssetCategoriesController.list` → `CampAssetsService.listCategories` | гишүүн | `camp-assets.controller.ts:24` |
| POST | `/api/v1/camp/asset-categories` | `CampAssetCategoriesController.create` → `CampAssetsService.createCategory` | `camp.asset.manage` | `camp-assets.controller.ts:31` |
| PATCH | `/api/v1/camp/asset-categories/:id` | `CampAssetCategoriesController.update` → `CampAssetsService.updateCategory` | `camp.asset.manage` | `camp-assets.controller.ts:37` |
| GET | `/api/v1/camp/camps/:campId/assets` | `CampAssetsController.list` → `CampAssetsService.list` | гишүүн | `camp-assets.controller.ts:49` |
| POST | `/api/v1/camp/camps/:campId/assets` | `CampAssetsController.create` → `CampAssetsService.create` | `camp.asset.manage` | `camp-assets.controller.ts:56` |
| GET | `/api/v1/camp/camps/:campId/assets/:id` | `CampAssetsController.get` → `CampAssetsService.get` | гишүүн | `camp-assets.controller.ts:62` |
| PATCH | `/api/v1/camp/camps/:campId/assets/:id` | `CampAssetsController.update` → `CampAssetsService.update` | `camp.asset.manage` | `camp-assets.controller.ts:68` |
| POST | `/api/v1/camp/camps/:campId/assets/:id/move` | `CampAssetsController.move` → `CampAssetsService.move` | `camp.asset.manage` | `camp-assets.controller.ts:75` |
| POST | `/api/v1/camp/camps/:campId/assets/:id/write-off` | `CampAssetsController.writeOff` → `CampAssetsService.writeOff` | `camp.asset.manage` | `camp-assets.controller.ts:82` |
| GET | `/api/v1/camp/camps/:campId/assets/:id/movements` | `CampAssetsController.movements` → `CampAssetsService.movements` | гишүүн | `camp-assets.controller.ts:88` |

## modules/camp/attendance

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/movement-imports/template` | `CampAttendanceController.template` → `CampAttendanceService.template` | — | `camp-attendance.controller.ts:55` |
| POST | `/api/v1/camp/camps/:campId/movement-imports` | `CampAttendanceController.upload` → `CampAttendanceService.preview` | `camp.movement.import` | `camp-attendance.controller.ts:65` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/manual` | `CampAttendanceController.manual` → `CampAttendanceService.previewManual` | `camp.movement.import` | `camp-attendance.controller.ts:74` |
| GET | `/api/v1/camp/camps/:campId/movement-imports` | `CampAttendanceController.listImports` → `CampAttendanceService.listImports` | `camp.movement.import` | `camp-attendance.controller.ts:80` |
| GET | `/api/v1/camp/camps/:campId/movement-imports/:id` | `CampAttendanceController.getImport` → `CampAttendanceService.getImport` | `camp.movement.import` | `camp-attendance.controller.ts:86` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/:id/confirm` | `CampAttendanceController.confirm` → `CampAttendanceService.confirm` | `camp.movement.import` | `camp-attendance.controller.ts:93` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/:id/cancel` | `CampAttendanceController.cancel` → `CampAttendanceService.cancel` | `camp.movement.import` | `camp-attendance.controller.ts:100` |
| GET | `/api/v1/camp/camps/:campId/movements` | `CampAttendanceController.listMovements` → `CampAttendanceService.listMovements` | гишүүн | `camp-attendance.controller.ts:107` |
| POST | `/api/v1/camp/camps/:campId/movements` | `CampAttendanceController.createMovement` → `CampAttendanceService.createMovement` | `camp.movement.import` | `camp-attendance.controller.ts:114` |
| DELETE | `/api/v1/camp/camps/:campId/movements/:id` | `CampAttendanceController.deleteMovement` → `CampAttendanceService.deleteMovement` | `camp.movement.import` | `camp-attendance.controller.ts:120` |
| GET | `/api/v1/camp/camps/:campId/stays` | `CampAttendanceController.stays` → `CampAttendanceService.listStays` | гишүүн | `camp-attendance.controller.ts:126` |
| GET | `/api/v1/camp/camps/:campId/shift-adjustments` | `CampAttendanceController.listAdjustments` → `CampShiftsService.listAdjustments` | гишүүн | `camp-attendance.controller.ts:133` |
| POST | `/api/v1/camp/camps/:campId/shift-adjustments` | `CampAttendanceController.createAdjustments` → `CampShiftsService.createAdjustments` | `camp.shift.adjust` | `camp-attendance.controller.ts:140` |
| DELETE | `/api/v1/camp/camps/:campId/shift-adjustments/:id` | `CampAttendanceController.deleteAdjustment` → `CampShiftsService.deleteAdjustment` | `camp.shift.adjust` | `camp-attendance.controller.ts:146` |
| GET | `/api/v1/camp/camps/:campId/shift-calendar` | `CampAttendanceController.calendar` → `CampShiftsService.calendar` | гишүүн | `camp-attendance.controller.ts:152` |
| GET | `/api/v1/camp/camps/:campId/room-allocations` | `CampAttendanceController.listAllocations` → `CampRoomsService.list` | гишүүн | `camp-attendance.controller.ts:159` |
| POST | `/api/v1/camp/camps/:campId/room-allocations` | `CampAttendanceController.allocate` → `CampRoomsService.allocate` | `camp.room.manage` | `camp-attendance.controller.ts:166` |
| POST | `/api/v1/camp/camps/:campId/room-allocations/:id/end` | `CampAttendanceController.endAllocation` → `CampRoomsService.end` | `camp.room.manage` | `camp-attendance.controller.ts:173` |
| GET | `/api/v1/camp/camps/:campId/room-board` | `CampAttendanceController.roomBoard` → `CampRoomsService.board` | гишүүн | `camp-attendance.controller.ts:179` |
| GET | `/api/v1/camp/camps/:campId/presence` | `CampAttendanceController.presenceOf` → `CampPresenceService.presence` | гишүүн | `camp-attendance.controller.ts:186` |

## modules/camp/audit

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/audit` | `CampAuditController.list` → `CampAuditService.list` | гишүүн | `camp-audit.controller.ts:21` |

## modules/camp/catalog

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/positions` | `CampPositionsController.list` → `CampCatalogService.list` | гишүүн | `camp-catalog.controller.ts:15` |
| POST | `/api/v1/camp/positions` | `CampPositionsController.create` → `CampCatalogService.create` | `camp.master.manage` | `camp-catalog.controller.ts:22` |
| PATCH | `/api/v1/camp/positions/:id` | `CampPositionsController.update` → `CampCatalogService.update` | `camp.master.manage` | `camp-catalog.controller.ts:28` |
| GET | `/api/v1/camp/building-types` | `CampBuildingTypesController.list` → `CampCatalogService.list` | гишүүн | `camp-catalog.controller.ts:40` |
| POST | `/api/v1/camp/building-types` | `CampBuildingTypesController.create` → `CampCatalogService.create` | `camp.master.manage` | `camp-catalog.controller.ts:47` |
| PATCH | `/api/v1/camp/building-types/:id` | `CampBuildingTypesController.update` → `CampCatalogService.update` | `camp.master.manage` | `camp-catalog.controller.ts:53` |
| GET | `/api/v1/camp/camps/:campId/position-settings` | `CampPositionSettingsController.list` → `CampCatalogService.listSettings` | гишүүн | `camp-catalog.controller.ts:65` |
| PUT | `/api/v1/camp/camps/:campId/position-settings/:positionId` | `CampPositionSettingsController.upsert` → `CampCatalogService.upsertSetting` | `camp.master.manage` | `camp-catalog.controller.ts:71` |

## modules/camp/data

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/data-imports/:type/template` | `CampDataController.template` → `CampDataImportService.template` | — | `camp-data.controller.ts:44` |
| GET | `/api/v1/camp/camps/:campId/data-imports` | `CampDataController.list` → `CampDataImportService.list` | гишүүн | `camp-data.controller.ts:51` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type` | `CampDataController.upload` → `CampDataImportService.preview` | гишүүн | `camp-data.controller.ts:58` |
| GET | `/api/v1/camp/camps/:campId/data-imports/:type/:id` | `CampDataController.get` → `CampDataImportService.get` | гишүүн | `camp-data.controller.ts:76` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type/:id/confirm` | `CampDataController.confirm` → `CampDataImportService.confirm` | гишүүн | `camp-data.controller.ts:83` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type/:id/cancel` | `CampDataController.cancel` → `CampDataImportService.cancel` | гишүүн | `camp-data.controller.ts:90` |
| GET | `/api/v1/camp/camps/:campId/export/:type` | `CampDataController.export` → `CampDataImportService.export` | гишүүн | `camp-data.controller.ts:96` |

## modules/camp/maintenance

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/maintenance` | `CampMaintenanceController.list` → `CampMaintenanceService.list` | гишүүн | `camp-maintenance.controller.ts:15` |
| POST | `/api/v1/camp/camps/:campId/maintenance` | `CampMaintenanceController.create` → `CampMaintenanceService.create` | `camp.maintenance.create` | `camp-maintenance.controller.ts:22` |
| GET | `/api/v1/camp/camps/:campId/maintenance/:id` | `CampMaintenanceController.get` → `CampMaintenanceService.get` | гишүүн | `camp-maintenance.controller.ts:28` |
| PATCH | `/api/v1/camp/camps/:campId/maintenance/:id` | `CampMaintenanceController.update` → `CampMaintenanceService.update` | `camp.maintenance.close` `camp.maintenance.create` | `camp-maintenance.controller.ts:34` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/start` | `CampMaintenanceController.start` → `CampMaintenanceService.transition` | `camp.maintenance.parts` (`TRANSITIONS`) | `camp-maintenance.controller.ts:41` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/complete` | `CampMaintenanceController.complete` → `CampMaintenanceService.transition` | `camp.maintenance.parts` (`TRANSITIONS`) | `camp-maintenance.controller.ts:48` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/reopen` | `CampMaintenanceController.reopen` → `CampMaintenanceService.transition` | `camp.maintenance.close` (`TRANSITIONS`) | `camp-maintenance.controller.ts:55` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/close` | `CampMaintenanceController.close` → `CampMaintenanceService.transition` | `camp.maintenance.close` (`TRANSITIONS`) | `camp-maintenance.controller.ts:62` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/cancel` | `CampMaintenanceController.cancel` → `CampMaintenanceService.transition` | `camp.maintenance.close` (`TRANSITIONS`) | `camp-maintenance.controller.ts:69` |
| POST | `/api/v1/camp/camps/:campId/maintenance/:id/parts` | `CampMaintenanceController.addPart` → `CampMaintenanceService.addPart` | `camp.maintenance.parts` | `camp-maintenance.controller.ts:76` |
| PATCH | `/api/v1/camp/camps/:campId/maintenance/:id/parts/:partId` | `CampMaintenanceController.updatePart` → `CampMaintenanceService.updatePart` | `camp.maintenance.parts` | `camp-maintenance.controller.ts:82` |
| DELETE | `/api/v1/camp/camps/:campId/maintenance/:id/parts/:partId` | `CampMaintenanceController.removePart` → `CampMaintenanceService.removePart` | `camp.maintenance.parts` | `camp-maintenance.controller.ts:94` |

## modules/camp/master

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps` | `CampsController.list` → `CampsService.list` | гишүүн | `camp-master.controller.ts:42` |
| POST | `/api/v1/camp/camps` | `CampsController.create` → `CampsService.create` | `camp.master.manage` | `camp-master.controller.ts:49` |
| GET | `/api/v1/camp/camps/:campId` | `CampsController.get` → `CampsService.get` | гишүүн | `camp-master.controller.ts:55` |
| PATCH | `/api/v1/camp/camps/:campId` | `CampsController.update` → `CampsService.update` | `camp.master.manage` | `camp-master.controller.ts:61` |
| GET | `/api/v1/camp/organizations` | `CampOrganizationsController.list` → `CampOrganizationsService.list` | гишүүн | `camp-master.controller.ts:73` |
| POST | `/api/v1/camp/organizations` | `CampOrganizationsController.create` → `CampOrganizationsService.create` | `camp.master.manage` | `camp-master.controller.ts:80` |
| PATCH | `/api/v1/camp/organizations/:id` | `CampOrganizationsController.update` → `CampOrganizationsService.update` | `camp.master.manage` | `camp-master.controller.ts:86` |
| GET | `/api/v1/camp/camps/:campId/buildings` | `CampMasterController.listBuildings` → `CampFacilitiesService.listBuildings` | гишүүн | `camp-master.controller.ts:104` |
| POST | `/api/v1/camp/camps/:campId/buildings` | `CampMasterController.createBuilding` → `CampFacilitiesService.createBuilding` | `camp.master.manage` | `camp-master.controller.ts:111` |
| POST | `/api/v1/camp/camps/:campId/buildings/:id/rooms/bulk` | `CampMasterController.bulkRooms` → `CampFacilitiesService.bulkRooms` | гишүүн | `camp-master.controller.ts:119` |
| PATCH | `/api/v1/camp/camps/:campId/buildings/:id` | `CampMasterController.updateBuilding` → `CampFacilitiesService.updateBuilding` | `camp.master.manage` | `camp-master.controller.ts:125` |
| GET | `/api/v1/camp/camps/:campId/rooms` | `CampMasterController.listRooms` → `CampFacilitiesService.listRooms` | гишүүн | `camp-master.controller.ts:132` |
| POST | `/api/v1/camp/camps/:campId/rooms` | `CampMasterController.createRoom` → `CampFacilitiesService.createRoom` | гишүүн | `camp-master.controller.ts:139` |
| PATCH | `/api/v1/camp/camps/:campId/rooms/:id` | `CampMasterController.updateRoom` → `CampFacilitiesService.updateRoom` | гишүүн | `camp-master.controller.ts:145` |
| GET | `/api/v1/camp/camps/:campId/departments` | `CampMasterController.listDepartments` → `CampDepartmentsService.list` | гишүүн | `camp-master.controller.ts:152` |
| POST | `/api/v1/camp/camps/:campId/departments` | `CampMasterController.createDepartment` → `CampDepartmentsService.create` | `camp.master.manage` | `camp-master.controller.ts:159` |
| PATCH | `/api/v1/camp/camps/:campId/departments/:id` | `CampMasterController.updateDepartment` → `CampDepartmentsService.update` | `camp.master.manage` | `camp-master.controller.ts:165` |
| PUT | `/api/v1/camp/camps/:campId/departments/:id/shift-pattern` | `CampMasterController.setShiftPattern` → `CampDepartmentsService.setShiftPattern` | `camp.master.manage` | `camp-master.controller.ts:171` |
| GET | `/api/v1/camp/camps/:campId/crews` | `CampMasterController.listCrews` → `CampCrewsService.list` | гишүүн | `camp-master.controller.ts:178` |
| POST | `/api/v1/camp/camps/:campId/crews` | `CampMasterController.createCrew` → `CampCrewsService.create` | `camp.master.manage` | `camp-master.controller.ts:185` |
| PATCH | `/api/v1/camp/camps/:campId/crews/:id` | `CampMasterController.updateCrew` → `CampCrewsService.update` | `camp.master.manage` | `camp-master.controller.ts:191` |
| GET | `/api/v1/camp/camps/:campId/employees` | `CampMasterController.listEmployees` → `CampEmployeesService.list` | гишүүн | `camp-master.controller.ts:198` |
| GET | `/api/v1/camp/camps/:campId/employees/:id` | `CampMasterController.getEmployee` → `CampEmployeesService.get` | гишүүн | `camp-master.controller.ts:204` |
| POST | `/api/v1/camp/camps/:campId/employees/bulk` | `CampMasterController.bulkEmployees` → `CampEmployeesService.bulkUpdate` | `camp.employee.manage` | `camp-master.controller.ts:212` |
| POST | `/api/v1/camp/camps/:campId/employees` | `CampMasterController.createEmployee` → `CampEmployeesService.create` | `camp.employee.manage` | `camp-master.controller.ts:219` |
| PATCH | `/api/v1/camp/camps/:campId/employees/:id` | `CampMasterController.updateEmployee` → `CampEmployeesService.update` | `camp.employee.manage` | `camp-master.controller.ts:225` |

## modules/camp/rbac

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/permissions` | `CampRbacController.permissions` → `CampRbacService.listPermissions` | — | `camp-rbac.controller.ts:32` |
| GET | `/api/v1/camp/me/permissions` | `CampRbacController.myPermissions` → `CampRbacService.myPermissions` | — | `camp-rbac.controller.ts:37` |
| GET | `/api/v1/camp/users` | `CampRbacController.users` → `CampRbacService.listUsers` | `camp.roles.manage` | `camp-rbac.controller.ts:43` |
| GET | `/api/v1/camp/roles` | `CampRbacController.roles` → `CampRbacService.listRoles` | `camp.roles.manage` | `camp-rbac.controller.ts:49` |
| POST | `/api/v1/camp/roles` | `CampRbacController.createRole` → `CampRbacService.createRole` | `camp.roles.manage` | `camp-rbac.controller.ts:56` |
| PATCH | `/api/v1/camp/roles/:id` | `CampRbacController.updateRole` → `CampRbacService.updateRole` | `camp.roles.manage` | `camp-rbac.controller.ts:62` |
| DELETE | `/api/v1/camp/roles/:id` | `CampRbacController.deleteRole` → `CampRbacService.deleteRole` | `camp.roles.manage` | `camp-rbac.controller.ts:68` |
| PUT | `/api/v1/camp/roles/:id/permissions` | `CampRbacController.setPermissions` → `CampRbacService.setRolePermissions` | `camp.roles.manage` | `camp-rbac.controller.ts:74` |
| GET | `/api/v1/camp/user-roles` | `CampRbacController.userRoles` → `CampRbacService.listUserRoles` | `camp.roles.manage` | `camp-rbac.controller.ts:80` |
| POST | `/api/v1/camp/user-roles` | `CampRbacController.assign` → `CampRbacService.assignUserRole` | `camp.roles.manage` | `camp-rbac.controller.ts:87` |
| DELETE | `/api/v1/camp/user-roles/:id` | `CampRbacController.remove` → `CampRbacService.removeUserRole` | `camp.roles.manage` | `camp-rbac.controller.ts:93` |
| GET | `/api/v1/camp/roles/:id/apply-preview` | `CampRbacController.applyPreview` → `CampRbacService.previewRoleApply` | `camp.roles.manage` | `camp-rbac.controller.ts:101` |
| POST | `/api/v1/camp/roles/:id/apply` | `CampRbacController.apply` → `CampRbacService.applyRoleTemplate` | `camp.roles.manage` | `camp-rbac.controller.ts:108` |
| GET | `/api/v1/camp/users/:userId/permissions` | `CampRbacController.userPermissions` → `CampRbacService.listUserPermissions` | `camp.roles.manage` | `camp-rbac.controller.ts:114` |
| POST | `/api/v1/camp/users/:userId/permissions` | `CampRbacController.grantDirect` → `CampRbacService.grantDirectPermission` | `camp.roles.manage` | `camp-rbac.controller.ts:121` |
| DELETE | `/api/v1/camp/user-permissions/:id` | `CampRbacController.revokeDirect` → `CampRbacService.revokeDirectPermission` | `camp.roles.manage` | `camp-rbac.controller.ts:127` |
| GET | `/api/v1/camp/positions/:positionId/role-templates` | `CampRbacController.positionTemplates` → `CampRbacService.getPositionTemplates` | `camp.roles.manage` | `camp-rbac.controller.ts:133` |
| PUT | `/api/v1/camp/positions/:positionId/role-templates` | `CampRbacController.setPositionTemplates` → `CampRbacService.setPositionTemplates` | `camp.roles.manage` | `camp-rbac.controller.ts:139` |
| PUT | `/api/v1/camp/camps/:campId/employees/:id/user` | `CampRbacController.linkUser` → `CampEmployeeLoginService.link` | `camp.roles.manage` | `camp-rbac.controller.ts:147` |
| GET | `/api/v1/camp/camps/:campId/employees/:id/position-preview` | `CampRbacController.positionPreview` → `CampEmployeeLoginService.positionPreview` | `camp.roles.manage` | `camp-rbac.controller.ts:158` |
| POST | `/api/v1/camp/positions/:positionId/role-templates/apply` | `CampRbacController.applyPositionTemplates` → `CampEmployeeLoginService.applyPositionTemplates` | `camp.roles.manage` | `camp-rbac.controller.ts:170` |
| POST | `/api/v1/camp/camps/:campId/employees/:id/create-user` | `CampRbacController.createEmployeeUser` → `CampUserAccessService.createUserForEmployee` | `camp.roles.manage` | `camp-rbac.controller.ts:179` |
| POST | `/api/v1/camp/users/:userId/invites` | `CampRbacController.inviteUser` → `CampUserAccessService.invite` | `camp.roles.manage` | `camp-rbac.controller.ts:191` |
| GET | `/api/v1/camp/invites/options` | `CampRbacController.inviteOptions` → `CampUserAccessService.options` | `camp.roles.manage` | `camp-rbac.controller.ts:197` |

## modules/camp/settings

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/settings` | `CampSettingsController.get` → `CampSettingsService.getSettings` | гишүүн | `camp-settings.controller.ts:13` |
| PUT | `/api/v1/camp/camps/:campId/settings` | `CampSettingsController.put` → `CampSettingsService.updateSettings` | `camp.settings.manage` | `camp-settings.controller.ts:19` |
| GET | `/api/v1/camp/camps/:campId/meal-locations` | `CampSettingsController.listLocations` → `CampSettingsService.listMealLocations` | гишүүн | `camp-settings.controller.ts:25` |
| POST | `/api/v1/camp/camps/:campId/meal-locations` | `CampSettingsController.createLocation` → `CampSettingsService.createMealLocation` | `camp.settings.manage` | `camp-settings.controller.ts:32` |
| PATCH | `/api/v1/camp/camps/:campId/meal-locations/:id` | `CampSettingsController.updateLocation` → `CampSettingsService.updateMealLocation` | `camp.settings.manage` | `camp-settings.controller.ts:38` |

## modules/health

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/health` | `HealthController.check` → `—` | — | 🌐 `health.controller.ts:9` |

## modules/inventory

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/inventory/items` | `InventoryController.list` → `InventoryService.list` | — | `inventory.controller.ts:17` |
| POST | `/api/v1/inventory/items` | `InventoryController.create` → `InventoryService.create` | — | `inventory.controller.ts:23` |
| PATCH | `/api/v1/inventory/items/:id/adjust` | `InventoryController.adjust` → `InventoryService.adjust` | — | `inventory.controller.ts:29` |

## modules/material-requisition/controllers

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| POST | `/api/v1/requisitions` | `MaterialRequisitionController.create` → `MaterialRequisitionService.create` | — | `material-requisition.controller.ts:36` |
| GET | `/api/v1/requisitions` | `MaterialRequisitionController.findAll` → `MaterialRequisitionService.findAll` | — | `material-requisition.controller.ts:43` |
| GET | `/api/v1/requisitions/:id` | `MaterialRequisitionController.findOne` → `MaterialRequisitionService.findOne` | — | `material-requisition.controller.ts:50` |
| PUT | `/api/v1/requisitions/:id` | `MaterialRequisitionController.update` → `MaterialRequisitionService.update` | — | `material-requisition.controller.ts:57` |
| DELETE | `/api/v1/requisitions/:id` | `MaterialRequisitionController.remove` → `MaterialRequisitionService.remove` | — | `material-requisition.controller.ts:69` |
| POST | `/api/v1/requisitions/:id/submit` | `MaterialRequisitionController.submit` → `MaterialRequisitionService.submit` | — | `material-requisition.controller.ts:77` |
| POST | `/api/v1/requisitions/:id/approve` | `MaterialRequisitionController.approve` → `MaterialRequisitionService.approve` | — | `material-requisition.controller.ts:89` |
| POST | `/api/v1/requisitions/:id/reject` | `MaterialRequisitionController.reject` → `MaterialRequisitionService.reject` | — | `material-requisition.controller.ts:101` |

## modules/report

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/reports/summary` | `ReportController.summary` → `ReportService.summary` | — | `report.controller.ts:16` |
| GET | `/api/v1/reports/summary.csv` | `ReportController.summaryCsv` → `ReportService.summaryCsv` | — | `report.controller.ts:23` |

## modules/route-ingress

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| POST | `/api/v1/routes` | `RouteIngressController.register` → `RouteIngressService.registerRoute` | — | `route-ingress.controller.ts:20` |
| DELETE | `/api/v1/routes/:id` | `RouteIngressController.deactivate` → `RouteIngressService.deactivateRoute` | — | `route-ingress.controller.ts:30` |

## modules/tenant-admin

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| POST | `/api/v1/admin/tenants` | `TenantAdminController.createTenant` → `TenantOnboardingService.createTenant` | — | `tenant-admin.controller.ts:18` |

## modules/vendor

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/vendors` | `VendorController.list` → `VendorService.list` | — | `vendor.controller.ts:17` |
| POST | `/api/v1/vendors` | `VendorController.create` → `VendorService.create` | — | `vendor.controller.ts:23` |
| PATCH | `/api/v1/vendors/:id` | `VendorController.update` → `VendorService.update` | — | `vendor.controller.ts:29` |

## modules/workflow

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/reports/approval-sla` | `ApprovalSlaController.getApprovalSla` → `ApprovalSlaService.getReport` | — | `approval-sla.controller.ts:10` |
| GET | `/api/v1/workflow/delegations` | `DelegationController.list` → `DelegationService.listDelegations` | — | `delegation.controller.ts:10` |
| POST | `/api/v1/workflow/delegations` | `DelegationController.create` → `DelegationService.createDelegation` | — | `delegation.controller.ts:15` |
| DELETE | `/api/v1/workflow/delegations/:id` | `DelegationController.revoke` → `DelegationService.revokeDelegation` | — | `delegation.controller.ts:20` |
| GET | `/api/v1/workflow/definitions` | `WorkflowDefinitionController.list` → `WorkflowDefinitionService.list` | — | `workflow-definition.controller.ts:16` |
| POST | `/api/v1/workflow/definitions` | `WorkflowDefinitionController.create` → `WorkflowDefinitionService.create` | — | `workflow-definition.controller.ts:21` |
| PUT | `/api/v1/workflow/definitions/:id` | `WorkflowDefinitionController.update` → `WorkflowDefinitionService.update` | — | `workflow-definition.controller.ts:27` |
