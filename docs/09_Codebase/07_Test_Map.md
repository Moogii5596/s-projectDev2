---
title: "Тестийн зураглал"
type: "Guide"
status: "Active"
last_updated: 2026-11-06
tags: [codebase, testing, generated]
---

# Тестийн зураглал

> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).

Орчин, fixture: [[02_Local_Supabase_Docker_Windows]] · тест бичих дүрэм: [[08_Patterns]] · сургамж: [[lessons_learned]] (TEST-*). Тестийн тоо = `it(`/`test(` мөрийн тоо (ойролцоо).

## Integration (бодит PG + RLS) — 34 файл, ~309 тест

Команд: `pnpm test:integration`

| Файл | Тест | describe |
|---|---|---|
| `core-kernel/test/auth.integration.spec.ts` | 6 | AuthService Integration |
| `core-kernel/test/budget.integration.spec.ts` | 12 | 🧾 Budget API · 🔗 MR ↔ Budget (transaction дотор) · 🔒 RLS leakage (app_user, NOBYPASSRLS) |
| `core-kernel/test/camp-assets-maintenance.integration.spec.ts` | 15 | 🪑 Үндсэн хөрөнгө · 🔧 Засвар · 🪑🔧 Хөрөнгө ба засвар · 🔒 RLS |
| `core-kernel/test/camp-attendance.integration.spec.ts` | 18 | 📥 Ирцийн xlsx импорт · 🍽️ Хоолны суурь тоо (presence) · ✍️ Гараар бүртгэл · 🛏️ Өрөө (хоногоор) · 🔒 Validation ба RLS · 📥 [R4] HR ShiftChange — PREVIEW, ростерын зөрүү, мөр засах |
| `core-kernel/test/camp-audit.integration.spec.ts` | 6 | 📜 camp_audit_log |
| `core-kernel/test/camp-data-import.integration.spec.ts` | 14 | 📥 Загвар · 👥 Ажилтан — хүснэгтээр · 🏢 Хэлтэс ба өрөөний экспорт · 🔒 RLS |
| `core-kernel/test/camp-master.integration.spec.ts` | 27 | 🔑 Каталог ба анхдагч роль · 🏕️ Кемп, тохиргоо, байршил · 🏢 Хэлтэс + ээлжийн загвар, баг, байр/өрөө, байгууллага · 👷 Ажилтан · 👥 Кемпийн роль → эрх (зөвхөн тэр кемпэд) · 🧯 camp-errors — БОДИТ Pri |
| `core-kernel/test/camp-snapshot.integration.spec.ts` | 3 | 📸 camp:snapshot |
| `core-kernel/test/camp-v020-ux.integration.spec.ts` | 10 | 🏠 FB-07 олон өрөө · 👥 FB-03 хэлтсийн тоо · 🗓 FB-14 ирц · 🛏 FB-12 өрөөний самбар |
| `core-kernel/test/camp-v021.integration.spec.ts` | 11 | 🍽️ Хоолны байршил / хоол авах / ээлж — ажилтан ?? албан тушаал ?? анхдагч · 📋 C-14 ирцийн жагсаалт — тооцоолсон ээлжээр · 🏢 C-12 байрны төрөл, байранд хөрөнгө, өрөөний самбар · 🔒 RLS — шинэ хүснэг |
| `core-kernel/test/camp-v022-invite.integration.spec.ts` | 5 | v0.2.2 Блок 3 — урилга, хэрэглэгч үүсгэх (integration) |
| `core-kernel/test/camp-v022-login.integration.spec.ts` | 7 | v0.2.2 Блок 2 — нэвтрэх нэр, ажилтан ↔ хэрэглэгч (integration) |
| `core-kernel/test/camp-v022-perms.integration.spec.ts` | 7 | v0.2.2 Блок 1 — camp_user_permissions (integration) |
| `core-kernel/test/camp-v022-terminate.integration.spec.ts` | 7 | v0.2.2 Блок 5 — ажлаас гаргах, дахин ажилд авах, PII лог (integration) |
| `core-kernel/test/camp-v022-users.integration.spec.ts` | 3 | v0.2.2 Блок 4 — хэрэглэгч удирдах (integration) |
| `core-kernel/test/camp-v023-auth.integration.spec.ts` | 6 | PIL-16 — сүүлийн нэвтрэлт · PIL-15 — нэвтэрсэн төхөөрөмжүүд (D-3) · PIL-15 — нууц үг солих: одоогийн төхөөрөмж үлдэнэ (D-1, OPS-013) · PIL-15 — урилга accept: бүх session цуцлагдана |
| `core-kernel/test/camp-v023-contracts.integration.spec.ts` | 1 | v0.2.3 contracts and exchange rates |
| `core-kernel/test/camp-v023-data-import.integration.spec.ts` | 12 | S1 + S2 — нэр, нэмэлт утас · S4 — албан тушаал · S5 — өрөөний тохиргоо · S6 — өрөөнд байрлуулалт (түүх) · S7 — ажлаас гарсан ажилтан · S9 — «Мэдээлэл дутуу» (буруу имэйл / утас) · S11 — гарсан огноо т |
| `core-kernel/test/camp-v023-meal-orders.integration.spec.ts` | 13 | Тохиргоо A — хүлээн авах шаардлагагүй + ALLOW · Cutoff — BLOCK / FREE · Тохиргоо B — хүлээн авах + TWO_SIDED + өөрөө хүлээн авахгүй · Тогтмол загвар + анхдагч тоо |
| `core-kernel/test/core-feedback.integration.spec.ts` | 8 | v0.2.3 Блок F — санал хүсэлт (integration) |
| `core-kernel/test/core-rbac-adr007.integration.spec.ts` | 7 | v0.2.3 Блок 2 — ADR-007 core RBAC (integration) |
| `core-kernel/test/event-bus.integration.spec.ts` | 5 | 🔗 5.2 Гинж: MR → Workflow → Budget → Outbox → Redis · 🔒 5.0 Зэрэгцээ poller — event бүр яг нэг удаа [EVT-001] · ♻️ 5.3 Retry + DLQ |
| `core-kernel/test/feed.integration.spec.ts` | 13 | v0.2.3 Блок 5 — Feed v0 (integration) |
| `core-kernel/test/hr-routes.integration.spec.ts` | 7 | 👥 HR ажилтан, бүтэц — шинэ зам; хуучин зам устсан (QA-12) · 🗓 HR ирц → Кемпийн байрлалт (H-Q2) · 📥 HR импорт / экспорт · 🔒 RLS (app_user) — HR model нэр солигдсон ч DB хүснэгт хэвээр |
| `core-kernel/test/i18n-overrides.integration.spec.ts` | 7 | 🌐 Орчуулгын Excel · 🗣 Хэрэглэгчийн хэл · 🌐 Кемпийн алдаа 3 хэлээр (code + params + message) |
| `core-kernel/test/modules-lite.integration.spec.ts` | 9 | 📦 Inventory-lite · 🏢 Vendor-lite · 📊 Report-lite · 🔒 RLS leakage (app_user) |
| `core-kernel/test/mr-approval.integration.spec.ts` | 16 | POST /requisitions/:id/submit · POST /requisitions/:id/approve · POST /requisitions/:id/reject · Full approval flow · Outbox events |
| `core-kernel/test/mr-crud.integration.spec.ts` | 13 | 📋 POST /api/v1/requisitions — MR үүсгэх · 📋 GET /api/v1/requisitions — жагсаалт · 📋 GET /api/v1/requisitions/:id — дэлгэрэнгүй · 📋 PUT /api/v1/requisitions/:id — засварлах · 📋 DELETE /api/v1/requ |
| `core-kernel/test/mr-workflow-approval.integration.spec.ts` | 14 | 🔐 Эрх [SEC-004] · 🪜 1 алхам (< 1,000,000) · 🪜 2 алхам (≥ 1,000,000): APPROVER quorum 2 → ADMIN · 🗂 Хуучин MR (workflow instance-гүй) · 🔢 MR дугаар [CONC-002] · SEC-005 POST /auth/register |
| `core-kernel/test/rls-app-user.integration.spec.ts` | 5 | 🔒 app_user — tenant хүснэгт бүр (4.8.2) · 🔒 app_user — tenant хоорондын тусгаарлалт (workflow_definitions) |
| `core-kernel/test/rls-leakage.integration.spec.ts` | 7 | 🔒 RLS Tenant Isolation — ХАМГИЙН ЧУХ АЛ ТЕСТ |
| `core-kernel/test/route-probe.integration.spec.ts` | 2 | 🔎 Route probe — path параметртэй route бүр |
| `core-kernel/test/tenant-auth-guard.integration.spec.ts` | 5 | 🔐 TenantAuthGuard — GET /api/v1/auth/me |
| `core-kernel/test/tenant-isolation-http.integration.spec.ts` | 8 | 🧱 MR — tenant тусгаарлалт · 🧱 Workflow definition — tenant тусгаарлалт [SEC-002] + эрх/validation [SEC-003] |

