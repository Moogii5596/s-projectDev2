---
title: "Lessons — Архитектур, RLS runtime, event bus, модулиуд, жижиг засвар"
type: "Log"
status: "Active"
last_updated: 2026-10-13
tags: [lessons]
---

# Lessons — Архитектур, RLS runtime, event bus, модулиуд, жижиг засвар

> Индекс (ID → дүрэм): [[lessons_learned]]. Дэлгэрэнгүйг зөвхөн индексээс ID-гаа олсны дараа унш. Хэсгийн дугаар (§N) анхны нэгтгэсэн файлынхтай ижил.

## 13. Архитектур / Ажлын процесс (2026-10-08, Phase 2 — ADR-001)

### [ARCH-001] Mock-д суурилсан unit тест integration алдааг нуусан — Schema-per-tenant ажиллаагүй байсан
**Алдаа:** Sprint 6-ийн `SchemaRouterService` 20+ unit тесттэй "ногоон" байсан ч (1) request урсгалд огт холбогдоогүй, (2) `SET search_path` нь Prisma-д нөлөөлөхгүй (Prisma хүснэгтийг `"public"."table"` гэж бүрэн нэрээр бичдэг).
**Шалтгаан:** Тест зөвхөн `$transaction`/`$executeRaw` mock дуудагдсан эсэхийг шалгасан — бодит SQL, бодит wiring шалгаагүй.
**Шийдэл:** ADR-001 — schema-per-tenant цуцалж, RLS + dedicated deploy (B).
**Дүрэм:** Тусгаарлалт/аюулгүй байдлын feature-ийг "дууссан" гэхээс өмнө (1) `grep`-ээр бодит дуудагдах газрыг шалгах, (2) **бодит DB** дээр integration/leakage тест заавал.

### [PROC-001] Засварын скрипт давхар ажиллахад мөр давхардсан (Duplicate identifier)
**Алдаа:** `TS2300: Duplicate identifier 'parseDeploymentConfig'` — import мөр 2 удаа.
**Шалтгаан:** Idempotency шалгалт `new in s and old not in s` — `old` нь `new`-ийн дотор агуулагдах үед (import мөрөнд нэмэлт хийх) дахин хэрэглэгдсэн.
**Шийдэл:** `if new in s: continue` — эхлээд үр дүн байгаа эсэхийг шалгана. Скриптийг 2 удаа ажиллуулж idempotent эсэхийг шалгана; дараа нь `tsc --noEmit`.

### [SEC-001] 🔴 TenantAuthGuard tenant membership шалгадаггүй байсан — cross-tenant унших эрсдэл
**Алдаа:** Shared горимд guard (1) JWT хүчинтэй, (2) Host-ийн tenant DB-д байгаа эсэхийг л шалгадаг байсан. A tenant-ийн хэрэглэгч `Host: b.app.mn` илгээвэл `request.user.tenantId = B` болж, RLS (`app.tenant_id = B`) B-ийн MR жагсаалтыг буцаах боломжтой байсан.
**Шалтгаан:** RLS нь `app.tenant_id`-д бүрэн итгэдэг; тэр утгыг Host-оос авдаг ч хэрэглэгч тухайн tenant-д харьяалагдах эсэхийг хэн ч шалгаагүй. Тестүүд "зөв tenant" болон "байхгүй tenant"-ийг л шалгасан — "байгаа ч гишүүн биш" тохиолдол алга байсан.
**Шийдэл:** `TenantCacheService.isMember(tenantId, authId)` — `core_users` (`is_active = true`), RULE-04 (`set_config` + query нэг `$transaction`), Redis cache (гишүүн 300с / гишүүн биш 30с), DB алдаа → `false` (fail closed). Guard: гишүүн биш → 403 (shared + dedicated).
**Тест:** guard unit (+4), cache unit (+7), integration: бодит DB-д байгаа өөр tenant-ийн Host → 403. SQL-ийг RLS-тэй `app_user` role дээр шалгасан.
**Дүрэм:** Auth guard-ын тест бүрт 3 тохиолдол заавал: зөв tenant (200) · байхгүй tenant (403) · **байгаа ч гишүүн биш tenant (403)**.
**Анхаар:** Хэрэглэгчийг идэвхгүй болгох / хасах кодонд `invalidateMember()` дуудна (эсвэл 5 мин хүртэл cache хүчинтэй).

