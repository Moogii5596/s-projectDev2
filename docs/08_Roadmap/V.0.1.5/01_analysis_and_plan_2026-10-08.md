# Төслийн Шинжилгээ ба Хөгжүүлэлтийн Төлөвлөгөө — 2026-10-08

> Хувилбар: v0.1.0 ✅ → v0.1.5 (Tier 2 Enterprise VPC) 🔄
> Төлөв: **БАТЛАГДСАН 2026-10-08** · Phase 0–1 ✅ · Phase 2 ✅ · Phase 2.8 ✅ · Phase 2.9 ✅ (integration 47/47) · Phase 3 дараагийнх
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

### Phase 3 — Sprint 8 DoD үлдэгдэл (0.5 session)
- [ ] 3.1 Load test (100 concurrent, p99 < 500ms)
- [ ] 3.2 Cache hit rate, cursor pagination 10k хэмжилт
- [ ] 3.3 Cluster mode worker restart шалгах

### Phase 4 — Sprint 9: Нэмэлт модулиуд (5–6 session)
- [ ] 4.1 Budget (MR submit-д budget check)
- [ ] 4.2 Inventory (`workflow.instance.approved` → reserve)
- [ ] 4.3 Vendor (quote → accept)
- [ ] 4.4 Report + Excel export + Dashboard
- [ ] 4.5 Модуль бүрт RLS leakage тест

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
