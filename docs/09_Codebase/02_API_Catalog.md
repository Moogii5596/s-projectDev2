---
title: "API каталог (core-kernel)"
type: "Architecture"
status: "Active"
last_updated: 2026-10-19
tags: [codebase, api, generated]
---

# API каталог (core-kernel)

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Нийт **218** endpoint, 30 controller. Угтвар: `/api/v1`. Нэвтрэлт: бүх route анхдагчаар `TenantAuthGuard` (JWT → tenant) — 🌐 = `@SkipAuth()` (нэвтрэлтгүй).

**Эрх** багана: controller-ийн дуудсан service метод (+ түүний дуудсан нэг түвшний `this.*` туслах метод) дахь `CAMP_PERMISSIONS.*` — олон код = аль нэг нь / нөхцөлтэй байж болно. `(TABLE)` = үйлдлийн хүснэгтээс яг тухайн үйлдлийн эрх (жишээ нь засварын `TRANSITIONS`). **OWNER·ADMIN** = зөвхөн системийн роль (`requireTenantAdmin` — хэрэглэгч / роль удирдах, SEC-009), `гишүүн` = зөвхөн кемпийн гишүүнчлэл (`requireAccess`), `—` = шууд олдсонгүй (core role / tenant л) → service-ийг шалга. Эрхийн жагсаалт: [[05_Permissions_Catalog]] · модулийн тайлбар: [[01_Backend_Modules]].

## Агуулга