### [TEST-002] Vitest нь type-check хийдэггүй — тест "ногоон" ч TS алдаатай
**Алдаа:** `TS2322` (`vi.fn(impl)` generic таарахгүй) — vitest 132/132 давсан ч `tsc --noEmit` унасан.
**Шийдэл:** `vi.fn().mockImplementation(impl)`.
**Дүрэм:** Тест бичсний дараа **заавал** `tsc --noEmit` (core-kernel tsconfig `test/**`-г хамардаг) + `eslint`.

### [TEST-003] Шинэ APP_GUARD Redis команд нэмсэн ч integration mock шинэчлэгдээгүй → 29 тест 500
**Алдаа:** `TypeError: this.redis.incr is not a function` (`TenantRateLimitGuard`) — token-той бүх integration хүсэлт 500. Sprint 8-аас хойш нуугдмал (Sprint 8 зөвхөн unit тестээр "дууссан").
**Шалтгаан:** 3 integration файл тус бүр өөрийн Redis mock-тай (`get/setex/del` л), апп-д `incr/pexpire/set/publish/scanStream` нэмэгдсэн. Copy-paste mock → нэгийг шинэчлэхэд бусад нь мартагдана.
**Шийдэл:** `test/helpers/redis-mock.ts` — нийтлэг `createRedisMock()` (апп-ын бүх Redis команд). `src/common/tests/redis-mock-coverage.test.ts` — `src/`-ийн `redis.<cmd>(` бүрийг mock-д байгаа эсэхийг **unit** шатанд шалгана.
**Дүрэм:** (1) APP_GUARD / global interceptor нэмбэл integration тест **заавал** ажиллуулна. (2) Тестийн mock-ийг хуулахгүй — `test/helpers/`.

### [RL-001] Rate limit guard Redis тасрахад бүх API 500 болох эрсдэлтэй байсан → fail-open
**Шийдвэр (2026-10-08, 2.9.2-A):** `incr/pexpire` алдаа → хүсэлтийг нэвтрүүлж, 60 сек тутам нэг warn log. Тэр хугацаанд rate limit түр ажиллахгүй (нийтлэг практик).

### [PERF-001] Load test зөвхөн socket алдаа тоолдог байсан → 429 хариутай ч "давсан"
**Алдаа:** `load-test.ts` нь autocannon-ийн `errors`-ийг л шалгадаг; `non2xx` (429/500) тоологдохгүй. Rate limit (нэг tenant 10/с) 100 connection-ийг бараг бүхэлд нь 429 болгосон ч тест ✅.
**Шийдэл:** `non2xx + errors + timeouts == 0`, 429-ийг тусад нь тайлагнана; preflight (401/403/429 → тодорхой зөвлөмж); шалгаж чадаагүй DoD (Redis INFO) → ❌ (давсан гэж харуулахгүй).
**Дүрэм:** Хэмжилтийн script-ийг алдааны зам бүрээр (429, буруу token, Redis байхгүй) туршиж, **унах ёстой үед унаж** байгааг шалгана.

### [PERF-002] Rate limit default хэт бага байсан (10/с нэг tenant)
**Шийдвэр (Phase 3.1-B):** default 100 / 500 / 2000 (1с/10с/60с), `RATE_LIMIT_SHORT/MEDIUM/LONG` env, буруу утга → startup алдаа. Cluster горимд тоолуур Redis-д тул worker хооронд нэгдсэн.

### [PROC-002] `pkill -f <текст>` / `grep -c <текст>` өөрийгөө (bash мөрийг) олж тоолсон
**Алдаа:** `pkill -f fake-api.js` → өөрийн shell зогссон (exit 144); `ps | grep -c 'dist/src/main.js'` → "2 процесс үлдсэн" гэсэн худал тоо.
**Шийдэл:** PID файл ашиглах; эсвэл `grep "[d]ist/src/main.js"` (bracket trick) — өөрийн командын мөрт тохирохгүй.

