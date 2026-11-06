---
title: "Frontend зураглал (web-shell)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-06
tags: [codebase, frontend, camp, i18n]
---

# Frontend зураглал (web-shell)

> Эх: `apps/web-shell/src/`. Route → хуудас: [[09_Frontend_Routes]] (автомат). Backend endpoint: [[02_API_Catalog]]. Эхлэх цэг: [[00_Codebase_Map]].
> Стек: React 18 · Vite 6 · TanStack Query v5 (+ react-virtual) · axios · react-router 6 · react-i18next · Tailwind 3 · Supabase JS (session) · Module Federation (`@module-federation/vite`). Шинэ UI сан нэмэхгүй — Tailwind (gray/blue) хэв маяг.

## 1. Бүтэц

| Хавтас | Юу |
|---|---|
| `App.tsx` | Route мод: нийтийн (`/login`, `/invite/:token`, `/reset/:token`, `/forgot` — үндсэн chunk-д) → `ProtectedRoute` → `Layout` → модулиуд (`isEnabled(...)`). Нэвтэрсний дараах хуудас / модуль бүр `React.lazy` (PIL-10) |
| `api/` | `client.ts` — axios (`VITE_API_BASE_URL` хоосон бол same-origin → Vite proxy, RULE-19; токен, хэл, 401 болон 403 `auth.not_member` / `camp.err.access.1` (`isSessionRevoked` — AUTH-004) → `lib/unauthorized.ts`, нууц үг солих → `lib/password-change.ts`) · `auth.ts` (server sign-in, урилга, нууц үг) · `me.ts` · `requisitions.ts` · `workflow.ts` · `i18n.ts` |
| `components/` | `Layout`, `ProtectedRoute`, `PageSuspense` (lazy хуудасны `Suspense` — `Layout`, `CampLayout`, `HrLayout`-ийн `<Outlet />`-ийг ороосон), `LanguageSwitcher`, `StatusBadge`, `RejectModal`, `ErrorMessage`, `LoadingSpinner`, `MfeDisabled` |
| `hooks/` | `useAuth`, `useMe`, `useMR`, `useMRRealtime` (Supabase Realtime — амжилтгүй бол чимээгүй), `useI18nSync` |
| `lib/` | `access.ts` (v0.2.3 Блок 3, PIL-19 — цэс/хэсэг/ажлын байр харагдах дүрмийн ганц эх сурвалж, [[ADR-007_System_Roles_Permissions]] §6б) · `supabase.ts` (session; пилотод same-origin `/auth/v1`) · `modules.ts` (`APP_MODULES`, `VITE_MODULES` задлах, `MODULE_REQUIRES` — `camp` → `hr`, нүүр зам) · `roles.ts` (core role, `canWrite` = OWNER/ADMIN) · `mr-approval.ts` · (Кемп) `modules/camp/lib/permissions.ts` — `isSystemAdmin(perms)`: хэрэглэгч / роль удирдах UI зөвхөн OWNER / ADMIN (SEC-009), `RETIRED_PERMISSIONS` (`camp.roles.manage` матрицад харагдахгүй) |
| `config/enabled-modules.ts` | `ENABLED_MODULES`, `HOME_PATH`, `isEnabled()` |
| `pages/` | MR (`MRList/Create/DetailPage`), workflow админ (`ApprovalSla`, `WorkflowDefinition`, `Delegation`), auth (`Login`, `SetPassword`, `ForgotPassword`, `ChangePassword`), `DevicesPage` (`/account/devices` — нэвтэрсэн төхөөрөмжүүд харах / гаргах; `api/sessions.ts`, `lib/devices.ts`, v0.2.3 Блок 4б) |
| `modules/<name>/` | Модуль бүр өөрийн `api`, хуудас, `lib` — §2–§3 |
| `i18n/index.ts` | i18next тохиргоо — §4 |
| `test/setup.ts` | vitest setup (тест: [[07_Test_Map]]) |

## 2. Кемп модуль (`modules/camp/`)

