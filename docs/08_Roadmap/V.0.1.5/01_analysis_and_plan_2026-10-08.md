# Төслийн Шинжилгээ ба Хөгжүүлэлтийн Төлөвлөгөө — 2026-10-08

> Хувилбар: v0.1.0 ✅ → v0.1.5 (Tier 2 Enterprise VPC) 🔄
> Төлөв: **БАТЛАГДСАН 2026-10-08** · Phase 0–1 ✅ · Phase 2 ✅ · Phase 2.8 ✅ · Phase 2.9 ✅ (integration 47/47) · Phase 3 ✅ (Sprint 8 DoD 4/4) · Phase 3.7 ✅ · Phase 3.6 ✅ (код) · Phase 4 ✅
> **Шийдвэр (2026-10-08):** B — Schema-per-tenant цуцлах; shared tenant = RLS, Enterprise VPC = тусдаа DB/deploy

## 1. Одоогийн бодит төлөв (кодоос шалгасан)

| Sprint | Баримт бичигт | Код дээр бодитоор |
|---|---|---|
| 6 Schema Isolation | 🔄 "тест хүлээгдэж байна" | ⚠️ Service + migration + mock тест бий, гэхдээ **request урсгалд холбогдоогүй** |
| 7 Advanced Workflow | ⏳ (index) / [x] (sprint файл) | ✅ amount-router, delegation, escalation, SLA, UI хуудас бий |
| 8 Performance | ✅ | ✅ Load-test-ийн DoD 4 зүйл баталгаажаагүй |
| 9 Модулиуд | ⏳ | ❌ Эхлээгүй |
| 10 Event Bus тест | ⏳ | ❌ Эхлээгүй |
| 11 Release | ⏳ | ❌ Эхлээгүй |

## 2. Илэрсэн асуудлууд

### 🔴 Critical
1. **Schema isolation ажиллахгүй байна.** `SchemaRouterService.withSchema()`-г `TenantContextInterceptor` болон аль ч бизнес service (MR, Workflow) дууддаггүй (Алхам 6.4 хийгдээгүй). Enterprise tenant-ийн өгөгдөл одоо ч `public`-д бичигдэнэ.
2. **`search_path` арга Prisma-тай таарахгүй байх магадлал өндөр.** Prisma хүснэгтийн нэрийг `"public"."mr_headers"` гэж schema-тай нь бичдэг тул `SET search_path` нөлөөлөхгүй. Unit тест mock ашигладаг тул үүнийг барьж чадахгүй → query log-оор баталгаажуулна.

### 🟠 High
3. **CI-ийн unit тест алхам юу ч ажиллуулахгүй.** `ci.yml` → `pnpm turbo test:unit`, гэтэл `core-kernel`-д `test:unit` script байхгүй.
4. **CI-д `supabase db push`** — remote project link шаарддаг; local CI-д `supabase db reset` байх ёстой.
5. **Локал хавтсанд `.git` олдсонгүй** — version control-гүй бол CI trigger болохгүй, буцаах боломжгүй.

### 🟡 Medium
6. Баримт бичгийн зөрүү: `00_index.md` (Sprint 7 "хүлээгдэж байна"), Sprint 6 файл замууд (`src/tenant/` ↔ бодит `src/modules/tenant-admin/`).
7. `lessons_learned.md` хоёр газар (root + `docs/`) — нэг эх сурвалж болгох.
8. Frontend component тест огт байхгүй; `mfe-requisitions` нь 15 мөр stub.
9. Root-д 17 хоосон `_tmp_*` файл, `docs/test_write.tmp`, `supabase/snippets/Untitled query 611.sql`.

## 3. Хийх ажлын төлөвлөгөө

### Phase 0 — Цэвэрлэгээ ба суурь ✅
- [x] 0.1 Git: repo + `origin` (GitHub) хэрэглэгч үүсгэсэн (2026-10-08 13:46). Commit / `v0.1.0` tag — хэрэглэгч хийнэ
- [x] 0.2 17 `_tmp_*`, `docs/test_write.tmp` устгав; `.gitignore`-д `_tmp_*`, `*.tmp` нэмэв (`supabase/snippets/` дахь seed snippet-ийг хадгалав)
- [x] 0.3 lessons_learned нэгтгэв → **үндсэн: `docs/lessons_learned.md`** (бүх docs аль хэдийн тийш заадаг); root файл = заагч
- [x] 0.4 `00_index.md`, `project-status.md` бодит төлөвтэй тааруулав

### Phase 1 — CI засвар ✅ (Linux орчинд бодитоор ажиллуулж шалгасан)
- [x] 1.1 `core-kernel`-д `test:unit` script → turbo одоо бодитоор ажиллуулна [CI-001]
- [x] 1.2 CI хоёр job-оос `supabase db push` хасав [CI-002]
- [x] 1.3 Root `.eslintrc.cjs` + 5 lint алдаа засав [CI-003]
- [x] 1.4 `tenant-onboarding.service.spec.ts` env-ээс хамааралгүй болгов [TEST-001]
- [x] 1.5 lessons_learned-д бүртгэв
- **Үр дүн:** unit 111/111 ✅ (env-гүй) · tsc core-kernel + web-shell ✅ · lint 0 error (78 warning) · `turbo lint test:unit` 3/3 ✅