### [PERF-003] Guard хүсэлт бүрт Supabase Auth руу (`getUser`) хандаж, шинэ client үүсгэдэг байсан
**Алдаа (load test):** 154 req/s, p99 = 1974ms, 3268 non-2xx (429 = 0), дараа нь "Token хүчингүй" 401 — MR жагсаалт 100% Redis cache-ээс уншигдсан ч.
**Шалтгаан:** (1) хүсэлт бүр = Supabase Auth HTTP дуудлага → Auth (Docker) 100 зэрэгцээ ачаалалд удаашрах/алдаа; (2) guard ЯМАР Ч алдааг (сүлжээ, 5xx) 401 болгодог → хүчинтэй хэрэглэгчийг гаргана; (3) хүсэлт бүрт `createClient` (autoRefreshToken timer-тэй).
**Шийдэл (Phase 3.7-A):** `TenantCacheService.getCachedAuthUser/cacheAuthUser` — түлхүүр = token-ийн SHA-256, TTL = min(60с, token exp); single-flight (ижил token-ийн зэрэгцээ шалгалт → 1 дуудлага); нэг client (`persistSession/autoRefreshToken: false`); `isAuthServiceError` → сүлжээ/0/≥500 = **503**, бусад = 401; алдааг cache-д хадгалахгүй.
**Хэмжилт:** жинхэнэ supabase-js + Redis: 500 хүсэлт (200 зэрэгцээ) → Supabase **500 → 1** дуудлага.
**Trade-off:** хэрэглэгчийг гаргасан/хассан ч token нь ≤ 60с cache-д хүчинтэй.

### [SEED-002] `supabase db reset` → `auth.users` хоосорно, seed-ийн `core_users.auth_id` хуучин машины UUID
**Алдаа:** load test → `Supabase нэвтрэлт амжилтгүй (400): Invalid login credentials`; нэвтэрсэн ч SEC-001 → 403.
**Шийдэл (гараар, reset бүрийн дараа):** Studio → Authentication → Add user (`admin@test.mn` / `test1234`, Auto Confirm) →
`docker exec -i $db psql -U postgres -d postgres -c "UPDATE core_users c SET auth_id = u.id FROM auth.users u WHERE u.email = c.email AND c.email = 'admin@test.mn';"`
**Цаашид:** ✅ `pnpm dev:test-user` (Phase 3.6.5, 2026-10-10) — reset бүрийн дараа энэ ганц команд (Auth хэрэглэгч үүсгэх/нууц үг тохируулах + `core_users.auth_id` холбох, зөвхөн local).


---

## 14. Phase 4 — Sprint 9 модулиуд (2026-10-08)

### [RLS-004] 🔴 RESTRICTIVE-only policy + `app_user` эрхгүй → runtime дээр RLS огт ажилладаггүй
**Илэрсэн:** Workflow хүснэгтүүд (`workflow_definitions`, `workflow_instances`, …) зөвхөн `AS RESTRICTIVE ... TO app_user` policy-тэй, `app_user`-д GRANT алга → цэвэр DB дээр `app_user`: `permission denied`; GRANT хийсэн ч RESTRICTIVE ганцаараа **0 мөр** (PostgreSQL permissive policy шаарддаг). Sprint 9 баримт ижил алдаатай загвар санал болгосон (+ байхгүй `s_project_app_user` role).
**Бодит нөлөө:** App (local, compose, VPC runbook) postgres **superuser**-ээр холбогддог → RLS bypass. Tenant тусгаарлалт одоогоор код (`WHERE tenant_id`) + SEC-001-д тулгуурладаг.
**Шийдэл (Phase 4.8, 2026-10-10):** 4.8.2 migration (49/49 хүснэгт) → 4.8.3 `inTenantTx` [RLS-007] → 4.8.4 `SystemPrismaService` (`SYSTEM_DATABASE_URL`) → 4.8.5 тест; `.env`: `DATABASE_URL`=app_user, `SYSTEM_DATABASE_URL`=postgres.
**Phase 4 стандарт (шинэ хүснэгт бүр):** `ENABLE` + `FORCE` + `AS PERMISSIVE FOR ALL TO app_user USING/WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)` + `GRANT ... TO app_user`; service бүрийн transaction `set_config('app.tenant_id')`-оор эхэлнэ; integration тестэд `app_user`-ээр leakage шалгана.
**Үлдсэн ажил:** app-ийг `app_user`-ээр ажиллуулах (хуучин хүснэгтүүдийн policy/GRANT засах, MR transaction-уудад set_config) — тусдаа phase (санал).