- `CampRoutes.tsx` — `/camp/*` доторх route (харьцангуй зам; v0.2.2 H2: хуучин ажилтан/ирц/ээлж/хэлтэс/бригад хаяг → `/hr`, `LegacyHrRedirect`) · `components/CampLayout.tsx` — кемп сонголт, цэс (өрөө, хоол, засвар, хөрөнгө, тохиргоо; анхдагч `rooms`).
- `api/camp-api.ts` — **`campApi` объект** (Кемп + эрх/роль; байгууллага → `/core/organizations`, албан тушаал → `/hr/positions` (`CATALOG_BASE`); HR endpoint → `hrApi` §2б) + `api/types.ts` (backend DTO-тай **ТАМ АДИЛ** нэр — RULE-20).
- `hooks/useCampPermissions.ts` — `campKeys` (query key-ийн ганц эх сурвалж — HR ч ашиглана) + `me/permissions` → товч/цэс нуух · `hooks/useCampMutation.ts` — mutation + холбогдох query-г invalidate, алдааг `ErrorBox`-оор.
- `components/` — `ui.tsx` (`Button`, `PageHeader`, `Card`, `Field`, `Badge`, `Loading`, `Empty`, `ErrorBox`, `Modal`, `Table`, `ActiveBadge`, `NoAccess` — шинэ хуудсанд эдгээрийг ашигла), `ImportDialog` (Excel импорт preview → confirm; мөрийн шар анхааруулга `warnings` — v0.2.3 S9), `EmployeePicker`, `ShiftPattern`.
- `pages/` — `CampHomePage`, `SystemSettingsPage` (`/camp/system/:section` — «Кемпийн тохиргоо»: кемп, байрны төрөл, хөрөнгийн ангилал; v0.2.3 Блок 3: байгууллага, роль, хэрэглэгчийн роль, орчуулга → `/settings`), мастер (`Facilities`, `Organizations`, `Catalog` — HR албан тушаалд ч, `PositionSettings` — албан тушаалын хоол/ээлж), ажиллагаа (`Presence`, `RoomBoard`), хөрөнгө (`AssetCategories`, `Assets`), засвар (`MaintenanceList/Detail`), `CampSettings`, `Roles` (эрхийн нэр `permissionLabel` — `perm.<code>`), `UserRoles`, `Translations`.
- `lib/` — цэвэр функц (unit тесттэй, `lib/tests`): `permissions` (+ `permissionLabel`), `dates`, `calendar`, `stays`, `presence`, `meals`, `money`, `room-range` (backend `room-range.ts`-тэй ИЖИЛ дүрэм), `shift-pattern`, `maintenance`, `permissions`, `errors` (`apiErrorMessage`), `labels`, `grid`, `download`, `last-camp`, `effective`, `asset-location`.

## 2б. Хүний нөөц (`modules/hr/`, v0.2.2 H2 — [[ADR-006_HR_Core_Module]] §5.1)