### Phase 2 — Tenant Isolation (ADR-001) ✅ (2026-10-08)
- [x] 2.1 ADR: `docs/02_System_Architecture/ADR-001_Tenant_Isolation.md`
- [x] 2.2 Sprint 6 код хасав: `SchemaRouterService`, `TenantProvisioning{Service,Controller}` (3 endpoint), `schema-isolation.spec.ts`
- [x] 2.3 Migration `20261008001_revert_schema_per_tenant.sql` (функц/index/багана DROP, `tenant_*` schema-г УСТГАХГҮЙ — NOTICE) + Prisma `schemaName` хасав
- [x] 2.4 `src/config/deployment-mode.ts` (ганц эх сурвалж) → `EnvConfig` startup validation + `TenantAuthGuard` (dedicated → tenant = `DEDICATED_TENANT_SLUG`)
- [x] 2.5 `docker/docker-compose.vpc.yml`, `docker/.env.vpc.example`, `docker/vpc/bootstrap_dedicated_tenant.sql`; `.gitignore`-д `.env.vpc`
- [x] 2.6 Тест: `deployment-mode.spec.ts` (17), `env.config.spec.ts` (4), guard dedicated/shared (+8)
- [x] 2.7 Runbook `docs/07_Tech_Stack_and_Environment/03_Enterprise_VPC_Deployment.md`; sprint_6 (орлогдсон), sprint_11, index, INDEX, `.env.example`, lessons (ARCH-001, PROC-001)
- **Шалгалт:** unit 121/121 ✅ (env-гүй) · mutation шалгалт (dedicated логик унтраахад 4 тест унав) · tsc ✅ · lint 0 error ·
  PostgreSQL 16 дээр 16 migration цэвэр DB-д ✅, provision хийсэн DB-д ✅, давтан ажиллуулахад ✅ · bootstrap SQL 2 удаа ✅ · `docker compose config` ✅
- **Шалгаагүй:** бодит Supabase + Docker image build (сүлжээ хаалттай) → таны компьютер дээр `supabase db reset` + `pnpm test`

### Phase 2.8 — 🔴 Аюулгүй байдал: tenant membership шалгалт ✅ (2026-10-08)
- [x] 2.8.1 `TenantCacheService.isMember(tenantId, authId)` — `core_users.is_active`, RULE-04 transaction, Redis 300с/30с, fail closed
- [x] 2.8.2 Guard: гишүүн биш → 403 (shared + dedicated); `invalidateMember()` нэмэгдсэн
- [x] 2.8.3 Тест: guard unit +4, cache unit +7, integration `tenant-auth-guard` +1 (бодит DB-д байгаа өөр tenant → 403)
- [x] 2.8.4 lessons_learned [SEC-001], [TEST-002]
- **Шалгалт:** unit 132/132 ✅ · mutation (guard шалгалт хасахад 2, set_config хасахад 1 тест унав) · tsc (src+test) ✅ · lint 0 error ·
  membership SQL-ийг RLS-тэй `app_user` role дээр PostgreSQL 16-д шалгасан (гишүүн → 1, өөр tenant → 0, идэвхгүй → 0)
- **Таны компьютер дээр:** `pnpm --filter @s-project/core-kernel test:integration` (Supabase асаалттай)

### Phase 2.9 — Integration Redis mock + rate limit fail-open ✅ (2026-10-08)
> Шалтгаан: таны `test:integration` → 29/47 унасан, бүгд `redis.incr is not a function` (Sprint 8-аас хойш нуугдмал).
> Phase 2.8 бодит DB-д баталгаажсан: "өөр tenant → 403" ✓; "зөв tenant" membership-г давж rate limit guard дээр унасан.
- [x] 2.9.1 `test/helpers/redis-mock.ts` (бүх Redis команд) → 3 integration файл ашиглана; `redis-mock-coverage.test.ts` (unit)
- [x] 2.9.2 (A) `TenantRateLimitGuard` Redis алдаа → fail-open + 60с тутам warn; unit +4
- [x] 2.9.3 lessons_learned [TEST-003], [RL-001]
- **Шалгалт:** unit 139/139 ✅ · mutation (try/catch хасахад 3, mock-оос `incr` хасахад coverage тест унав) · жинхэнэ guard + CacheService + mock хамтдаа ✅ · tsc (src+test) ✅ · lint 0 error · turbo 3/3
- [x] 2.9.4 Таны компьютер дээр: `test:integration` → **47/47 ✅** (2026-10-08 15:58, Windows + local Supabase)

### Phase 3 — Sprint 8 DoD үлдэгдэл ✅ ДУУССАН (2026-10-08) — DoD бүрэн баталгаажсан
- [x] 3.1 (B) `src/config/rate-limit.ts` — `RATE_LIMIT_SHORT/MEDIUM/LONG`, default **100/500/2000**, буруу утга → startup алдаа; guard + EnvConfig; `.env.example`, compose (root, VPC)
- [x] 3.2 `apps/e2e/tests/load-test.ts` — non-2xx/429 тоолно, preflight, token автоматаар (Supabase REST), Redis INFO hit rate, cursor 20 хуудас. Dependency нэмээгүй
- [x] 3.3 `supabase/dev/seed_perf_10k_mr.sql` (dev only, idempotent) · EXPLAIN ANALYZE (PostgreSQL 16, app_user + RLS): **10k → 5.8ms** ✅
- [x] 3.4 `apps/e2e/tests/cluster-check.ts` + `main.ts`-д `Worker <pid> online` log — 4 worker → нэгийг kill → respawn → /health; crash loop-г 12с-д илрүүлнэ
- **Шалгалт:** unit 153/153 ✅ · mutation (rate limit hardcode → 2 тест унав) · load-test: fake API + жинхэнэ Redis дээр 4 сценари (хэвийн ✅ / 429 ❌ / буруу token ❌ / Redis байхгүй ❌) · cluster-check: `main.ts`-ийн cluster логик дээр хэвийн ✅, жинхэнэ build дээр crash loop ❌ (зөв), үлдсэн процесс 0 · tsc (core-kernel, e2e, web-shell) ✅ · lint 0 · turbo 3/3
- [x] 3.5 Таны компьютер дээр ✅ — load test (3.7-ийн дараа) + cluster-check: **Sprint 8 DoD 4/4 + бүх тест** (2026-10-08 16:53)