### [MIG-001] `prisma db push` БҮҮ ашигла — schema өөрчлөлт = supabase migration
**Шалтгаан:** Expression/partial index (жнь `lower(btrim(department))`), RLS policy, GRANT зэрэг нь Prisma schema-д илэрхийлэгдэхгүй → `db push` тэдгээрийг устгах/зөрүүлэх эрсдэлтэй.
**Дүрэм:** `supabase/migrations/*.sql` → `pnpm exec supabase migration up` (auth хэрэглэгчийг устгахгүй) → `pnpm db:generate`.

### [TEST-004] Сул assertion — mutation шалгалтаар илэрсэн
**Алдаа:** `toThrow(/хэлтэс/)` — "хэлтэс заавал" шалгалтыг хассан ч өөр мессеж ("хэлтэст ... төсөв алга") мөн "хэлтэс" агуулж тест давсаар байв.
**Дүрэм:** Алдааны мессежийг онцлог хэсгээр нь шалгах (`/хэлтэс \(department\) заавал/`); шинэ логик бүрд mutation шалгалт.

### [ASYNC-001] Promise буцаадаг method sync-аар throw хийсэн
**Алдаа:** `createPeriod()` async биш → validation алдаа rejected promise биш sync exception (тест `.rejects` барьсангүй).
**Дүрэм:** Promise буцаадаг public method → `async`.

### [TEST-005] Unit тест shell-ийн env-ээс хамааралтай байсан (TEST-001 давтагдсан)
**Алдаа:** Load test-д `$env:RATE_LIMIT_SHORT="1000000"` тохируулсан PowerShell session-д `pnpm test` → rate limit 2 тест "429 хүлээсэн, true буцаав".
**Шалтгаан:** `TenantRateLimitGuard` constructor `process.env`-ээс уншдаг; тест зөвхөн *хоосон* env дээр шалгагдсан (`env -u`), *бохир* env дээр шалгагдаагүй.
**Шийдэл:** `test/setup/unit-env.ts` (vitest `setupFiles`) — апп-ын зан төлөвийг өөрчилдөг env-үүдийг (`RATE_LIMIT_*`, `DEPLOYMENT_MODE`, `DEDICATED_TENANT_SLUG`, `DEV_TENANT_SLUG`, `NODE_CLUSTER_WORKERS`) тест бүрийн өмнө устгана; хэрэгтэй тест `vi.stubEnv`.
**Дүрэм:** Unit тестийг **бохир env**-ээр (жнь `RATE_LIMIT_SHORT=1000000 DEPLOYMENT_MODE=dedicated`) ажиллуулж шалгана. Env-ээс уншдаг шинэ тохиргоо нэмбэл `APP_BEHAVIOR_ENV_KEYS`-д нэмнэ.

### [TEST-006] JS default параметр `undefined`-д ажилладаг → "хэлтэсгүй MR" тест IT-ээр явсан
**Алдаа:** `createMr(amount, department = 'IT')` → `createMr(10, undefined)` нь `'IT'` болсон → "хэлтэсгүй → 400" тест 200 авч, 10₮ committed үлдэж дараагийн 2 тест зөрсөн (integration 56/59).
**Шийдэл:** "байхгүй"-г `null`-оор илэрхийлэх (`department: string | null = 'IT'`, `department !== null`); тест өөрийн урьдчилсан нөхцлийг шалгах (committed өөрчлөгдөөгүй).
**Дүрэм:** Тестийн helper-т "утгагүй" гэсэн утгыг `undefined` биш `null`-оор дамжуулна; сөрөг тестэд "юу ч бичигдээгүй"-г assert хийнэ.

## 16. Phase 3.6 — Жижиг засварууд (2026-10-10)

