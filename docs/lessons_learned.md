---
title: "Lessons Learned — индекс (ID → дүрэм)"
type: "Log"
status: "Active"
last_updated: 2026-10-17
tags: [lessons, index, generated]
---

# Lessons Learned — индекс (ID → дүрэм)

> 🤖 **AUTO-GENERATED** (`pnpm docs:gen`) — `docs/lessons/LL-*.md`-ийн `[ID]` гарчиг ба **Дүрэм / Шийдэл** мөрөөс. Энд бүү засаарай.
> **Унших:** зөвхөн даалгаварт хамаарах бүлгээ. Шалтгаан / жишээ хэрэгтэй бол "Хаана" файлыг нээж `[ID]`-аар хай. 🔁 = давтагдсан алдаа.
> **Шинэ алдаа:** тохирох `lessons/LL-*.md`-д `### [TAG-NNN] Гарчиг` + **Тохиолдсон / Шалтгаан / Дүрэм** → [[LL-99_Changelog]]-д мөр → `pnpm docs:gen`. Давтагдвал шинэ ID биш — `### [ID] (давтагдсан, огноо) …`.
> Файл: [[LL-01_Backend_DB]] · [[LL-02_Test_CI]] · [[LL-03_Env_Ops_Pilot]] · [[LL-04_Architecture_RLS]] · [[LL-05_Frontend]] · [[LL-06_Camp_v02]] · [[LL-07_Docs]] · Хуучин нэгтгэсэн файл (архив): [[lessons_learned_MVP]]

Нийт **159** сургамж.

## DB, Prisma, RLS, migration

| ID | Дүрэм | Хаана |
|---|---|---|
| ASYNC-001 | Promise буцаадаг public method → `async`. | LL-04 §14 |
| CONC-001 | Эцэг мөрийн төлвөөс хамаарч дэд мөр бичихийг хориглох trigger/код → эцэг мөрийг `FOR SHARE` (эсвэл `FOR UPDATE`)-ээр унш.… | LL-06 §15 |
| CONC-002 | "max+1" дугаарлалт бүр advisory lock эсвэл sequence-тэй байна; Prisma алдааны `meta`-д (target, modelName) найдахгүй —… | LL-05 §19 |
| CURSOR-001 | Хэрэглэгчээс ирсэн утга DB-д cast (`::uuid`, `::timestamptz`) болж орох бол cast-ын өмнө форматыг шалгаж 400 буцаана. | LL-04 §16 |
| DATA-001 | Backfill-ийг бодит төстэй өгөгдлөөр (үсэг/зайн хувилбартай) A = B шалгаж, үүссэн нэрсийг нүдээр харна. Кирилл `lower()`… | LL-06 §22 |
| ENUM-001 | `tier: TierType.TIER1` + `import { TierType } from '@prisma/client'` | LL-01 §2 |
| ENUM-002 | `UserRole.REQUESTER`, `MrStatus.DRAFT`, `MrStatus.PENDING_APPROVAL` | LL-01 §2 |
| MIG-001 | `supabase/migrations/*.sql` → `pnpm exec supabase migration up` (auth хэрэглэгчийг устгахгүй) → `pnpm db:generate`. | LL-04 §14 |
| MIG-002 | Migration файлын дугаарыг **хэрэгжүүлэх үед** (бодит дарааллаар) өгнө; tech plan-д зөвхөн «шинэ migration» гэж… | LL-06 §24 |
| MIG-003 | Enum утга нэмэх migration-д тэр утгыг хэрэглэх юу ч (index, CHECK, seed, функц) бичихгүй. | LL-06 §24 |
| MIGRATE-001 | DROP CHECK → CREATE ENUM → ALTER TYPE → RECREATE CHECK | LL-01 §3 |
| MIGRATE-002 | DROP index → DROP CHECK → CREATE ENUM → ALTER TYPE → RECREATE index | LL-01 §3 |
| PRISMA-001 | `id String @id @default(uuid()) @db.Uuid`, `tenantId String @map("tenant_id") @db.Uuid` | LL-01 §2 |
| PRISMA-002 | ```typescript | LL-01 §2 |
| PRISMA-003 | DB/гадаад системийн алдааны текстэд тулгуурласан код бичихдээ (1) mock-ийн мессежийг **бодит гаралтаас хуулж** бичнэ, (2)… | LL-06 §15 |
| RLS-001 | `this.prisma.$transaction(async tx => { await tx.$executeRaw(set_config); return tx.model.findFirst() })` | LL-01 §2 |
| RLS-002 | Dual PrismaClient — `prismaAdmin` (postgres, setup/teardown) + `prismaRls` (app_user, бодит тест) | LL-01 §2 |
| RLS-003 | `NULLIF(current_setting('app.tenant_id', true), '')::uuid` (RULE-12 аль хэдийн хамардаг) | LL-01 §2 |
| RLS-004 | 4.8.2 migration (49/49 хүснэгт) → 4.8.3 `inTenantTx` [RLS-007] → 4.8.4 `SystemPrismaService` (`SYSTEM_DATABASE_URL`) →… | LL-04 §14 |
| RLS-005 | Шинэ policy-г `camp_apply_tenant_rls` / Module Template-ийн загвараар л бичнэ; GUC нэрийг гараар бичихгүй. Migration-ийн… | LL-04 §17 |
| RLS-006 🔁 | GUC → uuid хөрвүүлэлт ҮРГЭЛЖ `NULLIF(..., '')`. | LL-04 §17 |
| RLS-007 | Tenant хүснэгтэд хандах query бүр `inTenantTx`/`camp-tx` дотор. `this.prisma.<model>`-ийг transaction-гүй ашиглахгүй… | LL-04 §17 |
| SEED-001 | `seed.sql`: `'starter'` → `'tier1'` (Prisma `@default(TIER1)`-тэй таарна). | LL-03 §12 |
| SEED-002 | Studio → Authentication → Add user (`admin@test.mn` / `test1234`, Auto Confirm) → | LL-04 §13 |
| SQL-001 | `` tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}` `` (tagged template = parameterized) | LL-01 §2 |