```powershell
# 1) 10k MR (нэг удаа) — psql суугаагүй бол Supabase DB container-оор:
$db = docker ps --filter "name=supabase_db" --format "{{.Names}}"
Get-Content supabase/dev/seed_perf_10k_mr.sql -Raw | docker exec -i $db psql -U postgres -d postgres -v ON_ERROR_STOP=1
# 2) Backend-ийг өндөр rate limit-тэй асаах (тусдаа терминал)
$env:RATE_LIMIT_SHORT="1000000"; $env:RATE_LIMIT_MEDIUM="1000000"; $env:RATE_LIMIT_LONG="1000000"; pnpm --filter @s-project/core-kernel dev
# 3) Load test (өөр терминал)
pnpm --filter e2e exec tsx tests/load-test.ts
# 4) Cluster (backend dev-ийг зогсоогоод)
pnpm --filter @s-project/core-kernel build
pnpm --filter e2e exec tsx tests/cluster-check.ts
```

### Phase 3.6 — Жижиг засварууд ✅ хэрэгжсэн (2026-10-10, батлагдсан 11:47 — "B, дараа нь A")
- [x] 3.6.1 **MR cursor index** `idx_mr_headers_cursor (tenant_id, created_at DESC, id DESC)` (`20261010003_mr_cursor_index.sql`) + WHERE `created_at <= c AND (created_at < c OR id < cid)` (asc эсрэгээр). PG16 10k мөр: Seq Scan + Sort **2.68ms → Index Scan 0.035ms**
- [x] 3.6.2 `start` → `node dist/src/main` [BUILD-001]
- [x] 3.6.3 Буруу cursor → **400** (`decodeCursor`: base64/JSON, id = UUID, огноо) — MR + Inventory + Camp бүгдэд [CURSOR-001]
- [x] 3.6.4 Cluster crash-loop backoff: 0 → 1с → 2с … 30с, disconnect-ийг асаахгүй; **бууж өгөхгүй** (эрүүл worker-уудыг унагахгүй) [CLUSTER-001]
- [x] 3.6.5 `pnpm dev:test-user [--email= --password=]` — Auth хэрэглэгч үүсгэх/нууц үг + `core_users.auth_id` холбох; зөвхөн local; core_user-гүй / олон tenant → Auth-д юу ч хийхгүй [SEED-002]
- [x] 3.6.6 (нэмэлт) Integration гаралтын `prisma:error` чимээ → `PRISMA_LOG_LEVELS` (integration = `warn`) [LOG-001]
  - Шалгалт: unit **457/457** (бохир env-ээр ч) · mutation **9/9** · tsc ✅ · lint 0 алдаа · PG16: 27 migration + seed, cursor walk 6/6 (desc/asc × статус, ижил created_at), EXPLAIN ✅, dev:test-user SQL 2/2 · GoTrue mock (supabase-js): үүсгэх → дахин ажиллуулахад шинэчлэх (250 хэрэглэгч, 2 хуудас) ✅ · `pnpm start` + backoff бодитоор ✅
  - [x] Таны компьютер (2026-10-10 12:14): `migration up` → `db:generate` → `test` → `test:integration` → `pnpm dev:test-user` ✅

### Phase 3.7 — Auth token cache (A) ✅ хэрэгжсэн (2026-10-08)
> 3.5-ийн анхны хэмжилт (таны компьютер): p99 = 1974ms ❌, 154 req/s, non-2xx 3268 (429 = 0) ❌, cache hit 100% ✅, cursor → 401 ❌.
> Шалтгаан: guard хүсэлт бүрт Supabase Auth `getUser` + алдаа бүрийг 401 болгодог ([PERF-003]).
- [x] 3.7.1 Redis cache: түлхүүр = SHA-256(token), TTL = min(60с, exp); алдааг cache-д хадгалахгүй; Redis алдаа → Supabase-аар шалгана
- [x] 3.7.2 Нэг Supabase client (`persistSession/autoRefreshToken: false`) + **single-flight** (ижил token-ийн зэрэгцээ шалгалт → 1 дуудлага)
- [x] 3.7.3 `isAuthServiceError`: сүлжээ / status 0 / ≥ 500 → **503**, бусад → 401
- [x] 3.7.4 Тест: unit 179/179 · mutation 6/6 баригдсан (cache, 503→401, client дахин ашиглах, hash, exception→401, single-flight) · жинхэнэ supabase-js + Redis: 503/сүлжээ тасрах → 503, 401 → 401; **500 хүсэлт → Supabase 1 дуудлага** · tsc ×3 · lint 0 · turbo 3/3
- [x] 3.7.5 Load test (таны компьютер, 16:52): ✅ p99 **1974 → 57ms**, **154 → 3360 req/s**, non-2xx **3268 → 0**, cache 100%, cursor max 31ms

