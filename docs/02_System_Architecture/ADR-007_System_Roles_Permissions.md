---
title: "ADR-007 — Роль, эрх системийн түвшинд (core RBAC)"
type: "Architecture"
status: "Active"
last_updated: 2026-11-06
tags: [auth, rbac, v0.2.3]
---

# ADR-007 — Роль, эрх системийн түвшинд (core RBAC)

> Төлөв: **Батлагдсан — 2026-11-06** (Q-R1…R3: 2026-10-19, B2-1…B2-6, B3-1…B3-4: 2026-11-06) · Хэрэгжүүлэлт: v0.2.3 Блок 2 (DB + data layer), Блок 3 (guard, UI) · Ажлын ID: PIL-13
> Холбоотой: [[ADR-003_Users_Login_Permissions]] (эцсийн эрх, загвар) · [[ADR-006_HR_Core_Module]] · [[09_v0.2.3_tech_plan]] Блок 2–3 · [[11_v0.2_completion_master_plan]] §3 (ADR-008 «ажлын байр»)

## 1. Нөхцөл

v0.2.2 хүртэл роль, эрх Кемп модулийн хүснэгтүүдэд байсан (`camp_permissions`, `camp_roles`, `camp_role_permissions`, `camp_user_roles`, `camp_user_permissions`, `camp_position_role_templates`). HR модуль ([[ADR-006_HR_Core_Module]]) тусгаарлагдсаны дараа ажилтан, ирц, ээлжийн эрх `camp.*` нэртэй үлдсэн; цаашид Feed, хоолны захиалга, гэрээ зэрэг олон модуль нэмэгдэнэ. Эрх нь **системийн** ойлголт байх ёстой — модуль бүр өөрийн роль/эрхийн хүснэгт үүсгэхгүй.

## 2. Шийдвэр

| # | Шийдвэр |
|---|---|
| **Q-R1** | Роль = tenant-ийн (`core_roles`). **Олголт** хүрээтэй: `TENANT` (бүх ажлын байр) эсвэл `SITE` (нэг ажлын байр — одоогоор кемп). |
| **Q-R2** | Эрхийн код `<модуль>.<объект>.<үйлдэл>`: `hr.*`, `camp.*`, (нөөц) `core.*`. Хуучин код migration-д mapping-аар солигдож, **нэг хувилбар** alias-аар уншигдана. |
| **Q-R3** | Хэрэглэгч, роль, эрх удирдах = **зөвхөн системийн роль OWNER / ADMIN** (SEC-009). `camp.roles.manage` устгагдана. |
| **B2-1** | Хуучин хүснэгтүүдийг энэ хувилбарт **устгахгүй**: migration-ийн өмнөх төлвийг `legacy_camp_*` хөлдөөсөн хуулбар болгоно (зөвхөн SELECT). v0.2.4-т устгана. |
| **B2-2** | Блок 2 = DB + **data layer** (эрх тооцох, роль/олголтын service) `core_*` руу. Guard/декоратор, «Роль ба эрх» UI, цэс нуух — Блок 3. |
| **B2-3** | Кодын mapping — §3. Бусад 13 код `camp.*` хэвээр. |
| **B2-4** | `core.users.*` / `core.roles.*` эрхийн код **үүсгэхгүй** — нөөц нэр. Систем удирдлага = `core_users.role` (OWNER / ADMIN). |
| **B2-5** | `core_roles.system_code` = **TEXT** (enum биш, G-1). Олголтын багана `site_id` (одоо `camps`-ийн FK), `scope_type` = `TENANT` \| `SITE` (generated). ADR-008-д `site_id` нь «ажлын байр» хүснэгт рүү шилжинэ. |
| **B2-6** | Alias: v0.2.3 хуучин кодыг (API оролт, `me/permissions` гаралт) таньж хөрвүүлнэ; **v0.2.4-т устгана**. |

## 3. Кодын нэрлэлт ба mapping

