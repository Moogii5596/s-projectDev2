---
title: "08_Roadmap: Хөгжүүлэлтийн Төлөвлөгөө"
type: "Roadmap"
status: "Active"
last_updated: 2026-10-11
tags: [roadmap]
---

# 08_Roadmap: Хөгжүүлэлтийн Төлөвлөгөө

**Хувилбар:** v3.0.0  
**Огноо:** 2026-09-21  
**Өмнөх хувилбар:** v2.1.0 → Автомат тест, CI/CD нэмэв. v3.0.0 → SemVer v0.x.x стандартад шилжүүлэв.  
**Хамрах хүрээ:** v0.1.0 (MVP+V1, ✅) → v0.1.5 (Enterprise VPC, ✅) → v0.1.6 (Кемп пилот, ✅ — v0.1 хаагдсан 2026-10-11) → **v0.2.0 (пилотын үр дүн + Кемп V2 + өр)** → v0.3.0 (Air-Gapped) → v1.0.0 (Production Launch)

> **2026-10-11 шийдвэр (11:43):** v0.2.x = Кемп (пилотын санал + V2 + олон хэл + ADR-003 хэрэглэгч/эрх), **v0.3 = байгууллагын дотоод Feed**; сурталчилгаа/төлбөр/худалдаа хассан; чат — дараа; Air-Gapped → v0.4+ (хэрэгтэй эсэх шийдэгдээгүй — доорх «v0.3.0 Air-Gapped» хэсэг түүхэн).
>
> **2026-10-11 шийдвэр (D1):** v0.2 = пилот + Кемп V2 + техникийн өр ([[01_plan_draft]]). Хуучин «v0.2.0 Air-Gapped» → **v0.3.0** (доорх хэсгийн дэд дугаар v0.3.0.x).

### SemVer Зураглал

| Хуучин нэр | SemVer | Тайлбар | Төлөв |
|---|---|---|---|
| MVP + v1.0 | **v0.1.0** | Tier 1 Production Ready (Core System) | ✅ ДУУССАН |
| v1.5 | **v0.1.5** | Tier 2 Enterprise VPC | ✅ 2026-10-10 |
| — | **v0.1.6** | Кемп пилот (Sino Hydro) | ✅ 2026-10-10 (`v0.1.6.1`) |
| — | **v0.2.0** | Пилотын үр дүн + Кемп V2 + техникийн өр | 📝 УРЬДЧИЛСАН |
| — | **v0.3.0** | Байгууллагын дотоод Feed (PRD-05, ADR-004) | 📝 УРЬДЧИЛСАН |
| — | **v0.4.0+** | Чат · Air-Gapped (хэрэгтэй эсэх шийдэгдээгүй) · нэмэлт | 📋 ИРЭЭДҮЙ |
| Public Release | **v1.0.0** | Олон нийтэд гаргах | 🎯 ЭЦСИЙН ЗОРИЛГО |

---

## Тойм

```
[v0.1.0] ──► [v0.1.5] ──► [v0.1.6] ──► [v0.2.0] ──► [v0.3.0] ──► [v1.0.0]
 MVP + V1     Tier 2       Кемп         Пилот +      Tier 3       Public
 ✅           Enterprise   пилот        Кемп V2 +    Air-Gapped   Release
              VPC ✅       ✅ 🔄        өр 📝        Offline      🎯 Зорилго
```

---

## 0. Claude + Чи: Хамтын Ажиллагааны Загвар

### Хэн юу хийх вэ?

| Ажил | Claude | Чи |
|---|---|---|
| Код бичих (NestJS, React, SQL) | ✅ Бүрэн | — |
| **Автомат тест бичих (Vitest unit, Supertest integration, E2E)** | ✅ Заавал бичнэ | — |
| CI/CD pipeline тохиргоо (GitHub Actions YAML) | ✅ Бүрэн | — |
| Dockerfile, docker-compose файл | ✅ Бүрэн | — |
| Файл үүсгэх, commit хийх | ✅ Бүрэн | — |
| Алдаа засах, refactor | ✅ Бүрэн | — |
| Шинэ feature design хийх | ✅ Бүрэн | Бизнесийн шийдвэр батлах |
| `supabase start`, `pnpm dev` ажиллуулах | — | ✅ Чи |
| **Тестүүдийг локал дээр ажиллуулж, үр дүн шалгах** | — | ✅ `pnpm test` гүйлгэх |
| "Энэ зөв байна / тест унасан" хэлэх | — | ✅ Чи |
| Бизнесийн дүрэм тодорхойлох | — | ✅ Чи |