### Phase 4 — Sprint 9: Нэмэлт модулиуд (2026-10-08 эхэлсэн)
> **Шийдвэр (2026-10-08):** холболт = MR transaction дотор шууд (`MrLifecycleService`) · Budget: tenant-д идэвхтэй хугацаа байвал заавал ·
> Inventory: боломжтойг нөөцөлж дутууг тэмдэглэнэ · Frontend: модуль бүрт хялбар хуудас + Report dashboard
> **Илэрсэн:** sprint_9-ийн RLS загвар буруу (RESTRICTIVE-only) → PERMISSIVE TO app_user стандарт [RLS-004]; workflow хүснэгтүүд ижил алдаатай + app superuser-ээр ажилладаг (RLS runtime-д идэвхгүй) → Phase 4.8 санал
- [x] **4.0** Суурь: `MrLifecycleService` (MR батлах 2 зам: MR service + WorkflowService), `requireRole` helper, RLS стандарт
- [x] **4.1** Budget: migration `20261008002_budget.sql` + Prisma + `/api/v1/budget` (periods, allocations, check) + submit commit / approve SPENT / reject RELEASED
  - Шалгалт: unit 210/210 · mutation 5/5 (+ сул assertion засав) · PostgreSQL 16 (app_user, RLS): migration 17/17, RLS 5 сценари, SQL 10 сценари (зэрэгцээ `FOR UPDATE` ✅) · AppModule DI ✅ · tsc/lint ✅
  - [x] Таны компьютер: budget integration **59/59 ✅**
- [x] **Шийдвэр (17:47):** шинэ модулиуд = платформ батлах **хөнгөн** модуль (1 хүснэгт, хамгийн бага API); frontend энэ удаа алгасна
- [x] **4.1 баталгаажуулалт:** integration **59/59 ✅** (таны компьютер, TEST-005/006 засварын дараа)
- [x] **4.2 Inventory-lite ✅** — `inventory_items` · `GET/POST /inventory/items` (cursor + lowStock + Redis cache), `PATCH /inventory/items/:id/adjust` (атомик, сөрөг болохгүй)
- [x] **4.3 Vendor-lite ✅** — `vendors` · `GET/POST /vendors`, `PATCH /vendors/:id` (загвар модуль)
- [x] **4.4 Report-lite ✅** — `GET /reports/summary` (MR, төсөв, бараа, нийлүүлэгч) + `GET /reports/summary.csv` (BOM, injection хамгаалалт, dependency-гүй)
- [x] **4.5 Integration** — `test/modules-lite.integration.spec.ts` (эрх, cursor, adjust, CSV, RLS app_user)
- [x] **4.7 Загвар** — `docs/03_Data_Models_and_Security/03_Module_Template.md`
  - Шалгалт: unit **230/230** (бохир env-ээр ч) · mutation 6/6 · PostgreSQL 16 (app_user, RLS): migration 18/18, RLS 5, SQL 10 сценари (cursor 25→3 хуудас давхардалгүй, **зэрэгцээ 10 хасалт → яг 5**) · бүтэн AppModule-ийн route 11/11 · tsc/lint ✅
  - [x] Таны компьютер (2026-10-10): integration **10 файл / 123 тест ✅** (modules-lite 9/9, budget 12/12)