| Хуучин (≤ v0.2.2) | Шинэ (v0.2.3) | Модуль |
|---|---|---|
| `camp.employee.manage` | `hr.employee.manage` | hr |
| `camp.employee.terminate` | `hr.employee.terminate` | hr |
| `camp.movement.import` | `hr.attendance.import` | hr |
| `camp.shift.adjust` | `hr.shift.adjust` | hr |
| `camp.roles.manage` | — (**устгасан**, юу ч зөвшөөрдөггүй байсан — SEC-009) | — |
| бусад `camp.*` (13) | өөрчлөгдөхгүй | camp |

Дүрэм: код `^(camp|hr|core)\.[a-z_]+\.[a-z_]+$`, `core_permissions.module` = кодын эхний хэсэг. Шинэ эрх: (1) migration-д `INSERT INTO core_permissions`, (2) `core/permissions/permission-registry.ts`, (3) хэрэгтэй бол `core_seed_default_roles` → `pnpm docs:gen`.

## 4. Өгөгдлийн загвар

| Хүснэгт (v0.2.3) | Өмнөх | Тайлбар |
|---|---|---|
| `core_permissions` | `camp_permissions` | глобал каталог (tenant-гүй, app_user: SELECT). + `module`, `available_in` (`v1`/`v2`) |
| `core_permission_aliases` | — | `old_code → new_code` (глобал, SELECT). v0.2.4-т устгана |
| `core_roles` | `camp_roles` | `system_code TEXT` (`CAMP_ADMIN`, `CAMP_MANAGER`, `CATERING_ADMIN`, `EMPLOYEE`) |
| `core_role_permissions` | `camp_role_permissions` | роль ↔ эрх |
| `core_user_roles` | `camp_user_roles` | олголт: `site_id` (NULL = tenant даяар), `scope_type` (generated), `source_position_id` |
| `core_user_permissions` | `camp_user_permissions` | **эцсийн эрх** (guard зөвхөн үүнийг уншина, ADR-003 D-01); `site_id`, `scope_type` |
| `core_position_role_templates` | `camp_position_role_templates` | албан тушаал → роль-загвар |
| `legacy_camp_*` (6) | — | migration-ийн өмнөх хөлдөөсөн хуулбар, зөвхөн SELECT, v0.2.4-т устгана |

Функц / trigger: `core_roles_protect_system`, `core_user_roles_apply_template`, `core_seed_default_roles(tenant)`, `core_tenants_after_insert` (`trg_tenants_core_seed_roles`); `camp_employees_sync_position_roles` (HR хүснэгт дээр, нэр хэвээр) шинэ хүснэгтийг бичнэ. Хуучин `camp_seed_default_roles`, `camp_roles_protect_system`, `camp_user_roles_apply_template`, `camp_tenants_after_insert` устгагдсан. Trigger-ийн алдааны угтвар `CAMP_SYSTEM_ROLE` хэвээр (API 409 mapping).

Enum `CampPermissionSource`, `CampTemplateScope` (утга `ALL_CAMPS` / `EMPLOYEE_CAMP`) нэр, утгаараа хэвээр — API/DTO-д ил (R20); ADR-008-ийн «ажлын байр»-тай хамт шинэчилнэ. `CampRoleCode` enum зөвхөн `legacy_camp_roles`-д үлдэнэ.

## 5. Шилжилт (migration `20261106005_core_rbac_adr007.sql`)

1. `legacy_camp_*` хуулбар (өмнөх төлөв, хуучин кодтой).
2. Хүснэгт **байранд нь нэрлэх** (`camp_*` → `core_*`): ID, FK, RLS, хамаарал хэвээр — өгөгдөл хуулахгүй, эрх алдах эрсдэлгүй. Constraint / index / policy / trigger-ийн нэрийг `core_*` болгоно; `camp_id` → `site_id`.
3. Код mapping (§3): шинэ код нэмэх → `core_role_permissions` / `core_user_permissions`-д солих → хуучин код устгах; `camp.roles.manage`-ийн мөр устана.
4. `system_code` → TEXT; функц, trigger шинэчлэх.
5. **Шалгалт migration дотор:** legacy ↔ core мөрийн тоо (`camp.roles.manage`-ээс бусад) таарахгүй бол `RAISE EXCEPTION` → migration бүхэлдээ буцна.
6. A = B: `pnpm camp:snapshot` (A — v0.2.2, B — v0.2.3). Харьцуулалт хоёр талын кодыг alias-аар хөрвүүлж, устгасан кодыг хасна; бусад ямар ч зөрүү = алдаа.

