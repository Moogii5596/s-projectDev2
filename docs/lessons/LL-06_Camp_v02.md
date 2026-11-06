---
title: "Lessons — Кемп модуль ба v0.2.x"
type: "Log"
status: "Active"
last_updated: 2026-10-17
tags: [lessons]
---

# Lessons — Кемп модуль ба v0.2.x

> Индекс (ID → дүрэм): [[lessons_learned]]. Дэлгэрэнгүйг зөвхөн индексээс ID-гаа олсны дараа унш. Хэсгийн дугаар (§N) анхны нэгтгэсэн файлынхтай ижил.

## 15. Camp Module (2026-10-09)

### [RBAC-003] Хэрэгжсэн эрхийн хувилбар DB болон registry-д зөрөв
**Алдаа:** Гэрээний migration `camp.contract.manage`-ийг `v1` болгосон ч `permission-registry.ts`-д `v2` хэвээр байв.
**Дүрэм:** Эрхийн хувилбар өөрчлөхдөө migration, кодын registry, unit тест болон DB-кодын каталог тулгалтыг хамтад нь шинэчилж шалгана.

### [RBAC-004] Tenant каталогийн UI кемпийн хүрээний эрхийг орхигдуулав
**Алдаа:** Гэрээний каталог, ханшийн API `requireInAnyCamp` ашигладаг ч UI tenant-ийн `permissions`-ийг дангаар шалгасан тул нэг кемпэд эрхтэй хэрэглэгч хаагдав.
**Дүрэм:** Tenant түвшний API аль нэг кемпийн эрхийг зөвшөөрдөг бол UI-д `canInAnyCamp`-аар адил шалгаж, site-scoped болон эрхгүй тохиолдлыг тестлэнэ.

### [I18N-003] Туслах UI-ийн орчуулгад давхар хаалттай хувьсагч орсон
**Алдаа:** `{{name}}` ашигласан орчуулга төслийн `{name}` interpolation тохиргоотой зөрж, UI-д илүү хаалт харуулсан.
**Дүрэм:** Pending орчуулга нэгтгэхдээ төслийн `{name}` хэлбэрийг мөрдөж, гурван хэлээр бодит i18next орлуулалтыг тестлэнэ.

### [ENV-009] PowerShell pipe (`Get-Content ... | docker exec -i ... psql`) кирилл үсгийг `?` болгодог
**Алдаа:** `camp_schema_test.sql`-ийг pipe-ээр өгөхөд NOTICE-ууд `????` болж гарсан — зөвхөн дэлгэц биш, **SQL текст өөрөө** эвдэрнэ (`'Кемп админ'` → `'?????'`) → өгөгдөл буруу бичигдэх / тест худал унах эрсдэлтэй.
**Шалтгаан:** Windows PowerShell 5.1-ийн `$OutputEncoding` анхдагчаар US-ASCII — native програм руу pipe хийхэд ASCII-аас бусад тэмдэгт `?` болно.
**Шийдэл:** Файлыг контейнер руу хуулж `-f`-ээр ажиллуулна: `docker cp file.sql "${db}:/tmp/x.sql"` → `docker exec $db psql ... -f /tmp/x.sql`. Гаралтыг уншихад `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`.
**Дүрэм:** Монгол текст агуулсан SQL-ийг PowerShell pipe-ээр ХЭЗЭЭ Ч өгөхгүй.

### [TEST-007] Supabase local-д `postgres` superuser биш → `SET ROLE app_user` хориотой
**Алдаа:** `ERROR: permission denied to set role "app_user"` (RLS тест `app_user` болж шилжих үед).
**Шалтгаан:** Supabase-ийн `postgres` role нь BYPASSRLS-тэй ч superuser биш, `app_user`-ийн гишүүн биш. Cloud-ийн цэвэр PostgreSQL дээр `postgres` = superuser байсан тул тест тэнд давсан — орчны ялгаа.
**Шийдэл:** SQL-ээр RLS тест хийхдээ Supabase-ийн superuser `supabase_admin`-аар холбогдоно: `docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin ...`. (`GRANT app_user TO postgres` хийхгүй — role-ийн эрхийг байнга өөрчилнө.)
**Дүрэм:** Supabase дээр ажиллах SQL скриптийг бичихдээ `postgres` = superuser гэж бүү тооц (RLS-002-той холбоотой: bypass нь BYPASSRLS-ээс, superuser-ээс биш).


### [ENV-010] Төслийн хавтсыг зөөсний дараа `tsc`: `Cannot find module '@s-project/shared-types'`
**Алдаа:** `TS2307` — `import type { RequestUser } from '@s-project/shared-types'` бүхий 5 controller. Код өөрчлөгдөөгүй.
**Шалтгаан:** pnpm (Windows) workspace package-ийг **junction**-оор холбодог, junction нь **бүтэн замтай**. Төслийг `E:\MoogiiDev\s-project` → `E:\MoogiiDev\Dev\s-project` зөөхөд `apps/core-kernel/node_modules/@s-project/*` хуучин зам руу заасаар үлдэж тасарсан.
**Оношлох:** `(Get-Item apps\core-kernel\node_modules\@s-project\shared-types).Target` → хуучин зам гарвал энэ.
**Шийдэл:** `pnpm install --frozen-lockfile` (node_modules-ийг дахин үүсгэнэ; `pnpm dev` зогссон байх [ENV-006]).
**Дүрэм:** Төслийн хавтсыг зөөх/нэр солих бүрт `pnpm install` заавал.


### [PRISMA-003] Prisma 5-ийн DB алдааны мессеж Rust Debug хэлбэртэй — хашилт escape-тэй (`\"`)
**Алдаа:** `camp-errors.ts` EXCLUDE/CHECK алдааг 409/400 болгож чадаагүй (integration 2/25 унав) — unit тест давсан, учир нь тестийн мессежийг гараар "цэвэр" хэлбэрээр бичсэн байсан.
**Шалтгаан:** `PrismaClientUnknownRequestError.message` = `... PostgresError { code: "23514", message: "... violates check constraint \"camp_rooms_capacity_check\"" ... }` — regex `constraint "(...)"` нь `\"`-тэй таарахгүй. Trigger-ийн мессеж (`CAMP_*: ...`) хашилтгүй тул давсан.
**Шийдэл:** мессежийг эхлээд `.replace(/\\"/g, '"')`-ээр хэвийн болгох + SQLSTATE (`code: "23P01"` EXCLUDE, `"23514"` CHECK)-ээр нөөц таних. Unit тестэд Prisma-гийн бодит хэлбэрийн мессеж нэмсэн.
**Дүрэм:** DB/гадаад системийн алдааны текстэд тулгуурласан код бичихдээ (1) mock-ийн мессежийг **бодит гаралтаас хуулж** бичнэ, (2) integration тестэд бодит алдаан дээр баталгаажуулна, (3) боломжтой бол текст биш код (SQLSTATE)-оор танина.


### [VALID-001] 🔴 `enableImplicitConversion` → query `?activeOnly=false` нь `true` болдог
**Алдаа:** main.ts-ийн ValidationPipe `transformOptions: { enableImplicitConversion: true }` — class-transformer нь `@Transform`-оос ӨМНӨ declared type-аар хөрвүүлнэ: `Boolean('false') === true`. `@Transform(({ value }) => value === 'true')` нь аль хэдийн `true` болсон утга авна → `?activeOnly=false` = шүүлттэй. Camp, vendor (`activeOnly`), inventory (`lowStock`), budget (`activeOnly`) — бүгд нөлөөлөгдсөн.
**Яагаад нуугдсан:** integration тестүүд `new ValidationPipe({ whitelist: true, transform: true })` — main.ts-ээс ӨӨР тохиргоо (implicit conversion, forbidNonWhitelisted байхгүй).
**Шийдэл:** `src/common/utils/query-bool.ts` → `queryBool` анхны утгыг (`obj[key]`) уншина; 4 модульд хэрэглэсэн. Camp integration тестүүд main.ts-тэй ИЖИЛ pipe ашигладаг болсон + регресс тест (хуучин кодоор унадгийг шалгасан).
**Дүрэм:** (1) Query boolean → ЗААВАЛ `@Transform(queryBool)`. (2) Integration тестийн app тохиргоо (pipe, prefix, plugin) main.ts-тэй ИЖИЛ байх — өөр бол production алдааг нуудаг. (3) ✅ Шат 4.0: `src/common/http/configure-app.ts` → `main.ts` ба БҮХ integration spec `await configureApp(app)` (шинэ spec ч заавал).

---

### [CONC-001] 🔴 Snapshot бичих (засвар хаах → зардал) ба дэд мөр (сэлбэг) өөрчлөх race — trigger-ийн SELECT түгжээ авдаггүй
**Илэрсэн:** Шат 4.4 дизайн шалгалт (Шат 1-ийн `camp_maintenance_parts_protect` trigger). Production-д гараагүй.
**Алдаа:** Trigger хүсэлтийн төлвийг энгийн `SELECT`-ээр уншдаг байсан. READ COMMITTED-д: A transaction засварыг CLOSED болгож сэлбэгийг уншиж зардал бичиж байх зуур B transaction сэлбэг нэмбэл B-ийн trigger commit хийгдээгүй CLOSED-ийг харахгүй (DONE гэж харна) → сэлбэг нэмэгдэнэ, харин зардалд ОРОХГҮЙ → тайлан ба сэлбэгийн жагсаалт зөрнө.
**Шийдэл:** (1) Migration `20261010002` §4: trigger `SELECT ... FOR SHARE` — хаах transaction-ийн мөрийн түгжээг хүлээгээд CLOSED-ийг харж татгалзана. (2) Хаах үед төлвийг ЭХЛЭЭД CLOSED болгож (мөр түгжигдэнэ), ДАРАА нь сэлбэг уншина → өмнө нь эхэлсэн сэлбэгийн transaction commit хийгдтэл UPDATE хүлээнэ. Хоёр чиглэлийг 2 psql session-оор шалгасан (хүлээгээд татгалзсан / хоцорсон сэлбэгийг харсан).
**Дүрэм:** Эцэг мөрийн төлвөөс хамаарч дэд мөр бичихийг хориглох trigger/код → эцэг мөрийг `FOR SHARE` (эсвэл `FOR UPDATE`)-ээр унш. "Төлөв солих + дэд мөрөөс snapshot" үйлдэлд төлвийг эхэлж сольж, дараа нь дэд мөрийг унш. Нэгээс олон хүсэлт нэг нөөцийг (өрөөний төлөв) суллах/түгжих бол нөөцийн мөрийг `FOR UPDATE`-аар түгж.

