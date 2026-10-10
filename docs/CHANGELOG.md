# CHANGELOG

Бүх мэдэгдэхүйц өөрчлөлтүүд энэ файлд бүртгэгдэнэ.

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Хувилбаржуулалт: [SemVer 2.0.0](https://semver.org/) — v0.x.x = pre-production, v1.0.0 = public release

---

## [Unreleased] — v0.1.5 (Tier 2: Enterprise VPC)

> Огноог `v0.1.5` tag тавихад (Phase 6.4) бичнэ. Дэлгэрэнгүй: `docs/08_Roadmap/V.0.1.5/01_analysis_and_plan_2026-10-08.md`,
> алдааны шалтгаан/шийдэл: `docs/lessons_learned.md` §11–19.

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
- **CACHE-001** MR төлөв/эзэмшигчийн шалгалт cache-ээс; **EVT-001~003** outbox давхар publish, retry бүрт шинэ id; **API-001/HTTP-001** UUID биш id → 500; **CURSOR-001** буруу cursor → 500; **PERF-003** auth шалгалт хүсэлт бүрт (p99 1974ms → 57ms); **RL-001** Redis алдаа → бүх хүсэлт унах.
- CI: `test:unit` script, `supabase db push` хасав, ESLint тохиргоо.

### Тест (2026-10-10)
- Unit: core-kernel **510**, web-shell **45**
- Integration: **15 файл / 154** — `app_user` (RLS) ба `postgres` хоёр горимд
- Playwright e2e: **47** (0 skip) — fixture тест бүрийн өгөгдлийг өөрөө үүсгэж/устгана
- Load (10k MR, 100 conn): p99 57ms / 3360 req/s (local), `app_user` горимд p99 106ms (cloud, 1 worker)

### Нэмэгдсэн — Кемп модуль V1 (2026-10-10) ✅
> Төлөвлөгөө/ERD v4: `docs/08_Roadmap/camp_module/01_plan_and_erd.md`. V1 = Шат 1–4 + Шат 8 (frontend) + Шат 9 (баримт).
> Дараагийн хувилбарт (`v0.1.5`) багтана — `VERSIONING.md`-ийн дагуу `v0.2.0` нь Air-Gapped-д зориулагдсан тул тусдаа дугаар нээгээгүй.

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
- `lessons_learned.md` §15: ENV-009/010, TEST-007/008/009, PRISMA-003, VALID-001, CONC-001, PROC-003/004, FE-004

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
| **v0.1.5** | v1.5 | Tier 2 Enterprise VPC | 🔜 ДАРААГИЙН |
| **v0.2.0** | v2.0 | Tier 3 Air-Gapped | 📋 ТӨЛӨВЛӨСӨН |
| **v0.3.0+** | — | Нэмэлт хөгжүүлэлт | 📋 ИРЭЭДҮЙ |
| **v1.0.0** | Production | Олон нийтэд гаргах | 🎯 ЗОРИЛГО |

---

[Unreleased]: https://github.com/your-org/s-project/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/your-org/s-project/releases/tag/v0.1.0
