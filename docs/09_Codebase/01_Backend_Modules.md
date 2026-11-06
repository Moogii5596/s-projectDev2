---
title: "Backend модулиуд (core-kernel)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-06
tags: [codebase, backend, camp, hr, auth]
---

# Backend модулиуд (core-kernel)

> Эх: `apps/core-kernel/src/`. Модуль бүр: **зорилго → гол файл → хүснэгт → эрх / API → тест → анхаарах**. Endpoint-ийн бүрэн жагсаалт [[02_API_Catalog]] (хэсгийн нэр = хавтасны зам), хүснэгт [[03_DB_Catalog]].
> Зөвхөн даалгаварт хамаарах хэсгээ унш. Код өөрчлөгдөхөд энэ хэсгийг шинэчил (RULE-21). Эхлэх цэг: [[00_Codebase_Map]].

## Агуулга
- Суурь: [[#auth]] · [[#db]] · [[#common]] · [[#config, cache, gateway]] · [[#scripts]]
- Бизнес: [[#MR + workflow]] · [[#budget, inventory, vendor, report (lite)]] · [[#event-bus]] · [[#tenant-admin, route-ingress, health]]
- HR / Core (v0.2.2 H1, [[ADR-006_HR_Core_Module]]): [[#hr — нийтлэг]] · [[#hr/employees, hr/org, hr/positions]] · [[#hr/attendance]] · [[#hr/import]] · [[#core/organizations]] · [[#core/feedback]]
- Кемп: [[#camp — нийтлэг]] · [[#camp/rbac]] · [[#camp/master]] · [[#camp/catalog]] · [[#camp/settings]] · [[#camp/attendance]] · [[#camp/assets]] · [[#camp/maintenance]] · [[#camp/data]] · [[#camp/costs, camp/audit]] · [[#camp — V2 (кодгүй)]]

---

## auth
- **Зорилго:** нэвтрэлт (Supabase JWT), tenant тодорхойлох, хэрэглэгч үүсгэх, урилга / нууц үг сэргээх, имэйл.
- **Гол файл:** `tenant-auth.guard.ts` (глобал APP_GUARD; JWT → tenant → membership; PERF-003 Supabase унасан үеийн 503) · `tenant-slug.ts` (Host → slug; dedicated горимд `DEDICATED_TENANT_SLUG`) · `tenant-cache.service.ts` (membership cache: эерэг 5 мин, сөрөг 30 сек — SEC-001) · `tenant-rate-limit.guard.ts` · `tenant-context.interceptor.ts` · `sign-in.service.ts` + `login-identifier.ts` (утас / username / имэйлээр нэвтрэх — v0.2.2 Блок 2, ADR-003 §2.2) · `user-admin.service.ts` (**хэрэглэгч үүсгэх ГАНЦ газар**, SEC-005) · `invite.service.ts` + `invite-token.ts` (токен = SHA-256 hash л хадгална) · `mailer.service.ts` + `auth-mail.ts` (SMTP, 3 хэл).
- **Хүснэгт:** `core_users`, `core_user_invites`, `tenants`; нэвтрэлтийн түгжээ — `auth_guard.password_failures` (Supabase hook).
- **Анхаарах:** `req.user.id` = authId (RULE-13). Шинэ public route → `@SkipAuth()`; нууц үг солих шаардлагатай хэрэглэгчид нээлттэй → `@AllowPasswordChangeRequired()`.
- **Тест:** `auth.integration`, `tenant-auth-guard.integration`, `camp-v022-login/invite.integration` ([[07_Test_Map]]).

## db
- `prisma-tenant-client.service.ts` (AsyncLocalStorage tenant context; `prisma.service.ts` = alias) · `system-prisma.service.ts` (`SYSTEM_DATABASE_URL`, BYPASSRLS — зөвхөн системийн ажил) · `tenant-tx.ts` → **`inTenantTx(prisma, tenantId, fn)`** — `set_config('app.tenant_id')` + бүх query нэг transaction (RULE-03/04, RLS-004) · `redis.module.ts`.
- **Дүрэм:** tenant өгөгдөл → үргэлж `inTenantTx`; `SystemPrismaService`-ийг tenant өгөгдөлд хэрэглэхгүй ([[08_Patterns]] §2).

## common
- `http/configure-app.ts` — ValidationPipe, угтвар, multipart; **main.ts ба integration тест хоёулаа** дуудна (VALID-001).
- `i18n/` — `messages.ts` (backend мессеж mn/en/zh), `app-error.ts` (код + параметр), `i18n.interceptor.ts` + `i18n-overrides.service.ts` (байгууллагын орчуулгын засвар), `catalog.ts` (frontend + backend бүх түлхүүр), `i18n.controller.ts`.
- `helpers/resolve-user-id.helper.ts` (authId → `core_users.id`), `helpers/require-role.helper.ts` (core role шалгах) · `decorators/` (`@SkipAuth`, `@AllowPasswordChangeRequired`) · `utils/cursor.ts` (cursor pagination, буруу UUID → 400) · `xlsx/` (Excel импорт/экспортын нийтлэг давхарга, v0.2.0).

## config, cache, gateway
- `config/env.config.ts` (env шалгалт, `DEPLOYMENT_MODE`, `DEDICATED_TENANT_SLUG`) · `deployment-mode.ts` (ADR-001: shared / dedicated) · `rate-limit.ts` · `app-version.ts` (`/health`-ийн хувилбар) · `cluster-restart.ts` · `prisma-log.ts`.
- `cache/cache.service.ts` — Redis cache (PERF-*). `gateway/` — `DrainingInterceptor` (глобал, graceful shutdown), `dynamic-ingress-router.service.ts`.

## scripts
- CLI (`*.cli.ts`, pnpm script-ээр — [[06_Config_Env]]): `dev-test-user` (admin@test.mn), `e2e-fixture`, `pilot-admin` (`pnpm pilot:user`, `pilot:onboard`), `camp-snapshot` (upgrade-ийн өмнө/дараа A = B эрхийн тулгалт), `camp-login-report`.

---

## MR + workflow
- **Модулиуд:** `material-requisition/` (MR CRUD, submit/approve/reject; `mr-approval.ts` — цэвэр батлалтын логик, SEC-004: үүсгэгч өөрөө батлахгүй) · `workflow/` (олон алхамт батлалт, `amount-router` дүнгээр, quorum, SLA `approval-sla.*`, `escalation.scheduler.ts` — Cron 15 мин, `delegation.*`, `idempotency.service.ts`, `pessimistic-lock.service.ts`, `workflow-definition.*` — OWNER/ADMIN) · `mr-lifecycle/` (MR төлөв солигдоход **тухайн transaction дотор** Budget/Inventory-г дууддаг; алдаа → бүх tx rollback).
- **Хүснэгт:** `mr_headers`, `mr_items`, `approval_logs`, `workflow_*`, `idempotency_keys`.
- **Event:** outbox `MR_SUBMITTED` / `MR_APPROVED` / `MR_REJECTED`.
- **Тест:** `mr-crud`, `mr-approval`, `mr-workflow-approval`, `rls-leakage` integration; e2e `requisition-flow`, `advanced-workflow`.

## budget, inventory, vendor, report (lite)
- v0.1.5 Phase 4 — **хөнгөн** модулиуд (системийг турших зорилготой). `budget/` (`budget_periods`, `budget_allocations`, `budget_commitments`; MR-д хэлтсийн төсөв) · `inventory/` (`inventory_items`, нөөцлөл) · `vendor/` (хамгийн энгийн CRUD + RLS — **шинэ модулийн жишээ**, [[03_Module_Template]]) · `report/` (олон модулийг нэг tenant tx-д уншина).
- Frontend: `/inventory`, `/vendors`, `/reports` (`VITE_MODULES`). Тест: `budget`, `modules-lite` integration.

## event-bus
- Transactional outbox: `outbox_events` (бизнес tx дотор бичнэ) → `outbox-poller.service.ts` (Cron 5 сек, `SKIP LOCKED`, retry 30с/120с/480с) → `redis-publisher.service.ts` → алдаатай бол `dlq.service.ts` (`dlq_events`). CloudEvents v1.0 (`cloud-events.adapter.ts`, тогтвортой id).
- Тест: `event-bus.integration`. Гэрээний spec (`01_Shared_Event_Bus_Contract_Spec`) vault-д алга — [[INDEX]] → Missing Specs.

## tenant-admin, route-ingress, health
- `tenant-admin/` — tenant onboarding (`SuperAdminGuard` — платформын super admin). `route-ingress/` — `tenant_routes` бүртгэл. `health/` — health endpoint (🌐; хувилбар `config/app-version.ts`) — зам [[02_API_Catalog]].

---

## hr — нийтлэг
- **Зорилго:** системийн суурь HR ([[ADR-006_HR_Core_Module]]) — ажилтан, хэлтэс, бригад, албан тушаал, ээлж, ирц, импорт. `hr.module.ts` (импорт: `CampCommonModule` л — **HR → Кемп хамааралгүй**).
- **v0.2.2 H1 хязгаар:** зөвхөн кодын эзэмшил шилжсэн. Хүснэгт `camp_*`, эрхийн код `camp.*` хэвээр (v0.3); Prisma model HR нэртэй (`HrEmployee` …) + `@@map("camp_employees")`. Ажилтан нэг кемптэй хэвээр — API-д `:campId` = «үндсэн ажлын байр».
- **API:** `/api/v1/hr/sites/:campId/...`, `/api/v1/hr/positions`. Хуучин `/api/v1/camp/...` замууд — `camp/legacy/hr-legacy.controller.ts` (HR controller-ийг өвлөсөн, `Deprecation: true`, **v0.2.3-т устгана**).
- **Хэв маяг:** Кемпийн хэв маягтай ижил (`inTenantTx` + `CampAccessService.require` — `camp/common`). Хуваалцах DTO — `camp/common/common.dto.ts` (`QueryActiveOnlyDto`, нэрийн каталог, `CODE`).
- **Тест:** `hr-routes` integration (шинэ = хуучин хариу, Deprecation, ирц → байрлалт, rooms экспорт, RLS).

## hr/employees, hr/org, hr/positions
- `employees/hr-employees.service.ts` (ажилтан, bulk; эффектив хоол/байршил — `camp/common/position-defaults.ts`) · `org/hr-departments.service.ts` + `shift-pattern.ts` (хэлтэс, ээлжийн загвар) · `org/hr-crews.service.ts` (бригад) · `positions/hr-positions.service.ts` (албан тушаалын каталог + `resolvePositionByName`, `assertPosition`, `normName`).
- **Автомат код (v0.2.3 R7, PIL-25):** `employees/employee-code.ts` — `employeeCode` өгөөгүй үед `<угтвар><4 орон>` (`camp_settings.auto_code_prefix`, анхдагч `Z` → `Z0001`); дугаарлалт tenant даяар (ажлаас гарсныг ч тооцно), tenant-ийн advisory lock; код солих = `PATCH employees/:id` (давхардлын шалгалттай).
- **Хүснэгт:** `camp_employees`, `camp_departments`, `camp_department_shift_patterns`, `camp_crews`, `camp_positions`. Кемп × албан тушаалын анхдагч (`camp_position_settings`, `camp_position_shift_patterns`) — Кемпийнх ([[#camp/catalog]]).
- **Эрх:** `camp.employee.manage`, `camp.master.manage`. Нэвтрэх эрх / урилга (Блок 2–3) — [[#camp/rbac]]-д үлдсэн (`/camp/camps/:campId/employees/:id/{user,create-user}`).
- **Амьдралын мөчлөг (v0.2.2 Блок 5, [[07_v0.2.2_tech_plan]] §13):** `employees/hr-employee-lifecycle.service.ts` — `terminate` (D-07: нэг tx — кемпэд байвал явалт ирцийн planner-ээр, өрөө чөлөөлөх порт, `TERMINATED` + огноо/шалтгаан, хэрэглэгч идэвхгүй + урилга хүчингүй, аудит `TERMINATE`; GoTrue ban tx-ээс өмнө, алдаа гарвал буцаана; огнооноос хойш ирц → 409), `rehire` (шинэ бүртгэл `rehired_from_id`, ижил код — partial unique; хэрэглэгч шилжинэ: бүх роль/шууд эрх устаж DB trigger загвараас дахин олгоно; ban арилна), `profile` (мэдээлэл, нэвтрэх эрх, ирц 20, кемпэд эсэх, өрөөний түүх, аудит — `summary` орчуулсан; PII лог атом `INSERT … WHERE NOT EXISTS` 15 мин), `piiViews` (тухайн кемпийн `camp.roles.manage`). Цэвэр: `terminationDateError`, `terminationUserBlocker`.
- **Порт:** `employees/employee-hooks.ts` — `EmployeeSitePort` (`releaseOnTermination`, `roomHistory`) + `HrEmployeeHooks`; хэрэгжүүлэлт `camp/attendance/camp-employee-site.ts`, бүртгэл `CampHrBridge`. API: `GET employees/:id/{profile,pii-views}`, `POST employees/:id/{terminate,rehire}` (эрх `camp.employee.terminate`). Хүснэгт `camp_pii_access_log` (app_user: SELECT, INSERT л).
- **Нэр, утас (v0.2.3 Блок D, S1–S2):** `employees/employee-names.ts` — `family_name` (ургийн овог), `last_name` (овог), `first_name` (нэр); `full_name` = DB trigger `trg_camp_employees_names` («овог нэр», шууд бичихгүй). Хуучин клиент `fullName` л өгвөл эхний зайгаар салгана (`resolveNames`). Нэмэлт утас `camp_employee_phones` (үндсэн = `phone`), DTO/хариу `extraPhones: string[]` (өгвөл бүхэлд нь солино, үндсэнтэй давхардсаныг хасна). Prisma-д `firstName` optional (DB NOT NULL — trigger бөглөнө).
- **«Мэдээлэл дутуу» (v0.2.3 S9, S11):** `employees/data-issues.ts` — `camp_employees.data_issues` JSONB `[{field: email|phone|extraPhones|terminatedAt, code, value}]`. Импортын `soft` багана (`table-spec.ts` `ColumnSpec.soft` → `ParsedTableRow.issues`, PREVIEW-д `warnings`) буруу утгыг талбарт бичихгүй, энд хадгална; API-аар талбар засахад `clearedBy` арилгана; импортод хоосон нүд хөндөхгүй. Жагсаалт `?dataIssues=true`. `TERMINATED` + `terminated_at` хоосон — зөвхөн `terminatedAt` тэмдэглэгээтэй (CHECK).
- **TERMINATED-ийн дүрэм:** жагсаалт анхдагчаар хасна (`status=TERMINATED` шүүлтээр), засах/бөөнөөр → 409, `assertCodeUnique`/импорт/ирцийн planner кодоор TERMINATED биш бүртгэлийг сонгоно (импорт: зөвхөн гарсан кодтой мөр → `row.code_terminated`), экспорт хасна. Тест: `hr-employee-lifecycle.test`, `camp-v022-terminate` integration.

## hr/attendance
- **Ирц:** `hr-attendance.service.ts` — xlsx импорт **PREVIEW → CONFIRM** (нэг tx), гараар бүртгэл, устгал · `hr-shifts.service.ts` (ээлжийн өөрчлөлт, календарь). Цэвэр функц: `import-parser`, `import-planner`, `attendance-state`, `roster`, `shift-resolver`, `meal-rules`, `range` (огноо — `camp/common/camp-date.ts`). **v0.2.3 Блок R:** PREVIEW загварыг автоматаар таньна — «Ирц» эсвэл HR ShiftChange: `shiftchange-parser` (хуудас ирэх / буух / Сунах; ЗОХИЦУУЛАЛТ, чөлөө алгасна) → `shiftchange-resolver` (код / овог+нэрээр тулгах) → planner (`action: 'EXTEND'` → EXTENSION зохицуулалт, `camp_settings.extension_default_days`). **R4.1:** `PATCH movement-imports/:id/rows` (зөвхөн PREVIEW) — мөр бүрт ажилтан солих / устгах / сэргээх (`import-edits.ts`: `applyRowEdits`, `planWithDeleted`; `parsedRows`-д `deleted`, `edited.fromCode`) → дахин төлөвлөж шинэ PREVIEW; CONFIRM устгасан мөрийг алгасна (бүгд устгагдсан → 400). `camp_movement_imports.preview_meta` = `{ format, skippedSheets }`. **R4.2:** `roster-gaps.ts` — ShiftChange PREVIEW / PATCH хариунд `rosterGaps` (ростероор ирэх / явах ёстой боловч файлд алга; анхааруулга, DB-д хадгалахгүй).
- **Кемпийн байрлалт (порт):** `stay-store.ts` — `AttendanceStayStore` + `HrAttendanceHooks`. Ирцийн бичилт `camp_stays`-ыг **нэг transaction-д** порт-оор шинэчилнэ; хэрэгжүүлэлт `CampStayStore` (Кемп), бүртгэл `CampHrBridge.onModuleInit`. Бүртгэгдээгүй бол алдаа.
- **Хүснэгт:** `camp_movements`, `camp_movement_imports`, `camp_shift_adjustments`. **Эрх:** `camp.movement.import`, `camp.shift.adjust`. Тест: `import.test`, `import-edits.test`, `roster-gaps.test`, `attendance-services.test` (Кемптэй хамт), `camp-attendance` integration + golden.

## hr/import
- `hr-data-import.service.ts` — хүснэгтээр оруулах/экспорт, урсгал PREVIEW → CONFIRM (дахин шалгана). Handler-ийн **бүртгэл** (v0.2.3 Блок D): HR-ийнх `employees`, `former-employees`, `departments`, `positions`; бусад модуль `registerHandler(urlType, handler)` (Кемп: `building-types`, `buildings`, `rooms`, `room-allocations` — `CampHrBridge`). `registerExport` — handler-гүй экспорт. Хүснэгт: `camp_data_imports` (`CampDataImportType` 8 утга).
- **Handler-ууд:** `employees.handler.ts` (овог/нэр/ургийн овог, хуучин «Овог нэр» = салгана; «Нэмэлт утас» таслал/мөрөөр), `former-employees.handler.ts` (S7: зөвхөн ШИНЭ `TERMINATED` бүртгэл, түлхүүр = код + гарсан огноо (огноогүй → «Мэдээлэл дутуу», дараа огноотой мөр бөглөнө — S11), `linkRehireChains` — ижил кодыг огноогоор гинжлэнэ, идэвхтэй нь сүүлд; эрх `camp.employee.terminate`), `departments.handler.ts`, `positions.handler.ts` (нэрээр, `code` = ажлын байрны индекс).
- **Дараалал:** хэлтэс → албан тушаал → ажилтан → гарсан ажилтан; байрны төрөл → байр → өрөө → байрлуулалт ([[12_v0.2.3_data_import]]). Тест: `camp-data-import`, `camp-v023-data-import` integration.

## core/organizations
- `core.module.ts` — `CoreOrganizationsService` (байгууллагууд — гэрээт г.м.), `/api/v1/core/organizations`. Хүснэгт `camp_organizations` (model `CoreOrganization`). Эрх: `camp.master.manage`.

## core/feedback
- `feedback/` (v0.2.3 Блок F, FB-SYS-01a) — `CoreFeedbackService` (санал хүсэлт: илгээх, бүгдийг харах, «+1», зохиогч «Шинэ» үед засах/устгах; OWNER/ADMIN — төлөв, хариу, `doneVersion`, Excel), `/api/v1/core/feedback`. Хүснэгт `core_feedback`, `core_feedback_votes` (`vote_count` нэг tx-д тоолно). Эрх: кемпийн эрхгүй — tenant-ийн идэвхтэй хэрэглэгч бүр; админ = `core_users.role` (ADR-007-ийн дараа системийн эрх рүү). Цэвэр дүрэм `feedback-rules.ts` (unit).

## camp — нийтлэг
- `camp.module.ts` — бүх дэд модулийг бүртгэнэ; `HrModule`, `CoreModule`-ийг import хийнэ (Кемп → HR, эсрэгээрээ үгүй). `camp-hr.bridge.ts` — HR-д байрлалтын порт, ажилтны мөчлөгийн порт (`CampEmployeeSite` — Блок 5), `rooms` экспорт бүртгэнэ. `common/camp-common.module.ts` — `CampAccessService`, `CampAuditService` (HR/Core хуваалцана). Кемп = уурхайн кемпийн катеринг үйлчилгээ ([[01_plan_and_erd]]).
- `common/camp-access.service.ts` — эрх шалгах: `require(tx, tenantId, authId, campId, codes)` (эрх), `requireAccess(...)` (кемпийн гишүүнчлэл л), `requireInAnyCamp`, **`requireTenantAdmin(...)`** — хэрэглэгч / роль / эрх удирдах (урилга, идэвхгүй болгох, холбох, «Хэн үзсэн») зөвхөн системийн роль OWNER / ADMIN (v0.2.2 Блок 6б, SEC-009; `camp.roles.manage` юу ч зөвшөөрөхгүй — ADR-007, v0.2.3); `isTenantAdminRole(role)` — зорилтот хэрэглэгчийг хамгаалах. **Tenant OWNER/ADMIN = бүх кемпийн бүх эрх** (анхны тохиргоо). · `camp-permissions.ts` — `CAMP_PERMISSIONS` (DB-тэй ЯГ ижил, [[05_Permissions_Catalog]]) · `camp-tx.ts` — `inTenantTx` + огноо/цагийн хөрвүүлэлт (`toDbDate`, `fromDbDate`…) · `camp-errors.ts` (DB алдаа → HTTP, нөөц хамгаалалт) · `camp-audit.service.ts` (`camp_audit_log`) · `camp-lookup.ts` (кемп байгаа эсэх — эрх шалгасны ДАРАА) · `camp-request.ts` (`reqUser(req)`) · `camp-i18n.ts`.
- **Хэв маяг:** service-ийн public метод бүр `(tenantId, authId, campId, …)` → `withCampErrors(() => inTenantTx(...))` → эхэнд `access.require/requireAccess`. Эрхийн alias: `const P = CAMP_PERMISSIONS`.
- **Шилжилт:** ажилтан / хэлтэс / ээлж / ирц / гэрээт байгууллага → HR модуль руу ([[ADR-006_HR_Core_Module]], v0.2.2).

## camp/rbac
- `camp-rbac.service.ts` (эрхийн каталог, роль, роль-эрх, `me/permissions`) · `camp-user-access.service.ts` (ажилтны картаас нэвтрэх эрх үүсгэх, урилга — v0.2.2 Блок 3) · `camp-employee-login.service.ts` (ажилтан ↔ хэрэглэгч холбох — Блок 2) · `template-diff.ts` (роль-загвар ↔ бодит эрхийн зөрүү, цэвэр функц).
- **Хүснэгт:** `camp_permissions` (глобал), `camp_roles`, `camp_role_permissions`, `camp_user_roles`, **`camp_user_permissions`** (эцсийн эрхийн ганц эх сурвалж — Блок 1), `camp_position_role_templates`.
- **Эрх:** `camp.roles.manage`. Загвар: [[ADR-003_Users_Login_Permissions]]. Тест: `camp-v022-perms`, `camp-master` integration.

## camp/master
- `camps.service.ts` (кемп — жагсаалт = хэрэглэгчийн эрхтэй кемп) · `camp-facilities.service.ts` (байр, өрөө; `room-range.ts` олон өрөө). Хэлтэс, бригад, ажилтан, байгууллага → [[#hr/employees, hr/org, hr/positions]], [[#core/organizations]] (v0.2.2 H1).
- **Хүснэгт:** `camps`, `camp_buildings`, `camp_rooms`.
- **Эрх:** `camp.master.manage`, `camp.room.manage`. Тест: `camp-master` integration, e2e `camp`.

## camp/catalog
- Байрны төрөл (`camp_building_types`) + кемп × албан тушаалын анхдагч (`camp_position_settings` — хоол/байршил, `camp_position_shift_patterns`; v0.2.1 C-01). Албан тушаалын каталог → [[#hr/employees, hr/org, hr/positions]]. Тест: `camp-v021` integration.

## camp/settings
- Кемпийн тохиргоо (НӨАТ, ростер, анхдагч хоолны байршил) — `camp_settings`, `camp_meal_locations`. Тохиргоогүй кемпэд DB DEFAULT-тай ижил анхдагч. Эрх: `camp.settings.manage`.

## camp/attendance
- **Байрлалт ба хоолны суурь тоо.** `camp-stays.service.ts` (`CampStayStore` — HR ирцийн порт, `CampStaysService` — `GET stays`) · `camp-rooms.service.ts` (өрөө хуваарилалт, багтаамж — 28 хоногийн цонх) · `camp-presence.service.ts` + `presence.ts` (өдрийн хоолны суурь тоо — V2 хоолны захиалгын суурь). Ирц/ээлж → [[#hr/attendance]] (v0.2.2 H1).
- **Хүснэгт:** `camp_stays`, `camp_room_allocations`.
- **Эрх:** `camp.room.manage`. Тест: `camp-attendance` integration + `tests/__golden__`, e2e `camp-ops`.
- **HR руу шилжинэ** (ирц, ээлж — [[ADR-006_HR_Core_Module]]); өрөө/байрлалт кемпэд үлдэнэ.

## camp/assets
- Хөрөнгийн ангилал (tenant түвшин `/camp/asset-categories`) ба кемпийн хөрөнгө, хөдөлгөөн, акт. Хүснэгт: `camp_asset_categories`, `camp_assets`, `camp_asset_movements`. Эрх: `camp.asset.manage`. Тест: `camp-assets-maintenance` integration, e2e `camp-assets`.

## camp/maintenance
- Засварын хүсэлт + сэлбэг. **Төлвийн машин** `maintenance-flow.ts` (`TRANSITIONS`: start/complete → `parts`, reopen/close/cancel → `close`; өрөө түгжих/чөлөөлөх) — цэвэр өгөгдөл, unit тестээр бүрэн хамрагдсан. Хаахад сэлбэгийн зардал → `camp/costs`.
- **Хүснэгт:** `camp_maintenance_requests`, `camp_maintenance_parts`. Эрх: `camp.maintenance.{create,parts,close}`.

## camp/data
- `rooms.export.ts` — өрөөний spec + экспорт. `facilities.handlers.ts` (v0.2.3 Блок D, S5) — байрны төрөл (нэрээр, tenant), байр (кодоор; идэвхтэй өрөөтэйг идэвхгүй ✖), өрөө (байр + дугаар; одоо хүнтэйг INACTIVE ✖). `room-allocations.handler.ts` (S6) — өрөөнд байрлуулалт **түүхтэй** (мөр = хугацаа; дуусаагүй = одоо): ижил ажилтны давхцал ✖, DB-тэй ижил өрөө → нэгтгэх (update), өөр өрөө → алдаа; багтаамж зөвхөн дуусаагүй мөрөнд (`firstOverCapacityNight`, 28 шөнө); TERMINATED ажилтны хугацаа гарсан өдрөөс хэтрэхгүй. Бүгд `CampHrBridge`-ээр HR-ийн импортод бүртгэгдэнэ → [[#hr/import]].

## camp/costs, camp/audit
- `costs/cost-entry-writer.ts` — **нэгдсэн зардлын бичигч** (`camp_cost_entries` — тайлангийн ганц эх сурвалж, snapshot) · `vat.ts` (2 оронтой, ROUND_HALF_UP).
- `audit/camp-audit.controller.ts` — `GET /camp/camps/:campId/audit` (`camp_audit_log`, v0.2.0 §0.4).

## camp — V2 (кодгүй)
- DB-д бий, service/API **хараахан алга** (D8 — V2): `camp_contracts*` (гэрээ, үнэ), `camp_haul_records` (бохир ус / хог), `camp_meal_orders`, `camp_meal_order_lines`. Эрх: `camp.contract.manage`, `camp.haul.*`, `camp.meal.*`, `camp.report.view`. Төлөвлөгөө: [[03_v0.2_full_plan]] (v0.2.3–v0.2.4).