- `HrRoutes.tsx` — `/hr` (сүүлийн / ганц ажлын байр → шууд, эс бөгөөс жагсаалт), `/hr/positions`, `/hr/:campId/{employees,employees/:employeeId,departments,crews,shifts,attendance,import,positions,users}`. `campId` = «үндсэн ажлын байр» (одоогоор кемп).
- `components/HrLayout.tsx` — ажлын байр сонгогч (солиход ижил хэсэгт үлдэнэ) + цэс · `components/LegacyHrRedirect.tsx` — Кемпийн хуучин хаяг → HR.
- `api/hr-api.ts` — **`hrApi`** (`/api/v1/hr/sites/:campId/...`): хэлтэс, бригад, ажилтан, ирц (`movements`, `movement-imports`), ээлж (`shift-calendar`, `shift-adjustments`), мастер импорт/экспорт (`data-imports`, `export/:type` — `rooms` ч), `dataImports` түүх, `updateImportRows` (R4.1 PATCH мөр засах / устгах). Query/Input type (`EmployeeQuery`, `MovementQuery`, `EmployeeInput`). DTO type `camp/api/types.ts`-д (RULE-20).
- `pages/` — `Employees` (v0.2.3 R8: нэмэх цонхонд «Код автоматаар олгох (HR ID-гүй)» — гэрээт байгууллагад анхдагчаар, `employeeCode` илгээхгүй → backend `Z0001` (R7), олгосон кодыг мэдэгдлээр; жагсаалтад байгууллагаар шүүх — `lib/employee-form.ts`; засах цонхонд овог/нэр/ургийн овог, нэмэлт утас — v0.2.3; `EmployeeAccess`; нэр → профайл; «Мэдээлэл дутуу» шүүлт + шар тэмдэг (S9); «Ажлаас гарсан» шүүлт, гарсан мөрийг засах/сонгохгүй), `EmployeeProfile` (Блок 5: мэдээлэл, ирц, өрөө, түүх, «Хэн үзсэн» табууд; «Мэдээлэл дутуу» хайрцаг (S9); «Ажлаас гаргах» / «Дахин ажилд авах» цонх — `camp.employee.terminate`; профайл нээх = PII лог тул `refetchOnWindowFocus: false`), `Departments`, `Crews`, `Shifts`, `Attendance` (Кемпээс зөөсөн; «Ирц» нь Кемпийн `stays`-ыг харуулна; импортын PREVIEW-ийн дээд хэсэг → `components/ImportPreviewHeader.tsx` — загвар, сунгалт / анхааруулга / устгасан, алгассан хуудас, ростерын зөрүү `rosterGaps` — v0.2.3 Блок R4.3; хүснэгт + шүүлт, засварлах горим (мөр бүрт ажилтан сонгох / устгах → `hrApi.updateImportRows`), «Алдаатай бүх мөрийг устгах», «Сэргээх» → `components/ImportRowsTable.tsx` — R4.4–R4.6; R9: засварын горимд «Шинэ ажилтан бүртгэх» — байгууллага / хэлтэс / баг (файлын «Хэлтэс», «Shift»-ээр урьдчилан, «Бүх шинэ мөрөнд хэрэглэх»), `camp.employee.manage` эрхтэйд), `HrHomePage`, `HrImportPage` (v0.2.3 Блок D: 2 бүлэг — Хүний нөөц / Өрөөний тохиргоо, дарааллын дугаартай; түүхэнд төрөл `hr.import.kind.*`), `HrUsersPage` (Блок 4), `HrPositionsPage` (`CatalogPage` + `rowAction` «Эрхийн загвар»).
- `components/` (Блок 4) — `EmployeeAccess` (нэвтрэх эрх үүсгэх), `InviteActions` (линк / имэйл), `UserPermissionsModal` (загвар/шууд эрх), `PositionTemplatesModal`. API — `campApi` (`users`, `setUserActive`, `createEmployeeUser`, `inviteUser`, `inviteOptions`, `userPermissions`, `grantDirect`, `revokeDirect`, `positionTemplates`, `setPositionTemplates`, `applyPositionTemplates`).
- `lib/` — `hr-sections` (хэсэг, зам, хуучин хаягийн зураглал), `user-access` (урилгын линк, нэвтрэх нэр, төлөв, шүүлт, эрхийн бүлэглэл), `import-columns` (импортын багана: ажилтан, гарсан ажилтан, хэлтэс, албан тушаал, байрны төрөл, байр, өрөө, байрлуулалт — v0.2.3 Блок D), `phones` (нэмэлт утас задлах), `termination` (Блок 5: маягтын шалгалт, товч, үр дагаврын мөр), `import-rows` (R4.4–R4.6: шүүлт, эх мөр, засварын payload), `import-preview` (R4.3: PREVIEW badge, алгассан хуудасны шалтгааны түлхүүр, ростерын зөрүүний нийлбэр); тест `lib/tests`. API `hrApi.{employeeProfile,piiViews,terminateEmployee,rehireEmployee}`, query key `campKeys.{employeeProfile,piiViews}` (`employees`-ийн доор).
- **Хамаарал:** `ui.tsx`, `useCampMutation`, `campKeys`, `ImportDialog`, `EmployeePicker`, `ShiftPattern`, `CatalogPage`, `camp/lib/*` — Кемпээс import (shared руу салгах — QA-10, v0.3). Шинэ HR хуудас: `hrApi` → `campKeys` → `HrRoutes` + `HR_SECTIONS` → `hr.section.*` i18n.