---

### [PROC-003] Ажлын хавтсанд тасарсан өмнөх оролдлогын commit хийгдээгүй файлууд үлдэж шинэ кодтой холилдсон
**Тохиолдсон:** Шат 8 багц 1 (web-shell). Өмнөх (хадгалагдаагүй, таны машин руу бичигдээгүй) оролдлогын `modules/camp/*`, `App.tsx`/`Layout.tsx` өөрчлөлт, e2e spec cloud-ийн хавтсанд үлдсэн байв. Шинэ кодын 4 файл хуучинг нь дарж бичиж, хоёр өөр бүтэц (`campApi.ts` ↔ `camp-api.ts`, `shiftPattern.ts` ↔ `shift-pattern.ts`, `routes.tsx` ↔ `CampRoutes.tsx`) зэрэгцэн оршсон; `App.tsx` хоёр давхар route-тэй болсон.
**Шийдэл:** Хуучин файлуудыг scratch руу нөөцлөөд устгасан; `App.tsx`, `Layout.tsx`-ийг HEAD-ээс сэргээгээд зөвхөн шинэ өөрчлөлтийг дахин хэрэглэсэн; таны машин дээр хуучин хувилбар байхгүйг (device_list_dir) шалгасан. Ашиглах боломжтой хэсгийг (e2e grant SQL, vitest config) хянаж, шинэ UI-д тааруулж үлдээсэн.
**Дүрэм:** Багц/шат эхлэхийн өмнө `git status --short`-ийг ЗААВАЛ шалгаж, untracked/modified файл бүрийн гарал үүслийг тодруулна. Шинэ файл бичихэд "created" биш "updated" гэсэн хариу ирвэл зогсож шалгана.

---

### [TEST-008] Playwright: `getByLabel`/`getByRole(name)` анхдагчаар том жижиг үсэг үл харгалзсан ДЭД мөр хайдаг
**Тохиолдсон:** Шат 8 багц 2 — хуурамч API-тай браузерын шалгалт, e2e dry-run. `getByLabel('Өрөө')` нь "Одоогийн өрөөг …" checkbox болон dialog-ийн `aria-label`-тай ("Өрөө шилжүүлэх") давхцаж strict mode алдаа өгсөн; `'Эхлэх огноо'`, `'Ээлж'` (↔ "Хэлтэс, ээлж" холбоос), `'1-р өдөр'` (↔ "11-р өдөр") мөн адил. `<span>{code}</span>{name}` хоорондоо зайгүй тул нэр "E1Бат" болж regex таараагүй. `<th>` нь `scope`-гүй үед columnheader гэж танигдаагүй.
**Шийдэл:** Тогтмол шошгод `{ exact: true }`; нэр/кодын хооронд `{' '}`; хүснэгтийн толгойд `scope="col"`; давтагдах элементэд (өрөөгүй ажилтны chip) `role="group"` + `aria-label`.
**Дүрэм:** e2e/UI тест бичихдээ богино шошгыг ЗААВАЛ `exact`; spec-ийг таны машинд өгөхөөс өмнө хуурамч backend дээр dry-run хийнэ (энэ удаа spec-ийн 2 selector-ийн алдааг илрүүлсэн).
**Дахин (багц 3, dry-run-аас ӨМНӨ кодыг уншихад илэрсэн):** `Modal`-ын "×" товч `aria-label="Хаах"` тул `getByRole('button', { name: /Хаах/ })` нь "Хаах (зардал бүртгэх)" товчтой давхцана → бүтэн нэрээр сонгосон. Дүрэм нэмэлт: цонх доторх товчийг сонгохдоо ui-kit-ийн өөрийн товчны нэр ("Хаах", "Болих")-тэй давхцах эсэхийг шалгана.

### [TEST-009] Playwright route interception multipart файлын агуулгыг дамжуулдаггүй (`postDataBuffer` хоосон)
**Тохиолдсон:** Шат 8 багц 2 — xlsx upload-ийн mock шалгалт "file талбар/xlsx алга" гэж унасан; бодит алдаа биш (CDP файл blob-ийг interception-д өгдөггүй).
**Шийдэл:** Upload-ийг `route.continue()`-ээр vite proxy → жижиг echo сервер (localhost:3000) руу бодитоор илгээж байт, boundary, файлын нэрийг шалгасан (6512 байт xlsx → 6750 байт multipart). UI урсгалын mock нь зөвхөн Content-Type-ийг шалгана. Мөн axios-ийн анхдагч `Content-Type: application/json` FormData-г JSON болгодог тул upload-д `'multipart/form-data'` гэж тодорхой өгсөн (boundary-г browser нэмнэ).
**Дүрэм:** Файл илгээх хүсэлтийг mock interception-ээр биш бодит HTTP-ээр шалгана; axios-ийн JSON анхдагчтай client-ээр FormData илгээхдээ Content-Type-ийг тодорхой заана.
**Давтагдсан (2026-11-07, v0.2.3 Блок 5):** Feed-ийн `feedApi.create` header-гүй FormData илгээж, зураг чимээгүй хаягдсан (пост зөвхөн текстээр үүссэн; e2e `core-v023-feed` барьсан). **Бүтцийн шийдэл:** `api/client.ts`-ийн request interceptor FormData бүрт `multipart/form-data` тавина (`lib/multipart.ts`, unit) — дуудлага бүрт заах шаардлагагүй.

### [FE-004] Шат 8 frontend — хуурамч API-тай браузерын шалгалтаар илэрсэн UI алдаанууд (хэрэглэгчид хүрэхээс өмнө зассан)
**Тохиолдсон:** Шат 8 багц 1–2 (cloud дээр tsc/eslint + 1400px/390px браузер шалгалт).
1. `// eslint-disable-next-line react-hooks/exhaustive-deps` → web-shell-ийн eslint-д react-hooks plugin **байхгүй** тул "Definition for rule … was not found" алдаа. **Шийдэл:** ийм comment бичихгүй; dependency-г зөв өгөх эсвэл логикийг effect-ээс гаргах.
2. Браузерын native validation (`required`, `type=number`) **англи** мессеж харуулсан. **Шийдэл:** form-д `noValidate`, шалгалтыг монгол мессежтэйгээр өөрсдөө (эсвэл backend-ийн монгол алдааг `ErrorBox`-оор).
3. 390px-д хэвтээ гүйлгээ гарсан (grid, урт товч, nav). **Шийдэл:** `grid-cols-1 sm:grid-cols-N`, Card-д `min-w-0`, товчинд `whitespace-nowrap`, nav `flex-wrap`/`overflow-x-auto`; хүснэгт card дотроо гүйлгэгдэнэ.
4. Tailwind class давхцал (`inputCls` + `py-1 text-sm` → аль нь ялах нь CSS-ийн дарааллаас хамаарна). **Шийдэл:** тусдаа `inputSmCls` хувилбар.
5. `window.prompt` (нэр засах) — тест хийх боломжгүй, mobile-д муу. **Шийдэл:** inline засвар.
**Дүрэм:** UI багц бүрийг хэрэглэгчид өгөхөөс өмнө 1400px + 390px-д `scrollWidth ≤ innerWidth` шалгаж, screenshot-оор нүдээр харна; native dialog/validation ашиглахгүй.

### [PROC-004] Баримт засахад Python `open()` текст горим CRLF файлыг бүхэлд нь LF болгосон
**Тохиолдсон:** Шат 9 — [[CHANGELOG]], [[project-status]], [[00_rules_and_context]] (CRLF) дээр хэдхэн мөр нэмэхэд `git diff --stat` 387/328/168 мөр өөрчлөгдсөн гэж харуулсан (universal newlines уншихдаа `\r\n` → `\n`, бичихдээ `\n`). Төхөөрөмж рүү хадгалахаас ӨМНӨ илэрсэн.
**Шийдэл:** Мөрийн төгсгөлийг сэргээсэн (`sed 's/$/\r/'`) → diff зөвхөн нэмсэн мөрүүд.
**Дүрэм:** Засварлах скриптэд `open(p, newline='')`; засварын дараа `git diff --stat`-ийн мөрийн тоо нь бодит өөрчлөлттэй таарч байгааг заавал шалгана (CRLF: `App.tsx`, `Layout.tsx`, `web-shell/package.json`, эдгээр 3 баримт).

## 21. v0.2.0 — Олон хэл, бөөнөөр оруулах, staging/upgrade (2026-10-11)

### [FE-008] Тохиргооны каталогийн линк кемпээс гаргаж хаяв
**Тохиолдсон:** `CampSettingsPage` (route `settings/:section`) доторх каталогийн `NavLink to={`../${s}`}` → `/camp/:id/settings/meal-locations` биш `/camp/:id/meal-locations` (байхгүй route) руу очиж, `CampRoutes`-ийн fallback `/camp` руу буцаав. e2e (`camp-v020.spec.ts`) барьсан.
**Шалтгаан:** React Router-ийн `..` анхдагчаар **route** шатлалаар (`relative="route"`), URL сегментээр биш.
**Дүрэм:** Nested route-д харьцангуй линк → `relative="path"`; табын линк бүрийг e2e-д дарж URL-ийг шалгана.

### [PROC-012] Үл үзэгдэх тэмдэгт (BOM) кодонд
> ⚠️ **Давтагдсан (2026-10-13):** `scripts/docs/gen-codebase-docs.mjs`-ийн `.replace(/^\uFEFF/, '')` мөр Write хэрэгслээр жинхэнэ BOM болсон — eslint барьсан, Python-оор зассан. **Нэмэлт дүрэм:** шинэ файл бүрийг танд өгөхөөс өмнө тухайн машин дээр `eslint <файл>` ажиллуулна (cloud-д eslint-гүй бол).
**Тохиолдсон:** CSV-ийн BOM-ийг арилгах `"\uFEFF"` мөрийг Write хэрэгслээр бичихэд escape биш жинхэнэ U+FEFF болж, eslint `no-irregular-whitespace` алдаа.
**Дүрэм:** Escape дараалал, үл үзэгдэх тэмдэгттэй кодыг Python (`\\uFEFF`)-оор бичиж, `grep -P '\xEF\xBB\xBF'`-ээр шалгана.