## Unit — core-kernel — 96 файл, ~784 тест

Команд: `pnpm --filter core-kernel test`

| Файл | Тест | describe |
|---|---|---|
| `core-kernel/src/app/app.service.spec.ts` | 4 | AppService |
| `core-kernel/src/auth/auth.controller.spec.ts` | 6 | AuthController.register [SEC-005] · AuthController — төхөөрөмжүүд, нууц үг солих (PIL-15) |
| `core-kernel/src/auth/auth.service.rls.spec.ts` | 2 | AuthService — RLS холболтууд |
| `core-kernel/src/auth/auth.service.spec.ts` | 7 | AuthService |
| `core-kernel/src/auth/invite-token.spec.ts` | 4 | invite-token (v0.2.2 Блок 3) · auth-mail (D-04) |
| `core-kernel/src/auth/invite.service.spec.ts` | 9 | InviteService (v0.2.2 Блок 3) |
| `core-kernel/src/auth/login-identifier.spec.ts` | 4 | login-identifier (v0.2.2 D-13) |
| `core-kernel/src/auth/pilot-auth-config.spec.ts` | 7 | пилотын GoTrue тохиргоо (deploy/pilot/supabase/config.toml) |
| `core-kernel/src/auth/session-revoke.service.spec.ts` | 11 | SessionRevokeService (v0.2.3 Блок 4б, PIL-15) |
| `core-kernel/src/auth/sign-in.service.spec.ts` | 16 | SignInService (v0.2.2 D-10) |
| `core-kernel/src/auth/tenant-auth.guard.spec.ts` | 24 | TenantAuthGuard |
| `core-kernel/src/auth/tenant-cache.service.spec.ts` | 19 | TenantCacheService · TenantCacheService.isMember() · Auth token cache (PERF-003) |
| `core-kernel/src/auth/tenant-rate-limit.guard.test.ts` | 7 | TenantRateLimitGuard |
| `core-kernel/src/cache/tests/cache.service.test.ts` | 2 | CacheService |
| `core-kernel/src/common/i18n/tests/i18n.test.ts` | 5 | parseAcceptLanguage · каталог · t / formatMessage / AppError · AppError helper-ууд (v0.2.0 — Кемпийн алдаа кодтой) |
| `core-kernel/src/common/tests/cursor-pagination.test.ts` | 1 | cursor pagination |
| `core-kernel/src/common/tests/query-bool.test.ts` | 2 | queryBool |
| `core-kernel/src/common/tests/redis-mock-coverage.test.ts` | 3 | Integration Redis mock coverage (TEST-003) |
| `core-kernel/src/common/tests/require-role.helper.test.ts` | 2 | requireRole() |
| `core-kernel/src/common/xlsx/tests/table-spec.test.ts` | 11 | coerceCell · parseTableXlsx · parseTableRows (хүснэгтээр) · buildTemplate / buildExport |
| `core-kernel/src/config/app-version.spec.ts` | 2 | APP_VERSION |
| `core-kernel/src/config/cluster-restart.spec.ts` | 8 | RestartPolicy · resolveRestartPolicyOptions · startClusterPrimary |
| `core-kernel/src/config/deployment-mode.spec.ts` | 10 | parseDeploymentConfig() |
| `core-kernel/src/config/env.config.spec.ts` | 7 | EnvConfig — DEPLOYMENT_MODE · EnvConfig — RATE_LIMIT_* (Phase 3.1) |
| `core-kernel/src/config/env.system-db.spec.ts` | 3 | EnvConfig — SYSTEM_DATABASE_URL (Phase 4.8.4) |
| `core-kernel/src/config/prisma-log.spec.ts` | 4 | resolvePrismaLogLevels (Phase 3.6.6) |
| `core-kernel/src/config/rate-limit.spec.ts` | 4 | parseRateLimitConfig() |
| `core-kernel/src/db/system-prisma.service.spec.ts` | 3 | resolveSystemDatabaseUrl (Phase 4.8.4) |
| `core-kernel/src/gateway/draining.interceptor.spec.ts` | 9 | DrainingInterceptor |
| `core-kernel/src/gateway/dynamic-ingress-router.service.spec.ts` | 10 | DynamicIngressRouterService |
| `core-kernel/src/modules/budget/tests/budget.service.test.ts` | 18 | BudgetService — ledger (MR transaction дотор) · BudgetService — CRUD / эрх · budgetDate() |
| `core-kernel/src/modules/camp/assets/tests/camp-assets.service.test.ts` | 21 | CampAssetsService — ангилал (Шат 4.3) · CampAssetsService — хөрөнгө (Шат 4.3) |
| `core-kernel/src/modules/camp/attendance/tests/attendance-rules.test.ts` | 18 | camp-date · roster — 14 ажил, замын хоног амралтад (Лхагва ирж, Пүрэв явна) · ShiftResolver · Хоолны дүрэм · Presence — D өдрийн суурь тоо (ERD v4 жишээнүүд) |
| `core-kernel/src/modules/camp/attendance/tests/attendance-services.test.ts` | 32 | HrAttendanceService — импорт (Шат 3.3) · HrShiftsService (Шат 3.2) · Өрөөний багтаамж — хоногоор (Шат 3.4) · CampRoomsService (Шат 3.4) · CampPresenceService (Шат 3.5) — DB → тооцоо |
| `core-kernel/src/modules/camp/attendance/tests/presence-golden.test.ts` | 3 | Хоолны тооцоо — golden (§0.6) |
| `core-kernel/src/modules/camp/attendance/tests/presence-v021.test.ts` | 5 | effectiveEmployee · computePresence — v0.2.1 |
| `core-kernel/src/modules/camp/catalog/tests/camp-catalog.service.test.ts` | 4 | v0.2.1 CampCatalogService — байрны төрөл, кемп × албан тушаал |
| `core-kernel/src/modules/camp/common/tests/camp-audit.test.ts` | 6 | auditValue · computeAuditDiff · resolveAuditAction / buildAuditRow · CampAuditService.record/recordMany |
| `core-kernel/src/modules/camp/common/tests/camp-common.test.ts` | 19 | Camp permission каталог (Шат 2.1) · CampAccessService (Шат 2.1) · camp-errors (Шат 2.1) · camp-tx (Шат 2.1) |
| `core-kernel/src/modules/camp/contracts/tests/contract-pricing.test.ts` | 15 | contract-pricing — хугацаа · contract-pricing — үнэ · contract-pricing — ханш · contract-pricing — хоолны тоо (G-3) · contract-pricing — төлбөрийн хуваарь |
| `core-kernel/src/modules/camp/contracts/tests/contract-services.test.ts` | 14 | contract services |
| `core-kernel/src/modules/camp/costs/tests/vat.test.ts` | 2 | VatCalculator (Шат 4.2) |
| `core-kernel/src/modules/camp/maintenance/tests/camp-maintenance.service.test.ts` | 28 | maintenance-flow (Шат 4.4) · CampMaintenanceService — үүсгэх (Шат 4.4) · CampMaintenanceService — төлөв шилжилт (Шат 4.4) · CampMaintenanceService — сэлбэг (Шат 4.4) |
| `core-kernel/src/modules/camp/master/tests/camp-master.services.test.ts` | 28 | CampsService (Шат 2.4) · CampFacilitiesService (Шат 2.4) · CoreOrganizationsService (Шат 2.4) · HrDepartmentsService (Шат 2.4) · HrCrewsService (Шат 2.4) · HrEmployeesService (Шат 2.4) |
| `core-kernel/src/modules/camp/meal-orders/tests/meal-order-policy.test.ts` | 21 | cutoff · decideSubmit — тохиргооны хослол · allowedActions · totals, fill, дубль |
| `core-kernel/src/modules/camp/meal-orders/tests/meal-orders.service.test.ts` | 17 | MealOrdersService (Блок 6а) |
| `core-kernel/src/modules/camp/rbac/tests/camp-rbac.service.test.ts` | 25 | CampRbacService (Шат 2.2) · Эрхийн V1/V2 хүрээ (D8, 2026-10-09) · CampRbacService — v0.2.2 Блок 1 (загвар хэрэгжүүлэх, шууд эрх) |
| `core-kernel/src/modules/camp/rbac/tests/template-diff.test.ts` | 2 | template-diff (v0.2.2 D-09) |
| `core-kernel/src/modules/camp/rbac/tests/user-access-b4.test.ts` | 16 | user-list (цэвэр) · CampRbacService.listUsers (B4-Q3) · CampUserAccessService.setActive (B4-Q2) · SEC-009 (Блок 6б) — хэрэглэгч удирдах = зөвхөн системийн админ (OWNER / ADMIN) |
| `core-kernel/src/modules/camp/settings/tests/camp-settings.service.test.ts` | 12 | CampSettingsService (Шат 2.3) |
| `core-kernel/src/modules/core/feedback/tests/feedback-rules.test.ts` | 5 | v0.2.3 Блок F — санал хүсэлтийн дүрэм |
| `core-kernel/src/modules/core/permissions/tests/permission-registry.test.ts` | 4 | permission-registry (ADR-007) |
| `core-kernel/src/modules/event-bus/cloud-events.adapter.spec.ts` | 6 | CloudEventsAdapter |
| `core-kernel/src/modules/event-bus/dlq.service.spec.ts` | 3 | DlqService |
| `core-kernel/src/modules/event-bus/event-bus.service.spec.ts` | 2 | EventBusService.emit (Phase 5.1 [EVT-003]) |
| `core-kernel/src/modules/event-bus/outbox-poller.service.spec.ts` | 10 | OutboxPollerService |
| `core-kernel/src/modules/feed/tests/feed-rules.test.ts` | 6 | feed-rules — харагдах, засах, устгах, report · feed-rules — cursor, хуудас |
| `core-kernel/src/modules/hr/attendance/tests/import-edits.test.ts` | 6 | applyRowEdits (R4.1) · planWithDeleted (R4.1) |
| `core-kernel/src/modules/hr/attendance/tests/import.test.ts` | 15 | import-parser · import-planner |
| `core-kernel/src/modules/hr/attendance/tests/roster-gaps.test.ts` | 3 | findRosterGaps (R4.2) |
| `core-kernel/src/modules/hr/attendance/tests/shiftchange-parser.test.ts` | 9 | shiftchange-parser — туслах функц · shiftchange-parser — файл |
| `core-kernel/src/modules/hr/attendance/tests/shiftchange-planner.test.ts` | 7 | planImport — Сунах (R-6) · firstOverCapacityNight — сунгалт (R-7) |
| `core-kernel/src/modules/hr/attendance/tests/shiftchange-resolver.test.ts` | 6 | shiftchange-resolver |
| `core-kernel/src/modules/hr/employees/tests/data-issues.test.ts` | 2 | v0.2.3 Блок D (S9) — data-issues |
| `core-kernel/src/modules/hr/employees/tests/employee-code.test.ts` | 6 | nextAutoCode (R7) · HrEmployeesService.create — автомат код (R7) · HrEmployeesService.update — S9 «HR ID хүлээгдэж байна» (R9) |
| `core-kernel/src/modules/hr/employees/tests/employee-names.test.ts` | 3 | v0.2.3 Блок D — employee-names |
| `core-kernel/src/modules/hr/employees/tests/hr-employee-lifecycle.test.ts` | 19 | цэвэр функц · HrEmployeeLifecycleService · HrEmployeesService — ажлаас гарсан бүртгэл (v0.2.2 Блок 5) |
| `core-kernel/src/modules/hr/employees/tests/hr-employees-v021.test.ts` | 5 | v0.2.1 HrEmployeesService — албан тушаал, хоолны байршил, хоол авах |
| `core-kernel/src/modules/hr/org/tests/shift-pattern.test.ts` | 7 | normalizeShiftPattern (Шат 2.4) |
| `core-kernel/src/modules/hr/positions/tests/hr-positions.service.test.ts` | 4 | v0.2.1 каталог — normName / resolvePositionByName · HrPositionsService — албан тушаалын каталог (v0.2.1 C-01 → v0.2.2 H1) |
| `core-kernel/src/modules/inventory/tests/inventory.service.test.ts` | 9 | InventoryService |
| `core-kernel/src/modules/material-requisition/tests/material-requisition.find-all.test.ts` | 3 | MaterialRequisitionService.findAll (cursor) |
| `core-kernel/src/modules/material-requisition/tests/mr-approval.test.ts` | 8 | normalizeSteps · approvalDenial [SEC-004] · quorumReached · summarizeWorkflow |
| `core-kernel/src/modules/material-requisition/tests/mr-number.test.ts` | 2 | generateMrNumber [CONC-002] |
| `core-kernel/src/modules/mr-lifecycle/mr-lifecycle.service.test.ts` | 3 | MrLifecycleService (Phase 4.0) |
| `core-kernel/src/modules/report/tests/report.service.test.ts` | 3 | ReportService (Phase 4.4) |
| `core-kernel/src/modules/tenant-admin/tenant-onboarding.service.spec.ts` | 6 | TenantOnboardingService |
| `core-kernel/src/modules/vendor/tests/vendor.service.test.ts` | 3 | VendorService (Phase 4.3) |
| `core-kernel/src/modules/workflow/amount-router.service.test.ts` | 5 | AmountRouterService |
| `core-kernel/src/modules/workflow/approval-sla.service.test.ts` | 1 | ApprovalSlaService |
| `core-kernel/src/modules/workflow/delegation.service.test.ts` | 4 | DelegationService |
| `core-kernel/src/modules/workflow/escalation.scheduler.test.ts` | 4 | EscalationScheduler |
| `core-kernel/src/modules/workflow/idempotency.service.spec.ts` | 4 | IdempotencyService |
| `core-kernel/src/modules/workflow/pessimistic-lock.service.spec.ts` | 5 | PessimisticLockService |
| `core-kernel/src/modules/workflow/workflow-definition.dto.test.ts` | 4 | stepsConfigError · WorkflowDefinitionDto |
| `core-kernel/src/modules/workflow/workflow-definition.service.test.ts` | 4 | WorkflowDefinitionService |
| `core-kernel/src/modules/workflow/workflow.service.spec.ts` | 13 | WorkflowService |
| `core-kernel/src/scripts/camp-login-report.spec.ts` | 1 | camp-login-report (v0.2.2 §8) |
| `core-kernel/src/scripts/camp-snapshot-perms.spec.ts` | 8 | camp-snapshot perms (v0.2.2 §5.1/5.2) · camp-snapshot perms — ADR-007 (v0.2.3): хуучин код ↔ шинэ код |
| `core-kernel/src/scripts/e2e-fixture.spec.ts` | 4 | setupFixture · teardownFixture |
| `core-kernel/src/scripts/pilot-admin.spec.ts` | 7 | validate* · onboard · ensureUser |
| `core-kernel/src/scripts/test-user.spec.ts` | 9 | ensureTestUser · assertLocalUrl · parseDotenv / parseArgs |
| `core-kernel/src/storage/tests/image-processor.responsive.test.ts` | 7 | ImageProcessorService.processResponsive |
| `core-kernel/src/storage/tests/image-processor.service.test.ts` | 9 | ImageProcessorService |
| `core-kernel/src/storage/tests/local-disk.storage.test.ts` | 7 | LocalDiskStorage · contentTypeOf |
| `core-kernel/src/storage/tests/media.test.ts` | 11 | MediaUrlSigner — гарын үсэгтэй зургийн URL · parseVariants / pickVariant / mediaImageDto · MediaService — хадгалах / устгах (LocalDiskStorage, бодит sharp) · storageDir |