> **Чиний үндсэн үүрэг:** Шинэ ажлын хуралдаан нээх → Claude код + тест бичнэ → чи `pnpm test` ажиллуулж үр дүн буцааж өгнө. Гараар UI дарах шаардлагыг хамгийн бага байлгана.

> **Яагаад автомат тест заавал бэ?** Claude бичсэн кодын зөвийг баталгаажуулахад чи гараар бүх route, edge case шалгаж амжихгүй. Тест нь Claude-н хяналтын механизм — тест давсан = зөв гэж итгэх үндэслэл бий.

---

### Нэг Session-н хурд

Нэг Claude хуралдаанд (session) бодитоор хийж чадах зүйл:

| Ажлын төрөл | Нэг session-д хийх боломжтой | Тест хамаарах |
|---|---|---|
| Prisma schema + migration | Бүрэн (1 session) | Migration тест + RLS leakage тест |
| NestJS module + CRUD endpoint | Бүрэн (1 session) | Vitest unit + Supertest integration |
| Guard + Interceptor + тест | Бүрэн (1 session) | Auth/AuthZ тест бүрэн |
| React хуудас + form + API холболт | Бүрэн (1 session) | Component тест (Testing Library) |
| Workflow Engine бүрэн | 2–3 session | State machine тест + idempotency тест |
| Module Federation тохиргоо | 1–2 session | Remote loading smoke тест |
| CI/CD pipeline (GitHub Actions) | 1 session | Pipeline өөрөө тест ажиллуулна |
| Event Bus integration тест | 1 session | Publisher → Subscriber end-to-end |

**Чиний зүгээс:** Нэг ажлын өдөрт 1–2 session нээж, Claude-н гаргасан кодыг туршиж үзэх.

---

### Юу удаашруулна?

Хэрэв бид хурдан явбал, гол саад нь код бичих биш, харин:

1. **Тест ажиллуулах хугацаа** (хамгийн бага болгосон) — Claude автомат тест бичнэ; чи зөвхөн `pnpm test` ажиллуулж, үр дүн (pass/fail log) буцааж өгнө. Гараар UI дарах шаардлага байхгүй.
2. **Тодорхойгүй бизнесийн дүрэм** — "батлах эрхтэй хүн хэн бэ?" гэх мэт асуулт гарвал Claude хүлээнэ
3. **Орчин тохиргооны бэрхшээл** — `supabase start` эсвэл Docker анхны удаа асахдаа гарз гаргана (1 удаа)
4. **Гэнэтийн bug** — Realtime, RLS, AsyncLocalStorage-н нюанс нь заримдаа нэмэлт session шаардана
5. **CI pipeline хүлээх** — GitHub Actions ажиллах хугацаа (~3–5 мин/PR); чи хүлээх шаардлагагүй, дараагийн session-д үр дүн шалгана

> **TDD стратеги:** Claude кодын өмнө эсвэл хамт тест бичнэ. Нэг feature = нэг тест файл. Тест бүр тусдаа describe блок → алдаатай тохиолдолд яг аль test case унасныг шууд мэдэгдэнэ. Чи `pnpm test -- --reporter=verbose` гүйлгэж унасан тестийн нэр хуулж өгнө → Claude засна.

---

---

## MVP — Хамгийн Бага Ажиллагаатай Систем ✅ ДУУССАН

> 🏷️ **SemVer:** MVP + v1.0 хоёулаа хамтдаа **v0.1.0** болно. Энэ хэсэг бүрэн дууссан.

**Зорилго:** Дотоод ашиглалтад гаргах боломжтой хамгийн бага боловч бүрэн ажиллагаатай систем.  
**Хугацаа:** ~~6–8 долоо хоног~~ → **10–14 өдөр** (Claude бүх код бичнэ)  
**Tier:** Tier 1 хэсэгчлэн (нэг tenant, local орчин)  
**Төлөв:** ✅ БҮРЭН ДУУССАН — v0.1.0-д нэгтгэгдсэн