### [CURSOR-001] Буруу `cursor` → 500 (MR), UUID биш id-тай cursor → 500 (бүх raw SQL cursor)
**Алдаа:** `decodeCursor` энгийн `Error` шиддэг байсан → MR `findAll` барьдаггүй → **500**. Inventory/Camp `try/catch`-аар 400 болгодог ч JSON нь зөв, `id` нь UUID биш cursor (`{"id":"x",...}`) шалгалтаас давж `${id}::uuid` / Prisma uuid талбарт хүрээд **500**.
**Шийдэл:** `decodeCursor` өөрөө `BadRequestException('cursor буруу байна')` шиднэ: base64/JSON, `id` = UUID, `createdAt` = огноо. `BadRequestException` нь `Error`-ийн удамшил тул хуучин `try { decodeCursor } catch { throw 400 }` хэв маяг ажилласаар. MR-д cursor-ийг cache/DB-ээс ӨМНӨ decode хийнэ. UUID биш id ашигласан 2 unit тестийг UUID болгосон.
**Дүрэм:** Хэрэглэгчээс ирсэн утга DB-д cast (`::uuid`, `::timestamptz`) болж орох бол cast-ын өмнө форматыг шалгаж 400 буцаана.

### [BUILD-001] `pnpm start` ажилладаггүй байсан (`node dist/main` ↔ build гаралт `dist/src/main.js`)
**Шалтгаан:** `apps/core-kernel/tsconfig.json`-ийн `include` нь `src` + `test` → `nest build` гаралт `dist/src/`, `dist/test/`. Dockerfile-ууд `dist/src/main.js` (зөв), харин package.json `start` хуучин зам.
**Шийдэл:** `"start": "node dist/src/main"`. Шалгалт: build → `pnpm start` (`NODE_CLUSTER_WORKERS=2`) → master + worker-ууд асав.
**Дүрэм:** Script/зам өөрчлөхдөө build хийж бодитоор ажиллуулж шалгана.

### [CLUSTER-001] Worker эхлэхгүй (DB/Redis/.env) бол master саатуулгүй fork хийдэг байсан (crash loop)
**Шийдэл:** `config/cluster-restart.ts` — `RestartPolicy`: 60с цонхонд 1 дэх унасан → шууд (cluster-check-ийн сценари хэвээр), дараагийнх 1с, 2с, 4с … **30с** (env: `CLUSTER_RESTART_BASE_MS/MAX_MS/WINDOW_MS`). `disconnect()`-ээр санаатай зогсоосон worker-ийг дахин асаахгүй. Лог форматыг (`Worker N online` / `Worker N died`) cluster-check.ts-ийн regex-д тааруулж үлдээсэн.
**Шийдвэр:** Анхны санал "N удаа дараа master зогсох" байсан ч **бууж өгөхгүй** хувилбарыг сонгосон — нэг worker-ийн давтагдах алдаа эрүүл worker-уудыг унагахгүй; хамгийн ихдээ 30с тутам оролдоно.
**Шалгалт:** build хийсэн app-ийг DB-гүй ажиллуулахад: 0 → 300 → 600 → 1200 → 2000ms (тест тохиргоо) — өмнө нь 12с-д 11+ удаа fork.

### [LOG-001] Integration гаралтад `prisma:error … Unique constraint failed` — тест давсан ч алдаатай мэт
**Шалтгаан:** Prisma `log: ['error']` үед кодоор БАРЬЖ АВСАН алдааг ч (P2002 → 409, MR дугаарын дахин оролдлого) консол руу бичдэг. Тест санаатайгаар давхардал үүсгэдэг.
**Шийдэл:** `PRISMA_LOG_LEVELS` (default `warn,error` — production өөрчлөгдөхгүй; `none`; жагсаалт). `vitest.integration.config.ts` → `warn`. Барьж аваагүй алдаа exception → тестийн filter `[ERROR]` лог / HTTP 500-аар харагдсаар.

### [PROC-005] Хуучин snapshot дээр ажиллах эрсдэл — төсөл зөөгдсөн, өөр session (Camp) олон файл өөрчилсөн
**Илэрсэн:** Phase 3.6 эхлэхэд таны төсөл `E:\MoogiiDev\s-project` → `E:\MoogiiDev\Dev\s-project` зөөгдсөн, Camp модуль (Шат 1–9) нэмэгдсэн байв (unit 230 → 424, migration 18 → 27). Cloud дахь өмнөх ажлын хуулбар (v5) хуучирсан.
**Шийдэл:** Төхөөрөмжөөс бүтэн snapshot (node_modules-гүй tar) авч шинэ ажлын хавтас үүсгэсэн; baseline (unit/tsc/lint) ажиллуулж байж эхэлсэн; deploy-ийн өмнө өөрчлөх файл бүрийн hash-ийг snapshot-той тулгана.
**Дүрэм:** Phase/багц бүрийг төхөөрөмжийн одоогийн төлвөөс эхлүүлнэ; өмнөх cloud хуулбарыг хэзээ ч шууд deploy хийхгүй.