## Unit — web-shell — 35 файл, ~171 тест

Команд: `pnpm --filter web-shell test`

| Файл | Тест | describe |
|---|---|---|
| `web-shell/src/i18n/tests/i18n.test.ts` | 5 | орчуулгын каталог · i18n ажиллагаа |
| `web-shell/src/lib/tests/access.test.ts` | 5 | access (PIL-19, ADR-007 B3-3) |
| `web-shell/src/lib/tests/devices.test.ts` | 5 | describeUserAgent · deviceTitle · sortDevices / otherDevices |
| `web-shell/src/lib/tests/home.test.ts` | 3 | M-0 — нэвтэрсний дараах зам (v0.2.3 Блок 5) |
| `web-shell/src/lib/tests/modules.test.ts` | 8 | parseModules · homePath · resolveSupabaseUrl |
| `web-shell/src/lib/tests/mr-approval.test.ts` | 8 | approvalState [SEC-004] — backend approvalDenial-тэй ижил · stepViews |
| `web-shell/src/lib/tests/multipart.test.ts` | 1 | multipart (TEST-009) |
| `web-shell/src/lib/tests/password-change.test.ts` | 4 | password-change (v0.2.2 D-06) · displayLogin |
| `web-shell/src/lib/tests/unauthorized.test.ts` | 4 | handleUnauthorized [FE-007] · isSessionRevoked (v0.2.2 Блок 6б, №3) |
| `web-shell/src/modules/camp/lib/tests/camp-lib.test.ts` | 11 | shift-pattern · permissions · apiErrorMessage · dates |
| `web-shell/src/modules/camp/lib/tests/camp-maint-lib.test.ts` | 8 | formatMoney (string → float-гүй) · maintenance.availableActions (backend maintenance-flow-тэй ижил) · permissions.canInAnyCamp |
| `web-shell/src/modules/camp/lib/tests/camp-ops-lib.test.ts` | 8 | calendar.cellKind (ростер 14+14: 0 = ирэх, 15 = явах) · calendar.rangeProblem · presence.pivotPresence · meals.mealsPayload |
| `web-shell/src/modules/camp/lib/tests/camp-v021-lib.test.ts` | 4 | v0.2.1 filterStays (C-14) · v0.2.1 хөрөнгийн байршил (C-12) · v0.2.1 inherited (Q1): албан тушаал(кемп) ?? кемпийн анхдагч |
| `web-shell/src/modules/camp/lib/tests/contract.test.ts` | 4 | contract helpers |
| `web-shell/src/modules/camp/lib/tests/granted.test.ts` | 2 | granted (PIL-18) |
| `web-shell/src/modules/camp/lib/tests/grid.test.ts` | 5 | grid (хүснэгтээр оруулах) · room-range (FB-07) |
| `web-shell/src/modules/camp/lib/tests/last-camp.test.ts` | 3 | last-camp (FB-11) |
| `web-shell/src/modules/camp/lib/tests/meal-order.test.ts` | 3 | meal-order grid |
| `web-shell/src/modules/camp/lib/tests/permission-label.test.ts` | 3 | permissionLabel |
| `web-shell/src/modules/feed/components/tests/feed-components.test.tsx` | 10 | FeedImage · FeedImageGrid · ImagePicker · ReportDialog · RevisionsDialog · Feed i18n (packages/i18n каталог — v0.2.3 Блок 5) |
| `web-shell/src/modules/feed/lib/tests/data-saver.test.ts` | 2 | readDataSaver |
| `web-shell/src/modules/feed/lib/tests/feed.test.ts` | 5 | feed lib — кэш шинэчлэл · feed lib — цаг, урт текст |
| `web-shell/src/modules/feedback/tests/feedback-api.test.ts` | 2 | feedback attachments API |
| `web-shell/src/modules/feedback/tests/feedback-components.test.tsx` | 2 | FeedbackAttachments |
| `web-shell/src/modules/feedback/tests/feedback-lib.test.ts` | 4 | feedback lib |
| `web-shell/src/modules/hr/lib/tests/employee-form.test.ts` | 3 | employee-form (R8) |
| `web-shell/src/modules/hr/lib/tests/hr-sections.test.ts` | 4 | hr-sections |
| `web-shell/src/modules/hr/lib/tests/import-preview.test.ts` | 5 | previewBadges · rosterGapTotals · i18n түлхүүр |
| `web-shell/src/modules/hr/lib/tests/import-rows.test.ts` | 8 | filterRows / filterCounts · эх мөр · buildEdits / deleteErrorRowsEdits · R9 — шинэ ажилтан бүртгэх |
| `web-shell/src/modules/hr/lib/tests/phones.test.ts` | 1 | phones (v0.2.3 Блок D) |
| `web-shell/src/modules/hr/lib/tests/termination.test.ts` | 8 | terminationFormError · lifecycleActions · terminationEffects · орчуулга (mn/en/zh) |
| `web-shell/src/modules/hr/lib/tests/user-access.test.ts` | 6 | inviteLink · loginName · userState · permissionView |
| `web-shell/src/modules/inventory/lib/tests/quantity.test.ts` | 5 | inventory quantity (numeric(15,3), float-гүй) |
| `web-shell/src/modules/report/lib/tests/report.test.ts` | 5 | report lib |
| `web-shell/src/release-notes/tests/release-notes.test.ts` | 7 | release notes — функц · release notes — өгөгдөл (notes.ts) |