- [~] **4.6 Frontend** — энэ удаа алгассан (шийдвэр 17:50)
- [x] **Хасагдсан** (анхны sprint_9-ээс): агуулахын байршил, нөөцлөлт/MR мөр холболт, үнийн санал, Excel (`exceljs`), тусдаа chain тест
- [ ] **4.8 RLS runtime (батлагдсан 2026-10-10 12:20)** — app-ийг `app_user`-ээр ажиллуулах, шат бүрт тест ногоон
  - [x] **4.8.1 Аудит** — `supabase/dev/rls_audit.sql` (зөвхөн уншина). Таны DB (12:19) = PG16 хуулбар: 52 хүснэгт / 49 tenant / **39 зөв**, NO_GRANT 10, PERMISSIVE-гүй 9; `postgres` = BYPASSRLS (superuser биш) → апп RLS-ийг алгасдаг нь батлагдсан
  - [x] **4.8.2 Migration ✅** `20261010004_rls_app_user.sql`: 10 хүснэгтэд PERMISSIVE `tenant_isolation_*` + GRANT; буруу GUC-тэй `approval_logs_tenant_isolation` устгав [RLS-005]; `current_tenant_id()` NULLIF [RLS-006]; `extensions` USAGE. `tenants`/`super_admins` → app_user эрхгүй (системийн холболт). **Апп-ын зан төлөв өөрчлөгдөхгүй** (апп `postgres`-ээр хэвээр)
    - Шалгалт (PG16): аудит **49/49**, давтан ажиллуулах ✅, app_user 11/11 (49 хүснэгт × 3 context, cross-tenant бичих татгалзав, tenants эрхгүй); migration-гүй DB дээр ижил тест УНАСАН (хүчинтэй тест) · `test/rls-app-user.integration.spec.ts` (шинэ)
    - [ ] Таны компьютер: `migration up` → `db:generate` → `test:integration` → аудит дахин (хураангуй 49 / 2 / 0)
    - [x] Таны компьютер (15:21): `migration up` → integration ✅ → аудит **49 / 2 / 0** ✅
  - [x] **4.8.3 Код ✅** — `db/tenant-tx.ts` (`inTenantTx`): **MR service бүхэлдээ** (create/list/detail/update/remove/submit/approve/reject — өмнө нь нэг ч query context-гүй), `WorkflowService` actor lookup, `ApprovalSlaService`, `AuthService.register` (set_config ба create тусдаа statement байсан); үр дүнгүй `$use` устгав [RLS-007]
    - Нэмэлт засвар [CACHE-001]: MR төлөв/эзэмшигчийн шалгалт 60с cache-ээс уншдаг, өөрчлөлтийн дараа cache цэвэрлэдэггүй байв → transaction доторх шинэ мөр + `invalidateTenant` (MR + workflow approve/reject)
    - Шалгалт: unit **458/458** · tsc ✅ · lint 0 алдаа · **бодит PG16 + бодит Prisma (wasm engine + pg adapter) harness**: `app_user`-ээр MR бүтэн урсгал **8/8** (хуучин кодоор **7/8 УНАСАН**), `postgres`-ээр 8/8 (одоогийн горим өөрчлөгдөөгүй) · mutation (`inTenantTx`-ээс set_config хасах) → unit 5 + harness 7 унасан
    - 4.8.4-т шилжих (системийн холболт): `TenantCacheService.getTenantId` (tenants), `AuthService.login`, `SuperAdminGuard`, `TenantOnboardingService`, `OutboxPollerService` + `DlqService`, `EscalationScheduler` (бүх tenant-ийг скан)
    - [x] Таны компьютер (15:38): `test` → `test:integration` ✅
  - [x] **4.8.4 Хоёр холболт ✅** — `db/system-prisma.service.ts` (`SystemPrismaService`, `SYSTEM_DATABASE_URL` → алга бол `DATABASE_URL`): `TenantCacheService`, `AuthService.login`, `SuperAdminGuard`, `TenantOnboardingService`, `OutboxPollerService`, `DlqService`, `EscalationScheduler`; `dev:test-user` мөн. `EnvConfig` URL шалгалт; эхлэхэд DB role BYPASSRLS эсэхийг лог (warn); `.env.example`, VPC env/compose
    - Шалгалт: unit **466/466** · tsc ✅ · lint 0 алдаа · PG16 harness (DATABASE_URL=`app_user`, SYSTEM=`postgres`): системийн 6/6 (tenant lookup, membership, outbox 2 tenant, DLQ, escalation; app_user-ээр бол tenant олдохгүй / скан 0 — system хэрэгтэйг батлав) + MR урсгал 8/8
    - Зан төлөв өөрчлөгдөхгүй: `SYSTEM_DATABASE_URL` тохируулаагүй → хоёр холболт хоёулаа `DATABASE_URL` (`postgres`)
    - Олдвор (Phase 5): `OutboxPollerService` `FOR UPDATE SKIP LOCKED`-ийг transaction-гүй ажиллуулдаг → түгжээ тэр дороо суларч, олон worker-т нэг event давхар publish болох эрсдэлтэй [EVT-001 — засаагүй]
    - [x] Таны компьютер (16:28): unit 466/466 · integration 127 ✅
  - [x] **4.8.5 Тест ✅ (код)** — `test/helpers/db-urls.ts` (`ADMIN_DB_URL` = SYSTEM → DATABASE): 10 integration файлын бэлтгэл/цэвэрлэгээ RLS-ийг алгасна; `auth.integration` шалгалт/цэвэрлэгээ системийн холболтоор (өмнө нь буруу GUC `app.current_tenant_id`); шинэ `tenant-isolation-http.integration.spec.ts` (2 tenant, MR + workflow definition HTTP, **бодит** tenant lookup — patch-гүй)
    - 🔴 Олдсон+зассан [SEC-002]: `PUT /workflow/definitions/:id` нь `where: { id }` — **өөр tenant-ийн definition-ийг засах боломжтой байв** (одоогийн `postgres` горимд 200). Одоо tenant шүүлттэй → 404
    - Шалгалт: unit **468/468** · tsc ✅ · lint 0 алдаа · **бүтэн integration (12 файл / 133) PG16 + fake Supabase Auth + бодит Prisma дээр**: `app_user` горим **133/133**, `postgres` горим 133/133 · хуучин workflow-definition кодоор шинэ тест унасан (postgres: 200, app_user: 500)
    - [x] Таны компьютер (17:33): (1) тест ✅ → (2) **.env шилжилт ✅** (`DATABASE_URL`=app_user, `SYSTEM_DATABASE_URL`=postgres) → integration + `pnpm dev` ✅ — **RLS runtime-д идэвхтэй**

### Phase 4.9 — Аюулгүй байдлын үлдэгдэл ✅ (код, батлагдсан 2026-10-10 17:35)
- [x] 4.9.1 [SEC-003] Workflow definition: үүсгэх/засах = OWNER/ADMIN (`requireRole`), body = class DTO (`workflow-definition.dto.ts`: stepsConfig-ийн 2 хэлбэр, role ∈ UserRole, order/quorum/min/max, ≤20 алхам/дүрэм, илүү талбар → 400)
- [x] 4.9.2 IDOR sweep: (а) статик — `where: { id }` бичилт бүрийг шалгасан (Camp/Budget/Vendor/Route/Delegation нь tenant-аар урьдчилан шалгадаг); `WorkflowService` instance + `mr_headers` sync + `PessimisticLockService` түгжээнд `tenant_id` нэмэв. (б) **автомат probe** `test/route-probe.integration.spec.ts` — Nest metadata-аас path параметртэй БҮХ route (≥40), санамсаргүй UUID / `not-a-uuid` → 2xx/5xx байх ёсгүй
- [x] 4.9.3 Probe илрүүлсэн 8 × 500 → засав [API-001]: MR 6 route + delegation + routes `ParseUUIDPipe`; Camp загвар файлын `@Header` (xlsx Content-Type) нь 400-ийн JSON-ийг 500 болгож байв [HTTP-001]
- [x] 4.9.4 Load test (cloud, PG16 + wasm Prisma + Redis, 1 worker, 10k MR, 100 conn × 15с) — харьцуулалт: `app_user` p99 **106ms** / 2021 req/s, cursor avg 21ms · `postgres` p99 107ms / 2206 req/s, cursor avg 16ms → DoD бүгд ✅; DB зам +~5ms (BEGIN + set_config + COMMIT)
  - Шалгалт: unit **489/489** · tsc ✅ · lint 0 алдаа · integration **13 файл / 138** (`app_user` ба `postgres` хоёр горимд)
  - [x] Таны компьютер (17:48): `test` → `test:integration` ✅