## 17. Phase 4.8 — RLS runtime (2026-10-10)

### [RLS-005] `approval_logs` PERMISSIVE policy буруу GUC (`app.current_tenant_id`)-г уншдаг байсан
**Илэрсэн:** 4.8.1 аудит (§7 policy нөхцөл). Код хаана ч `app.current_tenant_id`-г тохируулдаггүй (стандарт = `app.tenant_id`, RULE-04) → app_user-ээр бол `approval_logs` үргэлж 0 мөр (эрх нээгдсэн ч). Policy `TO PUBLIC` байсан.
**Шийдэл:** `20261010004`: policy-г устгаж стандарт `tenant_isolation_approval_logs` (PERMISSIVE TO app_user) нэмэв.
**Дүрэм:** Шинэ policy-г `camp_apply_tenant_rls` / Module Template-ийн загвараар л бичнэ; GUC нэрийг гараар бичихгүй. Migration-ийн дараа `rls_audit.sql`-ийг ажиллуулж §3 (verdict), §7 (нөхцөл)-ийг шалгана.

### [RLS-006] `current_tenant_id()` — context тохируулаагүй үед 0 мөр биш АЛДАА (RLS-003 давтагдсан)
**Шалтгаан:** `COALESCE(current_setting('app.tenant_id', true), '')::uuid` → `''::uuid` → `invalid input syntax for type uuid`. `core_users`, `mr_headers`, `mr_items`, `outbox_events`-ийн policy үүнийг ашигладаг.
**Шийдэл:** `NULLIF(current_setting('app.tenant_id', true), '')::uuid` (+ `SET search_path` — SECURITY DEFINER). PG16 дээр 49 хүснэгт × (context-гүй, `''`, tenant) алдаагүй.
**Дүрэм:** GUC → uuid хөрвүүлэлт ҮРГЭЛЖ `NULLIF(..., '')`.

### [RLS-007] `set_config` нь transaction-ий ГАДНА → app_user-д RLS 0 мөр (MR модуль бүхэлдээ)
**Илэрсэн (4.8.3):** `PrismaTenantClientService`-ийн `$use` middleware `this.$executeRaw(set_config(..., true))`-г тусдаа statement болгон дууддаг — `is_local=true` тул тэр statement дуусахад л арилна, дараагийн query-д хүрдэггүй (+ query бүрт 2 илүү round-trip). Үүнд найдсан **MR service-ийн 16 query бүгд context-гүй**; `AuthService.register` set_config ба create-ийг тусдаа дууддаг; `WorkflowService` actor lookup, `ApprovalSlaService` transaction-гүй. Апп `postgres` (BYPASSRLS)-ээр ажилладаг тул илрээгүй.
**Шийдэл:** `db/tenant-tx.ts` `inTenantTx(prisma, tenantId, fn)` — set_config + бүх query нэг transaction. MR service бүхэлд нь шилжүүлэв, `$use` устгав. PG16 + бодит Prisma-аар `app_user`: хуучин код 7/8 унасан → шинэ 8/8.
**Дүрэм:** Tenant хүснэгтэд хандах query бүр `inTenantTx`/`camp-tx` дотор. `this.prisma.<model>`-ийг transaction-гүй ашиглахгүй (зөвхөн системийн холболт — 4.8.4).

### [CACHE-001] MR төлөв/эзэмшигчийн шалгалт 60с cache-ээс, өөрчлөлтийн дараа cache цэвэрлэдэггүй байсан
**Эрсдэл:** Дэлгэрэнгүйг харсан (DRAFT cache-лэгдсэн) → submit → 60с дотор approve: cache-ийн DRAFT-аас болж 403 "Зөвхөн PENDING_APPROVAL…"; жагсаалт/дэлгэрэнгүй 60с хуучин. Workflow-ийн approve/reject `mr_headers`-ийг raw SQL-ээр өөрчилдөг ч MR cache мэдэхгүй.
**Шийдэл:** Шалгалт `loadOne(tx)` — transaction доторх шинэ мөр; create/update/remove/submit/approve/reject болон `WorkflowService.approveStep/rejectStep`-ийн дараа `cache.invalidateTenant` (алдаа → warn, үр дүнг буцаахгүй).
**Дүрэм:** Cache зөвхөн уншиж харуулахад; бизнесийн шийдвэр (төлөв, эрх) DB-ийн шинэ мөрөөс. Бичсэн service бүр cache-ээ цэвэрлэнэ.
**Яагаад integration тест бариагүй:** `test/helpers/redis-mock.ts`-ийн `get` үргэлж `null` (cache miss) — cache-ийн хуучирсан утгын алдааг integration тест хэзээ ч харахгүй. Cache-тэй урсгалыг санах ойн cache-тэй (бичсэнээ уншдаг) harness-аар шалгана.