Redis-ийн эрхийн cache-ийн түлхүүр солигдсон (`perms2`) → шинэчлэлийн дараа хуучин кодтой cache уншигдахгүй (AUTH-004, CACHE-001).

## 6. Alias (нэг хувилбар — v0.2.3)

- API оролт (`PUT roles/:id/permissions`, `POST users/:id/permissions`): хуучин код → шинэ код руу хөрвөнө; устгасан код → `400`.
- `GET me/permissions`: шинэ кодын хажууд хуучин alias кодыг **нэмж** буцаана (Блок 3-аас өмнөх frontend, e2e эвдрэхгүй).
- `GET permissions` (каталог): зөвхөн шинэ код.
- v0.2.4: alias хүснэгт, кодын alias, `legacy_camp_*` устгана (backlog).

## 6б. API ба UI (v0.2.3 Блок 3 — B3-1…B3-4, 2026-11-06)

| # | Шийдвэр |
|---|---|
| **B3-1** | RBAC API → **`/api/v1/core/rbac/*`** (`CoreRbacController`). Хуучин `/api/v1/camp/{permissions,me/permissions,users,roles,user-roles,user-permissions,positions/:id/role-templates,invites}` — `CampRbacLegacyController` (өвлөсөн, `Deprecation: true`), v0.2.4-т устгана. Ажилтны картаас нэвтрэх эрх (`camp/camps/:campId/employees/:id/{user,position-preview,create-user}`) `/camp`-д үлдсэн. Service `camp/rbac`-д (ARC-01 — v0.3). |
| **B3-2** | UI: **«Системийн тохиргоо»** `/settings/:section` (дээд цэс) — роль ба эрх, хэрэглэгчийн роль, байгууллага, орчуулга. `/camp/system` = **«Кемпийн тохиргоо»** (кемп, байрны төрөл, хөрөнгийн ангилал); хуучин хаяг → redirect. |
| **B3-3** | Цэс / хэсэг нуух (PIL-19) — `web-shell/src/lib/access.ts` (ганц эх сурвалж, backend-ийн шалгалтыг дагана); `me/permissions.modules` (эрхтэй модуль); `ModuleGate`, `HomeRedirect`; ажлын байрны сонгогчид зөвхөн хандах эрхтэй. |
| **B3-4** | V2-05: матрицад бүх эрх; хэрэгжээгүй модулийн эрх (бохир ус/хог, зардлын тайлан) «удахгүй». Олгосон роль / шууд эрх «олгогдсон» — идэвхгүй (PIL-18). |

## 7. Rollback

Код v0.2.2 руу буцаахад DB-г migration-ийн өмнөх нөөцөөс сэргээнэ (`pilot.ps1` snapshot — урвуу migration бичихгүй: нэрлэлт + код солилт олон алхамтай). `legacy_camp_*` нь A = B шалгалт, гар сэргээлтэд зориулсан.

## 8. Үр дагавар
- (+) Эрх нэг газар, модулиас хамаарахгүй; шинэ модуль (Feed, хоол, гэрээ) зөвхөн код нэмнэ.
- (+) Хүрээ ерөнхий (`TENANT` / `SITE`) — ADR-008-ийн ажлын байранд бэлэн.
- (−) Нэг хувилбар alias, legacy хүснэгтийн давхардал (v0.2.4-т цэвэрлэнэ).
- (−) Prisma-ийн талбар `campId` (`@map("site_id")`) — кодын нэр ADR-008 хүртэл хэвээр (API-тай ижил).