### [TEST-017] DB reset-ийн дараа эрхийн cache (Redis) хуучин
**Тохиолдсон:** Harness DB-г reset + `camp_e2e_grant.sql` хийсний дараа e2e 403 — эрхийн жагсаалт Redis-д reset-ээс өмнөхөөрөө.
**Дүрэм:** DB reset/seed/restore бүрийн дараа Redis `FLUSHALL` (`pilot.ps1 restore` аль хэдийн хийдэг; harness `db-reset.sh`-д нэмэв).

### [TEST-018] Playwright substring + төлөв үлдээсэн тест
**Тохиолдсон:** `getByRole('button', { name: 'Хаах' })` хоёр товч олж strict алдаа; хэлний тест `admin@test.mn`-ийн хэлийг `zh` болгож үлдээгээд дараагийн spec-үүд хятадаар нээгдэв.
**Дүрэм:** `exact: true` (эсвэл `.last()` — зориуд); хэрэглэгчийн тохиргоог өөрчилсөн spec `afterAll`-д буцаана.

### [OPS-004] Task Scheduler watchdog-ийг засвар үйлдлийн дундуур дахин асаах эрсдэл (урьдчилан сэргийлсэн)
**Илэрсэн:** `upgrade`-ийг зохиохдоо: `install-tasks` нь `RestartCount 3 / 1 мин` — `Stop-Watchdog` процессыг алахад Task "амжилтгүй" гэж үзэж 1 минутын дараа `pilot.ps1 run`-ийг дахин асааж, build/restore-ийн дундуур backend асаах боломжтой (v0.1.6-ийн `restore`-д ч мөн).
**Шийдэл:** `upgrade`/`restore` нь эхлээд Task-ийг `Stop` + `Disable`, дуусахад (алдаатай ч `finally`) `Enable` (`upgrade` амжилттай бол `Start`).
**Дүрэм:** Автомат дахин асаагчтай (watchdog, Task, service) системд урт засвар хийхдээ асаагчийг өөрийг нь түр унтраана.

### [PS-002] Shim-ийн процессын нэр
**Тохиолдсон:** pwsh shim тестэд `node` нь python shebang скрипт → `Get-Process`-ийн `ProcessName` = `python3` → `Get-PilotProcess 'backend' 'node'` "ажиллаагүй" гэж `stop` юу ч зогсоосонгүй (тест барьсан, бодит Windows-д `node.exe` тул асуудалгүй).
**Дүрэм:** Процессын нэр шалгадаг кодыг тестлэх shim нь жинхэнэ нэртэй байх (жижиг C wrapper, хүүхэд процесс `PR_SET_PDEATHSIG`-тэй).

### [TEST-019] CONC-002 тест postgres горимын бүтэн ажиллуулалтад нэг удаа унав
**Тохиолдсон:** Integration-ийг `DATABASE_URL=postgres`-оор 4 удаа бүтэн ажиллуулахад 1 удаа `30 зэрэгцээ MR үүсгэлт` унав; дангаар нь 2 удаа, бүтнээр 3 удаа ногоон.
**Таамаг (батлагдаагүй):** 30 transaction advisory lock-оор цувран хүлээх үед Prisma interactive transaction-ийн `maxWait` 2с / `timeout` 5с хэтэрч 500 (harness-ийн wasm adapter удаан). v0.2.0-д MR код өөрчлөгдөөгүй.
**Дүрэм:** TEST-015-ийн дагуу "flaky" гэж хаахгүй — QA-09-д бүртгэж, алдааны мессежийг барьж шалтгааныг батална.

### [PROC-013] Зааварт `dev:test-user` орхигдов → e2e 6 тест унав
**Тохиолдсон (2026-10-11 19:10):** v0.2.0-ийг таны машин дээр шалгах зааварт `pnpm supabase:reset` (auth.users-ийг цэвэрлэнэ) бичээд `pnpm dev:test-user`-ийг орхисон → `admin@test.mn` алга → `loginAs` 6 тест "Invalid login credentials", 23 тест ажиллаагүй. Код буруу биш (cloud e2e 55/55).
**Хоёр дахь удаа (19:14):** `dev:test-user`-ийн дараа ч `camp_e2e_grant.sql` (admin@test.mn → Кемп админ) мөн орхигдсон → Кемпийн 4 тест `POST /camps → 403 camp.err.access.2`. Би зааврыг CI-тэй тулгалгүй, санахаараа бичсэн нь давтагдав.
**Дүрэм:** DB reset орсон заавар бүрт CI-ийн дараалал бүтнээрээ: `supabase:reset` → `db:generate` → `dev:test-user` → `camp_e2e_grant.sql` → тест. Зааврыг `.github/workflows/ci.yml`-ийн "Prepare" алхмаас ХУУЛЖ бичнэ (санахаар биш). Docker контейнерийг нэрээр нь яг заана (`supabase_db_s-project` — пилотын `supabase_db_s-project-pilot`-тэй андуурахгүй).

### [CI-005] CI улаан: Node 20, Prisma client generate-гүй unit тест
**Тохиолдсон (2026-10-11, v0.2.0 push):** GitHub Actions "Lint · Unit · Integration · Build" — (1) `TenantOnboardingService` 6 тест: `Node.js detected but native WebSocket not found` (CI `node-version: 20`; `@supabase/supabase-js` realtime нь Node 22+-ийн native WebSocket шаарддаг — Dockerfile, таны машин 22); (2) `workflow-definition.*`, `require-role.helper` тест: `Cannot read properties of undefined (reading 'OWNER')` — unit алхмын өмнө `prisma generate` хийгдээгүй тул `@prisma/client`-ийн enum-ууд алга (e2e job-д л `db:generate` байсан).
**Шалтгаан:** CI-г v0.1.5-аас хойш хэн ч шалгаагүй (QA-01, CI-004); local болон harness-д Prisma client аль хэдийн generate хийгдсэн байдаг тул илрээгүй.
**Шийдэл:** `ci.yml`: хоёр job-д `node-version: 22`; install-ийн дараа `pnpm db:generate`.
**Дүрэм:** CI-ийн орчин (Node, generate алхам) = Dockerfile/production-тэй ижил; release бүрт CI ногоон эсэхийг "дуусах нөхцөл"-д заавал шалгана.