### MVP.1 — Суурь Дэд Бүтэц + CI/CD + Docker (2–3 өдөр)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Turborepo + pnpm monorepo тохиргоо | `pnpm dev` нэг командаар бүгд асна |
| 2 | Supabase local тохиргоо (`supabase init`, `config.toml`) | PostgreSQL + Auth + Studio ажиллана |
| 3 | Core Kernel NestJS app үүсгэх | Port 3000-д хариулна |
| 4 | Prisma schema + tenant RLS extension | `prisma db push` migration ажиллана |
| 5 | Redis Docker container | `redis://localhost:6379` холбогдоно |
| 6 | `0001_initial_schema.sql` migration | `mr_headers`, `mr_items` хүснэгт үүснэ |
| 7 | `0002_rls_policies.sql` migration | ENABLE + FORCE ROW LEVEL SECURITY |
| 8 | `0003_force_rls_hardening.sql` migration | App user BYPASSRLS-гүй баталгаажна |
| 9 | **`Dockerfile` (core-kernel + web-shell)** | `docker build` амжилттай гүйнэ |
| 10 | **`docker-compose.yml` (Redis + App)** | `docker-compose up` нэг командаар орчин асна |
| 11 | **GitHub Actions CI pipeline** (`.github/workflows/ci.yml`) | PR бүрт `pnpm test + lint` автоматаар ажиллана |
| 12 | `.env.example` файл + validation | Орхигдсон env var → startup-д алдаа |

**Шалгуур:** `supabase start && pnpm dev` амжилттай ажиллана. RLS leakage test давна. `docker-compose up` нэг командаар production-хэлбэрийн орчин асна. GitHub-д push хийхэд CI pipeline ногоон болно.

---

### MVP.2 — Auth ба Tenant (1–2 өдөр)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `TenantAuthGuard implements CanActivate` | Supabase Auth JWT баталгаажуулна |
| 2 | `TenantContextInterceptor` | AsyncLocalStorage Prisma RLS-д дамжина |
| 3 | Redis tenant slug cache | Subdomain → tenant_id lookup |
| 4 | `tenants` хүснэгт + seed data | Туршилтын 1 tenant үүснэ |
| 5 | `core_users` хүснэгт + Supabase Auth sync | Хэрэглэгч бүртгэл ажиллана |
| 6 | Supabase Auth-аар нэвтрэх/бүртгүүлэх | Email + password flow |

**Шалгуур:** JWT-гүй хүсэлт → 401. Буруу tenant → 403. Зөв token → 200.

---

### MVP.3 — Material Requisition CRUD (2–3 өдөр)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `MaterialRequisitionModule` NestJS `@Module()` | Core Kernel-д import хийгдэнэ |
| 2 | `POST /api/v1/requisitions` — шинэ хуудас | DRAFT статустай MR үүснэ |
| 3 | `GET /api/v1/requisitions` — жагсаалт | Зөвхөн тухайн tenant-н өгөгдөл |
| 4 | `GET /api/v1/requisitions/:id` — дэлгэрэнгүй | MR + items |
| 5 | `PUT /api/v1/requisitions/:id` — засварлах | Зөвхөн DRAFT статуст |
| 6 | `DELETE /api/v1/requisitions/:id` — устгах | Зөвхөн DRAFT статуст |
| 7 | `mr_items` CRUD (nested) | Header-тай хамт items удирдана |
| 8 | **Vitest unit test** (Service, Guard, Interceptor) | 80%+ coverage — Claude бичнэ |
| 9 | **Supertest integration test** (API endpoint бүр) | Happy path + error case тест |
| 10 | **RLS leakage тест** (`rls-leakage.test.ts`) | Tenant A → Tenant B өгөгдөл 0 |

**Шалгуур:** `pnpm test` давна. Tenant A-н MR Tenant B-д харагдахгүй. RLS leakage test 100% давна.

---

### MVP.4 — Энгийн Батлах Урсгал (1–2 өдөр)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `POST /api/v1/requisitions/:id/submit` | DRAFT → PENDING_APPROVAL |
| 2 | `POST /api/v1/requisitions/:id/approve` | PENDING_APPROVAL → APPROVED |
| 3 | `POST /api/v1/requisitions/:id/reject` | PENDING_APPROVAL → REJECTED |
| 4 | Approval idempotency log | Давхар дарсан тохиолдолд нэг л action |
| 5 | Optimistic locking (`version` field) | Зэрэг өөрчлөлтийг зогсооно |
| 6 | `outbox_events` хүснэгт | DB + event нэг transaction |

> **MVP-д Workflow Engine байхгүй** — батлах logic нь MR сервис дотор шууд байна.  
> v1.0-д тусдаа Workflow Engine module болгон гаргана.

**Шалгуур:** Submit → Approve → дахин Approve хийхэд idempotent буцаана.

---