## E2E (Playwright) — 18 файл, ~85 тест

Команд: `pnpm test:e2e`

| Файл | Тест | describe |
|---|---|---|
| `e2e/tests/advanced-workflow.spec.ts` | 5 |  |
| `e2e/tests/auth-session.spec.ts` | 3 |  |
| `e2e/tests/auth.spec.ts` | 4 |  |
| `e2e/tests/camp-assets.spec.ts` | 7 |  |
| `e2e/tests/camp-ops.spec.ts` | 7 |  |
| `e2e/tests/camp-v020.spec.ts` | 8 |  |
| `e2e/tests/camp-v021.spec.ts` | 7 |  |
| `e2e/tests/camp-v022-terminate.spec.ts` | 5 |  |
| `e2e/tests/camp-v022-users.spec.ts` | 5 |  |
| `e2e/tests/camp-v023-shiftchange.spec.ts` | 5 |  |
| `e2e/tests/camp.spec.ts` | 6 |  |
| `e2e/tests/core-v023-access.spec.ts` | 3 |  |
| `e2e/tests/core-v023-feed.spec.ts` | 1 |  |
| `e2e/tests/core-v023-feedback.spec.ts` | 1 |  |
| `e2e/tests/modules-lite.spec.ts` | 8 |  |
| `e2e/tests/multi-tenant.spec.ts` | 5 |  |
| `e2e/tests/requisition-flow.spec.ts` | 3 |  |
| `e2e/tests/workflow-multistep.spec.ts` | 2 |  |