- [[#app]] — 1
- [[#auth]] — 8
- [[#common/i18n]] — 7
- [[#modules/budget]] — 6
- [[#modules/camp/assets]] — 10
- [[#modules/camp/attendance]] — 6
- [[#modules/camp/audit]] — 1
- [[#modules/camp/catalog]] — 5
- [[#modules/camp/maintenance]] — 12
- [[#modules/camp/master]] — 11
- [[#modules/camp/rbac]] — 25
- [[#modules/camp/settings]] — 5
- [[#modules/core/feedback]] — 8
- [[#modules/core/organizations]] — 3
- [[#modules/health]] — 1
- [[#modules/hr/attendance]] — 14
- [[#modules/hr/employees]] — 9
- [[#modules/hr/import]] — 7
- [[#modules/hr/org]] — 7
- [[#modules/hr/positions]] — 3
- [[#modules/inventory]] — 3
- [[#modules/material-requisition/controllers]] — 8
- [[#modules/report]] — 2
- [[#modules/route-ingress]] — 2
- [[#modules/tenant-admin]] — 1
- [[#modules/vendor]] — 3
- [[#modules/workflow]] — 7
- [[#modules/camp/legacy]] — 43

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
| GET | `/api/v1/camp/camps/:campId/stays` | `CampAttendanceController.stays` → `CampStaysService.listStays` | гишүүн | `camp-attendance.controller.ts:21` |
| GET | `/api/v1/camp/camps/:campId/room-allocations` | `CampAttendanceController.listAllocations` → `CampRoomsService.list` | гишүүн | `camp-attendance.controller.ts:28` |
| POST | `/api/v1/camp/camps/:campId/room-allocations` | `CampAttendanceController.allocate` → `CampRoomsService.allocate` | `camp.room.manage` | `camp-attendance.controller.ts:35` |
| POST | `/api/v1/camp/camps/:campId/room-allocations/:id/end` | `CampAttendanceController.endAllocation` → `CampRoomsService.end` | `camp.room.manage` | `camp-attendance.controller.ts:42` |
| GET | `/api/v1/camp/camps/:campId/room-board` | `CampAttendanceController.roomBoard` → `CampRoomsService.board` | гишүүн | `camp-attendance.controller.ts:48` |
| GET | `/api/v1/camp/camps/:campId/presence` | `CampAttendanceController.presenceOf` → `CampPresenceService.presence` | гишүүн | `camp-attendance.controller.ts:55` |

## modules/camp/audit

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/audit` | `CampAuditController.list` → `CampAuditService.list` | гишүүн | `camp-audit.controller.ts:21` |

## modules/camp/catalog

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/building-types` | `CampBuildingTypesController.list` → `CampCatalogService.list` | гишүүн | `camp-catalog.controller.ts:17` |
| POST | `/api/v1/camp/building-types` | `CampBuildingTypesController.create` → `CampCatalogService.create` | `camp.master.manage` | `camp-catalog.controller.ts:24` |
| PATCH | `/api/v1/camp/building-types/:id` | `CampBuildingTypesController.update` → `CampCatalogService.update` | `camp.master.manage` | `camp-catalog.controller.ts:30` |
| GET | `/api/v1/camp/camps/:campId/position-settings` | `CampPositionSettingsController.list` → `CampCatalogService.listSettings` | гишүүн | `camp-catalog.controller.ts:42` |
| PUT | `/api/v1/camp/camps/:campId/position-settings/:positionId` | `CampPositionSettingsController.upsert` → `CampCatalogService.upsertSetting` | `camp.master.manage` | `camp-catalog.controller.ts:48` |

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
| GET | `/api/v1/camp/camps` | `CampsController.list` → `CampsService.list` | гишүүн | `camp-master.controller.ts:17` |
| POST | `/api/v1/camp/camps` | `CampsController.create` → `CampsService.create` | `camp.master.manage` | `camp-master.controller.ts:24` |
| GET | `/api/v1/camp/camps/:campId` | `CampsController.get` → `CampsService.get` | гишүүн | `camp-master.controller.ts:30` |
| PATCH | `/api/v1/camp/camps/:campId` | `CampsController.update` → `CampsService.update` | `camp.master.manage` | `camp-master.controller.ts:36` |
| GET | `/api/v1/camp/camps/:campId/buildings` | `CampMasterController.listBuildings` → `CampFacilitiesService.listBuildings` | гишүүн | `camp-master.controller.ts:50` |
| POST | `/api/v1/camp/camps/:campId/buildings` | `CampMasterController.createBuilding` → `CampFacilitiesService.createBuilding` | `camp.master.manage` | `camp-master.controller.ts:57` |
| POST | `/api/v1/camp/camps/:campId/buildings/:id/rooms/bulk` | `CampMasterController.bulkRooms` → `CampFacilitiesService.bulkRooms` | гишүүн | `camp-master.controller.ts:65` |
| PATCH | `/api/v1/camp/camps/:campId/buildings/:id` | `CampMasterController.updateBuilding` → `CampFacilitiesService.updateBuilding` | `camp.master.manage` | `camp-master.controller.ts:71` |
| GET | `/api/v1/camp/camps/:campId/rooms` | `CampMasterController.listRooms` → `CampFacilitiesService.listRooms` | гишүүн | `camp-master.controller.ts:78` |
| POST | `/api/v1/camp/camps/:campId/rooms` | `CampMasterController.createRoom` → `CampFacilitiesService.createRoom` | гишүүн | `camp-master.controller.ts:85` |
| PATCH | `/api/v1/camp/camps/:campId/rooms/:id` | `CampMasterController.updateRoom` → `CampFacilitiesService.updateRoom` | гишүүн | `camp-master.controller.ts:91` |

## modules/camp/rbac

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/permissions` | `CampRbacController.permissions` → `CampRbacService.listPermissions` | — | `camp-rbac.controller.ts:33` |
| GET | `/api/v1/camp/me/permissions` | `CampRbacController.myPermissions` → `CampRbacService.myPermissions` | — | `camp-rbac.controller.ts:38` |
| GET | `/api/v1/camp/users` | `CampRbacController.users` → `CampRbacService.listUsers` | **OWNER·ADMIN** | `camp-rbac.controller.ts:44` |
| GET | `/api/v1/camp/roles` | `CampRbacController.roles` → `CampRbacService.listRoles` | **OWNER·ADMIN** | `camp-rbac.controller.ts:50` |
| POST | `/api/v1/camp/roles` | `CampRbacController.createRole` → `CampRbacService.createRole` | **OWNER·ADMIN** | `camp-rbac.controller.ts:57` |
| PATCH | `/api/v1/camp/roles/:id` | `CampRbacController.updateRole` → `CampRbacService.updateRole` | **OWNER·ADMIN** | `camp-rbac.controller.ts:63` |
| DELETE | `/api/v1/camp/roles/:id` | `CampRbacController.deleteRole` → `CampRbacService.deleteRole` | **OWNER·ADMIN** | `camp-rbac.controller.ts:69` |
| PUT | `/api/v1/camp/roles/:id/permissions` | `CampRbacController.setPermissions` → `CampRbacService.setRolePermissions` | **OWNER·ADMIN** | `camp-rbac.controller.ts:75` |
| GET | `/api/v1/camp/user-roles` | `CampRbacController.userRoles` → `CampRbacService.listUserRoles` | **OWNER·ADMIN** | `camp-rbac.controller.ts:81` |
| POST | `/api/v1/camp/user-roles` | `CampRbacController.assign` → `CampRbacService.assignUserRole` | **OWNER·ADMIN** | `camp-rbac.controller.ts:88` |
| DELETE | `/api/v1/camp/user-roles/:id` | `CampRbacController.remove` → `CampRbacService.removeUserRole` | **OWNER·ADMIN** | `camp-rbac.controller.ts:94` |
| GET | `/api/v1/camp/roles/:id/apply-preview` | `CampRbacController.applyPreview` → `CampRbacService.previewRoleApply` | **OWNER·ADMIN** | `camp-rbac.controller.ts:102` |
| POST | `/api/v1/camp/roles/:id/apply` | `CampRbacController.apply` → `CampRbacService.applyRoleTemplate` | **OWNER·ADMIN** | `camp-rbac.controller.ts:109` |
| GET | `/api/v1/camp/users/:userId/permissions` | `CampRbacController.userPermissions` → `CampRbacService.listUserPermissions` | **OWNER·ADMIN** | `camp-rbac.controller.ts:115` |
| POST | `/api/v1/camp/users/:userId/permissions` | `CampRbacController.grantDirect` → `CampRbacService.grantDirectPermission` | **OWNER·ADMIN** | `camp-rbac.controller.ts:122` |
| DELETE | `/api/v1/camp/user-permissions/:id` | `CampRbacController.revokeDirect` → `CampRbacService.revokeDirectPermission` | **OWNER·ADMIN** | `camp-rbac.controller.ts:128` |
| GET | `/api/v1/camp/positions/:positionId/role-templates` | `CampRbacController.positionTemplates` → `CampRbacService.getPositionTemplates` | **OWNER·ADMIN** | `camp-rbac.controller.ts:134` |
| PUT | `/api/v1/camp/positions/:positionId/role-templates` | `CampRbacController.setPositionTemplates` → `CampRbacService.setPositionTemplates` | **OWNER·ADMIN** | `camp-rbac.controller.ts:140` |
| PUT | `/api/v1/camp/camps/:campId/employees/:id/user` | `CampRbacController.linkUser` → `CampEmployeeLoginService.link` | **OWNER·ADMIN** | `camp-rbac.controller.ts:148` |
| GET | `/api/v1/camp/camps/:campId/employees/:id/position-preview` | `CampRbacController.positionPreview` → `CampEmployeeLoginService.positionPreview` | **OWNER·ADMIN** | `camp-rbac.controller.ts:159` |
| POST | `/api/v1/camp/positions/:positionId/role-templates/apply` | `CampRbacController.applyPositionTemplates` → `CampEmployeeLoginService.applyPositionTemplates` | **OWNER·ADMIN** | `camp-rbac.controller.ts:171` |
| POST | `/api/v1/camp/camps/:campId/employees/:id/create-user` | `CampRbacController.createEmployeeUser` → `CampUserAccessService.createUserForEmployee` | **OWNER·ADMIN** | `camp-rbac.controller.ts:180` |
| POST | `/api/v1/camp/users/:userId/invites` | `CampRbacController.inviteUser` → `CampUserAccessService.invite` | **OWNER·ADMIN** | `camp-rbac.controller.ts:192` |
| PATCH | `/api/v1/camp/users/:userId` | `CampRbacController.setUserActive` → `CampUserAccessService.setActive` | **OWNER·ADMIN** | `camp-rbac.controller.ts:199` |
| GET | `/api/v1/camp/invites/options` | `CampRbacController.inviteOptions` → `CampUserAccessService.options` | **OWNER·ADMIN** | `camp-rbac.controller.ts:205` |

## modules/camp/settings

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/camps/:campId/settings` | `CampSettingsController.get` → `CampSettingsService.getSettings` | гишүүн | `camp-settings.controller.ts:13` |
| PUT | `/api/v1/camp/camps/:campId/settings` | `CampSettingsController.put` → `CampSettingsService.updateSettings` | `camp.settings.manage` | `camp-settings.controller.ts:19` |
| GET | `/api/v1/camp/camps/:campId/meal-locations` | `CampSettingsController.listLocations` → `CampSettingsService.listMealLocations` | гишүүн | `camp-settings.controller.ts:25` |
| POST | `/api/v1/camp/camps/:campId/meal-locations` | `CampSettingsController.createLocation` → `CampSettingsService.createMealLocation` | `camp.settings.manage` | `camp-settings.controller.ts:32` |
| PATCH | `/api/v1/camp/camps/:campId/meal-locations/:id` | `CampSettingsController.updateLocation` → `CampSettingsService.updateMealLocation` | `camp.settings.manage` | `camp-settings.controller.ts:38` |

## modules/core/feedback

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/core/feedback` | `CoreFeedbackController.list` → `CoreFeedbackService.list` | — | `core-feedback.controller.ts:16` |
| GET | `/api/v1/core/feedback/export` | `CoreFeedbackController.export` → `CoreFeedbackService.exportXlsx` | — | `core-feedback.controller.ts:23` |
| POST | `/api/v1/core/feedback` | `CoreFeedbackController.create` → `CoreFeedbackService.create` | — | `core-feedback.controller.ts:32` |
| PATCH | `/api/v1/core/feedback/:id` | `CoreFeedbackController.update` → `CoreFeedbackService.update` | — | `core-feedback.controller.ts:38` |
| PATCH | `/api/v1/core/feedback/:id/status` | `CoreFeedbackController.setStatus` → `CoreFeedbackService.setStatus` | — | `core-feedback.controller.ts:44` |
| DELETE | `/api/v1/core/feedback/:id` | `CoreFeedbackController.remove` → `CoreFeedbackService.remove` | — | `core-feedback.controller.ts:50` |
| POST | `/api/v1/core/feedback/:id/vote` | `CoreFeedbackController.vote` → `CoreFeedbackService.vote` | — | `core-feedback.controller.ts:57` |
| DELETE | `/api/v1/core/feedback/:id/vote` | `CoreFeedbackController.unvote` → `CoreFeedbackService.vote` | — | `core-feedback.controller.ts:63` |

## modules/core/organizations

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/core/organizations` | `CoreOrganizationsController.list` → `CoreOrganizationsService.list` | гишүүн | `core-organizations.controller.ts:15` |
| POST | `/api/v1/core/organizations` | `CoreOrganizationsController.create` → `CoreOrganizationsService.create` | `camp.master.manage` | `core-organizations.controller.ts:22` |
| PATCH | `/api/v1/core/organizations/:id` | `CoreOrganizationsController.update` → `CoreOrganizationsService.update` | `camp.master.manage` | `core-organizations.controller.ts:28` |

## modules/health

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/health` | `HealthController.check` → `—` | — | 🌐 `health.controller.ts:9` |

## modules/hr/attendance

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/hr/sites/:campId/movement-imports/template` | `HrAttendanceController.template` → `HrAttendanceService.template` | — | `hr-attendance.controller.ts:43` |
| POST | `/api/v1/hr/sites/:campId/movement-imports` | `HrAttendanceController.upload` → `HrAttendanceService.preview` | `camp.movement.import` | `hr-attendance.controller.ts:53` |
| POST | `/api/v1/hr/sites/:campId/movement-imports/manual` | `HrAttendanceController.manual` → `HrAttendanceService.previewManual` | `camp.movement.import` | `hr-attendance.controller.ts:62` |
| GET | `/api/v1/hr/sites/:campId/movement-imports` | `HrAttendanceController.listImports` → `HrAttendanceService.listImports` | `camp.movement.import` | `hr-attendance.controller.ts:68` |
| GET | `/api/v1/hr/sites/:campId/movement-imports/:id` | `HrAttendanceController.getImport` → `HrAttendanceService.getImport` | `camp.movement.import` | `hr-attendance.controller.ts:74` |
| POST | `/api/v1/hr/sites/:campId/movement-imports/:id/confirm` | `HrAttendanceController.confirm` → `HrAttendanceService.confirm` | `camp.movement.import` | `hr-attendance.controller.ts:81` |
| POST | `/api/v1/hr/sites/:campId/movement-imports/:id/cancel` | `HrAttendanceController.cancel` → `HrAttendanceService.cancel` | `camp.movement.import` | `hr-attendance.controller.ts:88` |
| GET | `/api/v1/hr/sites/:campId/movements` | `HrAttendanceController.listMovements` → `HrAttendanceService.listMovements` | гишүүн | `hr-attendance.controller.ts:95` |
| POST | `/api/v1/hr/sites/:campId/movements` | `HrAttendanceController.createMovement` → `HrAttendanceService.createMovement` | `camp.movement.import` | `hr-attendance.controller.ts:102` |
| DELETE | `/api/v1/hr/sites/:campId/movements/:id` | `HrAttendanceController.deleteMovement` → `HrAttendanceService.deleteMovement` | `camp.movement.import` | `hr-attendance.controller.ts:108` |
| GET | `/api/v1/hr/sites/:campId/shift-adjustments` | `HrAttendanceController.listAdjustments` → `HrShiftsService.listAdjustments` | гишүүн | `hr-attendance.controller.ts:115` |
| POST | `/api/v1/hr/sites/:campId/shift-adjustments` | `HrAttendanceController.createAdjustments` → `HrShiftsService.createAdjustments` | `camp.shift.adjust` | `hr-attendance.controller.ts:122` |
| DELETE | `/api/v1/hr/sites/:campId/shift-adjustments/:id` | `HrAttendanceController.deleteAdjustment` → `HrShiftsService.deleteAdjustment` | `camp.shift.adjust` | `hr-attendance.controller.ts:128` |
| GET | `/api/v1/hr/sites/:campId/shift-calendar` | `HrAttendanceController.calendar` → `HrShiftsService.calendar` | гишүүн | `hr-attendance.controller.ts:134` |

## modules/hr/employees

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/hr/sites/:campId/employees` | `HrEmployeesController.listEmployees` → `HrEmployeesService.list` | гишүүн | `hr-employees.controller.ts:19` |
| GET | `/api/v1/hr/sites/:campId/employees/:id` | `HrEmployeesController.getEmployee` → `HrEmployeesService.get` | гишүүн | `hr-employees.controller.ts:25` |
| POST | `/api/v1/hr/sites/:campId/employees/bulk` | `HrEmployeesController.bulkEmployees` → `HrEmployeesService.bulkUpdate` | `camp.employee.manage` | `hr-employees.controller.ts:33` |
| POST | `/api/v1/hr/sites/:campId/employees` | `HrEmployeesController.createEmployee` → `HrEmployeesService.create` | `camp.employee.manage` | `hr-employees.controller.ts:40` |
| PATCH | `/api/v1/hr/sites/:campId/employees/:id` | `HrEmployeesController.updateEmployee` → `HrEmployeesService.update` | `camp.employee.manage` | `hr-employees.controller.ts:46` |
| GET | `/api/v1/hr/sites/:campId/employees/:id/profile` | `HrEmployeesController.profile` → `HrEmployeeLifecycleService.profile` | `camp.employee.terminate` | `hr-employees.controller.ts:54` |
| GET | `/api/v1/hr/sites/:campId/employees/:id/pii-views` | `HrEmployeesController.piiViews` → `HrEmployeeLifecycleService.piiViews` | **OWNER·ADMIN** | `hr-employees.controller.ts:60` |
| POST | `/api/v1/hr/sites/:campId/employees/:id/terminate` | `HrEmployeesController.terminate` → `HrEmployeeLifecycleService.terminate` | `camp.employee.terminate` | `hr-employees.controller.ts:67` |
| POST | `/api/v1/hr/sites/:campId/employees/:id/rehire` | `HrEmployeesController.rehire` → `HrEmployeeLifecycleService.rehire` | `camp.employee.terminate` / OWNER·ADMIN | `hr-employees.controller.ts:74` |

## modules/hr/import

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/hr/sites/:campId/data-imports/:type/template` | `HrDataController.template` → `HrDataImportService.template` | — | `hr-data.controller.ts:45` |
| GET | `/api/v1/hr/sites/:campId/data-imports` | `HrDataController.list` → `HrDataImportService.list` | гишүүн | `hr-data.controller.ts:52` |
| POST | `/api/v1/hr/sites/:campId/data-imports/:type` | `HrDataController.upload` → `HrDataImportService.preview` | гишүүн | `hr-data.controller.ts:59` |
| GET | `/api/v1/hr/sites/:campId/data-imports/:type/:id` | `HrDataController.get` → `HrDataImportService.get` | гишүүн | `hr-data.controller.ts:77` |
| POST | `/api/v1/hr/sites/:campId/data-imports/:type/:id/confirm` | `HrDataController.confirm` → `HrDataImportService.confirm` | гишүүн | `hr-data.controller.ts:84` |
| POST | `/api/v1/hr/sites/:campId/data-imports/:type/:id/cancel` | `HrDataController.cancel` → `HrDataImportService.cancel` | гишүүн | `hr-data.controller.ts:91` |
| GET | `/api/v1/hr/sites/:campId/export/:type` | `HrDataController.export` → `HrDataImportService.export` | гишүүн | `hr-data.controller.ts:97` |

## modules/hr/org

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/hr/sites/:campId/departments` | `HrOrgController.listDepartments` → `HrDepartmentsService.list` | гишүүн | `hr-org.controller.ts:20` |
| POST | `/api/v1/hr/sites/:campId/departments` | `HrOrgController.createDepartment` → `HrDepartmentsService.create` | `camp.master.manage` | `hr-org.controller.ts:27` |
| PATCH | `/api/v1/hr/sites/:campId/departments/:id` | `HrOrgController.updateDepartment` → `HrDepartmentsService.update` | `camp.master.manage` | `hr-org.controller.ts:33` |
| PUT | `/api/v1/hr/sites/:campId/departments/:id/shift-pattern` | `HrOrgController.setShiftPattern` → `HrDepartmentsService.setShiftPattern` | `camp.master.manage` | `hr-org.controller.ts:39` |
| GET | `/api/v1/hr/sites/:campId/crews` | `HrOrgController.listCrews` → `HrCrewsService.list` | гишүүн | `hr-org.controller.ts:45` |
| POST | `/api/v1/hr/sites/:campId/crews` | `HrOrgController.createCrew` → `HrCrewsService.create` | `camp.master.manage` | `hr-org.controller.ts:52` |
| PATCH | `/api/v1/hr/sites/:campId/crews/:id` | `HrOrgController.updateCrew` → `HrCrewsService.update` | `camp.master.manage` | `hr-org.controller.ts:58` |

## modules/hr/positions

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/hr/positions` | `HrPositionsController.list` → `HrPositionsService.list` | гишүүн | `hr-positions.controller.ts:15` |
| POST | `/api/v1/hr/positions` | `HrPositionsController.create` → `HrPositionsService.create` | `camp.master.manage` | `hr-positions.controller.ts:22` |
| PATCH | `/api/v1/hr/positions/:id` | `HrPositionsController.update` → `HrPositionsService.update` | `camp.master.manage` | `hr-positions.controller.ts:28` |

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

## modules/camp/legacy

| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |
|---|---|---|---|---|
| GET | `/api/v1/camp/organizations` | `CampOrganizationsController (extends CoreOrganizationsController).list` → `CoreOrganizationsService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:15` |
| POST | `/api/v1/camp/organizations` | `CampOrganizationsController (extends CoreOrganizationsController).create` → `CoreOrganizationsService.create` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:15` |
| PATCH | `/api/v1/camp/organizations/:id` | `CampOrganizationsController (extends CoreOrganizationsController).update` → `CoreOrganizationsService.update` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:15` |
| GET | `/api/v1/camp/positions` | `CampPositionsController (extends HrPositionsController).list` → `HrPositionsService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:19` |
| POST | `/api/v1/camp/positions` | `CampPositionsController (extends HrPositionsController).create` → `HrPositionsService.create` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:19` |
| PATCH | `/api/v1/camp/positions/:id` | `CampPositionsController (extends HrPositionsController).update` → `HrPositionsService.update` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:19` |
| GET | `/api/v1/camp/camps/:campId/departments` | `CampHrOrgLegacyController (extends HrOrgController).listDepartments` → `HrDepartmentsService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:23` |
| POST | `/api/v1/camp/camps/:campId/departments` | `CampHrOrgLegacyController (extends HrOrgController).createDepartment` → `HrDepartmentsService.create` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:23` |
| PATCH | `/api/v1/camp/camps/:campId/departments/:id` | `CampHrOrgLegacyController (extends HrOrgController).updateDepartment` → `HrDepartmentsService.update` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:23` |
| PUT | `/api/v1/camp/camps/:campId/departments/:id/shift-pattern` | `CampHrOrgLegacyController (extends HrOrgController).setShiftPattern` → `HrDepartmentsService.setShiftPattern` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:23` |
| GET | `/api/v1/camp/camps/:campId/crews` | `CampHrOrgLegacyController (extends HrOrgController).listCrews` → `HrCrewsService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:23` |
| POST | `/api/v1/camp/camps/:campId/crews` | `CampHrOrgLegacyController (extends HrOrgController).createCrew` → `HrCrewsService.create` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:23` |
| PATCH | `/api/v1/camp/camps/:campId/crews/:id` | `CampHrOrgLegacyController (extends HrOrgController).updateCrew` → `HrCrewsService.update` | `camp.master.manage` | Deprecated `hr-legacy.controller.ts:23` |
| GET | `/api/v1/camp/camps/:campId/employees` | `CampHrEmployeesLegacyController (extends HrEmployeesController).listEmployees` → `HrEmployeesService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:27` |
| GET | `/api/v1/camp/camps/:campId/employees/:id` | `CampHrEmployeesLegacyController (extends HrEmployeesController).getEmployee` → `HrEmployeesService.get` | гишүүн | Deprecated `hr-legacy.controller.ts:27` |
| POST | `/api/v1/camp/camps/:campId/employees/bulk` | `CampHrEmployeesLegacyController (extends HrEmployeesController).bulkEmployees` → `HrEmployeesService.bulkUpdate` | `camp.employee.manage` | Deprecated `hr-legacy.controller.ts:27` |
| POST | `/api/v1/camp/camps/:campId/employees` | `CampHrEmployeesLegacyController (extends HrEmployeesController).createEmployee` → `HrEmployeesService.create` | `camp.employee.manage` | Deprecated `hr-legacy.controller.ts:27` |
| PATCH | `/api/v1/camp/camps/:campId/employees/:id` | `CampHrEmployeesLegacyController (extends HrEmployeesController).updateEmployee` → `HrEmployeesService.update` | `camp.employee.manage` | Deprecated `hr-legacy.controller.ts:27` |
| GET | `/api/v1/camp/camps/:campId/employees/:id/profile` | `CampHrEmployeesLegacyController (extends HrEmployeesController).profile` → `HrEmployeeLifecycleService.profile` | `camp.employee.terminate` | Deprecated `hr-legacy.controller.ts:27` |
| GET | `/api/v1/camp/camps/:campId/employees/:id/pii-views` | `CampHrEmployeesLegacyController (extends HrEmployeesController).piiViews` → `HrEmployeeLifecycleService.piiViews` | **OWNER·ADMIN** | Deprecated `hr-legacy.controller.ts:27` |
| POST | `/api/v1/camp/camps/:campId/employees/:id/terminate` | `CampHrEmployeesLegacyController (extends HrEmployeesController).terminate` → `HrEmployeeLifecycleService.terminate` | `camp.employee.terminate` | Deprecated `hr-legacy.controller.ts:27` |
| POST | `/api/v1/camp/camps/:campId/employees/:id/rehire` | `CampHrEmployeesLegacyController (extends HrEmployeesController).rehire` → `HrEmployeeLifecycleService.rehire` | `camp.employee.terminate` / OWNER·ADMIN | Deprecated `hr-legacy.controller.ts:27` |
| GET | `/api/v1/camp/camps/:campId/movement-imports/template` | `CampHrAttendanceLegacyController (extends HrAttendanceController).template` → `HrAttendanceService.template` | — | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/movement-imports` | `CampHrAttendanceLegacyController (extends HrAttendanceController).upload` → `HrAttendanceService.preview` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/manual` | `CampHrAttendanceLegacyController (extends HrAttendanceController).manual` → `HrAttendanceService.previewManual` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/movement-imports` | `CampHrAttendanceLegacyController (extends HrAttendanceController).listImports` → `HrAttendanceService.listImports` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/movement-imports/:id` | `CampHrAttendanceLegacyController (extends HrAttendanceController).getImport` → `HrAttendanceService.getImport` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/:id/confirm` | `CampHrAttendanceLegacyController (extends HrAttendanceController).confirm` → `HrAttendanceService.confirm` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/movement-imports/:id/cancel` | `CampHrAttendanceLegacyController (extends HrAttendanceController).cancel` → `HrAttendanceService.cancel` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/movements` | `CampHrAttendanceLegacyController (extends HrAttendanceController).listMovements` → `HrAttendanceService.listMovements` | гишүүн | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/movements` | `CampHrAttendanceLegacyController (extends HrAttendanceController).createMovement` → `HrAttendanceService.createMovement` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| DELETE | `/api/v1/camp/camps/:campId/movements/:id` | `CampHrAttendanceLegacyController (extends HrAttendanceController).deleteMovement` → `HrAttendanceService.deleteMovement` | `camp.movement.import` | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/shift-adjustments` | `CampHrAttendanceLegacyController (extends HrAttendanceController).listAdjustments` → `HrShiftsService.listAdjustments` | гишүүн | Deprecated `hr-legacy.controller.ts:31` |
| POST | `/api/v1/camp/camps/:campId/shift-adjustments` | `CampHrAttendanceLegacyController (extends HrAttendanceController).createAdjustments` → `HrShiftsService.createAdjustments` | `camp.shift.adjust` | Deprecated `hr-legacy.controller.ts:31` |
| DELETE | `/api/v1/camp/camps/:campId/shift-adjustments/:id` | `CampHrAttendanceLegacyController (extends HrAttendanceController).deleteAdjustment` → `HrShiftsService.deleteAdjustment` | `camp.shift.adjust` | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/shift-calendar` | `CampHrAttendanceLegacyController (extends HrAttendanceController).calendar` → `HrShiftsService.calendar` | гишүүн | Deprecated `hr-legacy.controller.ts:31` |
| GET | `/api/v1/camp/camps/:campId/data-imports/:type/template` | `CampDataController (extends HrDataController).template` → `HrDataImportService.template` | — | Deprecated `hr-legacy.controller.ts:35` |
| GET | `/api/v1/camp/camps/:campId/data-imports` | `CampDataController (extends HrDataController).list` → `HrDataImportService.list` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type` | `CampDataController (extends HrDataController).upload` → `HrDataImportService.preview` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
| GET | `/api/v1/camp/camps/:campId/data-imports/:type/:id` | `CampDataController (extends HrDataController).get` → `HrDataImportService.get` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type/:id/confirm` | `CampDataController (extends HrDataController).confirm` → `HrDataImportService.confirm` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
| POST | `/api/v1/camp/camps/:campId/data-imports/:type/:id/cancel` | `CampDataController (extends HrDataController).cancel` → `HrDataImportService.cancel` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
| GET | `/api/v1/camp/camps/:campId/export/:type` | `CampDataController (extends HrDataController).export` → `HrDataImportService.export` | гишүүн | Deprecated `hr-legacy.controller.ts:35` |