### MVP.5 — Хялбар Frontend (2–3 өдөр)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | React + Vite web-shell app | Supabase Auth-аар нэвтрэх |
| 2 | MR жагсаалт хуудас | `/requisitions` route |
| 3 | MR дэлгэрэнгүй + items хуудас | `/requisitions/:id` route |
| 4 | Шинэ MR үүсгэх форм | POST → DRAFT |
| 5 | Submit / Approve / Reject товч | Баталгаажуулалтын flow |
| 6 | Supabase Realtime subscription | Статус өөрчлөгдөхөд хуудас шинэчлэгдэнэ |

> **MVP-д Module Federation байхгүй** — нэг монолит React app.  
> v1.0-д тусдаа MFE remote болгон хуваана.

**v0.1.0 (MVP)-н Нийт Гаралт:**
- ✅ Нэг tenant дотор MR үүсгэх, засах, батлах, татгалзах
- ✅ Realtime статус шинэчлэл
- ✅ RLS tenant тусгаарлалт баталгаажсан
- ✅ SQL Injection хаагдсан
- ✅ Idempotent approval

---

## v0.1.0 — Tier 1 Production Ready ✅ ДУУССАН

> 🏷️ **SemVer:** Энэ бол **v0.1.0** — MVP + энэ бүх sprint-үүд нэгдсэн. Бүрэн дууссан.

**Зорилго:** Олон tenant-тай cloud орчинд найдвартай ажиллах.  
**Хугацаа:** ~~6–8 долоо хоног~~ → **2–3 долоо хоног** (MVP-н дараа)  
**Tier:** Tier 1 бүрэн (Shared Cloud, Multi-Tenant SaaS)  
**Төлөв:** ✅ БҮРЭН ДУУССАН

### v0.1.0.1 — Core Kernel: Dynamic Route Ingress

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `DynamicIngressRouterService` — route registry | `Map<basePath, RouteEntry>` |
| 2 | `manifest.json` schema validation | Буруу manifest → startup-д алдаа |
| 3 | `DrainingInterceptor` | Mutation-г DRAINING үед зогсооно |
| 4 | `ROUTE_UPDATED` event broadcast | EventEmitter2-аар worker-үүдэд |
| 5 | `installed_modules` хүснэгт | Tenant-д идэвхтэй модулиудын бүртгэл |
| 6 | Module health check endpoint | `/healthz` тогтмол шалгана |

---

### v0.1.0.2 — Workflow Engine Module

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `WorkflowEngineModule` NestJS `@Module()` | Core Kernel-д import |
| 2 | `workflow_definitions` хүснэгт + DDL | Батлах дүрэм хадгалагдана |
| 3 | `workflow_instances` хүснэгт + DDL | Нэг MR-н батлах явц |
| 4 | `workflow_approval_steps` хүснэгт + DDL | Алхам бүрийн бүртгэл |
| 5 | `workflow.instance.start` event handler | MR submit → workflow эхлэнэ |
| 6 | Multi-level approval (2+ шат) | Дарга → Захирал гэх мэт дараалал |
| 7 | `workflow.instance.approved/rejected` event | Workflow → MR статус шинэчлэнэ |
| 8 | `processApproval` сервис (FIX-03) | Pessimistic lock + idempotency |

---

### v0.1.0.3 — Event Bus (Outbox → Redis)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Outbox processor (cron/scheduler) | `outbox_events` PENDING → publish |
| 2 | Redis pub/sub publisher | CloudEvents v1.0 envelope |
| 3 | Exponential backoff retry | 15s → 60s → 300s |
| 4 | DLQ (Dead Letter Queue) handler | 3 retry дараа alert явуулна |
| 5 | `next_retry_at` тооцоолол | `retry_count`-д суурилна |

---

### v0.1.0.4 — Module Federation (Frontend)

| # | Ажил | Гаралт |
|---|---|---|
| 1 | `web-shell` — Module Federation Host | Dynamic remote loading |
| 2 | `material-requisition-ui` — MFE Remote | Тусдаа Vite build, тусдаа deploy |
| 3 | UI Slot бүртгэл | Core Shell-д `<Slot name="mr-list" />` |
| 4 | Runtime module lazy loading | Tenant-д идэвхтэй модулиуд л ачаална |
| 5 | Shared design system package | Button, Table, Form компонент |

---

### v0.1.0.5 — Tenant Onboarding ба Admin

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Tenant бүртгэх API | `POST /admin/tenants` |
| 2 | Module идэвхжүүлэх API | `POST /admin/tenants/:id/modules` |
| 3 | Хэрэглэгч урих (Supabase Auth) | Email invitation flow |
| 4 | Role-based permission | `REQUESTER`, `APPROVER`, `ADMIN` |
| 5 | Audit log хүснэгт | Бүх critical action бүртгэгдэнэ |