### [TEST-010] Cloud орчинд Prisma query engine татагдахгүй (binaries.prisma.sh 403) — бодит DB-тэй Prisma тест хийх арга
**Шийдэл (зөвхөн шалгалтын harness, төсөлд орохгүй):** `previewFeatures = ["driverAdapters"]`-тай schema-г тусдаа хавтсанд generate → `wasm.js`-ийн engine loader-ийг `fs.readFileSync(query_engine_bg.wasm)` болгох → `@prisma/adapter-pg` (pg Pool) → vitest alias `@prisma/client` → shim. Үр дүн: бодит service код + бодит PostgreSQL 16 + `app_user` RLS.

### [SEC-002] 🔴 `PUT /workflow/definitions/:id` — өөр tenant-ийн workflow definition-ийг засах боломжтой байсан
**Илэрсэн (4.8.5):** `WorkflowDefinitionService.update` нь set_config хийдэг ч `tx.workflowDefinition.update({ where: { id } })` — tenant шүүлтгүй. Апп `postgres` (BYPASSRLS)-ээр ажилладаг тул RLS хамгаалдаггүй → Tenant B-ийн хэрэглэгч A-ийн definition-ийн id-г мэдвэл засна (шинэ HTTP тест: **200**). `app_user` горимд RLS хаах ч P2025 → 500.
**Шийдэл:** `updateMany({ where: { id, tenantId } })` → `count === 0` → 404, дараа нь `findFirstOrThrow({ id, tenantId })`. `test/tenant-isolation-http.integration.spec.ts` (2 tenant, MR + definition: жагсаалт, унших, засах, батлах, татгалзах → 404; гишүүн биш Host → 403).
**Дүрэм:** Update/delete-ийн `where`-д ҮРГЭЛЖ `tenantId` (эсвэл ижил transaction-д tenant-аар шалгасан мөр). RLS бол хоёр дахь хамгаалалт. Шинэ endpoint бүрт 2-tenant HTTP тест.
**Олдвор (засаагүй — дараагийн шат):** `WorkflowDefinitionController`-д эрхийн шалгалт алга (REQUESTER ч definition үүсгэж/засна), `WorkflowDefinitionInput` нь interface → body validation алга.

### [TEST-011] Integration тестийн admin холболт `DATABASE_URL` байсан → app_user болгоход бэлтгэл эвдэрнэ
**Шийдэл:** `test/helpers/db-urls.ts` — `ADMIN_DB_URL = SYSTEM_DATABASE_URL || DATABASE_URL`, `APP_USER_DB_URL`. Cloud-д бүтэн integration-ийг fake Supabase Auth (GoTrue-ийн 6 endpoint) + PG16 + wasm Prisma-аар (TEST-010) хоёр горимд ажиллуулж шалгасан.

### [SEC-003] Workflow definition: эрхийн шалгалтгүй, body шалгалтгүй
**Алдаа:** REQUESTER ч `POST/PUT /workflow/definitions` хийж батлах урсгалыг өөрчилж чаддаг байв. `WorkflowDefinitionInput` нь interface → ValidationPipe юу ч шалгадаггүй (`stepsConfig`-д байхгүй role → MR илгээхэд 500; `tenantId` зэрэг илүү талбар Prisma руу).
**Шийдэл:** `requireRole(tx, tenant, authId, [OWNER, ADMIN])`; `WorkflowDefinitionDto` + `stepsConfigError()` (монгол, замтай мессеж). 2-tenant HTTP тест: REQUESTER/APPROVER → 403, буруу body → 400, ADMIN → 201/200.
**Дүрэм:** Controller-ийн `@Body()` ҮРГЭЛЖ class DTO (interface/`unknown` биш). Тохиргоо өөрчилдөг endpoint бүрт role.

