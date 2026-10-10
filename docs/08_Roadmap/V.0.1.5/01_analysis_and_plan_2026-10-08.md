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
  - [ ] **4.8.3 Код** — MR, workflow, event-bus, auth: tenant query → `set_config` transaction; үр дүнгүй `$use` хасах
  - [ ] **4.8.4 Хоёр холболт** — `DATABASE_URL` (хүсэлт) / `SYSTEM_DATABASE_URL` (onboarding, outbox, scheduler, guard lookup); эхэндээ хоёулаа `postgres`
  - [ ] **4.8.5 Тест** — integration-ийг `app_user`-ээр, cross-tenant (MR, workflow) leakage

### Phase 5 — Sprint 10: Event Bus integration тест (2 session)
- [ ] 5.1 MR → Workflow → Inventory → Budget chain тест
- [ ] 5.2 Event idempotency + DLQ integration тест

### Phase 6 — Sprint 11: v0.1.5 Release (1 session)
- [ ] 6.1 E2E: schema-isolation, advanced-workflow, modules
- [ ] 6.2 CHANGELOG, project-status, `.env.example`, docker-compose
- [ ] 6.3 `v0.1.5` git tag

## 4. Phase 2.2-ийн сонголтууд

| Хувилбар | Арга | Давуу | Сул |
|---|---|---|---|
| A | Enterprise tenant бүрт тусдаа PrismaClient (`?schema=tenant_x`), LRU pool | Prisma-тай зөв ажиллана, жинхэнэ тусгаарлалт | Connection тоо өснө, pool удирдлага хэрэгтэй |
| B | Schema-per-tenant-аас татгалзаж RLS үлдээх; Enterprise VPC = тусдаа DB/deploy | Хамгийн энгийн, одоогийн код хэвээр | Нэг instance доторх schema тусгаарлалт алга болно |
| C | Raw SQL / view-ээр search_path ашиглах | Нэг client | Prisma type safety алдагдана, их засвар |