---

### v0.1.0.6 — Тест ба CI/CD

| # | Ажил | Гаралт |
|---|---|---|
| 1 | RLS leakage load test (100 concurrent) | leakage_count = 0 |
| 2 | Approval idempotency test | Давхар дарсан тохиолдол 0 |
| 3 | E2E test (Playwright) | Submit → Approve flow |
| 4 | GitHub Actions CI pipeline | PR бүрт test + lint |
| 5 | Docker Compose production config | `docker-compose.prod.yml` |
| 6 | Environment variable management | `.env.example` + validation |

**v0.1.0 (V1)-н Нийт Гаралт:**
- ✅ Олон tenant ажиллана
- ✅ Workflow Engine — multi-level approval
- ✅ Module Federation — тусдаа deploy
- ✅ Event bus (Outbox + Redis) найдвартай
- ✅ Tenant onboarding бүрэн автоматжсан
- ✅ CI/CD pipeline

---

## v0.1.5 — Tier 2: Enterprise VPC 🔜 ДАРААГИЙН

> 🏷️ **SemVer:** Энэ бол **v0.1.5** — Хуучин "v1.5". Одоогийн зорилтот хувилбар.

**Зорилго:** Том байгууллагуудад тусдаа isolated орчинд байршуулах.  
**Хугацаа:** ~~4–6 долоо хоног~~ → **2–3 долоо хоног** (v0.1.0-н дараа)  
**Tier:** Tier 2 (Dedicated Enterprise VPC — Schema-per-Tenant эсвэл DB-per-Tenant)  
**Төлөв:** 🔜 ДАРААГИЙН ХУВИЛБАР

### v0.1.5.1 — Тусдаа Schema / DB Isolaion

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Schema-per-tenant migration strategy | `CREATE SCHEMA tenant_<id>` |
| 2 | Prisma multi-schema support | `@@schema("tenant_abc123")` |
| 3 | Dynamic schema routing | Tenant → schema mapping |
| 4 | Tenant provisioning automation | Шинэ enterprise tenant → автоматаар schema үүснэ |

---

### v0.1.5.2 — Advanced Approval Workflow

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Мөнгөний хэмжээнд суурилсан approval route | 10M+ → Захирал шууд орно |
| 2 | Delegation (орлогч) | Ээлжийн амралтад байхад орлогч батлана |
| 3 | Approval deadline + escalation | 48 цаг дуусвал дараагийн шат |
| 4 | Workflow definition UI | Admin-аас дүрэм тохируулна |
| 5 | SLA tracking | Батлах хугацааны аналитик |

---

### v0.1.5.3 — Performance ба Хэмжээ

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Redis caching layer | Давтамжтай query-г cache-ээс |
| 2 | Database query optimization | `EXPLAIN ANALYZE` + index tuning |
| 3 | Pagination + cursor-based listing | Том жагсаалт хуудаслана |
| 4 | Rate limiting per tenant | Нэг tenant бусдад нөлөөлөхгүй |
| 5 | Horizontal scaling (NestJS cluster) | Load balancer + multiple pod |

---

### v0.1.5.4 — Нэмэлт Модулиуд

| # | Модуль | Тайлбар |
|---|---|---|
| 1 | **Inventory Module** | Агуулахын үлдэгдэл, MR-тэй холболт |
| 2 | **Budget Module** | Төсвийн шалгалт, MR amount validation |
| 3 | **Vendor Module** | Нийлүүлэгчийн бүртгэл, үнийн санал |
| 4 | **Report Module** | Аналитик dashboard, export (Excel/PDF) |

---

### v0.1.5.5 — Event Bus Integration Testing (1 session)

> **Яагаад энэ шатанд?** v1.5-д олон модуль нэмэгдэж, EventEmitter2 (Phase 1) ба Redis pub/sub (Phase 2-рүү шилжиж болзошгүй) хоёулаа ашиглагдана. Модуль хоорондын event урсгал зөв ажиллаж байгааг end-to-end тестлэх шаардлагатай.