### [PS-003] `pilot.ps1 upgrade` staging дээр "start"-ын дараа гацав
**Тохиолдсон (2026-10-11 20:12, staging дадлага):** `upgrade -Tag v0.2.0 -Profile staging` → init, build, start бүгд `[OK]` ("Пилот ажиллаж байна") ч эх процесс цааш явсангүй (health шалгалт, `upgrade.log OK`, мессеж гараагүй). Staging өөрөө амжилттай шинэчлэгдэж ажиллаж байсан.
**Шалтгаан:** `Invoke-Self` нь дэд `powershell -File pilot.ps1 start`-ийг `Invoke-Native` (`& exe | Out-Host`) — stdout-ыг **pipe**-аар уншина. Дэд процессын `Start-Process`-оор асаасан backend (node) ба Caddy нь удамшдаг handle-уудыг (тэр pipe-ийн бичих үзүүрийг) авч, урт хугацаанд ажилладаг тул дэд процесс дууссан ч pipe EOF болохгүй → эх процесс мөнхөд хүлээнэ. Linux дээрх pwsh + shim тест (.NET Unix нь бусад fd-г CLOEXEC болгодог) үүнийг илрүүлээгүй.
**Шийдэл:** `Invoke-Self` → `System.Diagnostics.Process.Start` (`UseShellExecute=$false`, redirect-гүй — консолыг шууд хуваалцана) + `WaitForExit()` (зөвхөн тэр процессыг), exit code шалгана; аргументийн хашилт (зай, төгсгөлийн `\`).
**Дүрэм:** Урт амьдрах процесс асаадаг командыг pipe-аар бүү дууд. Windows-ийн процесс/handle-ийн зан төлөвийг Linux shim тестээр "баталгаатай" гэж үзэхгүй — Windows дээрх анхны ажиллуулалтыг staging дээр.

### [CI-006] CI: Supabase CLI "latest" → хоосон SUPABASE_URL
**Тохиолдсон (2026-10-11 20:39):** CI-005-ийн дараа Unit ногоон болсон ч Integration 18/20 файл `Error: supabaseUrl is required`. "Supabase env" алхам `eval "$(… status -o env | grep '^API_URL=…')"` юу ч олоогүй ч алдаагүй өнгөрч, хоосон утгыг `$GITHUB_ENV`-д бичсэн. `setup-cli` нь `version: latest` (өмнөх run-д `toomanyrequests`, порт 54322-ийн алдаа ч энэ үед гарсан) — таны машин/lockfile `supabase@2.120.0` (`status -o env` = `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` — бинарийг шалгаж баталсан).
**Шийдэл:** хоёр job-д `setup-cli version: 2.120.0`; түлхүүр алга бол түлхүүрийн нэрсийг (утгагүй) хэвлээд тэр алхамдаа унана.
**Дүрэм:** CI-ийн хэрэгслийн хувилбарыг lockfile/машинтай ижил pin хийнэ ("latest" хориглоно); env бэлтгэх алхам хоосон утгыг "чимээгүй" дамжуулахгүй.

### [CI-008] Эрхийн V2 → V1 шилжилтийн хуучин unit хүлээлт CI-д үлдсэн
- **Тохиолдсон (v0.2.3 Блок 6б):** `camp.contract.manage` V1 болсон ч RBAC unit тест V2-ийн яг дөрвөн код гэж шалгасаар CI унасан.
- **Шийдэл:** V2-ийн яг гурван кодыг шалгаж, гэрээний эрхийг V1-ийн assertion-д оруулав.
- **Дүрэм:** Эрхийн төлөв солихдоо тухайн кодыг хүлээж буй бүх unit болон integration assertion-ийг хайж хамтад нь шалгана.

### [CI-007] Turbo 2 env-ийг шүүдэг → CI integration-д SUPABASE_URL алга
**Тохиолдсон (2026-10-11 20:48):** CI-006-ийн дараа "Supabase env" алхам амжилттай (түлхүүр бүгд олдсон, хамгаалалт унаагүй) ч integration 18 файл дахин `supabaseUrl is required`.
**Шалтгаан:** `pnpm turbo test:integration` — Turbo 2-ийн анхдагч **strict env mode** нь `turbo.json`-д зарлаагүй орчны хувьсагчийг task-ийн процесст дамжуулдаггүй. Local-д апп `.env` файлаас уншдаг тул илрээгүй; CI-д `.env` алга, бүх утга `$GITHUB_ENV`-ээр ирдэг. Баталгаа: ижил task `passThroughEnv`-гүй → `SB=undefined`, байвал `SB=http://x`. CI-006-ийн (CLI pin) засвар хэрэгтэй хэвээр боловч энэ алдааны жинхэнэ шалтгаан биш байсан — би нэг алдааг хоёр удаа буруу таамагласан.
**Шийдэл:** `turbo.json` — `test`, `test:unit`, `test:integration`, `test:e2e`-д `passThroughEnv` (DB/Redis/JWT, `SUPABASE_*`, `VITE_*`, `E2E_*`, `TEST_*`, `RATE_LIMIT_*`, `NODE_ENV`, `CI`).
**Дүрэм:** CI-ийн алдааг засахаасаа өмнө шалтгааныг туршилтаар батална (энд: turbo task-д env хэвлэх) — "магадгүй"-гээр засвар push хийхгүй.

### [PROC-014] Пилотын шинэчлэл: checkout цуцлагдсан ч дараагийн алхмууд үргэлжлэв
**Тохиолдсон (2026-10-11 21:11):** Миний гар заавар (v0.1.6.1-ийн `pilot.ps1`-д `upgrade` алга тул): `git status --short # хоосон байх ёстой` → пилотын хавтсанд commit хийгээгүй `CampLayout.tsx` (цэсний шошго засвар) байсан → `git checkout v0.2.0` "would be overwritten… Aborting" → `init`, `build` хуучин `v0.1.6.1` дээр ажиллаж, пилот хуучин хувилбараараа дахин асав. Мөн `Disable/Enable-ScheduledTask` админ бус цонхонд "Access is denied".
**Хохирол:** алга (өгөгдөл, ажиллагаа хэвийн; локал засвар хадгалагдсан) — гэхдээ шинэчлэгдсэн гэж буруу ойлгох эрсдэлтэй байв.
**Дүрэм:** Гар заавар бүрт алхам бүрийн **хүлээгдэх гаралт** ба "**өөр бол ЗОГС, надад илгээ**"; админ эрх шаардах алхмыг эхэнд нь тусгайлан; пилотын хавтсанд локал өөрчлөлт хийхгүй (хийсэн бол dev-д commit). v0.2.0-оос `pilot.ps1 upgrade` эдгээрийг өөрөө шалгадаг (бохир tree → эхлэхгүй).

## 22. v0.2.1 — Хоолны тооцооны загвар (2026-10-11)

### [FE-009] Нарийн самбарт шинэ контрол нэмэхэд товч харагдахгүй болов
**Тохиолдсон:** Байрны жагсаалтын мөрөнд "байрны төрөл" select нэмэхэд "+ Олон өрөө" товч самбараас гарч далдлагдсан. Үүнийг e2e (FB-07) барьсан.
**Шийдэл:** Үйлдлүүдийг тусдаа мөрөнд (`flex-wrap`) гаргасан.
**Дүрэм:** Мөрөнд контрол нэмбэл тухайн хуудсын e2e-г заавал ажиллуулж, screenshot-ыг харна.

### [TEST-020] Playwright `getByLabel` шошгын хэсгээр ч тааруулдаг
**Тохиолдсон:** Шинэ "Өдрийн ирц: албан тушаал" шошго хуучин тест дэх `getByLabel('Албан тушаал')`-д давхар тааралдаж strict mode алдаа өгсөн.
**Шийдэл:** Шошгыг өвөрмөц болгож, тестэд `{ exact: true }` нэмсэн.
**Дүрэм:** Нэг хуудсанд ижил төстэй шошго нэмэхээс өмнө тэр хуудсын хуучин e2e-г ажиллуулна.

### [DATA-001] Backfill-ийн каталогийн нэр санамсаргүй хэлбэрээр сонгогдов
**Тохиолдсон:** Чөлөөт текстээс албан тушаал үүсгэхэд "хамгийн эрт бичигдсэн" хэлбэрийг сонгосон тул " жолооч" гарсан (A = B шалгалтын явцад илэрсэн).
**Шийдэл:** Хамгийн олон давтагдсан хэлбэрийг, тэнцвэл том үсэгтэйг, дараа нь хамгийн эртийг сонгодог болгосон → "Жолооч".
**Дүрэм:** Backfill-ийг бодит төстэй өгөгдлөөр (үсэг/зайн хувилбартай) A = B шалгаж, үүссэн нэрсийг нүдээр харна. Кирилл `lower()` нь DB-ийн locale-оос хамаарна (C.UTF-8/en_US.UTF-8 OK, "C" бол үгүй).

### [PROC-015] Context хэмнэх
**Тохиолдсон:** v0.2.1 frontend-ийн шатанд бүтэн e2e-г дахин дахин ажиллуулж, урт гаралт уншсанаар context хурдан дуусав.
**Дүрэм:**
- Файлын зөвхөн хэрэгтэй хэсгийг уншина.
- Тестийн гаралтаас зөвхөн дүн болон эхний алдааг харна.
- E2E-г эхлээд зөвхөн өөрчлөгдсөн spec-ээр, бүтнээр нь хамгийн сүүлд нэг удаа ажиллуулна.
- Нэг session-д нэг блок ажил хийнэ. Блок дуусахад таны компьютерт хадгалж, дараагийн session-д шилжүүлэх тэмдэглэл бичнэ.

### [SEC-007] 🔴 Caddy `X-Forwarded-For`-ийг хаядаг → Supabase Auth-ийн IP хязгаар бүх хэрэглэгчид нэг (эсвэл огт үйлчлэхгүй)
**Илэрсэн (PIL-07, 2026-10-11):** Зам: Tailscale Funnel → Caddy (127.0.0.1) → Kong → GoTrue. Funnel хэрэглэгчийн бодит IP-г `X-Forwarded-For`-д тавьдаг ч Caddy (`trusted_proxies`-гүй) ирсэн XFF-д итгэхгүй, upstream руу `127.0.0.1` болгож илгээдэг (Caddy 2.8.4 + echo upstream-аар батлагдсан). Мөн GoTrue IP-ээр хязгаарлахдаа зөвхөн `GOTRUE_RATE_LIMIT_HEADER` тохируулсан үед header-ийг ашигладаг; хоосон бол `/token`-д IP хязгаар үйлчлэхгүй (эх код `middleware.go`), Supabase CLI үүнийг тохируулдаггүй.
**Шийдэл (v0.2.1 #15):** Caddyfile global `servers { trusted_proxies static 127.0.0.1/32 ::1/128; client_ip_headers X-Forwarded-For }` (Caddy 127.0.0.1-д bind хийсэн тул гаднаас хуурамч XFF ирэхгүй) + GoTrue-д header-ийг дамжуулах арга. Staging дээр буруу нууц үгээр олон удаа нэвтрэхэд `429` гарч байгааг батлана.
**Дүрэм:** Reverse proxy-г гинжээр (Funnel/Cloudflare → Caddy → Kong → апп) тавибал давхарга бүрийн XFF зан төлөвийг echo upstream-аар шалгана. Хязгаарлалт "тохиргоонд бичигдсэн" нь "ажиллаж байна" гэсэн үг биш — 429-ийг бодитоор гаргаж батална.

### [TEST-021] Cloud-д `prisma generate` engine татах гэж унадаг (binaries.prisma.sh 403)
**Тохиолдсон:** Шинэ cloud орчинд core-kernel unit тест ажиллуулахын тулд Prisma client generate хийхэд CLI schema-engine татах гэж 403.
**Шийдэл:** Хоосон файл үүсгээд `PRISMA_SCHEMA_ENGINE_BINARY=<хоосон>` `PRISMA_QUERY_ENGINE_LIBRARY=<хоосон.so.node>` `npx prisma generate` — Prisma 5 DMMF-ийг wasm-аар гаргадаг тул client (төрөл, enum) үүснэ, татахгүй. Unit тест (DB-гүй) 583/583.
**Дүрэм:** Зөвхөн unit тест/typecheck-д. Бодит DB-тэй integration-д TEST-010-ийн wasm + `@prisma/adapter-pg` harness хэрэглэнэ. Төсөлд (CI, пилот) хэзээ ч хэрэглэхгүй.


### [TEST-022] Harness: schema өөрчлөөд client-ийг дахин generate хийхэд wasm loader-ийн засвар арилсан
**Тохиолдсон (v0.2.2 Блок 1):** TEST-010-ийн harness-д `client/wasm.js`-ийн `#wasm-engine-loader`-ийг гараар `fs.readFileSync`-ээр сольсон. Prisma schema-д шинэ model нэмээд дахин generate хийхэд файл шинээр үүсэж засвар алга болов → `The loaded wasm module was unexpectedly undefined`.
**Шийдэл:** Засварыг generate скрипт (`gen.sh`)-д нэгтгэв — generate бүрийн дараа автоматаар (idempotent).
**Дүрэм:** Үүсгэгддэг (generated) файлд гараар засвар хийхгүй; хийх бол үүсгэх скриптийн нэг алхам болгоно.
**Нэмэлт (GoTrue-гүй integration):** Service-ийг `app_user` (RLS) `PrismaClient`-ээр шууд үүсгэж, `core_users`-ийг санамсаргүй `authId`-тай оруулбал GoTrue хэрэггүй (`test/camp-v022-perms.integration.spec.ts`) → cloud harness-д ч, CI-д ч ажиллана.

### [TEST-023] Зан төлөвийн өөрчлөлт → зөвхөн CI-д ажилладаг тест хуучин хүлээлттэй үлдэх эрсдэл
**Илэрсэн (урьдчилан, v0.2.2 Блок 1):** ADR-003 §2.4: роль = загвар, засахад хэрэглэгчийн эрх автоматаар өөрчлөгдөхгүй. `camp-master.integration.spec.ts` (GoTrue шаарддаг → cloud-д ажиллахгүй) "роль засахад manager шууд 201" гэж хүлээж байв → таны CI-д унах байсан.
**Шийдэл:** Тестийг шинэ урсгалд (засах → 403 хэвээр → `POST roles/:id/apply` → 201) шилжүүлэв.
**Дүрэм:** API-ийн зан төлөв өөрчлөхөөс өмнө `grep -rn '<endpoint>' test/ apps/e2e` — ажиллуулж чадахгүй тестийн хүлээлтийг ч шинэчилнэ.

### [PROC-016] Кирилл нэртэй файл `git ls-files | tar -T`-д алга болов
**Тохиолдсон:** `git ls-files` нь ASCII бус нэрийг `"docs/S Project_ \320\242…"` хэлбэрээр (core.quotePath) гаргадаг → `tar: Cannot stat`.
**Шийдэл:** `git ls-files -co --exclude-standard -z | … | tar czf x.tgz --null -T -`.

### [AUTH-003] GoTrue унтарсан үед хэрэглэгч "нууц үг буруу" гэж харах байв
**Илэрсэн (v0.2.2 Блок 2, бүтэн AppModule-ийг harness-д асааж):** `supabase.auth.signInWithPassword` сүлжээний алдаанд throw хийхгүй — `{ error: AuthRetryableFetchError, status: 0 }` буцаадаг. Код зөвхөн `status >= 500`-ийг 503 гэж үзэж байсан тул 401 `auth.invalid_credentials` гарсан.
**Шийдэл:** `isAuthServiceDown(e)` = `name === 'AuthRetryableFetchError' || !status || status >= 500` → 503 `auth.service_unavailable` (sign-in, change-password).
**Дүрэм:** Гадны client-ийн "алдаа буцаадаг (throw биш)" API-д сүлжээний алдааг тусад нь шалгана; unit mock-д ч энэ хэлбэрийг оруулна.

### [SEC-008] Нэвтрэлтийн хязгаар — амжилттай оролдлогыг тоолбол бодит хэрэглээ 429 авна
**Илэрсэн (урьдчилан, v0.2.2 Блок 2):** Эхний хувилбар нэвтрэх нэр 10 / 15 мин, IP 30 / 5 мин — БҮХ оролдлогыг тоолсон. e2e нь `beforeEach`-д нэг admin-аар олон удаа нэвтэрдэг; пилотод кемпийн нэг WiFi/NAT-аас өглөө олон ажилтан зэрэг нэвтэрнэ → 429.
**Шийдэл:** зөвхөн амжилтгүйг тоолно (нэвтрэх нэр 10 / 15 мин, IP 50 / 5 мин), амжилт нэвтрэх нэрийн тоолуурыг тэглэнэ; IP-г зөвхөн Caddy-ийн `X-Real-IP` (loopback-аас) байгаа үед. Үндсэн хамгаалалт = GoTrue-ийн бүртгэлийн түгжээ (PIL-07).
**Дүрэм:** Хязгаар тавихдаа "нэг IP-ийн ард олон хүн" (NAT, WiFi, proxy) ба тестийн давтамжийг тооцно.

### [PROC-008] (давтагдсан, 2026-10-12) `pkill -f` cloud shell-ийг дахин зогсоов
**Тохиолдсон:** `pkill -f "caddy run"`, `pkill -f "vite --port"` → exit 144, ажлын мөр тасарсан. **Дүрэм (чангатгав):** cloud-д `pkill -f` огт ашиглахгүй — арын процессыг `timeout N cmd &`-ээр эхлүүлж өөрөө дуусгана, эсвэл PID-ийг файлд бичиж `kill $(cat pid)`.

### [PROC-004] (давтагдсан, 2026-10-12) CRLF файл Python-ий текст горимоор LF болов — 9 файл
**Тохиолдсон:** Блок 2-т `auth/*.ts`, e2e helper, `ProtectedRoute.tsx` (CRLF) — `open(p).read()` / `write` → LF; sync-ийн hash `\r`-ийг хасдаг тул илрээгүй, git-д бүх мөр өөрчлөгдсөн мэт харагдах байв. Sync-ийн өмнөх шалгалтаар (base-д CR байсан эсэх) илэрч сэргээв.
**Дүрэм (чангатгав):** засварын скрипт `open(p, newline='')` эсвэл bytes-ээр; sync-ийн өмнө `git diff --name-only`-ийн файл бүрт "base CRLF ↔ одоо" шалгана (G1 алхамд).

### [TEST-024] Raw query-ийн `timestamptz` → JS `Date` хөрвүүлэлтэд найдах эрсдэл
**Илэрсэн (v0.2.2 Блок 3, harness integration):** `core_user_invites.expires_at`-ийг `$queryRaw`-аар уншиж JS-д `now`-тэй харьцуулсан → DB-д хугацаа дууссан (1 цагийн өмнө) токен "хүчинтэй" гэж гарав. Harness-ийн `@prisma/adapter-pg` нь timestamptz-ийг цагийн бүсгүй уншсан (+8 цаг). Бодит Prisma engine-д зөв байж магадгүй ч ялгаа нь эрсдэл.
**Шийдэл:** хугацаа/төлвийг SQL-д тооцно: `(expires_at <= now()) AS expired`, `(used_at IS NOT NULL) AS used`; "нэг удаа" = атом `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING`.
**Дүрэм:** Аюулгүй байдлын шийдвэр (хугацаа, түгжээ) DB-ийн цаг (`now()`) дээр — app/driver-ийн Date хөрвүүлэлтэд найдахгүй.
---

## 24. v0.2.2 — Хэрэглэгч ба ажилтан (2026-10-12 → )

### [MIG-002] Migration-ы дугаарыг төлөвлөгөөний блокийн дарааллаар урьдчилан эзэлж болохгүй
- **Нөхцөл:** Tech plan-д Блок 5 (ажлаас гаргах)-д `…005`, Блок 3 (урилга)-д `…006` дугаар өгсөн байсан. Блок 3 түрүүлж хэрэгжсэн → `…006` нь `…005`-аас өмнө apply хийгдэх байсан.
- **Шалтгаан:** Supabase CLI нь сүүлд apply хийсэн migration-аас **өмнөх** timestamp-тай шинэ файлыг (дараалал алдагдсан) хүлээж авдаггүй — staging / пилот дээр upgrade зогсоно.
- **Шийдэл (2026-10-13):** Дугаарыг сольсон: урилга = `20261013005_core_user_invites.sql`, ажлаас гаргах = `…006` ([[07_v0.2.2_tech_plan]] §3.5).
- **Дүрэм:** Migration файлын дугаарыг **хэрэгжүүлэх үед** (бодит дарааллаар) өгнө; tech plan-д зөвхөн «шинэ migration» гэж тэмдэглэнэ. Хэрэгжсэн, apply хийгдсэн migration-ы нэрийг хэзээ ч өөрчлөхгүй (MIG-001-тэй хамт — `db push` биш migration).

### [PROC-018] Prisma model-ийн нэрийг солиход (`@@map` хэвээр) DB өөрчлөгдөхгүйг cloud-д хэрхэн батлах (v0.2.2 H1)
- **Нөхцөл:** `CampEmployee → HrEmployee` г.м. 10 model-ийн нэрийг сольсон. Cloud-д `prisma migrate diff` ажиллахгүй (schema-engine татагдахгүй — TEST-021).
- **Шийдэл:** Хуучин/шинэ schema-ийн DMMF-ийг (`@prisma/internals` `getDMMF`, wasm) model нэрийг нормчилж **бүтцээр** харьцуулсан: `dbName`, талбарын `dbName`/төрөл, PK/unique/index нэр — 65 model, 0 зөрүү. `relationName` л өөрчлөгдөнө — implicit m-n (`_AToB` хүснэгт) байхгүй тул DB-д нөлөөгүй (шалгасан). Дараа нь migration-уудыг цэвэр PG16 дээр apply хийж бүх integration тест.
- **Дүрэм:** Model rename = (1) `@@map` бүх model-д байгаа эсэх, (2) implicit m-n relation байхгүй эсэх (байвал join хүснэгтийн нэр өөрчлөгдөнө!), (3) DMMF бүтцийн харьцуулалт эсвэл таны машин дээр `prisma migrate diff --from-migrations … --to-schema-datamodel …` хоосон.

### [DOC-004] Хуучин замыг controller өвлөлтөөр хийхэд API каталогид харагдаагүй (v0.2.2 H1)
- **Нөхцөл:** Хуучин `/camp/...` замуудыг `class CampX extends HrX {}` (+ `@Controller('camp/…')`) болгосон. Файлыг `hr-legacy.controllers.ts` гэж нэрлэсэн → `docs:gen` зөвхөн `*.controller.ts`-ийг уншдаг, мөн өвлөсөн route-ийг танихгүй байсан → 39 endpoint каталогоос дутсан.
- **Шийдэл:** Файлыг `hr-legacy.controller.ts` болгосон; `gen-codebase-docs.mjs`-д `extends` controller-ийн route-уудыг эцгийнхээс угтвар сольж нэмэх (+ `Deprecated` тэмдэглэл) алхам нэмсэн → 201 endpoint.
- **Дүрэм:** Controller файл үргэлж `*.controller.ts`. Өвлөсөн controller-ийн route param нэр эцгийнхтэй ИЖИЛ байна (`:campId`) — method-ийн `@Param('campId')` хуваалцана.

### [TEST-025] Integration тестийн бэлтгэл өгөгдөл DB-ийн CHECK-ийг зөрчсөн — cloud-д ажиллуулаагүй тест CI-д анх удаа унах байсан (v0.2.2 Блок 5-д илэрсэн)
- **Нөхцөл:** `camp-v022-users.integration` (Блок 4) урилгыг `tokenHash: 'old-<sfx>'` гэж шууд үүсгэсэн → `ck_core_user_invites_hash` (64 hex) → beforeAll унана. Блок 4-т cloud-д Prisma engine 403 гэж ажиллуулаагүй, «CI-д» гэж үлдээсэн.
- **Шийдэл:** `createHash('sha256').update(…).digest('hex')`. TEST-010 harness-аар (wasm + adapter-pg, PG16) cloud-д 3/3 ногоон.
- **Дүрэм:** «Cloud-д ажиллахгүй, CI-д» гэж шинэ integration тест үлдээхгүй — TEST-010 harness-аар заавал нэг удаа ажиллуулна. Тестийн бэлтгэл өгөгдөл migration-ийн CHECK/хэлбэрийг (hash, код, огноо) хангана.

### [MIG-003] Шинэ enum утгыг partial index-д ашиглах — ADD VALUE тусдаа migration (RULE-15 давтан батлав, v0.2.2 Блок 5)
- **Нөхцөл:** `CampEmployeeStatus += TERMINATED` ба `uq_camp_employees_code … WHERE status <> 'TERMINATED'` нэг файлд байвал `unsafe use of new value` (нэг transaction).
- **Шийдэл:** `20261017001` = зөвхөн `ADD VALUE` (TERMINATED, TERMINATE, REHIRE); `20261017002` = багана, CHECK, partial unique, эрх. Цэвэр PG16 дээр 47 migration-ийг файл бүрийг `psql -1`-ээр (Supabase CLI-тэй ижил — нэг transaction) apply хийж шалгав.
- **Дүрэм:** Enum утга нэмэх migration-д тэр утгыг хэрэглэх юу ч (index, CHECK, seed, функц) бичихгүй.

### [PROC-008] (давтагдсан — 2 дахь удаа, 2026-10-17) `pkill -f "vite --port"` — дүрэм мэдсээр байж зөрчив (exit 144)
- **Тохиолдсон:** Блок 5-ын UI smoke-ийн дараа vite-ийг `pkill -f`-ээр зогсоох гэж ажлын мөр (docs:gen) тасарсан. Хор хөнөөлгүй (дахин ажиллуулсан).
- **Дүрэм (хэвээр, чангатгав):** арын процессыг tool-ийн `run_in_background` + `timeout N`-оор эхлүүлнэ — өөрөө дуусна; гараар зогсоох бол `kill <PID>` (PID-ийг эхлүүлэхдээ файлд). `pkill`/`killall` командыг cloud-д огт бичихгүй.

### [TEST-026] e2e: H2-ын зөөлтийн дараа хуучирсан хүлээлт + профайлын хэл өөрчилдөг тест зэрэг ажиллаж бусдыг унагав (v0.2.2 Блок 5-ын e2e, таны машин)
- **Тохиолдсон:** `pnpm e2e` 62 ✓ / 4 ✗. (1) `camp-ops` «Өрөөний самбар», «Хоол»-ыг HR цэснээс хайсан — H2-оор тэдгээр Кемпэд үлдсэн; (2) `camp-v020` EN тест «Camp sections › Attendance» — ирц HR-д шилжсэн; (3) `camp.spec`, `camp-v021` — монгол шошго хайтал UI англи байв: `camp-v020`-ийн хэлний тест admin@test.mn-ийн **профайлын** хэлийг EN болгож, локалд 6 worker зэрэг ажиллахад бусад тест EN UI-тай нээгдсэн (CI-д `workers: 1` тул илрээгүй).
- **Шийдэл:** `camp-ops` `openSection` — HR (Ирц, Ээлж, Ажилтан) / Кемп (Өрөөний самбар, Хоол) салгав; EN тест «HR sections»; `camp.spec` эрхийн нэр `perm.<code>` («Кемп › …»). Хэлний **хоёр** тест (`camp-v020`, `camp-v021`) — fixture `devAdmin`-аар (ижил DEV tenant, ADMIN) өөрийн context-д; admin@test.mn-ийн профайлын хэл өөрчлөгдөхгүй. (Эхний оролдлого — `@lang` тусдаа project — буруу: serial describe-ийн өмнөх тестийн `campId`-гүй ажиллана, бас `camp-v021`-ийн хэлний тестийг алдсан → буцаасан.)
- **Нэмэлт олдвор:** ирцийн импорт «Цуцлах» дууссанаас өмнө шинэ файл оруулбал шинэ preview арилдаг байсан (UI уралдаан) — зөвхөн цуцалсан импортын preview-г хаадаг болгов (`AttendancePage`).
- **Дүрэм:** Хуваалцсан хэрэглэгчийн төлөвийг (хэл, эрх, нууц үг) өөрчилдөг e2e тест **тусдаа хэрэглэгч**ээр (fixture). Tenant даяар нөлөөлөх тест (орчуулгын override г.м.) мөн адил эрсдэлтэй. UI зөөлт (H2 г.м.) хийсэн блок бүрт e2e-г таны машин дээр **тэр блокт нь** ажиллуулна.

### [TEST-033] Нэвтэрсний дараах нүүр солигдоход MR e2e хуучин нүүрийг хүлээв
- **Тохиолдсон (v0.2.3):** Feed үндсэн нүүр болсон ч MR-ийн гурван e2e тест нэвтрээд шууд MR жагсаалт нээлттэй гэж үзсэнээс CI унав.
- **Шийдэл:** MR үүсгэх болон жагсаалт шалгах тест нэвтэрсний дараа `/requisitions`-д ил тод очно.
- **Дүрэм:** Нүүр/redirect солихдоо нэвтрэлтийн helper ашигладаг бүх e2e урсгалын эхлэх хуудсын хүлээлтийг шалгана.

### [FE-010] `React.lazy` хуудас тусдаа chunk болоогүй — өөр хуудас түүнээс тогтмол import хийсэн (v0.2.2 Блок 6, PIL-10)
- **Тохиолдсон:** `ChangePasswordPage`-ийг `lazy()` болгосон ч build-д тусдаа файл гараагүй (chunk 404-ийн reload тест 404 хүлээж аваагүй). Шалтгаан: нийтийн `SetPasswordPage` нь `import { MIN_PASSWORD_LENGTH } from './ChangePasswordPage'` — статик import модулийг бүхэлд нь үндсэн chunk-д татна.
- **Шийдэл:** тогтмолыг `lib/password-change.ts` руу зөөв; build-д `ChangePasswordPage-*.js` тусдаа (4 kB).
- **Дүрэм:** lazy хуудаснаас (`pages/*`, `modules/*/pages/*`) **юу ч** export хийж бусад файлд ашиглахгүй — хуваалцах тогтмол/функц → `lib/`. Code-split-ийг build-ийн гаралтаар (файлын нэр) шалгана, кодыг харж таамаглахгүй.

### [PROC-019] Release-д хувилбарын дугаар (`package.json`, `APP_VERSION`) ахиулаагүй — v0.2.1 `/health`-д `0.2.0` гэж харуулсан
- **Тохиолдсон:** v0.2.2 Блок 6-д илэрсэн: бүх `package.json` + `APP_VERSION` = `0.2.0`, харин пилот v0.2.1 дээр ажиллаж байсан. `app-version.spec` зөвхөн хоёр утга **ижил** эсэхийг шалгадаг тул илрээгүй.
- **Шийдэл:** v0.2.2-д бүгдийг `0.2.2` болгосон; [[pilot-test-guide]] TC-v022-18 (`/api/v1/health` → `"version":"0.2.2"`).
- **Дүрэм:** Release бэлтгэлийн блокийн checklist-д «хувилбарын дугаар (бүх `package.json` + `APP_VERSION`)» мөр заавал; пилотыг шинэчилсний дараах эхний шалгалт = `/health`-ийн `version`.

### [PROC-008] (давтагдсан — 3, 4 дэх удаа, 2026-10-17, Блок 6) `pkill -f "vite preview"` (exit 144)
- **Тохиолдсон:** UI smoke-ийн дараа preview-ийг зогсоох гэж 2 удаа `pkill -f` бичив — дүрмийг уншилгүй (lessons-ийг блокийн эхэнд шалгаагүй). Хор хөнөөлгүй: тухайн дуудлагад өөр ажил байгаагүй.
- **Дүрэм (хэвээр):** арын сервер → `run_in_background` + `timeout N`; зогсоох → `kill <PID>`. Smoke/preview эхлүүлэхийн өмнө [[lessons_learned]]-ээс `PROC-008`-ийг шалгана.

### [SEC-009] 🔴 Кемп админ (модулийн роль) OWNER / ADMIN бүртгэлийг булааж авах боломжтой байсан — v0.2.2 анализ (Блок 6б)
- **Тохиолдсон:** release-ийн өмнөх бүрэн анализаар илэрсэн (пилотод хүрээгүй): бүх кемпийн `camp.roles.manage`-тай REQUESTER (Кемп админ) `POST /camp/users/:id/invites` (LINK)-ээр OWNER-т урилгын токен авч нууц үгийг нь тавих, ADMIN / OWNER-ийг идэвхгүй болгох, ажилтанд холбох боломжтой байв. Unit тестээр хуулбарласан.
- **Шалтгаан:** хэрэглэгч удирдахыг модулийн эрхээр (`camp.roles.manage`) хамгаалсан; зорилтот хэрэглэгчийн системийн роль (OWNER / ADMIN) шалгагдаагүй. Тест зөвхөн «эрхгүй actor → 403»-ийг шалгадаг, «эрхтэй actor × өндөр эрхтэй зорилт»-ыг шалгадаггүй байв.
- **Шийдэл:** хэрэглэгч / роль / эрх удирдах (27 газар) → `CampAccessService.requireTenantAdmin` (зөвхөн OWNER / ADMIN, `camp.err.access.admin`); ажлаас гаргах / дахин ажилд авахад зорилт OWNER / ADMIN бол нэвтрэх эрхийг зөвхөн системийн админ хаах / шилжүүлнэ; «Хэн үзсэн» зөвхөн системийн админ. Frontend `isSystemAdmin`, `camp.roles.manage` матрицаас нуугдсан (DB-д үлдсэн — ADR-007, v0.2.3). e2e — тусдаа fixture `devUserAdmin`.
- **Дүрэм:** Хэрэглэгч, нууц үг, эрх олгох үйлдлийг **модулийн эрхээр биш системийн ролиор** хамгаална. Эрхийн тест бүрт «эрхтэй actor → өөрөөсөө өндөр эрхтэй зорилт» кейс заавал. Токен / нууц үг тавих линк үүсгэдэг endpoint = эрх нэмэгдүүлэх гарц гэж үзнэ.

### [AUTH-004] Идэвхгүй болгосон / ажлаас гарсан хэрэглэгч 5 мин хүртэл «гишүүн» хэвээр, frontend гаргадаггүй байсан (Блок 6б)
- **Тохиолдсон:** `setActive(false)`, `terminate` нь membership cache-ийг (`tenant:member`, 5 мин) цэвэрлэдэггүй; guard-ийн «гишүүн биш» 403 нь кодгүй, frontend зөвхөн 401 дээр гаргадаг → хэрэглэгч алдааны мессежтэй дэлгэц дээр токен дуустал (~1 цаг) үлддэг.
- **Шийдэл:** `setActive` / `terminate` / `rehire` → `tenantCache.invalidateMember` + `access.invalidate`; guard → `forbidden('auth.not_member')` (3 хэл); frontend `isSessionRevoked` (403 `auth.not_member` / `camp.err.access.1`) → 401-тэй адил локал session → /login (FE-007 давталтгүй, браузераар шалгасан).
- **Дүрэм:** Хэрэглэгчийн төлөв (идэвхтэй, роль) өөрчилдөг үйлдэл бүр холбогдох БҮХ cache-ийг (membership, эрх, auth) цэвэрлэнэ. «Нэвтрэх эрх хаагдсан» хариу нь machine-readable код-той — frontend session-ийг устгаж чадна.

### [SEC-010] Урилга / нууц үг сэргээх токен Caddy access log-д URL-аар бичигдэж байсан (Блок 6б)
- **Тохиолдсон:** `/invite/<token>`, `/reset/<token>`, `/api/v1/auth/invites/<token>` — `caddy-access.log`-д бүтнээр (72 / 1 цаг хүчинтэй). DB-д зөвхөн SHA-256 хадгалдаг давуу тал алдагдана.
- **Шийдэл:** Caddyfile `format filter { request>uri regexp … ${1}*** ; wrap json }` — Caddy 2.8.4, 2.10.2-д `caddy validate` + бодит хүсэлтээр шалгав; unit `pilot-auth-config.spec`.
- **Дүрэм:** Нууц агуулсан URL (токен, линк) үүсгэх бүрт лог (reverse proxy, апп, CDN) дотор хэрхэн харагдахыг шалгана; боломжтой бол токеныг path-аас гаргана.

### [AUTH-005] Ажлаас гарсан ажилтны хэрэглэгчийг «Хэрэглэгч» хуудаснаас сэргээж болдог байсан (Блок 6б)
- **Тохиолдсон:** `PATCH /camp/users/:id { isActive: true }` ажилтны TERMINATED төлөвийг шалгадаггүй → «Дахин ажилд авах» (шинэ бүртгэл, загвараас эрх) урсгалыг тойрно.
- **Шийдэл:** холбогдсон ажилтан TERMINATED бол 400 `camp.err.user.terminated` (3 хэл).
- **Дүрэм:** Нэг төлөвийг хоёр замаар өөрчилж болохгүй — нэг зам нь бизнесийн урсгал (rehire) бол нөгөө нь түүнийг хориглоно.

### [RBAC-001] Албан тушаалын автомат роль байхад гараар олговол 409, дараа нь алга болдог байсан (Блок 6б)
- **Тохиолдсон:** D-11 trigger-ийн олголт (`source_position_id`) байхад админ ижил роль × кемпийг гараар олговол «аль хэдийн өгөгдсөн» (409); албан тушаал солигдоход trigger тэр олголтыг устгаж, админы санаа алдагдана.
- **Шийдэл:** давхардал автомат бол 409 биш — `source_position_id = NULL` (гарын олголт болгоно) + аудит `audit.user_role.update`.
- **Дүрэм:** Автомат ба гарын эх сурвалжтай өгөгдөлд «гараар баталгаажуулах» үйлдэл автоматыг гарын болгож хувиргана (давхардлын алдаа өгөхгүй).

### [PROC-020] Эрхийн дүрэм өөрчлөхөд e2e-ийн нөлөөг дутуу хайсан — таны машин дээр 3 тест унав (v0.2.2 Блок 6б)
- **Тохиолдсон:** SEC-009-ийн дараа `pnpm e2e` 66 ✓ / 3 ✗: `camp-assets`, `camp-v021` бэлтгэл нь admin@test.mn (Кемп админ)-аар `POST /roles`, `/user-roles` дууддаг (403 `camp.err.access.admin`); `auth.spec` health `version` = хатуу `'0.2.0'` (PROC-019-ийн дагуу 0.2.2 болсон).
- **Шалтгаан:** нөлөөг `users`, `invites`, `role-templates` гэх мэт UI/замын нэрээр grep хийсэн — `'/roles'` (харьцангуй угтвартай `api()` helper) ба хувилбарын хатуу утгыг алгассан.
- **Шийдэл:** бэлтгэлийн эрх олголтыг тусдаа context-д `devUserAdmin`-аар; health тест хувилбарыг root `package.json`-оос уншина.
- **Дүрэм:** Эрх / зан төлөв өөрчлөхдөө нөлөөлөх **controller-ийн бүх route**-ыг ([[02_API_Catalog]]-ийн «OWNER·ADMIN» мөрүүд) e2e, integration-оос `api(…, '<method>', '<зам>')` хэлбэрээр бүгдийг хайна. Тестэд хувилбар, огноо зэрэг өөрчлөгддөг утгыг хатуу бичихгүй — эх сурвалжаас уншина.

### [TEST-030] Глобал шинэ товч («Санал илгээх») e2e-ийн өргөн regex selector-тэй мөргөлдөв — `requisition-flow` 2 тест унав (v0.2.3 Блок F)
- **Тохиолдсон (таны машин, 2026-10-19):** `pnpm e2e` 74 ✓ / 2 ✗ — `getByRole('button', { name: /submit|илгээх/i })` → strict mode: «📤 Батлуулахаар илгээх» + Layout-ын «Санал илгээх» (хуудас бүрт).
- **Шалтгаан:** Layout-д (бүх хуудсанд) товч нэмэхэд e2e-ийн нөлөөг зөвхөн шинэ хуудсын замаар хайсан; бусад spec-ийн **хэсэгчилсэн нэрийн regex**-ийг (`/илгээх/`) шалгаагүй (PROC-020-тэй ижил төрөл).
- **Шийдэл:** selector-ийг тодорхой болгов: `/батлуулахаар илгээх|submit/i`.
- **Дүрэм:** Layout / бүх хуудсанд харагдах товч, холбоос, текст нэмэхдээ шинэ шошгоны **үг бүрээр** `apps/e2e/tests`-ээс `getByRole(…name: /…/)`, `getByText(/…/)` хайна (жнь «Санал илгээх» → `илгээх`, `санал`); e2e-д өргөн regex биш, бүтэн нэр ашиглана.

### [TEST-031] Шинэ aria-label нь өөр талбарын шошгыг агуулсан — CI-ийн e2e strict mode (v0.2.3 Блок R9)
- **Тохиолдсон (CI, 2026-11-06):** `camp-v023-shiftchange` «PREVIEW → … засах» — `getByLabel('… · 4 мөрийн ажилтан')` 2 элемент: ажилтан хайх input + R9-ийн radiogroup «… · 4 мөрийн ажилтан: хэлбэр». Таны машин дээр ногоон байсан (R9 тест үүнээс өмнө ажилласан / radiogroup эрхээр нуугдсан эсэхээс хамаарна), CI-д унав → дараагийн 3 serial тест ажиллаагүй.
- **Шалтгаан:** Playwright `getByLabel` анхдагчаар **хэсэгчилсэн** (substring) тааруулдаг; шинэ шошгыг одоогийн шошгын урт хувилбараар нэрлэсэн; шинэ элемент нэмэхэд тухайн spec-ийн `getByLabel`-ийг шалгаагүй (TEST-030-тэй ижил төрөл).
- **Шийдэл:** radiogroup-ийн шошго «{row} мөр: ажилтныг хэрхэн холбох» (давхцахгүй); e2e-д мөр бүрийн талбарт `{ exact: true }`.
- **Дүрэм:** нэг мөр / маягтад олон элемент нэмэхдээ шошго нь бусдынхаа **угтвар / дэд мөр** болохгүй байх; e2e-д хувьсагч агуулсан шошгыг `getByLabel(…, { exact: true })`-аар хайна; шинэ aria-label нэмэхэд тухайн хуудсыг ашигладаг spec-үүдийн `getByLabel`-ийг хайна.

### [TEST-032] e2e: `admin@test.mn`-ийн профайлын хэл 中文 хэвээр үлдэж шинэ spec монгол шошгоор олсонгүй (v0.2.3 Блок R)
- **Тохиолдсон (таны машин, 2026-11-06):** `camp-v023-shiftchange` дангаар — HR цэс «考勤» (хятад) → `getByRole('link', { name: 'Ирц' })` 30 с timeout. Өмнөх бүтэн ажиллагаанд `camp-v020` / `camp-v021`-ийн «олон хэл» тест flaky унаж хэлийг буцаагаагүй.
- **Шалтгаан:** `camp-v021` «олон хэл: EN» `loginAs` (admin@test.mn)-ийн **профайлын** хэлийг сольдог (TEST-027-ийн дүрмийг зөрчсөн үлдэгдэл); профайлын хэл ажиллагаа хооронд DB-д үлддэг, шинэ spec хэлийг тохируулаагүй.
- **Шийдэл:** `camp-v023-shiftchange` `beforeEach` — `PATCH /api/v1/i18n/me/locale { locale: 'mn' }` + `localStorage['s-project.lang'] = 'mn'` (`forceMongolian`).
- **Дүрэм:** монгол шошгоор хайдаг шинэ e2e spec нь нэвтэрсний дараа хэлийг МН болгоно (эсвэл хуваалцсан хэрэглэгчийн хэлийг өөрчилдөг тестийг тусдаа fixture хэрэглэгч рүү шилжүүлнэ — `camp-v021` «олон хэл» → v0.2.4 QA).

### [TEST-027] e2e: `devAdmin`-ийн профайлын хэлийг өөрчилдөг тест зэрэг ажиллахад `modules-lite` хятад шошготой нээгдэв (TEST-026-ийн үлдэгдэл)
- **Тохиолдсон (таны машин, 2026-10-18, 6 worker):** `pnpm e2e` 72 ✓ / 1 ✗ — `modules-lite` «нийлүүлэгч … идэвхгүй болгох»: статус «Идэвхтэй»-гийн оронд «启用». Өмнөх ажиллагаанд ногоон байсан (санамсаргүй).
- **Шалтгаан:** `camp-v020`-ийн «олон хэл» тест `devAdmin`-ийн профайлын хэлийг EN → 中文 болгож буцаадаг; тэр хооронд `modules-lite` ижил `devAdmin`-ээр нэвтэрч `useI18nSync` профайлын хэлийг (中文) хэрэглэв. TEST-026 нь admin@test.mn-ийг тусгаарласан ч `devAdmin`-ийг өөр spec хуваалцсаар байв.
- **Шийдэл:** fixture `devLangAdmin` (ADMIN, DEV) — зөвхөн хэл өөрчилдөг тестэд.
- **Дүрэм:** Хэрэглэгчийн хуваалцсан төлөвийг (профайлын хэл, эрх, нууц үг, идэвхтэй эсэх) өөрчилдөг e2e тест бүр **өөрийн** fixture хэрэглэгчтэй; fixture нэмэхдээ «өөр spec энэ хэрэглэгчийг ашигладаг уу» гэж `grep "loginAsUser(.*'<key>')"`. Үлдсэн эрсдэл: «Орчуулгын засвар» тест (`devAdmin`) tenant-ийн `nav.camp` шошгыг түр солино — бусад тест «Кемп» товчийг `exact`-аар хайвал санамсаргүй унаж болно (v0.2.3-т тусдаа tenant / тестийн түлхүүр).

### [TEST-028] CI-ийн integration Блок 1-ээс хойш улаан байсныг «мэдэгдэж буй» гэж орхисон (v0.2.2 release-ийн өмнө илэрсэн)
- **Тохиолдсон:** `64f0174`-ийн CI: integration 238 ✓ / 8 ✗ — `camp-master` «3 системийн роль» (Блок 1-д «Ажилтан» нэмэгдэж 4 болсон; `ids.roleManager` тохируулагдаагүй тул дараагийн 6 тест гинжин 400/403/undefined), RLS тоо `[2,4,3]`; `route-probe` — Блок 3-ын нэвтрэлтгүй `GET /auth/invites/:token` санамсаргүй токенд 200 `{valid:false}` (зориуд). [[project-status]] «Нээлттэй асуудал #5»-д «хуучин хүлээлт» гэж бичээд Блок 2–6 турш засаагүй → CI улаан нь шинэ алдааг нууж байв.
- **Шийдэл:** хүлээлтийг шинэчилсэн (4 роль, `[2,4,4]`, урилга шалгах `valid:false` → probe-д зөвшөөрнө).
- **Дүрэм:** Улаан тестийг «мэдэгдэж буй» гэж хойшлуулахгүй — тухайн блокт засна (эсвэл `it.skip` + шалтгаан + ID). Release-ийн шалгуур = CI бүрэн ногоон. Гинжин алдааг эхний унасан assertion-оос эхэлж уншина.

### [TEST-029] Аудитын мөрийг `created_at`-аар эрэмбэлэхэд дараалал санамсаргүй (нэг `createMany`)
- **Тохиолдсон (cloud, 2026-10-19, v0.2.3 Блок D):** `camp-v022-terminate` «terminate … НЭГ transaction-д» — 3 ажиллуулалтаас 2 нь ✗: `['user_account:DEACTIVATE', 'employee:TERMINATE']`.
- **Шалтгаан:** `recordMany` хоёр мөрийг нэг statement-ээр оруулдаг → `created_at` ижил; `orderBy: createdAt` тэнцүү мөрийн дарааллыг баталгаажуулдаггүй.
- **Шийдэл:** тест дарааллыг биш олонлогийг шалгана (`.sort()`).
- **Дүрэм:** Нэг transaction / нэг statement-ийн мөрүүдийн дарааллыг `created_at`-аар шалгахгүй — олонлог эсвэл тодорхой хоёр дахь түлхүүр (`id`) ашигла.

### [DATA-002] Excel-ийн ажилтны ID тоо болж эхний 0 алдагдсан; нэг нүдэнд олон утас, хятад/монгол холимог нэр
- **Тохиолдсон (Sino-гийн `hrmasterdata.xlsx`, 2026-10-19):** ID 345 нь текст (`08101`), 232 нь тоо (`8101`); хэлтэс 21 янзаар бичигдсэн; «Яаралтай үеийн холбоо»-ны нэр/хамаарал солигдсон; гарсан огноо 5 өөр форматтай.
- **Шийдэл:** эх файлыг өөрчлөхгүй — `scripts/data-migration/sino/convert.mjs` (+ `mapping.json`) цэвэрлэж импортын файл, тайлан гаргана ([[12_v0.2.3_data_import]]).
- **Дүрэм:** Байгууллагын Excel-ийг шууд импортлохгүй — хөрвүүлэх скрипт + толь + тайлан (хасагдсан мөр бүр шалтгаантай), хоосон tenant-д dry-run хийсний дараа staging.

### [PRISMA-004] `$queryRaw`-аар `information_schema`-ийн `name` төрлийн багана (`table_name`) уншихад deserialize алдаа (v0.2.3 Блок 2, ADR-007)
- **Тохиолдсон (cloud integration, 2026-11-06):** `camp:snapshot`-ийн schema илрүүлэлт `SELECT table_name FROM information_schema.tables …` → `P2010 Failed to deserialize column of type 'name'` (driver adapter / wasm engine). Өмнө нь `count(*)` л уншдаг байсан тул илрээгүй.
- **Шийдэл:** `SELECT table_name::text AS table_name …`.
- **Дүрэм:** `$queryRaw`-д системийн каталогийн (`information_schema`, `pg_*`) `name` / `regclass` / `oid` төрлийн баганыг үргэлж `::text` (эсвэл `::int`) болгож уншина.

### [MIG-004] Хүснэгт нэрлэхэд (RENAME) plpgsql функцийн бие хуучин нэрээ хадгална — функц / trigger-ийг дахин үүсгэ (v0.2.3 Блок 2, ADR-007)
- **Нөхцөл:** `camp_*` → `core_*` нэрлэхэд FK, RLS policy, trigger-ийн холбоос автоматаар шилждэг ч plpgsql функцийн бие (текст) хуучин нэрээр хэвээр → дараагийн дуудлагад `relation "camp_…" does not exist`.
- **Шийдэл (`20261106005`):** нэрлэсэн хүснэгтийг хөндөх бүх функцийг (`*_apply_template`, `*_protect_system`, `*_seed_default_roles`, `camp_employees_sync_position_roles`) шинэ нэрээр дахин үүсгэж, trigger-ийг дахин холбож, хуучин функцийг DROP; constraint / index / policy / trigger-ийн нэрийг DO-блокоор солив; migration-ийн төгсгөлд legacy ↔ core эрхийн олонлогийг тулгаж зөрвөл `RAISE`.
- **Дүрэм:** Хүснэгт нэрлэх migration-ийн өмнө `grep -l <хүснэгт> supabase/migrations/*.sql`-ээр түүнийг хэрэглэдэг бүх функцийг олж дахин үүсгэнэ; өгөгдөл хөндөх бол migration дотор A = B шалгалт.

### [RBAC-002] Шинэ модулийн эрхийн код (`feed.*`) DB CHECK, тест, баримтын генераторт танигдаагүй (v0.2.3 Блок 5)
**Тохиолдсон (2026-11-07):** `feed.moderate` нэмэхэд (1) `ck_core_permissions_code` нь `^(camp|hr|core)\.x\.y$` — 2 хэсэгтэй, `feed` модульгүй код migration-д унах байсан; (2) каталогийн тоо / regex тест (`camp-common`, `camp-rbac.service`) унасан; (3) `docs:gen` эрхийн нэрийг `(camp|hr|core)` regex-ээр, хэрэглээг зөвхөн `CAMP_PERMISSIONS.X`-ээр хайдаг тул нэр, файл хоосон гарсан.
**Шийдэл:** код `feed.content.moderate` (3 хэсэг); migration-д CHECK-ийг `(camp|hr|core|feed)` болгож дахин үүсгэсэн; тест 18 код / модуль `feed`; генераторт `feed` ба `PERMISSIONS.X` alias.
**Дүрэм:** Шинэ модулийн эрх нэмэхдээ нэг дор: migration (`INSERT` + CHECK-ийн модулийн жагсаалт), `permission-registry.ts`, каталогийн тест, `scripts/docs/gen-codebase-docs.mjs` (модулийн regex) → `pnpm docs:gen` → [[05_Permissions_Catalog]]-д нэр, файл бөглөгдсөнийг шалга. Код үргэлж `<модуль>.<объект>.<үйлдэл>`. Админы `me/permissions.modules`-д шинэ модуль автоматаар нэмэгдэнэ — unit (`camp-rbac.service.test`) ба integration (`camp-master.integration.spec` B3-1) хоёуланд нь хүлээлтийг засна (`grep "modules).toEqual"`; 2026-11-07-нд integration-д үлдэж унасан).

### [FE-011] Хамгаалагдсан зураг: `<img src>` нь `Authorization: Bearer` илгээж чадахгүй (v0.2.3 Блок 5)
**Тохиолдсон (2026-11-07, загварчлалд илэрсэн):** нэвтрэлт зөвхөн Bearer header (cookie ✖) тул backend proxy-той зургийн URL `<img>`-д 401 өгөх байсан; `fetch` → blob URL бол `srcset`, `loading="lazy"`, HTTP кэш, Lightbox-ийн том хувилбар бүгд гараар.
**Шийдэл:** API харах эрхтэй хэрэглэгчид HMAC гарын үсэгтэй, хугацаатай URL өгнө (`MediaUrlSigner`; payload: tenant, төрөл, id, өргөн, хугацаа; 7 хоногийн хувин → URL тогтвортой, кэш онох), media route `@SkipAuth`, `Cache-Control: private, immutable` + ETag.
**Дүрэм:** Bearer-тэй апп-д `<img>/<video>/<a download>`-ийн хамгаалагдсан файлд гарын үсэгтэй URL; blob fetch зөвхөн нэг удаагийн татахад. Гарын үсэгт tenant заавал (өөр tenant-ийн id-аар ✖ — integration шалгана).