### [API-001] UUID параметрт `ParseUUIDPipe` байхгүй → `not-a-uuid` → Prisma алдаа → 500 (8 route)
**Илэрсэн:** `test/route-probe.integration.spec.ts` — Nest `DiscoveryService` + `PATH_METADATA/METHOD_METADATA`-аас path параметртэй бүх route-ийг цуглуулж, санамсаргүй UUID болон `not-a-uuid`-ээр дуудна. MR (6), delegation DELETE, routes DELETE → 500.
**Шийдэл:** `@Param('id', ParseUUIDPipe)`. Probe нь шинэ route-ийг автоматаар хамардаг тул дахин гарвал тест унана.

### [HTTP-001] `@Header('Content-Type', xlsx)` + validation алдаа → Fastify "invalid payload type" 500
**Шалтгаан:** Nest-Fastify `@Header`-ийг pipe-ээс ӨМНӨ тавьдаг → `ParseUUIDPipe`-ийн 400 JSON xlsx Content-Type-тай → Fastify object serialize хийж чадахгүй → 500.
**Шийдэл:** `@Res({ passthrough: true })` → амжилттай үед л `reply.header(...)`.

## 18. Phase 5 — Event Bus (2026-10-10)

### [EVT-001] Outbox poller: `SELECT … FOR UPDATE SKIP LOCKED` transaction-ГҮЙ → олон worker нэг event-ийг давхар publish хийдэг байсан
**Шалтгаан:** autocommit-д мөрийн түгжээ statement дуусахад суларна. Worker бүр (cluster, cron 5с) PENDING мөрүүдийг авч, нэг нэгээр нь publish → UPDATE. Хоёр дахь worker эхнийх нь PUBLISHED болгохоос өмнө ижил мөрүүдийг авна.
**Баталгаа:** PG16 race (4 poller, 40 event, 50мс зайтай эхлэх) → хуучин код **80–119 publish**, бүх event давхар; шинэ код яг 40.
**Шийдэл:** `processNext()` — event бүр нэг transaction: `… WHERE status='PENDING' AND next_retry_at <= now() ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED` → publish → `PUBLISHED` (эсвэл retry/`DLQ` + `dlq_events` ижил transaction-д) → commit. Баталгаа = at-least-once (publish-ийн дараа commit-оос өмнө унавал дахин) → consumer CloudEvent `id`-аар dedupe [EVT-002].
**Дүрэм:** `FOR UPDATE [SKIP LOCKED]` нь ЗӨВХӨН transaction дотор утгатай. Queue/claim хэв маягийг зэрэгцээ worker-тэй тестлэнэ (эхлэх хугацааг зөрүүлж — яг зэрэг эхэлбэл алдаа нуугдана).

### [EVT-002] Retry бүрт CloudEvent id шинээр үүсдэг байсан / [EVT-003] MR outbox-ийг шууд бичдэг байсан
**Шалтгаан:** Poller publish бүрт `CloudEventsAdapter.wrap()` → `randomUUID()`. MR service `tx.outboxEvent.create`-ээр `cloud_event_*` баганагүй бичдэг.
**Шийдэл:** `EventBusService.emit` id/type/source-ийг outbox-д нэг удаа хадгална (MR ч үүгээр, `event_type` хуучин нэр хэвээр + `cloudEventType`); poller `CloudEventsAdapter.fromOutbox(row)` (id алга бол outbox мөрийн id).

### [TEST-012] `client.$queryRaw`-г monkeypatch хийхэд interactive transaction доторх `tx.$queryRaw` transaction-аас ГАРСАН
**Тохиолдсон:** Race harness-д poller бүрийн авсан мөрийн тоог logging хийх гэж `PrismaClient.$queryRaw`-г орлуулахад шинэ (зөв) код давхар publish хийсэн мэт харагдсан — `tx.$queryRaw` нь клиентийн method-ийг transaction context-гүй дуудсан.
**Дүрэм:** Prisma клиентийн method-ийг тестэд орлуулахгүй; хэмжилтийг гадна талд (publisher mock, DB-ийн төлөв) хийнэ.

---