| # | Ажил | Гаралт |
|---|---|---|
| 1 | **Event publisher mock** | `EventEmitter2` / Redis-г test double-аар солих |
| 2 | **`workflow.instance.start` integration тест** | MR submit → WorkflowEngine event хүлээж авна |
| 3 | **`workflow.instance.approved` integration тест** | Workflow → MR статус `APPROVED` болно |
| 4 | **Cross-module event chain тест** | MR → Workflow → Inventory → Budget дараалал |
| 5 | **Event idempotency тест** | Давхар publish → нэг л handler ажиллана |
| 6 | **DLQ тест** | 3 retry дараа dead-letter queue-д орно |
| 7 | **EventEmitter2 → Redis шилжилтийн тест** | Transport солигдоход interface өөрчлөгдөхгүй |

**Шалгуур:** `pnpm test:integration` бүх event chain тест давна. CloudEvents envelope зөв бүтэцтэй. Идемпотент баталгаажна.

**v0.1.5-н Нийт Гаралт:**
- ✅ Enterprise байгууллагад тусдаа VPC-д байршина
- ✅ Мөнгөний хэмжээнд суурилсан approval workflow
- ✅ 1000+ хэрэглэгчийн ачаалал тэвчинэ
- ✅ Нэмэлт 4 модуль (Inventory, Budget, Vendor, Report)
- ✅ Event Bus integration тест бүрэн — cross-module chain баталгаажсан

---

## v0.2.0 — Пилотын үр дүн + Кемп V2 + техникийн өр 📝 УРЬДЧИЛСАН (2026-10-11)

> Төлөвлөгөө: [[01_plan_draft]] · Бүртгэл: [[00_backlog_and_tech_debt]] · Эхлэх нөхцөл: Кемп пилот дууссан ([[pilot-test-guide]] §7)

---

## v0.3.0 — Tier 3: Air-Gapped / Offline-First 📋 ТӨЛӨВЛӨСӨН (2026-10-11: v0.2.0-оос шилжсэн)

> 🏷️ **SemVer:** Энэ бол **v0.3.0** — Хуучин "v2.0" (2026-10-11 хүртэл v0.2.0). v0.2.0-ийн дараа хөгжүүлнэ.

**Зорилго:** Интернэтгүй орчинд (уул уурхай, цэрэг, алслагдсан газар) бүрэн ажиллана.  
**Хугацаа:** ~~8–10 долоо хоног~~ → **3–4 долоо хоног** (v0.1.5-н дараа)  
**Tier:** Tier 3 (Air-Gapped, Edge Node, Cryptographic Sync)  
**Төлөв:** 📋 ТӨЛӨВЛӨСӨН

### v0.3.0.1 — Edge Node Суурь

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Offline-capable React PWA | Service Worker + IndexedDB |
| 2 | Local SQLite / PGlite edge storage | Интернэтгүй CRUD |
| 3 | Conflict-free data structure (CRDT-inspired) | Офлайн өөрчлөлт merge хийнэ |
| 4 | Edge node identity + Ed25519 key pair | `node_id`, нийтийн/хувийн түлхүүр |
| 5 | `PROVISIONALLY_APPROVED` статус | Офлайн байх үед батлах |

---

### v0.3.0.2 — Cryptographic Sync

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Ed25519 гарын үсгийн sync payload | `"signature": "3b2a7...c4f9=="` |
| 2 | `sync_idempotency_ledger` DDL + handler | Давталт хамгаалалт |
| 3 | `sync_conflicts` DDL + handler | Зөрчилтэй өгөгдөл бүртгэнэ |
| 4 | Server-side signature verification | Нийтийн түлхүүрээр шалгана |
| 5 | Sync API endpoint | `POST /api/v1/sync/batch` |
| 6 | Sync result буцаах | `ACCEPTED` / `CONFLICT` / `REJECTED` |

---

### v0.3.0.3 — 3-Way Diff Conflict Resolution

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Base snapshot хадгалах | Edge node офлайн болохоосоо өмнөх утга |
| 2 | `field_diffs` тооцоолол | `{"field": {"base": v0, "local": v1, "server": v2}}` |
| 3 | Risk level тодорхойлох | LOW → MEDIUM → HIGH → CRITICAL |
| 4 | Auto-resolve (Last-Write-Wins) | LOW/MEDIUM зөрчлийг автоматаар |
| 5 | Manual resolve UI | HIGH/CRITICAL-г хүн шийднэ |
| 6 | 4-Eyes Principle | CRITICAL: 2 өөр reviewer баталгаажуулна |

---