### Phase 5 — Sprint 10: Event Bus ✅ (код, батлагдсан 2026-10-10 17:50)
- [x] 5.0 [EVT-001] `OutboxPollerService.processNext()`: event БҮР нэг transaction-д `FOR UPDATE SKIP LOCKED LIMIT 1` → publish → `PUBLISHED`/retry/`DLQ` (DLQ мөр ижил transaction-д). `OUTBOX_POLLER_CRON=off` (integration тест)
  - PG16 race (4 poller, 40 event, 50мс зайтай): **хуучин 80–119 publish (бүгд давхар) → шинэ яг 40**
- [x] 5.1 [EVT-002/003] `CloudEventsAdapter.fromOutbox` — хадгалсан `cloud_event_id`/type/source/time (retry-д id ижил); MR submit/approve/reject → `EventBusService.emit` (`event_type` хуучин нэр, `cloud_event_type` = EventTypes.*)
- [x] 5.2 `test/event-bus.integration.spec.ts` — гинж: MR → submit (COMMITTED, workflow, SLA) → approve (SPENT) / reject (RELEASED) → poller → Redis `tenant.{id}.{type}` (хадгалсан id); PUBLISHED дахин илгээгдэхгүй
- [x] 5.3 Retry (retry 1, backoff ~30с, PENDING) → 3 дахь алдаа → `DLQ` + `dlq_events`; 4 зэрэгцээ poller → event бүр 1 удаа
- [x] 5.4 Шалгалт: unit **498/498** · tsc ✅ · lint 0 алдаа · integration **14 файл / 143** (`app_user` ба `postgres`)
  - [x] Таны компьютер: unit **498/498** · integration **14 файл / 143** ✅

### Phase 6 — Sprint 11: v0.1.5 Release (батлагдсан 2026-10-10 18:29; + 4.6 frontend нэмэгдсэн)
PROC-005 (18:29): төхөөрөмж ↔ v6 манифест 424/424 тохирсон (зөвхөн таны `rls_audit.txt` илүү → 6.3)

**6.0 (= 4.6) Хөнгөн frontend — Inventory / Vendor / Report** ✅ (батлагдсан 18:33, код дууссан). Шинэ dependency-гүй; Tailwind + react-query + axios (одоогийн загвар)
- [x] 6.0.1 `lib/roles.ts` (цэвэр, FE-005) + `api/me.ts` + `hooks/useMe.ts`: `GET /auth/me` → role; `canWrite` = OWNER/ADMIN (backend `WRITE_ROLES`-тэй ижил) → бусдад засах товч харагдахгүй, backend 403 нь хамгаалалт хэвээр
- [x] 6.0.2 `modules/inventory/`: `api.ts` (list cursor/lowStock, create, adjust), `lib/quantity.ts` (BigInt ×1000, float-гүй) (тоо шалгах, үлдэгдэл сөрөг болох эсэх), `InventoryPage.tsx` — хүснэгт (SKU, нэр, үлдэгдэл, доод хэмжээ, ⚠️ бага), "Зөвхөн бага үлдэгдэл" шүүлт, "Цааш ачаалах", шинэ бараа форм, +/− тохируулга
- [x] 6.0.3 `modules/vendor/`: `api.ts`, `VendorsPage.tsx` — жагсаалт (идэвхтэй шүүлт), үүсгэх, нэр/РД засах, идэвхжүүлэх/идэвхгүй болгох
- [x] 6.0.4 `modules/report/`: `api.ts`, `lib/report.ts` (мөнгө формат, статусын монгол нэр), `ReportPage.tsx` — MR статусаар, төсвийн ашиглалт (%), бараа/нийлүүлэгчийн тоо, CSV татах (axios blob → token-той)
- [x] 6.0.5 `App.tsx` route (`/inventory`, `/vendors`, `/reports`) + `Layout` цэс
- [x] 6.0.6 Шалгалт: web-shell vitest **37/37** (+10) · tsc ✅ · lint 0 алдаа · `vite build` ✅ · cloud Playwright UI (app_user/RLS backend + vite): бараа/тохируулга/давхар SKU, нийлүүлэгч, тайлан + CSV, REQUESTER эрх, cursor 20→25, төсвийн ашиглалт — бүгд ✅ (төслийн e2e spec → 6.1.4)
  - [x] Таны компьютер (18:43): тест ✅

**6.0b [SEC-004] 🔴 MR батлалт workflow-г тойрдог** (6.1.3 бэлтгэх үед илэрсэн, батлуулахаар хүлээж буй)
- Cloud-д баталгаажсан: REQUESTER өөрийн 5,000,000₮ MR-г (amount_rules → 2 алхам) `POST /requisitions/:id/approve`-ээр нэг дор APPROVED болгосон; `workflow_instances` PENDING/current_step 0, `workflow_sla_logs` PENDING хэвээр → SLA хугацаа өнгөрөхөд батлагдсан MR-г escalate хийнэ
- Шалтгаан: `WorkflowService.approveStep/rejectStep` ямар ч controller-т холбогдоогүй; MR approve/reject-д role, өөрийгөө батлах, алхмын шалгалт алга
- [x] Засвар (батлагдсан 18:47; шийдвэр А = алхмын role эсвэл OWNER/ADMIN, Б = delegation → backlog)
  - [x] 1–3 `mr-approval.ts` + MR service approve/reject: `FOR UPDATE` түгжээ, role/өөрийгөө батлах шалгалт, quorum, олон алхам, SLA COMPLETED/дараагийн алхмын SLA, reject → REJECTED/RELEASED, хуучин MR → LEGACY 1 алхам
  - [x] 4 API нийцтэй: зам хэвээр, хариунд `workflow` (GET/approve/reject); давтан батлалт → 200
  - [x] 5 MRDetailPage: "Алхам 1/2", алхмын төлөв, товч зөвхөн эрхтэй хүнд, backend-ийн алдааны мессеж
  - [x] 6–7 Шалгалт: core unit **506/506** (+8) · web-shell **45/45** (+8) · tsc ✅ · lint 0 алдаа · integration **15 файл / 154** (`app_user`, `postgres`) — шинэ `mr-workflow-approval` 11 тест (хуучин код дээр 11/11 унасан) · cloud UI (2 алхам, 3 хэрэглэгч) ✅
  - [x] 8 `lessons_learned.md` SEC-004
  - [x] Таны компьютер (20:05): unit 506/506 · web-shell 45/45 ✅; e2e 26 ✅ / 3 ❌ (яг хүлээгдсэн: admin@test.mn өөрийн MR-г батлах → товч алга) / 2 skip
  - [ ] Таны компьютер: `test:integration` (15 файл / 154)
  - ⚠️ Одоогийн `apps/e2e` requisition-flow / workflow-multistep нь admin@test.mn өөрийн MR-г батладаг → 6.1-д 2 хэрэглэгчтэй болгож засна