## Backend, API, event, гүйцэтгэл

| ID | Дүрэм | Хаана |
|---|---|---|
| API-001 | `@Param('id', ParseUUIDPipe)`. Probe нь шинэ route-ийг автоматаар хамардаг тул дахин гарвал тест унана. | LL-04 §17 |
| ARCH-001 | Тусгаарлалт/аюулгүй байдлын feature-ийг "дууссан" гэхээс өмнө (1) `grep`-ээр бодит дуудагдах газрыг шалгах, (2) **бодит… | LL-04 §13 |
| BUILD-001 | Script/зам өөрчлөхдөө build хийж бодитоор ажиллуулж шалгана. | LL-04 §16 |
| CACHE-001 | Cache зөвхөн уншиж харуулахад; бизнесийн шийдвэр (төлөв, эрх) DB-ийн шинэ мөрөөс. Бичсэн service бүр cache-ээ цэвэрлэнэ. | LL-04 §17 |
| CLUSTER-001 | `config/cluster-restart.ts` — `RestartPolicy`: 60с цонхонд 1 дэх унасан → шууд (cluster-check-ийн сценари хэвээр),… | LL-04 §16 |
| CONFIG-001 | `configService.get('KEY') ?? process.env['KEY']` — process.env fallback ЗААВАЛ | LL-01 §8 |
| DEP-001 | `package.json` шалгаж суулгах, эсвэл `@IsOptional()` decorator-тэй гараар бичих | LL-01 §6 |
| DI-001 | `await prismaAdmin?.$disconnect()` | LL-01 §1 |
| DI-002 | `.overrideProvider(ConfigService).useValue({...})` chain ашиглах | LL-01 §1 |
| DI-003 | `this.tenantCacheService?.getTenantId(slug) ?? null` — optional chaining | LL-01 §1 |
| DI-008 | 1. `MaterialRequisitionModule.imports`-аас `AuthModule` **устга** | LL-01 §1 |
| DI-009 | `unplugin-swc` + `@swc/core` суулгаж `vitest.integration.config.ts`-д SWC plugin нэмэх | LL-01 §1 |
| EVT-001 | `FOR UPDATE [SKIP LOCKED]` нь ЗӨВХӨН transaction дотор утгатай. Queue/claim хэв маягийг зэрэгцээ worker-тэй тестлэнэ… | LL-04 §18 |
| EVT-002 | `EventBusService.emit` id/type/source-ийг outbox-д нэг удаа хадгална (MR ч үүгээр, `event_type` хуучин нэр хэвээр +… | LL-04 §18 |
| HTTP-001 | `@Res({ passthrough: true })` → амжилттай үед л `reply.header(...)`. | LL-04 §17 |
| LOG-001 | `PRISMA_LOG_LEVELS` (default `warn,error` — production өөрчлөгдөхгүй; `none`; жагсаалт). `vitest.integration.config.ts` →… | LL-04 §16 |
| MODULE-001 | `MaterialRequisitionModule.imports: [AuthModule]` нэмэх | LL-01 §6 |
| PATCH-001 | `app.get(AuthService).getMe = patchFn` — instance property нь prototype-с өмнө хайгддаг | LL-02 §5 |
| PERF-001 | Хэмжилтийн script-ийг алдааны зам бүрээр (429, буруу token, Redis байхгүй) туршиж, **унах ёстой үед унаж** байгааг шалгана. | LL-04 §13 |
| PERF-002 | Rate limit default хэт бага байсан (10/с нэг tenant) | LL-04 §13 |
| PERF-003 | `TenantCacheService.getCachedAuthUser/cacheAuthUser` — түлхүүр = token-ийн SHA-256, TTL = min(60с, token exp);… | LL-04 §13 |
| RESOLVE-001 | `import { FastifyRequest } from 'fastify'` → `import type { FastifyRequest } from 'fastify'` | LL-01 §6 |
| RL-001 | Rate limit guard Redis тасрахад бүх API 500 болох эрсдэлтэй байсан → fail-open | LL-04 §13 |
| VALID-001 | (1) Query boolean → ЗААВАЛ `@Transform(queryBool)`. (2) Integration тестийн app тохиргоо (pipe, prefix, plugin)… | LL-06 §15 |

## Нэвтрэлт, аюулгүй байдал

| ID | Дүрэм | Хаана |
|---|---|---|
| AUTH-001 | ```typescript | LL-01 §4 |
| AUTH-002 | Seed script нь `auth.users` + `core_users` **хоёуланг** үүсгэх ёстой | LL-01 §4 |
| AUTH-003 | Гадны client-ийн "алдаа буцаадаг (throw биш)" API-д сүлжээний алдааг тусад нь шалгана; unit mock-д ч энэ хэлбэрийг оруулна. | LL-06 §22 |
| SEC-001 | Auth guard-ын тест бүрт 3 тохиолдол заавал: зөв tenant (200) · байхгүй tenant (403) · **байгаа ч гишүүн биш tenant (403)**. | LL-04 §13 |
| SEC-002 | Update/delete-ийн `where`-д ҮРГЭЛЖ `tenantId` (эсвэл ижил transaction-д tenant-аар шалгасан мөр). RLS бол хоёр дахь… | LL-04 §17 |
| SEC-003 | Controller-ийн `@Body()` ҮРГЭЛЖ class DTO (interface/`unknown` биш). Тохиргоо өөрчилдөг endpoint бүрт role. | LL-04 §17 |
| SEC-004 | 1. Төлөвийг өөрчилдөг endpoint бүрт "хэн, ямар нөхцөлд" гэдгийг тест заавал шалгана — зөвхөн "зөв хэрэглэгч амжилттай"… | LL-05 §19 |
| SEC-005 | Release/байршуулалтын өмнө бүх controller-ийн endpoint-уудыг "хэн дуудаж чадах вэ" гэж жагсааж шалгана; service key… | LL-03 §20 |
| SEC-006 | Аюулгүй байдлын тохиргоог "тохируулсан" гэж бүү итгэ — үр дүнг (гарсан түлхүүр, header, хариу) шалгадаг автомат шалгалт… | LL-03 §20 |
| SEC-007 | Reverse proxy-г гинжээр (Funnel/Cloudflare → Caddy → Kong → апп) тавибал давхарга бүрийн XFF зан төлөвийг echo… | LL-06 §22 |
| SEC-008 | Хязгаар тавихдаа "нэг IP-ийн ард олон хүн" (NAT, WiFi, proxy) ба тестийн давтамжийг тооцно. | LL-06 §22 |

## Тест, E2E, CI

| ID | Дүрэм | Хаана |
|---|---|---|
| CI-001 | `apps/core-kernel/package.json`-д `"test:unit": "vitest run"` нэмэв. | LL-02 §11 |
| CI-002 | Алхмыг устгав. `supabase start` нь `supabase/migrations/*.sql` + `seed.sql`-г автоматаар ажиллуулдаг. Дахин цэвэрлэх… | LL-02 §11 |
| CI-003 | Root-д `.eslintrc.cjs` (ESLint 8 legacy) — зөвхөн root devDependencies (`@typescript-eslint/*`) ашигласан тул lockfile… | LL-02 §11 |
| CI-004 | package.json script / env / шаардлагатай урьдчилсан алхам өөрчлөгдөх бүрт `grep -rn "<хуучин нэр>" .github docker… | LL-05 §19 |
| CI-005 | CI-ийн орчин (Node, generate алхам) = Dockerfile/production-тэй ижил; release бүрт CI ногоон эсэхийг "дуусах нөхцөл"-д… | LL-06 §21 |
| CI-006 | CI-ийн хэрэгслийн хувилбарыг lockfile/машинтай ижил pin хийнэ ("latest" хориглоно); env бэлтгэх алхам хоосон утгыг… | LL-06 §21 |
| CI-007 | CI-ийн алдааг засахаасаа өмнө шалтгааныг туршилтаар батална (энд: turbo task-д env хэвлэх) — "магадгүй"-гээр засвар push… | LL-06 §21 |
| META | E2E тест бичихийн өмнө шалгах чеклист — Sprint 5-аас сурсан зүйл | LL-02 §10 |
| S5-E1 | `pnpm dlx turbo prune --scope=<pkg> --docker` ашиглах. | LL-02 §10 |
| S5-E2 | `pnpm --filter e2e add -D @playwright/test@1.48.0` ашиглах (add, not install). | LL-02 §10 |
| S5-E3 | Windows NTFS junction ≠ Linux symlink. pnpm workspace packages-г Windows дээр native PowerShell-ээс ажиллуулах. | LL-02 §10 |
| S5-E4 | Default утга ашиглах: `${SUPABASE_URL:-}` | LL-02 §10 |
| S5-E5 | Шинэ package нэмэхдээ `pnpm --filter <pkg> add -D <package>` ашигла, `--force` ашиглахаас зайлсхий. | LL-02 §10 |
| S5-E6 | `node-linker=hoisted` тохируулга өөрчлөгдсөний дараа `pnpm install` хийхийн өмнө `apps/*/node_modules` устга.… | LL-02 §10 |
| S5-E7 | `node_modules` устгаж дахин `pnpm install` хийсний дараа **заавал** `prisma generate` ажиллуулах. Root `package.json`-д… | LL-02 §10 |
| S5-E8 | ```typescript | LL-02 §10 |
| S5-E9 | `auth.helper.ts` + `auth.spec.ts`-д `getByLabel` орондоо type-based selector ашиглана: | LL-02 §10 |
| S5-E10 | `AppController`-аас `health()` method-г хасаж, liveness-д зориулсан `healthz()`-г (`/api/v1/healthz`) үлдээсэн. | LL-02 §10 |
| S5-E11 | `LoginPage.tsx`-д `useAuth()` hook-тэй `useEffect` нэмж, `!loading && user` үед `navigate('/requisitions', { replace:… | LL-02 §10 |
| S5-E12 | ```typescript | LL-02 §10 |
| S5-E13 | E2E тест дотор MR create form-д `title` бөглөхөөс гадна item fields-г бөглөнө: | LL-02 §10 |
| S5-E14 | ```typescript | LL-02 §10 |
| S5-E15 | `page.getByText('Батлагдсан', { exact: true })` — зөвхөн StatusBadge-ийн `<span>`-тэй таарна. Мөн `'Татгалзсан'`-д ижил… | LL-02 §10 |
| S5-E16 | Modal container (`'.fixed.inset-0'`) дотроос `page.locator('textarea').first()` болон… | LL-02 §10 |
| TEST-001 | Unit тест `.env`-ээс хамаарах ёсгүй. Тестийг **env-гүй** ажиллуулж шалгана: `env -u SUPABASE_URL npx vitest run`. | LL-02 §11 |
| TEST-002 | Тест бичсний дараа **заавал** `tsc --noEmit` (core-kernel tsconfig `test/**`-г хамардаг) + `eslint`. | LL-04 §13 |
| TEST-003 | (1) APP_GUARD / global interceptor нэмбэл integration тест **заавал** ажиллуулна. (2) Тестийн mock-ийг хуулахгүй —… | LL-04 §13 |
| TEST-004 | Алдааны мессежийг онцлог хэсгээр нь шалгах (`/хэлтэс \(department\) заавал/`); шинэ логик бүрд mutation шалгалт. | LL-04 §14 |
| TEST-005 🔁 | Unit тестийг **бохир env**-ээр (жнь `RATE_LIMIT_SHORT=1000000 DEPLOYMENT_MODE=dedicated`) ажиллуулж шалгана. Env-ээс… | LL-04 §14 |
| TEST-006 | Тестийн helper-т "утгагүй" гэсэн утгыг `undefined` биш `null`-оор дамжуулна; сөрөг тестэд "юу ч бичигдээгүй"-г assert хийнэ. | LL-04 §14 |
| TEST-007 | Supabase дээр ажиллах SQL скриптийг бичихдээ `postgres` = superuser гэж бүү тооц (RLS-002-той холбоотой: bypass нь… | LL-06 §15 |
| TEST-008 | e2e/UI тест бичихдээ богино шошгыг ЗААВАЛ `exact`; spec-ийг таны машинд өгөхөөс өмнө хуурамч backend дээр dry-run хийнэ… | LL-06 §15 |
| TEST-009 | Файл илгээх хүсэлтийг mock interception-ээр биш бодит HTTP-ээр шалгана; axios-ийн JSON анхдагчтай client-ээр FormData… | LL-06 §15 |
| TEST-010 | `previewFeatures = ["driverAdapters"]`-тай schema-г тусдаа хавтсанд generate → `wasm.js`-ийн engine loader-ийг… | LL-04 §17 |
| TEST-011 | `test/helpers/db-urls.ts` — `ADMIN_DB_URL = SYSTEM_DATABASE_URL // DATABASE_URL`, `APP_USER_DB_URL`. Cloud-д бүтэн… | LL-04 §17 |
| TEST-012 | Prisma клиентийн method-ийг тестэд орлуулахгүй; хэмжилтийг гадна талд (publisher mock, DB-ийн төлөв) хийнэ. | LL-04 §18 |
| TEST-013 | `chromium_headless_shell-*/…/headless_shell`-ийг `executablePath` болгоно. Таны компьютер дээр `pnpm exec playwright… | LL-05 §19 |
| TEST-014 | Багцын `test` script = зөвхөн сервергүй unit тест. E2E өгөгдлийг тест өөрөө үүсгэж/устгана (гараар бэлтгэл, skip-ээр нуух… | LL-05 §19 |
| TEST-015 🔁 | Нэг удаа давсан нь "flaky" гэсэн нотолгоо биш. Алдааны үйлдлийг (энд: MR үүсгэх) өөрөө тусгаарлаж зэрэгцээ/давтан… | LL-05 §19 |
| TEST-016 | scan-аас `src/scripts`-ийг тодорхой (тайлбартай) хасав — хувьсагчийн нэр сольж тойрохгүй. | LL-03 §20 |
| TEST-017 | DB reset/seed/restore бүрийн дараа Redis `FLUSHALL` (`pilot.ps1 restore` аль хэдийн хийдэг; harness `db-reset.sh`-д нэмэв). | LL-06 §21 |
| TEST-018 | `exact: true` (эсвэл `.last()` — зориуд); хэрэглэгчийн тохиргоог өөрчилсөн spec `afterAll`-д буцаана. | LL-06 §21 |
| TEST-019 | TEST-015-ийн дагуу "flaky" гэж хаахгүй — QA-09-д бүртгэж, алдааны мессежийг барьж шалтгааныг батална. | LL-06 §21 |
| TEST-020 | Нэг хуудсанд ижил төстэй шошго нэмэхээс өмнө тэр хуудсын хуучин e2e-г ажиллуулна. | LL-06 §22 |
| TEST-021 | Зөвхөн unit тест/typecheck-д. Бодит DB-тэй integration-д TEST-010-ийн wasm + `@prisma/adapter-pg` harness хэрэглэнэ.… | LL-06 §22 |
| TEST-022 | Үүсгэгддэг (generated) файлд гараар засвар хийхгүй; хийх бол үүсгэх скриптийн нэг алхам болгоно. | LL-06 §22 |
| TEST-023 | API-ийн зан төлөв өөрчлөхөөс өмнө `grep -rn '<endpoint>' test/ apps/e2e` — ажиллуулж чадахгүй тестийн хүлээлтийг ч шинэчилнэ. | LL-06 §22 |
| TEST-024 | Аюулгүй байдлын шийдвэр (хугацаа, түгжээ) DB-ийн цаг (`now()`) дээр — app/driver-ийн Date хөрвүүлэлтэд найдахгүй. | LL-06 §22 |
| TEST-025 | «Cloud-д ажиллахгүй, CI-д» гэж шинэ integration тест үлдээхгүй — TEST-010 harness-аар заавал нэг удаа ажиллуулна. Тестийн… | LL-06 §24 |
| TEST-026 | Хуваалцсан хэрэглэгчийн төлөвийг (хэл, эрх, нууц үг) өөрчилдөг e2e тест **тусдаа хэрэглэгч**ээр (fixture). Tenant даяар… | LL-06 §24 |
| VITEST-001 | `vitest.integration.config.ts`-д: | LL-02 §5 |

## Frontend

| ID | Дүрэм | Хаана |
|---|---|---|
| FE-001 | ```typescript | LL-05 §7 |
| FE-002 | `VITE_API_BASE_URL=` (хоосон) → relative URL → Vite proxy → CORS алга | LL-05 §7 |
| FE-003 | `create-mr-item.dto.ts` файлыг шалгаж frontend type-г тэрхүү нэртэй нийцүүлэх | LL-05 §7 |
| FE-004 | UI багц бүрийг хэрэглэгчид өгөхөөс өмнө 1400px + 390px-д `scrollWidth ≤ innerWidth` шалгаж, screenshot-оор нүдээр харна;… | LL-06 §15 |
| FE-005 | Цэвэр логик (`lib/roles.ts`, `modules/*/lib/*`) нь API/supabase импортгүй байна; хуудас/hook л API-г импортлоно. UI-д эрх… | LL-05 §19 |
| FE-006 | Production build-ийг браузераар нээж **гарч буй бүх хүсэлтийн host** ба консолын алдааг шалгана (зөвхөн хуудас харагдах… | LL-03 §20 |
| FE-007 | Auth-ийн урсгалд "серверт session хүчингүй, клиентэд хүчинтэй" кейсийг заавал шалгана; redirect хийхээс өмнө тухайн… | LL-03 §20 |
| FE-008 | Nested route-д харьцангуй линк → `relative="path"`; табын линк бүрийг e2e-д дарж URL-ийг шалгана. | LL-06 §21 |
| FE-009 | Мөрөнд контрол нэмбэл тухайн хуудсын e2e-г заавал ажиллуулж, screenshot-ыг харна. | LL-06 §22 |

## Орчин, ops, PowerShell, пилот

| ID | Дүрэм | Хаана |
|---|---|---|
| ENV-001 | Суулгасан эсэхийг замаар биш registry-ээр шалгана: `HKLM` **болон** `HKCU` `...\Uninstall\*`. | LL-03 §12 |
| ENV-002 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (admin шаардахгүй). | LL-03 §12 |
| ENV-003 | Root devDependency: `pnpm add -D supabase -w` (одоо `package.json`-д орсон → `pnpm install` хангалттай). Баг бүхэлдээ… | LL-03 §12 |
| ENV-004 | `.env`-д `sb_` угтвартай key оруулахгүй (supabase-js шинэчлэх хүртэл). | LL-03 §12 |
| ENV-005 | `.env`, `apps/core-kernel/.env`, `apps/web-shell/.env` — `.env.example`-уудаас автоматаар үүсгэх скрипт баримтын §1.5-д. | LL-03 §12 |
| ENV-006 | `pnpm dev`-г зогсоох (Ctrl+C) → `pnpm db:generate` → дахин `pnpm dev`. Давтагдвал `Get-Process node`, VS Code Prisma… | LL-03 §12 |
| ENV-007 | Шинэ машины шалгах жагсаалтад `pnpm playwright:install` заавал. | LL-03 §12 |
| ENV-008 | `.env.example`-ийн утга кодын тайлбартай (`client.ts`) зөрчилдөж болохгүй. Frontend API алдаа гарвал эхлээд DevTools →… | LL-03 §12 |
| ENV-009 | Монгол текст агуулсан SQL-ийг PowerShell pipe-ээр ХЭЗЭЭ Ч өгөхгүй. | LL-06 §15 |
| ENV-010 | Төслийн хавтсыг зөөх/нэр солих бүрт `pnpm install` заавал. | LL-06 §15 |
| OPS-001 | `/assets/*` — зөвхөн `file_server` (байхгүй → 404, байвал `immutable` cache); бусад зам → index.html (`no-cache`). | LL-03 §20 |
| OPS-002 | Пилот/production-д `stop` (data volume хадгална) л; `--no-backup`, `db reset`-ийг зөвхөн restore урсгал (нөөцийг тулгасны… | LL-03 §20 |
| OPS-003 | Тохиргооны түлхүүрийн нэрээр утгыг нь бүү таамагла — баримтаас (эсвэл бодит орчинд нэвтэрч) шалгана. Mock/fake-аар… | LL-03 §20 |
| OPS-004 | Автомат дахин асаагчтай (watchdog, Task, service) системд урт засвар хийхдээ асаагчийг өөрийг нь түр унтраана. | LL-06 §21 |
| PS-001 | Windows PowerShell 5.1-д ажиллах скрипт бичих | LL-03 §20 |
| PS-002 | Процессын нэр шалгадаг кодыг тестлэх shim нь жинхэнэ нэртэй байх (жижиг C wrapper, хүүхэд процесс `PR_SET_PDEATHSIG`-тэй). | LL-06 §21 |
| PS-003 | Урт амьдрах процесс асаадаг командыг pipe-аар бүү дууд. Windows-ийн процесс/handle-ийн зан төлөвийг Linux shim тестээр… | LL-06 §21 |

## Процесс, баримт

| ID | Дүрэм | Хаана |
|---|---|---|
| DOC-001 | Зан төлөв/команд/env өөрчилсөн phase бүрийн checklist-д "баримт: README, runbook, `.env.example`, CHANGELOG" мөр заавал… | LL-05 §19 |
| DOC-002 | Vault-д нэр давхардвал `[[хавтас/нэр/харагдах нэр]]` замтай линк ашиглана. Vault-ийн гадна файл (repo root, `apps/`,… | LL-07 §23 |
| DOC-003 | мэдээллийн төрөл бүр **ганц эх сурвалжтай** ([[CONTEXT]] §5) — бусад газар зөвхөн линк. Кодоос / дэлгэрэнгүйгээс гаргаж… | LL-07 §23 |
| DOC-004 | Controller файл үргэлж `*.controller.ts`. Өвлөсөн controller-ийн route param нэр эцгийнхтэй ИЖИЛ байна (`:campId`) —… | LL-06 §24 |
| PROC-001 | `if new in s: continue` — эхлээд үр дүн байгаа эсэхийг шалгана. Скриптийг 2 удаа ажиллуулж idempotent эсэхийг шалгана;… | LL-04 §13 |
| PROC-002 | PID файл ашиглах; эсвэл `grep "[d]ist/src/main.js"` (bracket trick) — өөрийн командын мөрт тохирохгүй. | LL-04 §13 |
| PROC-003 | Багц/шат эхлэхийн өмнө `git status --short`-ийг ЗААВАЛ шалгаж, untracked/modified файл бүрийн гарал үүслийг тодруулна.… | LL-06 §15 |
| PROC-004 🔁 | Засварлах скриптэд `open(p, newline='')`; засварын дараа `git diff --stat`-ийн мөрийн тоо нь бодит өөрчлөлттэй таарч… | LL-06 §15, LL-06 §22 |
| PROC-005 | Phase/багц бүрийг төхөөрөмжийн одоогийн төлвөөс эхлүүлнэ; өмнөх cloud хуулбарыг хэзээ ч шууд deploy хийхгүй. | LL-04 §16 |
| PROC-006 | Хуулах бүрт давтагдашгүй staged нэр (`plan_6_0.md`, bundle-д огноо/шат) ашиглана; хуулсны ДАРАА төхөөрөмж дээр hash… | LL-05 §19 |
| PROC-007 | Танд өгөх команд бүрийг төслийн `package.json` script-ээс (эсвэл `pnpm <bin>`) авна — глобал суулгалт гэж үзэхгүй; заавар… | LL-05 §19 |
| PROC-008 🔁 | pkill-ийг бусад бичвэргүй тусдаа дуудлагаар; урт скриптийг файлд бичээд тусад нь ажиллуулна. Cloud tool дуудлага дуусахад… | LL-03 §20, LL-06 §22, LL-06 §24 |
| PROC-009 | Суулгах/байршуулах скриптийг **хоосон (шинэ clone)** төлөвөөс эхлэн туршина — тестийн орчинд "бэлэн" зүйл (node_modules,… | LL-03 §20 |
| PROC-010 | Хэрэглэгчийн shell-д `.\script.ps1`-ээр ажиллах скрипт орчныг өөрчилбөл заавал буцаана; тестийг хэрэглэгчийн ажиллуулах… | LL-03 §20 |
| PROC-011 | Төхөөрөмж рүү хуулах **бүрт** check файлд `өмнөх hash` заавал, скрипт тулгаад таарахгүй бол **юу ч бичихгүй зогсоно**… | LL-03 §20 |
| PROC-012 | Escape дараалал, үл үзэгдэх тэмдэгттэй кодыг Python (`\\uFEFF`)-оор бичиж, `grep -P '\xEF\xBB\xBF'`-ээр шалгана. | LL-06 §21 |
| PROC-013 | DB reset орсон заавар бүрт CI-ийн дараалал бүтнээрээ: `supabase:reset` → `db:generate` → `dev:test-user` →… | LL-06 §21 |
| PROC-014 | Гар заавар бүрт алхам бүрийн **хүлээгдэх гаралт** ба "**өөр бол ЗОГС, надад илгээ**"; админ эрх шаардах алхмыг эхэнд нь… | LL-06 §21 |
| PROC-015 | - Файлын зөвхөн хэрэгтэй хэсгийг уншина. | LL-06 §22 |
| PROC-016 | `git ls-files -co --exclude-standard -z / … / tar czf x.tgz --null -T -`. | LL-06 §22 |
| PROC-017 | байгаа файлыг дарж бичихдээ түр хавтсанд задлаад `cp -f` (агуулгыг шууд дарна, устгахгүй); бичихээс өмнө `md5sum -c`… | LL-07 §23 |
| PROC-018 | Model rename = (1) `@@map` бүх model-д байгаа эсэх, (2) implicit m-n relation байхгүй эсэх (байвал join хүснэгтийн нэр… | LL-06 §24 |
