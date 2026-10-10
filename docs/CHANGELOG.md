# CHANGELOG

Бүх мэдэгдэхүйц өөрчлөлтүүд энэ файлд бүртгэгдэнэ.

Формат: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)  
Хувилбаржуулалт: [SemVer 2.0.0](https://semver.org/) — v0.x.x = pre-production, v1.0.0 = public release

---

## [Unreleased]

_(одоогоор алга)_

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

> Runbook: `docs/07_Tech_Stack_and_Environment/04_Pilot_Camp_Windows.md` · Төлөвлөгөө: `docs/08_Roadmap/V.0.1.5/01_analysis_and_plan_2026-10-08.md` (v0.1.6)
> Сургамж: `docs/lessons_learned.md` §20

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

> Дэлгэрэнгүй: `docs/08_Roadmap/V.0.1.5/01_analysis_and_plan_2026-10-08.md`,
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
| **v0.1.5** | v1.5 | Tier 2 Enterprise VPC | ✅ 2026-10-10 |
| **v0.2.0** | v2.0 | Tier 3 Air-Gapped | 📋 ТӨЛӨВЛӨСӨН |
| **v0.3.0+** | — | Нэмэлт хөгжүүлэлт | 📋 ИРЭЭДҮЙ |
| **v1.0.0** | Production | Олон нийтэд гаргах | 🎯 ЗОРИЛГО |

---

[Unreleased]: https://github.com/Moogii5596/s-projectDev2/compare/v0.1.5...HEAD
[v0.1.5]: https://github.com/Moogii5596/s-projectDev2/releases/tag/v0.1.5
[v0.1.0]: тэмдэглэгээ (git tag) тавигдаагүй — v0.1.0 нь `v0.1.5`-ийн өмнөх түүх