Одоогийн байдал (v6 snapshot): `apps/e2e` — Playwright, 7 spec (auth, requisition-flow, workflow-multistep, multi-tenant, camp×3); `multi-tenant.spec.ts` нь `MULTI_TENANT_E2E` + гараар өгсөн `TENANT_B_TOKEN`-оос хамаарч ихэвчлэн skip болдог; Inventory/Vendor/Report-д e2e алга.
- [x] 6.1 E2E (Playwright) — батлагдсан 20:08, код дууссан
  - [x] 6.1.0 Script: `pnpm test` нь e2e-г (Playwright, сервер асаадаг) ажиллуулдаг байсан (e2e-ийн `test` script) → e2e: `test` → `test:e2e`; turbo.json-д `test:e2e` (cache: false) — root `pnpm test:e2e` одоо task байхгүй тул эвдэрхий. Үр дүн: `pnpm test` = unit л, `pnpm test:e2e` = Playwright
  - [x] 6.1.1 Fixture: core-kernel `src/scripts/e2e-fixture.ts` (+ cli, unit тест; шинэ dependency-гүй — core-kernel-ийн Prisma + supabase-js), зөвхөн local:
    - `setup` → 2 tenant (`e2e-a-<ts>`, `e2e-b-<ts>`) + хэрэглэгчид (A: REQUESTER, APPROVER×2, ADMIN; B: ADMIN) + DEV tenant (`test-tenant`)-д UI хэрэглэгчид (REQUESTER, APPROVER×2, ADMIN) → `apps/e2e/.fixture.json` (token, нууц үг, id; .gitignore)
    - `teardown` → tenant-ууд (cascade), DEV tenant-ийн e2e хэрэглэгчид, Auth хэрэглэгчид
    - e2e `global-setup.ts` / `global-teardown.ts` нь `pnpm --filter @s-project/core-kernel e2e:fixture` дуудна
  - [x] 6.1.2 `multi-tenant.spec.ts` дахин бичих (API, skip-гүй): A-ийн MR/definition B-д 404, жагсаалтад алга, B→A Host 403
  - [x] 6.1.3 `advanced-workflow.spec.ts` (API): тусдаа wf tenant-д ADMIN definition үүсгэнэ (amount_rules 2 алхам) + төсөв → өөрийгөө батлах 403, алхам 1/2 → 2/2 → APPROVED, төсөв SPENT; татгалзах → RELEASED
  - [x] 6.1.4 `modules-lite.spec.ts`: API (A/B тусгаарлалт, REQUESTER 403) + UI (DEV tenant: бараа/нийлүүлэгч/тайлан, REQUESTER-т товч алга)
  - [x] 6.1.5 Хуучин spec засах: `requisition-flow` / `workflow-multistep` → REQUESTER үүсгэж илгээнэ, APPROVER батлана/татгалзана (fixture хэрэглэгч, UI); 2 алхамт урсгал UI-д
  - [x] 6.1.6 `helpers/fixture.ts`: `fixture()`, `headersFor(user, asTenant?)`, `createSubmittedMr`, `loginAsUser(page, user)`; `auth.helper.ts`-ийн `loginAs` (admin@test.mn) camp/auth spec-д хэвээр
  - [x] 6.1.7 Cloud: **47/47** (0 skip; өмнө 26 ✅ / 3 ❌ / 2 skip) · teardown-ийн дараа e2e tenant/хэрэглэгч/MR/бараа 0 · core unit **510/510** (+4 fixture) · tsc/lint ✅
  - [x] Нэмэлт: `supabase/config.toml` `[auth.rate_limit] sign_in_sign_ups = 500` (нэг ажиллалтад ~50 нэвтрэлт, анхдагч 30/5мин)
  - [x] Таны компьютер (20:28): `pnpm test` unit л — 510 + 45, **6 сек** (өмнө 4м51с) · `pnpm test:e2e` **47/47** (1.2 мин), fixture үүсгэж/цэвэрлэв ✅
