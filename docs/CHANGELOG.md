---
title: "CHANGELOG"
type: "Log"
status: "Active"
last_updated: 2026-10-13
tags: [release]
---

# CHANGELOG

Бүх мэдэгдэхүйц өөрчлөлтүүд энэ файлд бүртгэгдэнэ.

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Хувилбаржуулалт: [SemVer 2.0.0](https://semver.org/) — v0.x.x = pre-production, v1.0.0 = public release

---

## [Unreleased]

### Баримт бичиг — Codebase Atlas (2026-10-13)
- `docs/09_Codebase/` — хөгжүүлэлтийн чат кодыг уншихгүйгээр контекст авах: [[00_Codebase_Map]] (эхлэх цэг), [[01_Backend_Modules]], [[04_Frontend_Map]], [[08_Patterns]]
- Автомат каталог `pnpm docs:gen` / `pnpm docs:check` (`scripts/docs/gen-codebase-docs.mjs`, Node-оос өөр хамааралгүй): API (162 endpoint → service → эрх), DB (migration → хүснэгт/багана/RLS/policy), эрх + анхдагч роль, env + script, тест, frontend route
- RULE-21 (баримтыг кодтой хамт шинэчлэх); [[02_core_kernel_schema]] → Deprecated

### Баримт бичиг — Obsidian vault (2026-10-13)
- `docs/` = Obsidian vault: бүх `.md` (68) файлд YAML frontmatter (`title`, `type`, `status`, `last_updated`, `tags`)
- `type`-д `Log`, `status`-д `Archived` утга нэмсэн (стандарт: [[INDEX]] → "Frontmatter стандарт")
- Файл хоорондын лавлагаа (`` `…/X.md` ``, `[..](X.md)`) → `[[X]]` wiki-link (~320), dangling 0, orphan 0
- [[INDEX]]-ийг MOC болгон дахин бүтэцлэв; байхгүй spec-үүд (04 SDK, 06 FIX-01~04) → "Missing Specs" жагсаалт
- `_learning/` → `docs/_learning/` (git-ээс нуусан хэвээр: `.gitignore` `/docs/_learning/`); `build_pdf.py` frontmatter алгасдаг болсон
- Хуучирсан баримт засвар: [[project-status]], [[01_Development_Roadmap]] (v0.2.0/v0.2.1 ✅, Air-Gapped → v0.4.0+), [[00_rules_and_context]] толгой, [[08_v0.2.2_progress]] commit-ууд; пилотын хаяг → `sino.gobiverse.website` ([[04_Pilot_Camp_Windows]], [[pilot-test-guide]]; Funnel хаасан)
- Шинэ шийдвэрийн баримт: [[ADR-006_HR_Core_Module]] (HR модуль), [[PRD-06_Vision_Business_Model]] (алсын хараа, бизнес загвар); [[PRD-05_Internal_Social_Feed]] / [[ADR-004_Feed_Architecture]]-д 2026-10-13 тэмдэглэл; [[ADR-005_Org_Connectivity_Domains]] §2.4 нүүр хуудас
- [[lessons_learned]] §24: MIG-002 (migration дугаарын дараалал)

### Нэмэгдсэн (v0.2.2 Блок 3 — урилга, нууц үг сэргээх)
- Ажилтны картаас нэвтрэх эрх үүсгэх (имэйлгүй ажилтанд дотоод хаяг) — `POST /camp/camps/:campId/employees/:id/create-user`
- Урилга: "Линк хуулах" (72 цаг, нэг удаа) / имэйлээр — `POST /camp/users/:userId/invites`; хуудас `/invite/:token`
- "Нууц үг мартсан?" (`/forgot` → имэйлээр 1 цагийн линк, `/reset/:token`); хариу үргэлж ижил
- Системийн имэйл (SMTP, 3 хэлний захидал) — `.env` `SMTP_*`; тохируулаагүй бол зөвхөн линк
- SEC-005: хэрэглэгч үүсгэх ганц газар (`register` ч)
- Хамаарал: `nodemailer` 6.10.1

### Migration (v0.2.2 Блок 3, нэмэлт)
- `20261013005_core_user_invites.sql` — урилга / reset токен (SHA-256 hash л)

### Нэмэгдсэн (v0.2.2 Блок 2.5 — домэйн)
- ADR-005: байгууллага бүр `<байгууллага>.gobiverse.website` (Cloudflare Tunnel; 5 төрөл); заавар [[05_Cloudflare_Tunnel]]
- Caddyfile (пилот): бодит IP-г `CF-Connecting-IP`-ээс (Cloudflare), үгүй бол `X-Forwarded-For` (Funnel)
- `pilot.ps1 status`: Cloudflare Tunnel (cloudflared service), `PUBLIC_APP_URL`

### ⚠️ Зан төлөвийн өөрчлөлт (v0.2.2 Блок 2 — нэвтрэлт)
- **Нэвтрэх хуудас:** нэг талбар "Утас, нэвтрэх нэр эсвэл и-мэйл". Нэвтрэлт backend-ээр дамжина (`POST /api/v1/auth/sign-in`); хуучин имэйл + нууц үг хэвээр ажиллана
- Нууц үг солих: толгойн мөрөнд нэр дээр дарж (`/change-password`); админ "солих шаардлагатай" болгосон бол бусад хуудас хаалттай
- **Caddyfile** (пилот): `/api/*`-д `header_up X-Real-IP {client_ip}` — Caddy дахин асаах шаардлагатай

### Нэмэгдсэн (v0.2.2 Блок 2)
- Утсаар (Монгол 8 орон) / нэвтрэх нэрээр (ажилтны кодоос) нэвтрэх; ажилтан ↔ хэрэглэгч холбох API (`PUT /camp/camps/:campId/employees/:id/user`)
- Албан тушаалын эрхийн загвар ажилтанд автоматаар (холбох, албан тушаал солих, Excel импорт); гараар олгосон роль, шууд эрх хадгалагдана; `position-preview`, `role-templates/apply`
- `pnpm camp:login-report` — ажилтны утас/имэйлийн байдал (зөвхөн тоо)

### Migration (v0.2.2 Блок 2, нэмэлт)
- `20261013004_core_users_login.sql` — `core_users.phone/username/must_change_password`, `camp_employees.user_id`, `camp_user_roles.source_position_id`, trigger

### ⚠️ Зан төлөвийн өөрчлөлт (v0.2.2 Блок 1)
- **Роль = загвар:** "Роль ба эрх" дээр ролийн эрхийг өөрчилж хадгалахад хэрэглэгчийн эрх **автоматаар өөрчлөгдөхгүй** — "N хэрэглэгчид хэрэгжүүлэх" цонх (хэн юу авах/алдахыг урьдчилж харуулна) → батлах. Алгасвал ролийн баганад "⚠ хэрэгжээгүй" товч үлдэнэ (ADR-003 §2.4)
- **Кемп админ** засвар эхлүүлэх, хаах эрхтэй болно (Q9: `camp.maintenance.parts`, `camp.maintenance.close`)

### Нэмэгдсэн (v0.2.2 Блок 1)
- Хэрэглэгчийн эцсийн эрх `camp_user_permissions` (эрх шалгагчийн ганц эх сурвалж); "Ажилтан" системийн роль (өөрийн засварын хүсэлт)
- API: `GET roles/:id/apply-preview`, `POST roles/:id/apply`, `GET|POST users/:userId/permissions` (шууд эрх), `DELETE user-permissions/:id`, `GET|PUT positions/:positionId/role-templates`; `GET roles` → `pendingUsers`
- Эрхийн өөрчлөлт бүр өөрчлөлтийн түүхэд (роль олгох/хасах, шууд эрх, загвар хэрэгжүүлэх, албан тушаалын загвар)
- `camp:snapshot`: байгууллага бүрийн эрхийн жагсаалт (хувийн мэдээлэлгүй) + `--expect=v022-q9`

### Migration (зөвхөн нэмэлт)
- `20261013001_camp_user_permissions.sql` — хүснэгт + trigger + одоогийн эрхийг яг хэвээр шилжүүлэх (A = B)
- `20261013002_camp_position_role_templates.sql` — албан тушаал → загвар, `CampRoleCode += EMPLOYEE`
- `20261013003_camp_roles_v022_seed.sql` — "Ажилтан" роль, Q9

### Баримт
- `deploy/pilot/tests/pilot.shim.ps1`: Windows PowerShell 5.1-ээр ажиллуулах команд — `powershell -NoProfile -ExecutionPolicy Bypass -File deploy/pilot/tests/pilot.shim.ps1` (pwsh 7 суугаагүй машинд)
- v0.2.2 техникийн төлөвлөгөө: [[07_v0.2.2_tech_plan]] (✅ батлагдсан 2026-10-12)

---

## [v0.2.1] — 2026-10-12 — Хоолны тооцоо албан тушаалаар, хоолгүй ажилтан, байрны төрөл, мониторинг, нэвтрэлтийн хамгаалалт

> Төлөвлөгөө: [[04_v0.2.1_tech_plan]] · Явц: [[05_v0.2.1_progress]] · Санал: [[pilot-feedback]] FB-01, 04, 12 (үлдсэн), 14 (ээлжээр)
> Суулгах: **эхлээд staging (runbook §13в) — A = B + `pilot.ps1 auth-test`**, дараа нь `pilot.ps1 upgrade -Tag v0.2.1` · Туршилт: [[pilot-test-guide]] §5в · Сургамж: lessons §22

### ⚠️ Зан төлөвийн өөрчлөлт
- **Хоолны байршил:** хэлтсийн оронд **ажилтан ?? албан тушаал (кемп) ?? кемпийн анхдагч**. Хэлтсийн маягтаас хоолны байршил хасагдсан (API хуучин клиентэд optional). Одоогийн өгөгдөлд хоолны тоо өөрчлөгдөхгүй (backfill, staging A = B).
- **Ээлжийн загвар:** албан тушаал (кемп) дээр; байхгүй бол хэлтсийнх (шилжилтийн хугацаа).
- **Нэвтрэлт:** нэг бүртгэлд 15 минутад **5 буруу нууц үг → 15 минут түгжинэ** (зөв нууц үгтэй ч `429`, мессеж 3 хэлээр). Тайлах: runbook §10.
- **`pilot.ps1 init`:** Supabase-ийн `config.toml` өөрчлөгдсөн бол migration-ы дараа Supabase-ийг дахин асаана (v0.2.1 руу `upgrade` хийхэд нэг удаа ~1-2 мин; өгөгдөл хадгалагдана).
- **Caddy** хэрэглэгчийн бодит IP-г (Funnel-ийн `X-Forwarded-For`) дамжуулж, `caddy-access.log`-д бичнэ (өмнө нь бүгд `127.0.0.1`).

### Нэмэгдсэн
- **Албан тушаалын каталог** (Системийн тохиргоо) + кемп тус бүрийн анхдагч (хоолны байршил, хоол авах, ээлжийн загвар) (FB-01).
- **Ажилтан:** албан тушаал, хоолны байршил (override), **хоол авахгүй** (ирцэд тоологдоно, хоолонд орохгүй — "Хоолгүй" мөр) (FB-04); олноор үйлдэл (`POST employees/bulk`); Excel импорт/экспортод шинэ баганууд.
- **Байрны төрөл** (каталог), **хөрөнгийг байранд** (өрөөгүй) байрлуулах; өрөөний самбарт хөрөнгө + нээлттэй засвар (FB-12).
- **Ирц:** ээлжээр шүүх (`GET stays?shift=`) (FB-14); өдрийн ирц ээлжээр; хоолны задаргаа албан тушаалаар.
- **Ирцийн xlsx (I18N-02):** хятад толгой/утга (员工编号/日期/方向/餐/班次; 到达/离开; 早餐/午餐/晚餐/夜宵, 无; 白班/夜班); загварт `Заавар_MN` / `Заавар_EN` / `Заавар_中文`.
- **Мониторинг (PIL-04):** `PILOT_HEALTHCHECK_URL` (watchdog 5 мин, асуудал → `/fail`; `status`), `PILOT_HEALTHCHECK_BACKUP_URL` (нөөцийн дүн). Runbook §9а.
- **Нөөцийн 2 дахь хуулбар (PIL-05):** `PILOT_BACKUP_COPY_DIR` (SHA256 тулгалт, ижил хадгалах хугацаа). Runbook §12.
- **`pilot.ps1 auth-test <имэйл>`** (зөвхөн staging): нэвтрэлтийн түгжээг Caddy-ээр дамжуулж шалгана.

### Аюулгүй байдал
- **SEC-007 (PIL-07):** Caddy `trusted_proxies 127.0.0.1` (XFF); GoTrue-ийн IP хязгаар Supabase CLI-д үйлчилдэггүй тул бүртгэлийн түгжээ — `password_verification_attempt` hook (`auth_guard` schema, `supabase_auth_admin`-аас бусдад эрхгүй). Тайлан: [[06_v0.2.1_PIL-07_report]].

### Migration (зөвхөн нэмэлт)
`20261012001_camp_positions` · `20261012002_camp_position_settings` · `20261012003_camp_employees_position_meals` · `20261012004_camp_departments_meal_location_optional` · `20261012005_camp_building_types_asset_building` · `20261012006_auth_password_guard`

### Тест (cloud harness)
- core-kernel unit **586**, web-shell **74**, integration **210** ×2 (`app_user`, `postgres`), e2e **60**; backfill A = B (60 ажилтан × 22 хоног: 1932 хоол, 644 хүн-өдөр).
- PIL-07: Caddy 2.8.4 + echo upstream (XFF: өмнө `127.0.0.1`, одоо бодит IP эхэнд); **бодит Supabase Auth (GoTrue v2.178) + PG16** дээр hook: 6 буруу → `400×5, 429`, түгжээтэй үед зөв нууц үг → 429, өөр хэрэглэгч → 200, түгжээ дуусахад → 200 (мөр устна), 4 буруу + зөв + 4 буруу → түгжихгүй, 15 мин-ийн цонх хуучирвал тоолуур 1-ээс, `app_user` → schema-д эрхгүй.
- `deploy/pilot/tests/pilot.shim.ps1` (pwsh, docker/7z/pnpm/ping-ийн shim; Docker хэрэггүй): `backup` + хуулбар + ping, хуулбарын алдаа, 7z алдаа, `status` ping, `init` → config өөрчлөгдвөл Supabase дахин асаалт, `check` URL — **22/22**.

### Мэдэгдэж буй хязгаарлалт
- Нэвтрэлтийн түгжээ бүртгэлээр (IP-ээр биш): олон бүртгэлийг нэг IP-ээс оролдохыг хаахгүй; халдагч бусдын бүртгэлийг 15 мин түгжиж чадна.
- QA-09 (CONC-002) шалтгаан баталгаажаагүй (дахин гараагүй).

---

## [v0.2.0] — 2026-10-11 — Пилотын санал (бөөнөөр оруулах, тохиргоо), олон хэл, шинэчлэлийн хэрэгсэл ✅ (пилот 2026-10-11)

> Төлөвлөгөө: [[02_v0.2.0_tech_plan]] · Санал: [[pilot-feedback]] FB-02, 03, 05, 06, 07, 08, 11, 12 (1-р хэсэг), 14
> Суулгах: runbook §13 (v0.1.6.x → v0.2.0 нэг удаа гараар), **эхлээд staging дадлага §13в** · Туршилт: [[pilot-test-guide]] §5б · Сургамж: lessons §21

### ⚠️ Зан төлөвийн өөрчлөлт
- **Алдааны хариу** (Кемп): `{ statusCode, code, params, message, error }` — `code` тогтвортой (жнь `camp.err.departments.2`), `message` нь `Accept-Language`-ийн хэлээр. Хуучин клиент `message`-ийг харуулсаар ажиллана. Эрхгүй үед жагсаалтыг `" / "`-ээр (өмнө нь "эсвэл").
- **Цэс/URL:** `/camp` → сүүлд орсон кемп (жагсаалт: `/camp?list=1`); `/camp/admin/*` → `/camp/system/*`; кемпийн `facilities`, `departments`, `crews` → `settings/*` (хуучин холбоос redirect).
- **"Баг" → "Ростер"** (UI ба серверийн мессеж).
- **JSON body хязгаар 4 MB** (хүснэгтээр оруулах); файлын хязгаар 2 MB хэвээр.

### Нэмэгдсэн
- **Олон хэл — Монгол · English · 中文** (суурь + Кемп + нэвтрэх/цэс): хэл сонгох (баруун дээд, нэвтрэх хуудас), профайлд хадгална (`core_users.locale`); огноо/гараг/төлөв/enum хэлээр. en/zh — **ноорог** ([[i18n-review]]).
- **Орчуулгыг Excel/CSV-ээр засах** (Системийн тохиргоо → Орчуулга, OWNER/ADMIN): татах → засах → урьдчилсан харагдац (хувьсагч, урт шалгана) → ≤ 60 сек-д шууд; түүх, анхдагч руу буцаах; байгууллага тус бүрт (`i18n_overrides`, RLS).
- **Бөөнөөр оруулах:** ажилтан (Excel / "хүснэгтээр" paste; байгаа код = шинэчлэх; имэйл багана), хэлтэс (Excel); экспорт (ажилтан, хэлтэс, өрөө) = импортын загвар; урьдчилсан харагдац (шинэ / шинэчлэх / өөрчлөлтгүй / алдаа), алдаатай мөрийг алгасах сонголт (FB-02, FB-08, PIL-08).
- **Байр + олон өрөө нэг дор** (дугаарын муж, угтвар, тэгээр дүүргэх, ≤ 500; байгааг алгасна), байрны өрөөний тоо/багтаамж (FB-07).
- **Тохиргооны каталог** (FB-05), **Системийн тохиргоо** + кемп солих + сүүлийн кемп (FB-11), хэлтсийн идэвхтэй ажилтан/албан тушаалын тоо (FB-03).
- **Ирц:** хэлтэс/ростер/албан тушаал/нэрээр шүүх, **олон хүний ирц нэг дор** (preview → confirm) (FB-14).
- **Өрөөний самбар:** Сул / Дутуу / Дүүрсэн / Хэтэрсэн / Идэвхгүй ажилтантай, байраар шүүх; "Өрөө солих" (FB-12 1-р хэсэг).
- **Өөрчлөлтийн түүх** (`camp_audit_log`, append-only): ажилтан, хэлтэс, ростер, байр, өрөө (үүсгэх/засах/идэвхгүй/импорт), `GET …/camps/:id/audit` (UI → v0.2.2) (PIL-03).
- **`pilot.ps1 upgrade -Tag <tag>`**: нөөц → Task түр унтраах → checkout → init → build → start → health; бохир git tree-д эхлэхгүй; алдаа гарвал буцаах заавар (PIL-11).
- **Staging профайл** (`pilot.ps1 -Profile staging -Root <clone>`, `deploy/staging/`): тусдаа Supabase/Redis/портууд; пилотын DB/Redis/порт руу заасан `.env.staging`-ийг зогсооно.
- **`pnpm camp:snapshot`** — хоолны тоо (−35…+7 хоног), өрөөний самбар, тоонуудын snapshot (READ ONLY) ба `--compare` (A = B).

### Засагдсан / сайжирсан
- **OPS-004** `restore` (ба шинэ `upgrade`)-ийн үед Task Scheduler watchdog-ийг дахин асааж болзошгүй байсан → Task-ийг түр идэвхгүй.
- Docker image-д `packages/i18n` (runtime орчуулга).

### Migration (зөвхөн нэмэлт)
`20261011001_camp_audit_log` · `20261011002_camp_data_imports` · `20261011003_camp_employees_email` · `20261011004_core_users_locale` · `20261011005_i18n_overrides`

### Тест (cloud harness)
- core-kernel unit **558** (хоолны тооцооны golden 9 ажилтан × 44 хоног, Excel table-spec, i18n каталог/код бүрэн), web-shell **66** (3 хэлний түлхүүр ижил, Кемпийн `.tsx`-д кирилл үлдээгүй), integration **198** (`app_user` ба `postgres` горим), e2e **55**, `pilot.ps1` pwsh + shim **10 кейс**.

### Мэдэгдэж буй хязгаарлалт
- DTO шалгалтын мессеж, DB trigger-ийн тайлбар, ирцийн хуучин xlsx загвар — монгол/англи (I18N-02).

---

## [v0.1.6.1] — 2026-10-10 — Пилот суулгалтын засвар (v0.1-ийн сүүлийн хувилбар) ✅

> v0.1 хөгжүүлэлт хаагдсан (2026-10-11). Цаашид P0 hotfix-ийг `release/v0.1` салбараас `v0.1.7`+. Дараагийн: `docs/08_Roadmap/V.0.2/`.

### Засагдсан (таны машин дээр суулгах явцад илэрсэн — lessons §20)
- **FE-007** API 401 үед локал session үлдэж `/login` ↔ `/camp` төгсгөлгүй шилждэг байсан → 401-д `signOut({ scope: 'local' })` дараа нь `/login`; "Гарах" зөвхөн тухайн төхөөрөмж (өмнө нь бүх төхөөрөмжийг гаргадаг байсан).
- **OPS-003** Пилотын Supabase `[auth.email] enable_signup = false` нь имэйлээр **нэвтрэлтийг** бүхэлд нь хаадаг байсан ("Email logins are disabled") → `true`; бүртгэлийг `[auth] enable_signup = false` хаана.
- **PROC-009** `pilot.ps1 init` шинэ clone-д Supabase CLI олдохгүй → `node_modules` алга бол `pnpm install`.
- **PROC-010** `pilot.ps1` `.env`-ийг PowerShell цонхны орчинд үлдээдэг (`NODE_ENV=production` → devDependency алгасагдсан, dev тест пилотын DB руу холбогдох эрсдэл) → дуусахад орчныг буцаана; `pnpm install` NODE_ENV-гүй.

### Тест
- web-shell unit **54**, e2e **47**; давталтыг хуучин кодоор давтахад 6 сек-д 295 шилжилт → шинэ кодоор 4 шилжилт, `/login` дээр тогтоно.
- Таны машин: Funnel-ээр гаднаас (утас, мобайл дата) нэвтрэх, LAN-аас портууд хаалттай, дахин асаалтад автоматаар асах, backup → restore дадлага.

---

## [v0.1.6] — 2026-10-10 — Кемп пилот (нэг Windows машин, интернэтэд нээлттэй) ✅

> Runbook: [[04_Pilot_Camp_Windows]] · Төлөвлөгөө: [[01_analysis_and_plan_2026-10-08]] (v0.1.6)
> Сургамж: [[lessons_learned]] §20

### ⚠️ Зан төлөвийн өөрчлөлт
- **`POST /api/v1/auth/register` [SEC-005]:** зөвхөн OWNER/ADMIN; tenant = нэвтэрсэн хэрэглэгчийнх (Host header-ээс биш). UI ашигладаггүй.

### Нэмэгдсэн
- **`deploy/pilot/`** — пилотын бүх зүйл: `pilot.ps1` (check / init / build / start / run (watchdog) / stop / status / onboard / user / backup / restore / firewall / install-tasks), тусдаа Supabase project `s-project-pilot` (553xx, өөрийн JWT нууц, бүртгэл хаалттай, Studio унтраалттай), `Caddyfile` (нэг гарц: SPA + `/api` + Supabase Auth-ийн 3 зам, CSP), тусдаа Redis (127.0.0.1:56379), `.env.pilot.example`.
- **Хэрэглэгч удирдах CLI:** `pilot-admin` (`pnpm pilot:onboard` / `pnpm pilot:user`): байгууллага + OWNER + Кемп админ; хэрэглэгч нэмэх, role/кемпийн роль, нууц үг сэргээх, идэвхгүй болгох (Redis membership cache шууд цэвэрлэнэ).
- **Нөөц/сэргээлт:** өгөгдөл (`public` + `auth.users/identities`) → 7-Zip AES-256, 14 хоног; restore нь migration тулгаж, тоог шалгана.
- **Web-shell `VITE_MODULES`** (`all` | `camp` | таслалаар): цэс/route/нүүр хуудас; `VITE_SUPABASE_URL=same-origin`; `mfe` идэвхгүй бол Module Federation remote build-оос хасагдана, `VITE_MFE_REQUISITIONS_URL`.
- **`ESCALATION_CRON=off`** — автомат escalation унтраах.

### Аюулгүй байдал / Засагдсан
- **SEC-005** нэвтэрсэн дурын хэрэглэгч (VIEWER ч) service key-ээр шинэ бүртгэл (REQUESTER) үүсгэдэг байсан.
- **SEC-006** Supabase CLI `env()` хоосон үед demo JWT нууцаар асдаг — `pilot.ps1` түлхүүрийн гарын үсгийг шалгаж зогсооно.
- **FE-006** идэвхгүй MFE remote (`localhost:5174`) апп эхлэхэд ачаалагддаг байсан.

### Тест (2026-10-10)
- Unit: core-kernel **528**, web-shell **51**
- Integration: **15 файл / 159** — `app_user` ба `postgres` хоёр горимд
- Playwright e2e: **47**
- Пилот: Caddy-гаар UI (OWNER, VIEWER + Кемп менежер), `pilot.ps1`-ийн бүх команд, restore (54 хүснэгт md5 ижил)

---

## [v0.1.5] — 2026-10-10 — Tier 2: Enterprise VPC ✅

> Дэлгэрэнгүй: [[01_analysis_and_plan_2026-10-08]],
> алдааны шалтгаан/шийдэл: [[lessons_learned]] §11–19.

### ⚠️ Зан төлөвийн өөрчлөлт (шинэчлэхээс өмнө унших)
- **MR батлалт workflow-оор [SEC-004]:** `POST /requisitions/:id/approve|reject` нь одоо идэвхтэй алхмын role (эсвэл OWNER/ADMIN)-ийг шаардана; **MR үүсгэгч өөрөө батлах/татгалзахгүй**; amount_rules-ийн олон алхам, quorum дагагдана (завсрын алхамд MR `PENDING_APPROVAL` хэвээр). Нэг хэрэглэгчээр "үүсгээд батлах" урсгал ажиллахаа больсон — дор хаяж 2 хэрэглэгч (REQUESTER + APPROVER) хэрэгтэй.
- **RLS runtime:** апп `DATABASE_URL`-ээр `app_user` (NOBYPASSRLS) холбогдоход RLS бодитоор идэвхтэй; tenant-ээс өмнөх/бүх tenant-ийн ажил (tenant lookup, login, super-admin, onboarding, outbox, DLQ, escalation) `SYSTEM_DATABASE_URL`-ээр. Тохируулаагүй бол хоёулаа `DATABASE_URL` (өмнөх зан төлөв).
- **Workflow definition:** үүсгэх/засах = OWNER/ADMIN; body шалгалттай (буруу role/бүтэц → 400).
- **Скрипт:** `pnpm test` = зөвхөн unit (сервергүй); Playwright → `pnpm test:e2e` / `pnpm e2e`.

### Нэмэгдсэн
- **Tenant isolation (ADR-001, шийдвэр B):** shared = RLS; Enterprise VPC = тусдаа DB + deploy (`DEPLOYMENT_MODE=dedicated`, `DEDICATED_TENANT_SLUG`), `docker/docker-compose.vpc.yml`, `docker/vpc/bootstrap_dedicated_tenant.sql`, runbook. Schema-per-tenant (Sprint 6) цуцлагдсан.
- **Advanced workflow:** amount_rules routing, олон алхам + quorum, SLA бүртгэл (шийдэгдсэн алхам `COMPLETED`), escalation scheduler, delegation (API). MR дэлгэрэнгүйд алхмын явц ("Алхам 1/2"), товч зөвхөн эрхтэй хүнд.
- **Модулиуд:** Budget (хугацаа, хуваарилалт, MR submit → COMMITTED / approve → SPENT / reject → RELEASED), Inventory-lite (cursor, бага үлдэгдэл, атомик тохируулга), Vendor-lite, Report-lite (JSON + CSV, UTF-8 BOM). Web-shell хуудас: `/inventory`, `/vendors`, `/reports`.
- **Кемп модуль V1** — доорх тусдаа хэсэг.
- **Performance:** Redis cache (MR, inventory, auth token — SHA-256, single-flight), cursor pagination (`idx_mr_headers_cursor`), tenant rate limit (`RATE_LIMIT_SHORT/MEDIUM/LONG`, Redis алдаанд fail-open), cluster crash-loop backoff (`CLUSTER_RESTART_*`).
- **Event bus:** transactional outbox — event бүр `FOR UPDATE SKIP LOCKED` transaction-д, тогтвортой CloudEvent id (at-least-once), retry backoff 30с/120с → DLQ.
- **Хэрэгсэл:** `pnpm dev:test-user`, `supabase/dev/rls_audit.sql`, `supabase/dev/seed_perf_10k_mr.sql`, `apps/e2e/tests/load-test.ts`, `cluster-check.ts`, `PRISMA_LOG_LEVELS`, e2e fixture (`pnpm --filter @s-project/core-kernel e2e:fixture`).
- **Migration:** `20261008001_revert_schema_per_tenant`, `20261008002_budget`, `20261008003_inventory_vendor_lite`, `20261010003_mr_cursor_index`, `20261010004_rls_app_user` (+ Кемп 8).

### Аюулгүй байдал / Засагдсан
- **SEC-001** өөр tenant-ийн Host-оор гишүүн биш хэрэглэгч нэвтэрдэг байсан → 403 (membership шалгалт).
- **SEC-002** өөр tenant-ийн workflow definition-ийг засах боломжтой байсан → 404.
- **SEC-003** workflow definition: эрх, body шалгалтгүй байсан.
- **SEC-004** MR батлалт role / өөрийгөө батлах / workflow алхмыг шалгадаггүй байсан; батлагдсан MR-ийн SLA PENDING үлдэж escalate болдог байсан.
- **RLS-004~007** RLS policy (RESTRICTIVE-only, буруу GUC, `current_tenant_id()` хоосон утга, `set_config` transaction-ийн гадна) → PERMISSIVE TO app_user + `inTenantTx`.
- **CONC-002** нэг tenant-д зэрэгцээ MR үүсгэхэд дугаар давхцаж 500 (30-аас 22) → tenant+он advisory lock, тоон max (9999-ийн дараах давхцал ч засагдсан).
- **CACHE-001** MR төлөв/эзэмшигчийн шалгалт cache-ээс; **EVT-001~003** outbox давхар publish, retry бүрт шинэ id; **API-001/HTTP-001** UUID биш id → 500; **CURSOR-001** буруу cursor → 500; **PERF-003** auth шалгалт хүсэлт бүрт (p99 1974ms → 57ms); **RL-001** Redis алдаа → бүх хүсэлт унах.
- CI: `test:unit` script, `supabase db push` хасав, ESLint тохиргоо.

### Тест (2026-10-10)
- Unit: core-kernel **514**, web-shell **45**
- Integration: **15 файл / 155** — `app_user` (RLS) ба `postgres` хоёр горимд
- Playwright e2e: **47** (0 skip) — fixture тест бүрийн өгөгдлийг өөрөө үүсгэж/устгана
- Load (10k MR, 100 conn × 15с): p99 57ms / 3360 req/s (local, 4 worker) · `app_user` (RLS) горимд p99 **90ms** / 2416 req/s, cursor max 28ms (cloud, 1 worker)
- Dedicated mode smoke: slug дутуу → эхлэхгүй; өөр Host → тохируулсан tenant (200); өөр tenant-ийн хэрэглэгч → 403
- CI (`.github/workflows/ci.yml`): Supabase key `status -o env`-ээс, `app_user` + `SYSTEM_DATABASE_URL`, `pnpm test`, `pnpm test:e2e` (+ test user, camp grant) [CI-004]
- `/api/v1/health`, `/healthz` → `version: "0.1.5"` (`APP_VERSION` = package.json)

### Нэмэгдсэн — Кемп модуль V1 (2026-10-10) ✅
> Төлөвлөгөө/ERD v4: [[01_plan_and_erd]]. V1 = Шат 1–4 + Шат 8 (frontend) + Шат 9 (баримт).
> Дараагийн хувилбарт (`v0.1.5`) багтана — [[VERSIONING]]-ийн дагуу `v0.2.0` нь Air-Gapped-д зориулагдсан тул тусдаа дугаар нээгээгүй.

- **DB (Supabase migration 8):** `20261009001_camp_rbac` … `20261009006_camp_operations`, `20261010001_camp_attendance_import`, `20261010002_camp_org_services_maintenance`.
  RLS = `camp_apply_tenant_rls()` (PERMISSIVE TO app_user + FORCE + GRANT, [RLS-004]); давхцал EXCLUDE, CLOSED засвар/сэлбэг trigger-ээр түгжигдэнэ, НӨАТ `net + vat = gross` CHECK.
- **Эрх (Шат 2):** кемпийн роль ↔ эрхийн каталог, анхдагч 3 роль (Кемп админ, Кемп менежер, Катеринг админ), хэрэглэгчид бүх кемп / тодорхой кемпэд роль; эрхийн cache (Redis 5 мин) өөрчлөлтөд цэвэрлэгдэнэ. V2 эрхүүд `availableIn: 'v2'`-оор UI-д нуугдана (D8).
- **Мастер өгөгдөл:** кемп, тохиргоо (НӨАТ, ростер, хоол идэх байршил, катеринг байгууллага), байр/өрөө, хэлтэс + ээлжийн загвар, баг (ростер), байгууллага (үйлчилгээний төрөлтэй), ажилтан.
- **Ирц ба ажиллагаа (Шат 3):** ирцийн xlsx импорт (урьдчилан харах → батлах/цуцлах), гараар ирц, ээлжийн календарь + зохицуулалт, өрөөний самбар + хуваарилалт (28 хоногийн багтаамж), хоолны суурь тоо (хоол × байршил).
- **Хөрөнгө, засвар (Шат 4):** хөрөнгийн ангилал, бүртгэл, шилжүүлэх, актлах (түүхтэй); засварын хүсэлт `ZAS-{кемп}-{он}-{NNNN}` (advisory lock), төлвийн машин OPEN → IN_PROGRESS → DONE → CLOSED / CANCELLED, өрөө түгжих/суллах (`FOR UPDATE`), сэлбэг, хаахад катерингийн сэлбэгийн зардал `camp_cost_entries`-д snapshot.
- **Frontend (Шат 8, web-shell `/camp/*`):** 3 багц — тохиргоо/мастер/эрх; ирц, ээлж, өрөө, хоол, ажилтан; хөрөнгө, засвар (тусдаа дэлгэрэнгүй хуудас, хаахын өмнө нийт зардлын баталгаажуулалт, мөнгийг string-ээс float-гүй форматлах). Mobile (390px) дэмжинэ.

### Тест — Кемп модуль V1
- Backend unit 421 ✅, integration (`camp-master`, `camp-attendance`, `camp-assets-maintenance`) ✅
- web-shell vitest 27 ✅ (`modules/camp/lib`)
- Playwright e2e 20 ✅ (`camp.spec.ts` 6, `camp-ops.spec.ts` 7, `camp-assets.spec.ts` 7) — урьдчилсан нөхцөл `supabase/dev/camp_e2e_grant.sql`

### Хойшлуулсан — Кемп модуль V2 (D8)
- Шат 5 гэрээ/үнэ, Шат 6 бохир ус/хог + хоолны захиалга, Шат 7 зардлын тайлан. DB хүснэгт, Prisma model, эрхийн код бэлэн — drop хийгээгүй.

### Засагдсан / баримтжуулсан
- RULE-12 (RLS загвар) [RLS-004]-тэй нийцүүлсэн: `AS PERMISSIVE TO app_user` + GRANT (өмнө нь байхгүй `s_project_app_user` + RESTRICTIVE гэж буруу заасан)
- [[lessons_learned]] §15: ENV-009/010, TEST-007/008/009, PRISMA-003, VALID-001, CONC-001, PROC-003/004, FE-004

---

## [v0.1.0] — 2026-09-20 — Tier 1 Production Ready (Core System) ✅

> **Тэмдэглэл:** Хуучин нэрлэлтийн MVP + v1.0 sprint бүгд нэгдэж **v0.1.0** болсон.  
> Энэ нэг хувилбар дотор системийн суурь бүтцээс эхлэн Tier 1 production-ready байдал хүртэл бүгд хамрагдана.

### Нэмэгдсэн
- **Monorepo суурь:** Turborepo + pnpm workspaces, Supabase local, Redis Docker
- **Auth & Multi-tenant:** Supabase Auth JWT, TenantAuthGuard, TenantContextInterceptor, AsyncLocalStorage RLS
- **Material Requisition CRUD:** POST/GET/PUT/DELETE endpoints, mr_headers + mr_items хүснэгт
- **Approval workflow:** Submit → Approve/Reject, idempotency log, optimistic locking (version field)
- **Outbox events:** `outbox_events` хүснэгт, DB + event нэг transaction
- **Frontend:** React 18 + Vite 6, TanStack Query v5, Supabase Auth нэвтрэх, Realtime subscription
- **Module Federation:** web-shell (Host) + material-requisition-ui (Remote), shared design system
- **Dynamic Ingress Router:** `DynamicIngressRouterService`, manifest.json validation, DrainingInterceptor
- **Workflow Engine Module:** workflow_definitions/instances/approval_steps, multi-level approval
- **Event Bus:** Outbox processor, Redis pub/sub (CloudEvents v1.0), exponential backoff, DLQ
- **Tenant Onboarding:** Tenant бүртгэх, module идэвхжүүлэх, хэрэглэгч урих API, RBAC
- **CI/CD:** GitHub Actions pipeline, Docker + docker-compose, `.env` validation

### Тест
- Vitest unit тест (80%+ coverage)
- Supertest integration тест (endpoint бүр)
- RLS leakage тест — tenant A → tenant B өгөгдөл = 0
- Approval idempotency тест
- E2E тест (Playwright): Submit → Approve flow
- RLS leakage load тест (100 concurrent)

### Засагдсан алдаанууд (RULE-01~20 боловсруулагдсан)
- APP_GUARD useExisting pattern (RULE-07)
- resolveUserId: authId ≠ core_users.id (RULE-13)
- Dual PrismaClient RLS тест (RULE-16)
- unplugin-swc NestJS+vitest (RULE-08)
- VITE_API_BASE_URL='' proxy (RULE-19)
- uuid_generate_v7() only (RULE-11)
- Pagination {data, total, page, limit} (RULE-17)

---

## Хувилбарын Зураглал

| SemVer | Хуучин нэр | Тайлбар | Төлөв |
|---|---|---|---|
| **v0.1.0** | MVP + v1.0 | Tier 1 Core System | ✅ ДУУССАН |
| **v0.1.5** | v1.5 | Tier 2 Enterprise VPC | ✅ 2026-10-10 |
| **v0.2.0** | v2.0 | Tier 3 Air-Gapped | 📋 ТӨЛӨВЛӨСӨН |
| **v0.3.0+** | — | Нэмэлт хөгжүүлэлт | 📋 ИРЭЭДҮЙ |
| **v1.0.0** | Production | Олон нийтэд гаргах | 🎯 ЗОРИЛГО |

---

[Unreleased]: https://github.com/Moogii5596/s-projectDev2/compare/v0.1.5...HEAD
[v0.1.5]: https://github.com/Moogii5596/s-projectDev2/releases/tag/v0.1.5
[v0.1.0]: тэмдэглэгээ (git tag) тавигдаагүй — v0.1.0 нь `v0.1.5`-ийн өмнөх түүх
