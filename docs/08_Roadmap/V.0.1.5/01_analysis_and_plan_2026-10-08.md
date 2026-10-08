# Төслийн Шинжилгээ ба Хөгжүүлэлтийн Төлөвлөгөө — 2026-10-08

> Хувилбар: v0.1.0 ✅ → v0.1.5 (Tier 2 Enterprise VPC) 🔄
> Төлөв: **БАТЛАГДСАН 2026-10-08** · Phase 0–1 ✅ · Phase 2 (B хувилбараар шинэчилсэн) батлуулах хүлээгдэж байна
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

### Phase 2 — Sprint 6 дахин тодорхойлолт: Tenant Isolation (B) (1.5–2 session) — БАТЛУУЛАХ
- [ ] 2.1 ADR бичих: `docs/02_System_Architecture/ADR-001_Tenant_Isolation.md` (яагаад B, search_path + Prisma асуудал)
- [ ] 2.2 Sprint 6 кодыг хасах: `SchemaRouterService`, `TenantProvisioningService`, `TenantProvisioningController` (3 endpoint: `upgrade-enterprise`, `enterprise-schema`, `schema-health`), `schema-isolation.spec.ts`, module бүртгэл
- [ ] 2.3 Шинэ migration: `provision_tenant_schema`, `clone_tables_to_schema`, `deprovision_tenant_schema` функц + `idx_tenants_schema_name` + `tenants.schema_name` DROP; Prisma `Tenant.schemaName` хасах
- [ ] 2.4 Dedicated deploy mode: `DEPLOYMENT_MODE=shared|dedicated` + `DEDICATED_TENANT_SLUG` (env validation). Dedicated үед `TenantAuthGuard` зөвхөн тэр tenant-ийг зөвшөөрнө, бусад → 403
- [ ] 2.5 `docker/docker-compose.vpc.yml` + `.env.vpc.example` — нэг байгууллагад тусдаа Postgres + Redis + API + Shell
- [ ] 2.6 Тест: guard dedicated/shared mode unit тест; env validation тест; RLS leakage integration тест хэвээр давна
- [ ] 2.7 Runbook `docs/07_Tech_Stack_and_Environment/02_Enterprise_VPC_Deployment.md`; `sprint_6_*.md`, `sprint_11_release.md` (schema-isolation E2E → dedicated-mode E2E) шинэчлэх

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