- [x] 6.2 Баримт (батлагдсан 20:29; 6.2.8 = A) — зөвхөн баримт/тохиргооны жишээ, код өөрчлөхгүй [DOC-001]
  - [x] 6.2.1 `docs/CHANGELOG.md`: хуучин "Нэмэгдэх зүйлс" (schema-per-tenant гэх мэт хэрэгжээгүй төлөвлөгөө) → бодит v0.1.5: Added / Changed (⚠️ MR батлалт workflow-оор [SEC-004], RLS runtime `app_user` + `SYSTEM_DATABASE_URL`, `pnpm test` ↔ `test:e2e`) / Security & Fixed (SEC-001~004, API-001, HTTP-001, CACHE-001, EVT-001~003, CURSOR-001) / Тест (тоо). Огноо 6.4-д
  - [x] 6.2.2 `docs/project-status.md`: одоогийн хувилбар, модулиуд, тестийн тоо, тест ажиллуулах заавар (unit / integration / e2e + fixture), мэдэгдэж буй backlog
  - [x] 6.2.3 `V.0.1.5/00_index.md`: Sprint 9–11 төлөв, хуучирсан "Техникийн суурь" мод (бодит зам, `@@schema()` мөр хасах); `sprint_11_release.md`: хийгдсэн/орлогдсон алхмыг тэмдэглэх (бодит e2e файл, dedicated-mode smoke → 6.4)
  - [x] 6.2.4 `ADR-001`: RLS runtime (апп `app_user` NOBYPASSRLS, системийн ажил `SYSTEM_DATABASE_URL`) хэсэг нэмэх
  - [x] 6.2.5 `03_Enterprise_VPC_Deployment.md`: `app_user` нууц үг солих SQL, `DATABASE_URL`=app_user / `SYSTEM_DATABASE_URL`=postgres, `supabase/dev/rls_audit.sql`-ээр шалгах, "DB role app_user — RLS идэвхтэй" лог
  - [x] 6.2.6 `02_Local_Supabase_Docker_Windows.md` + `README.md`: `pnpm test` / `test:integration` / `test:e2e` (fixture, auth rate limit, `pnpm supabase:*` [PROC-007]), хуучин "9 passed / 2 skipped" → 47; `.env.example` тайлбар шинэчлэх
  - [x] 6.2.7 `docs/INDEX.md`: шинэ баримтын холбоос (ADR, Module_Template, lessons §16–19)
  - [x] 6.2.8 A: local `.env` + `apps/core-kernel/.env` → `DATABASE_URL`=app_user, `SYSTEM_DATABASE_URL`=postgres (хуучин утга); `.env.example`, `docker/.env.vpc.example` анхдагч ижил
  - [x] Нэмэлт (11.5): root `docker-compose.yml`-д `SYSTEM_DATABASE_URL`, `CLUSTER_RESTART_*`; `.env.example`-д `CLUSTER_RESTART_*`, `PRISMA_LOG_LEVELS`
  - [x] Таны компьютер (20:38): `pnpm dev` → `DB role "app_user" — RLS идэвхтэй` ✅ · `pnpm test:e2e` **47/47** (app_user, 23с) ✅
  - [ ] `pnpm test:integration` → 153/154: `mr-approval` "Approver submit → 403"-ийн бэлтгэл (`createDraftMr`) **500** — `pnpm dev`-тэй зэрэг ажилласан; cloud-д app_user горимд бүтэн suite 3/3 удаа 154/154, mr-approval+mr-crud 6/6 → давтагдахгүй. Дахин ажиллуулж [ERROR]-ийг авна
- [ ] 6.3 Цэвэрлэгээ (устгахаас өмнө жагсаалтыг танд харуулна)
  - [ ] 6.3.1 root `db:push` script хасах / `db:migrate`-ийг Supabase migration руу чиглүүлэх [MIG-001]
  - [ ] 6.3.2 `_tmp_*`, `supabase/snippets/Untitled query 611.sql`, root `package-lock.json` (pnpm төсөл), root `rls_audit.txt`
  - [ ] 6.3.3 root `lessons_learned.md` → `docs/lessons_learned.md`-тэй нэгтгэх/устгах
  - [ ] 6.3.4 `$use` дурдсан тайлбар (`tenant-auth-guard`, `mr-crud` integration spec, `prisma-tenant-client.service.ts`)
- [ ] 6.4 Эцсийн шалгалт: tsc · lint · unit · integration (2 горим) · e2e → `package.json` хувилбар `0.1.5` → `v0.1.5` git tag (таны компьютер дээр, таны зөвшөөрлөөр)

### Backlog (товлоогүй — шийдвэр шаардлагатай)
- [x] ~~4.6 Frontend~~ → Phase 6.0 руу шилжсэн
- [ ] Frontend component тест, `mfe-requisitions` stub
- [ ] Integration Redis mock-ийг санах ойн (бичсэнээ уншдаг) болгох — cache алдааг тест барих [CACHE-001]
- [ ] Давхар RESTRICTIVE policy-нуудыг цэвэрлэх (PERMISSIVE-тэй ижил нөхцөл)
- [ ] Delegation-ийг MR батлалттай холбох (шийдвэр Б) — орлон гүйцэтгэгч алхмыг батлах
- [ ] `WorkflowService.approveStep/rejectStep` (controller-гүй, role шалгалтгүй) — устгах эсвэл MR батлалттай нэгтгэх
- [ ] Escalation: `escalationEnabled`-ийг шалгадаггүй; `currentStep = order - 1` (1-ээс эхэлсэн order гэж үздэг); escalate = алхам алгасах утга — бизнесийн шийдвэр
- [ ] MR үүсгэх UI-д нэгж үнэ талбар алга (бүх UI MR 0₮ → үргэлж 1 алхам)

## 4. Phase 2.2-ийн сонголтууд

| Хувилбар | Арга | Давуу | Сул |
|---|---|---|---|
| A | Enterprise tenant бүрт тусдаа PrismaClient (`?schema=tenant_x`), LRU pool | Prisma-тай зөв ажиллана, жинхэнэ тусгаарлалт | Connection тоо өснө, pool удирдлага хэрэгтэй |
| B | Schema-per-tenant-аас татгалзаж RLS үлдээх; Enterprise VPC = тусдаа DB/deploy | Хамгийн энгийн, одоогийн код хэвээр | Нэг instance доторх schema тусгаарлалт алга болно |
| C | Raw SQL / view-ээр search_path ашиглах | Нэг client | Prisma type safety алдагдана, их засвар |