## 3. Бусад модуль
- `modules/settings/SettingsPage.tsx` (v0.2.3 Блок 3, B3-2) — «Системийн тохиргоо» `/settings/:section` (Кемп модулийн `RolesPage`, `UserRolesPage`, `OrganizationsPage`, `TranslationsPage`-ийг ашиглана). `components/ModuleGate.tsx` — `ModuleGate` (`/hr`, `/camp` эрхгүй → «эрх алга»), `HomeRedirect` («/» → эрхтэй эхний модуль). `camp/lib/granted.ts` — олгосон роль / шууд эрх (PIL-18).
- `modules/feedback/` (v0.2.3 Блок F) — `FeedbackPage` (`/feedback`: жагсаалт, шүүлтүүр, «+1», илгээх/засах, админ «Төлөв / хариу», Excel), `WhatsNewPage` (`/whats-new`: хувилбар бүрийн тэмдэглэл + тухайн хувилбарт хэрэгжсэн санал), `api.ts` (`feedbackApi`, DTO = backend — RULE-20), `lib.ts` (+ `tests`). Модулиас (`VITE_MODULES`) үл хамаарна. `Layout`: цэс «Санал хүсэлт», «Шинэчлэлийн түүх» (+ «Шинэ» тэмдэг — `localStorage` `s-project.whats-new.seen`), хуудас бүрийн баруун доод «Санал илгээх» товч (`/feedback`, state `{ compose, from }`).
- `release-notes/` — **`notes.ts`** (хэрэглэгчид зориулсан шинэчлэлийн тэмдэглэл, монгол + 中文; release бүрт ЭХЭНД нэмж `date` бөглөнө — [[pilot-test-guide]] «Release»), `release-notes.ts` (цэвэр функц: эрэмбэ, сүүлийн хувилбар, «Шинэ» тэмдэг), тест `tests/` (өгөгдлийн бүрэн бүтэн байдал ч).
- `modules/inventory/`, `modules/vendor/`, `modules/report/` — `api.ts` + нэг хуудас (`VITE_MODULES`-д `inventory`, `vendors`, `reports`).
- MR — `pages/MR*` + `hooks/useMR*`; MFE remote — `apps/mfe-requisitions` (`/mfe/*`, `MfeDisabled` fallback).

## 4. Олон хэл (i18n)
- Анхдагч орчуулга: `packages/i18n/web.{mn,en,zh}.json` (**хавтгай түлхүүр**, хувьсагч `{name}` — backend-тэй ижил). Түлхүүрийн тоо: [[09_Frontend_Routes]] → Орчуулгын файлууд.
- Байгууллагын засвар: `GET /api/v1/i18n/web/:lang` (≤60с cache) → `applyOverrides` (засах UI: `TranslationsPage`).
- Хэлний сонголт: профайл (`core_users.locale`) → төхөөрөмж (localStorage) → **монгол**.
- Шинэ текст: гурван json-д хамт нэм (mn заавал; en/zh ноорог байж болно — [[i18n-review]]). Backend мессеж — `common/i18n/messages.ts`.

## 5. Модуль асаах ба build
- `VITE_MODULES` (`all` | `camp` | таслалаар) — цэс/route/нүүр зам (`lib/modules.ts`). Пилот = `camp`. Бусад `VITE_*`: [[06_Config_Env]].
- Dev: `:5173`, `/api` → `:3000` proxy. Build → nginx (docker) эсвэл пилотын Caddy (static).
- **Code-split (v0.2.2 Блок 6, PIL-10):** `CampRoutes` / `HrRoutes` доторх хуудас бүр `lazy(() => import('./pages/X'))`; `vite.config.ts` `manualChunks` → `vendor-supabase`, `vendor-router`, `vendor-i18n`, `vendor-axios` (react / react-query-г federation `shared`). `main.tsx`: `vite:preloadError` → хуудсыг 60 сек-д нэг удаа дахин ачаална (шинэ хувилбарын дараах хуучин chunk). Хэмжээ: [[08_v0.2.2_progress]] «Блок 6».

## 6. Шинэ хуудас нэмэх (товч)
1. Backend DTO-г шалга ([[02_API_Catalog]] → service → `*.dto.ts`) → `api/types.ts`-д ижил нэртэй type (RULE-20).
2. `campApi`-д функц → query key-г `campKeys`-д → `useQuery` / `useCampMutation`.
3. Хуудас `pages/` → route `CampRoutes.tsx` (`const X = lazy(() => import('./pages/X'))` — хуудсаас тогтмол/функц import хийхгүй, үгүй бол үндсэн chunk-д орно; хуваалцах зүйл → `lib/`) → цэс `CampLayout.tsx` (эрхээр нуух — `useCampPermissions`). HR бол `modules/hr` → `HrRoutes.tsx` + `hr-sections.ts` (§2б).
4. Текст → `packages/i18n/web.*.json`. Цэвэр логик → `lib/` + unit тест.
5. `pnpm docs:gen` (route каталог) · энэ файлыг шинэчил (RULE-21).