### v0.3.0.4 — PROVISIONALLY_APPROVED → APPROVED Sync

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Офлайн батлал → `PROVISIONALLY_APPROVED` | Edge node-д хадгалагдана |
| 2 | Интернэт сэргэхэд sync | Server-т явуулна |
| 3 | Server дээр Workflow Engine дуусгана | Final `APPROVED` / `REJECTED` |
| 4 | Буцаах мэдэгдэл edge-рүү | Sync response дотор |
| 5 | UI дээр статус шинэчлэл | Offline → Online шилжилт харагдана |

---

### v0.3.0.4b — Offline Network Simulation Орчин (1 session)

> **Яагаад энэ шаардлагатай?** Tier 3 Air-Gapped функцийг бодит интернэтгүй орчинд туршихгүйгээр баталгаажуулах боломжгүй. Simulation орчин нь Claude-н бичсэн offline логикийг автоматаар шалгана.

| # | Ажил | Гаралт |
|---|---|---|
| 1 | **Docker network isolation** | `docker network create --internal offline-net` — гадагш интернэт таслагдана |
| 2 | **Edge node container** | Supabase-гүй, зөвхөн local SQLite/PGlite-тай тусдаа container |
| 3 | **Offline CRUD тест** | Интернэтгүй үед MR үүсгэх, засах, батлах (`PROVISIONALLY_APPROVED`) |
| 4 | **Network reconnect simulation** | `docker network connect` → sync trigger автоматаар гарна |
| 5 | **Sync correctness тест** | Офлайн үеийн өгөгдөл server-т зөв нийлнэ |
| 6 | **Conflict injection тест** | Офлайн + online хоёулаа нэг record засварлана → 3-Way Diff ажиллана |
| 7 | **Ed25519 signature тест** | Гарын үсэггүй sync payload → server татгалзана |
| 8 | **`pnpm test:offline` script** | CI/CD-д нэгтгэсэн, нэг командаар бүх offline тест |

```bash
# Offline simulation ажиллуулах
docker network create --internal s-project-offline
docker-compose -f docker-compose.offline.yml up -d
pnpm test:offline
docker-compose -f docker-compose.offline.yml down
docker network rm s-project-offline
```

**Шалгуур:** Интернэтгүй үед бүх CRUD + approval ажиллана. Sync дараа өгөгдөл 100% зөв. Гарын үсэгтэй payload л хүлээгдэнэ.

---

### v0.3.0.5 — Platform Completion

| # | Ажил | Гаралт |
|---|---|---|
| 1 | Multi-tier dashboard (T1/T2/T3 нэгдсэн) | Tier бүрийн статус нэг дэлгэцэнд |
| 2 | Plugin marketplace | Гуравдагч талын модуль суулгах |
| 3 | API public SDK | Гадаад систем (ERP, SAP) интеграц |
| 4 | Advanced analytics | BI tool холболт, export |
| 5 | SLA & uptime monitoring | 99.9% availability баталгаа |
| 6 | SOC 2 / ISO 27001 бэлтгэл | Аудитын бичиг баримт |

**v0.3.0-н Нийт Гаралт:**
- ✅ Интернэтгүй орчинд бүрэн ажиллана
- ✅ Ed25519 гарын үсгийн баталгаатай sync
- ✅ 3-Way Diff + 4-Eyes зөрчил шийдэл
- ✅ Docker network isolation-д offline simulation тест — автоматжсан
- ✅ Platform-as-a-Service — гуравдагч модуль суулгах боломж
- ✅ Enterprise аюулгүй байдлын стандарт

---

## Нийт Хуанли

### Хуучин тооцоо (хүмүүсийн хурд)
```
Нийт: ~26–42 долоо хоног (~6–10 сар)
v0.1.0: 14–18 долоо хоног (MVP+V1 нэгдсэн)
v0.1.5: 4–6 долоо хоног
v0.3.0 (Air-Gapped, хуучин v0.2.0): 8–10 долоо хоног
```

### Шинэ тооцоо (Claude + Чи)
```
Нийт: ~10–13 долоо хоног (~2.5–3 сар) 🚀
v0.1.0: ✅ ДУУССАН (MVP + V1 нэгдсэн)
v0.1.5: 3 долоо хоног
v0.3.0 (Air-Gapped, хуучин v0.2.0): 4 долоо хоног
v1.0.0: 🎯 Production Release
```

```
Өдөр       1  2  3  4  5  6  7  8  9  10 11 12 13 14
           ├─────────────────────────────────────────┤
MVP        │Суурь│Auth│CRUD │Approve│Frontend│тест  │
           └─────────────────────────────────────────┘

Долоо хоног   3  4  5  6  7
              ├─────────────────────────┤
v1.0          │WF│EventBus│MFE│CI/CD  │
              └─────────────────────────┘

Долоо хоног       8  9  10
                  ├─────────────┤
v1.5              │VPC│Modules │
                  └─────────────┘

Долоо хоног            11 12 13
                        ├───────────┤
v2.0                    │Edge│Sync │
                        └───────────┘
```

### Яагаад ингэж хурдан вэ?

| Хүчин зүйл | Нөлөө |
|---|---|
| Claude boilerplate, CRUD, тест нэгэн зэрэг бичнэ | 10x хурдтай |
| Copy-paste алдаа байхгүй — file шууд хадгалагдана | Debug цаг багасна |
| Архитектурын шийдвэр аль хэдийн гарсан | Дахин яриагүй эхэлнэ |
| Баримт бичиг бэлэн — spec → код шууд хөрвүүлнэ | Ойлголцлын алдаа 0 |
| **Claude тест бичнэ → чи гараар шалгахгүй** | Чиний тест ачааллыг 80% бууруулна |
| **CI/CD MVP-ээс л байна** — нийт тест автоматаар | Regression bug-г тэр дороо илрүүлнэ |

### TDD / AI-Generated Test Стратеги

```
┌─────────────────────────────────────────────────────────┐
│  Нэг feature-н дараалал (Claude + Чи)                  │
│                                                         │
│  1. Claude: spec → тест файл бичнэ (Vitest/Supertest)  │
│  2. Claude: тест-д нийцсэн код бичнэ                   │
│  3. Чи:     `pnpm test` ажиллуулна (~2 мин)            │
│  4. Чи:     pass/fail log буцааж өгнө                   │
│  5. Claude: унасан тест засна (хэрэв байвал)            │
│  6. ✅ Done — дараагийн feature                         │
└─────────────────────────────────────────────────────────┘
```

**Тестийн давхарга:**

| Давхарга | Хэрэгсэл | Хэн ажиллуулах |
|---|---|---|
| Unit тест | Vitest | `pnpm test` — чи |
| Integration тест (API) | Supertest + Supabase local | `pnpm test:integration` — чи |
| E2E тест | Playwright | `pnpm test:e2e` — чи |
| Event Bus тест | Vitest + Redis test container | `pnpm test:integration` — чи |
| Offline simulation тест | Docker network isolation | `pnpm test:offline` — чи |
| Security тест (RLS leakage) | Vitest + real DB | CI/CD — автомат |

> **Дүгнэлт:** Чи тест дарж шалгах шаардлагагүй. Claude тест бичнэ, CI/CD ажиллуулна, чи зөвхөн "ногоон болсон уу?" гэдгийг л шалгана.

---

## Эрсдэлийн Бүртгэл

| Эрсдэл | Магадлал | Нөлөө | Хянах арга |
|---|---|---|---|
| RLS leakage | Бага | 🔴 CRITICAL | Automated leakage test бүх PR-д |
| Workflow deadlock (pessimistic lock) | Дунд | 🟡 HIGH | `NOWAIT` + timeout + retry |
| Offline sync conflict эзлэх хувь өндөр | Дунд | 🟡 HIGH | 3-Way Diff + auto-resolve |
| MFE remote унах | Дунд | 🟠 MEDIUM | Fallback UI + health check |
| Ed25519 key compromise | Бага | 🔴 CRITICAL | Key rotation protocol |
| Database migration rollback | Дунд | 🟠 MEDIUM | Backward-compatible migration |

---

## Гаралтын Тодорхойлолт

| Хувилбар | Tenant | Модуль | Tier | Хэрэглэгч |
|---|---|---|---|---|
| **v0.1.0 (MVP+V1)** ✅ | 1 (test) | Material Requisition | Tier 1 хэсэгчлэн | Дотоод баг |
| **v0.1.0** ✅ | Олон | MR + Workflow Engine | Tier 1 бүрэн | SaaS харилцагчид |
| **v0.1.5** ✅ | Enterprise | + Inventory, Budget, Vendor, Report | Tier 1 + 2 | Том корпораци |
| **v0.1.6** ✅ | 1 (пилот) | Кемп V1 | dedicated | Sino Hydro |
| **v0.2.0** 📝 | Пилот + шинэ | + Кемп V2 | Tier 1 + 2 | Уул уурхайн кемп |
| **v0.3.0** 📋 | Бүх төрөл | Бүх модуль + Plugin Marketplace | T1 + T2 + T3 | Аж үйлдвэр, Цэрэг |
