---
title: "Lessons — Frontend"
type: "Log"
status: "Active"
last_updated: 2026-10-13
tags: [lessons]
---

# Lessons — Frontend

> Индекс (ID → дүрэм): [[lessons_learned]]. Дэлгэрэнгүйг зөвхөн индексээс ID-гаа олсны дараа унш. Хэсгийн дугаар (§N) анхны нэгтгэсэн файлынхтай ижил.

## 7. Frontend алдаанууд

### [FE-001] mrList.map is not a function — Pagination Wrapper
**Тохиолдсон:** MVP 5 `GET /api/v1/requisitions`  
**Алдаа:** `TypeError: mrList.map is not a function`  
**Шалтгаан:** Backend `{ "data": [...], "total": 10, "page": 1, "limit": 20 }` → frontend `res.data` (wrapper object) → `.map()` алдаа  
**Шийдэл:**
```typescript
// ✅ Зөв
const res = await apiClient.get<PaginatedResponse<MrHeader>>(BASE)
return res.data.data   // wrapper-ийн доторх array
```
**→ RULE-17:** Backend response format-г шалгаж type зөв тодорхойлох

---

### [FE-002] CORS — Vite Proxy алгасагдсан
**Тохиолдсон:** MVP 5 dev орчин  
**Алдаа:** CORS error, `http://localhost:3000` руу шууд хандсан  
**Шалтгаан:** `VITE_API_BASE_URL=http://localhost:3000` → cross-origin → CORS  
**Шийдэл:** `VITE_API_BASE_URL=` (хоосон) → relative URL → Vite proxy → CORS алга  
**→ RULE-19:** Dev-д `VITE_API_BASE_URL` хоосон байх ёстой

---

### [FE-003] 400 Bad Request — DTO Field Name Mismatch
**Тохиолдсон:** MVP 5 MR create form  
**Алдаа:** `400 Bad Request`, backend class-validator validation fail  
**Шалтгаан:**

| Frontend (буруу) | Backend DTO (зөв) |
|---|---|
| `itemName` | `description` |
| `unit` | `unitOfMeasure` |

**Шийдэл:** `create-mr-item.dto.ts` файлыг шалгаж frontend type-г тэрхүү нэртэй нийцүүлэх  
**→ RULE-20:** Backend DTO field names-г ЭХЛЭЭД шалгах, дараа frontend type бич

---

## 19. Phase 6.0 — Хөнгөн frontend (2026-10-10)

### [PROC-006] Төхөөрөмж рүү хуулахад ижил staged нэр → ХУУЧИН агуулга бичигдсэн
**Тохиолдсон:** Төлөвлөгөөний файлыг `outputs/plan.md` нэрээр 2 дахь удаагаа хуулахад tool "written" гэж хариулсан ч төхөөрөмж дээрх hash хуучин хэвээр (өмнөх upload-ийн хуулбар ашиглагдсан). Hash шалгалтаар илэрсэн.
**Шийдэл:** Хуулах бүрт давтагдашгүй staged нэр (`plan_6_0.md`, bundle-д огноо/шат) ашиглана; хуулсны ДАРАА төхөөрөмж дээр hash заавал тулгана (PROC-005-ийн үргэлжлэл).

### [FE-005] Frontend-д role хэрэгтэй үед API импортлох файлаас цэвэр функц тестлэхгүй
**Тохиолдсон (урьдчилан сэргийлсэн):** `canWrite`-г `api/me.ts`-д байршуулбал vitest (node) → `api/client` → `lib/supabase` импорт → `VITE_SUPABASE_URL` байхгүй тул module ачаалахад throw.
**Дүрэм:** Цэвэр логик (`lib/roles.ts`, `modules/*/lib/*`) нь API/supabase импортгүй байна; хуудас/hook л API-г импортлоно. UI-д эрх нуух нь зөвхөн UX — хамгаалалт backend `requireRole` (403).

### [TEST-013] Cloud harness: Playwright 1.48 + суулгасан Chromium (шинэ) → "Old Headless mode has been removed"
**Тохиолдсон:** `executablePath: /opt/pw-browsers/chromium` → 1.48 нь `--headless=old` дамжуулдаг тул шинэ Chrome эхлэхгүй.
**Шийдэл (зөвхөн harness):** `chromium_headless_shell-*/…/headless_shell`-ийг `executablePath` болгоно. Таны компьютер дээр `pnpm exec playwright install chromium` (ENV-007) хэвээр.

### [SEC-004] 🔴 MR батлалт workflow-г тойрдог байсан — REQUESTER өөрийн 5 сая₮ MR-г нэг дор баталсан
**Тохиолдсон:** `POST /requisitions/:id/approve|reject` нь role, өөрийгөө батлах, workflow алхам/quorum-ийг шалгадаггүй; amount_rules-ийн олон алхам (`resolved_steps`) зөвхөн submit-д тооцоологдоод ашиглагддаггүй. `WorkflowService.approveStep/rejectStep` ямар ч controller-т холбогдоогүй (dead code). Үр дагавар: ямар ч гишүүн ямар ч дүнтэй MR-г батална; `workflow_instances` PENDING / `workflow_sla_logs` PENDING үлдэж, SLA хугацаа өнгөрөхөд батлагдсан MR-г escalate хийнэ; SLA тайлангийн COMPLETED хэзээ ч бичигддэггүй.
**Яаж илэрсэн:** 6.1.3 (advanced workflow E2E) бэлтгэхдээ "батлах зам workflow-ийг ашигладаг уу" гэж кодыг уншаад → cloud-д бодит хүсэлтээр баталгаажуулав. Өмнөх бүх тест 1 алхамт definition + APPROVER хэрэглэгчээр батладаг байсан тул илрээгүй.
**Шийдэл (Phase 6.0b):** `mr-approval.ts` (цэвэр логик) + MR service: MR мөрийг `FOR UPDATE` → идэвхтэй алхмын role эсвэл OWNER/ADMIN (шийдвэр А); MR үүсгэгч өөрөө батлахгүй; quorum (`workflow_step_logs`) → завсрын алхам: дараагийн алхам + SLA, сүүлийн алхам: APPROVED + төсөв SPENT + MR_APPROVED; reject: MR/workflow REJECTED + RELEASED; шийдэгдсэн алхмын SLA → COMPLETED. Instance-гүй хуучин MR → 1 алхам APPROVER. Хариунд `workflow` (алхам, батлалтууд); frontend товчийг эрхтэй хүнд л харуулна.
**Дүрэм:**
1. Төлөвийг өөрчилдөг endpoint бүрт "хэн, ямар нөхцөлд" гэдгийг тест заавал шалгана — зөвхөн "зөв хэрэглэгч амжилттай" биш, **буруу хэрэглэгч 403** (өөрөө, өөр role, VIEWER) кейс.
2. Тохиргоо (amount_rules г.м.) үүсгэдэг код байвал түүнийг **хэрэглэдэг** зам бий эсэхийг шалгана; холбогдоогүй service method = анхааруулга.
3. Шинэ тестийг хуучин кодон дээр ажиллуулж (before/after) унахыг нь баталгаажуулна — энэ удаа хуучин код дээр 11/11 унасан.

### [TEST-014] `pnpm test` нь E2E-г (Playwright, сервер асаадаг) хамт ажиллуулдаг байсан; e2e нь гараар бэлтгэсэн хэрэглэгч/token-оос хамаардаг байсан
**Тохиолдсон:** `apps/e2e`-ийн script нэр `test` → turbo `test` task бүх багцад ажиллахад Playwright мөн асч (4–5 мин), unit тест сервергүй ажиллахгүй болсон; root `test:e2e` нь turbo task-гүй тул эвдэрхий. `multi-tenant.spec` нь `MULTI_TENANT_E2E` + гараар `TENANT_B_TOKEN` шаардаж үргэлж skip; MR урсгал нэг admin хэрэглэгч өөрийн MR-г батладаг байсан (SEC-004-ийн дараа унасан).
**Шийдэл (Phase 6.1):** e2e script → `test:e2e` + turbo task (cache: false). Playwright globalSetup/Teardown → core-kernel `e2e:fixture` (tenant a/b/wf + DEV tenant-д REQUESTER/APPROVER/ADMIN, token; teardown нь tenant cascade + DEV tenant-ийн e2e MR, `prefix`-тэй бараа/нийлүүлэгч). Local Supabase `[auth.rate_limit] sign_in_sign_ups` 30 → 500 (нэг ажиллалтад ~50 нэвтрэлт).
**Дүрэм:** Багцын `test` script = зөвхөн сервергүй unit тест. E2E өгөгдлийг тест өөрөө үүсгэж/устгана (гараар бэлтгэл, skip-ээр нуух хориотой). Төлөв өөрчилдөг урсгалыг дор хаяж 2 хэрэглэгчээр (үүсгэгч ≠ батлагч) шалгана.

### [PROC-007] Танд өгөх зааварт глобал `supabase` команд бичсэн → PowerShell "not recognized"
**Тохиолдсон:** 6.1-ийн заавар `supabase stop` / `supabase start` гэж бичигдсэн; CLI нь root devDependency тул глобал PATH-д алга (ENV-00x).
**Шийдэл:** `pnpm supabase:stop` → `pnpm supabase:start` (root script).
**Дүрэм:** Танд өгөх команд бүрийг төслийн `package.json` script-ээс (эсвэл `pnpm <bin>`) авна — глобал суулгалт гэж үзэхгүй; заавар бичихээс өмнө [[02_Local_Supabase_Docker_Windows]]-ийн командтай тулгана.

### [DOC-001] Баримт кодоос хоцорсон: runbook `pnpm db:push` зөвлөдөг (MIG-001-тэй зөрчилдөнө), INDEX `v0.4.0`, CHANGELOG-д хэрэгжээгүй төлөвлөгөө
**Тохиолдсон (Phase 6.2 аудит):** [[02_Local_Supabase_Docker_Windows]] §1.6 + README "Migration ажиллуулах: `pnpm db:push`"; [[INDEX]] хуучин дугаарлалт (`v0.4.0`) ба байхгүй `docs/tasks/*`; CHANGELOG `[Unreleased]` = schema-per-tenant (цуцлагдсан); [[00_index]] Sprint 9–11 "хүлээгдэж байна"; `.env.example`/VPC жишээ `postgres` (RLS алгасна); `CLUSTER_RESTART_*`, `SYSTEM_DATABASE_URL` root compose-д алга.
**Шийдэл:** 6.2-оор бүгдийг бодит төлөвтэй тааруулав; `.env.example` анхдагч = `app_user` + `SYSTEM_DATABASE_URL`.
**Дүрэм:** Зан төлөв/команд/env өөрчилсөн phase бүрийн checklist-д "баримт: README, runbook, `.env.example`, CHANGELOG" мөр заавал байна; release-ийн өмнө `grep`-ээр хуучирсан команд (db:push г.м.) хайна.

### [TEST-015] ⚠️ Буруу дүгнэлт: давтагдсан integration алдааг "ачааллын flaky" гэж үзсэн → бодит нь [CONC-002]
**Тохиолдсон:** 20:35-д `mr-approval`-ийн `createDraftMr` → 500. `pnpm dev`-гүй дахин ажиллуулахад давсан, cloud-д давтагдаагүй тул "dev + integration зэрэг → flaky" гэж бүртгэв. 21:04-т ӨӨР тестэд ижил 500 дахин гарав → зэрэгцээ үүсгэлтийг тусгайлан туршихад (30 хүсэлт) 22 нь унасан.
**Дүрэм:** Нэг удаа давсан нь "flaky" гэсэн нотолгоо биш. Алдааны үйлдлийг (энд: MR үүсгэх) өөрөө тусгаарлаж зэрэгцээ/давтан ачаалалд шалгаж, шалтгааныг log/кодоор батлаагүй бол "flaky" гэж хаахгүй. `[ERROR] … Authorization header / Token хүчингүй / Tenant олдсонгүй / харьяалагдахгүй` = 401/403-ийг санаатай шалгадаг тестийн хэвийн лог.

### [CONC-002] 🔴 Нэг tenant-д зэрэгцээ MR үүсгэхэд 500 (дугаар давхцал), retry ажилладаггүй
**Тохиолдсон:** `generateMrNumber` = `findFirst(orderBy: mrNumber desc)` + 1 (READ COMMITTED) → зэрэгцээ transaction ижил дугаар → `uq (tenant_id, mr_number)` P2002. Retry нөхцөл `Array.isArray(meta.target) && target.includes('mr_number')` → Prisma-ийн зарим орчинд `target = null` → retry огт хийгдээгүй → 500. Cloud: 30 зэрэгцээ POST → 201×8, 500×22. Нэмэлт далд алдаа: текст эрэмбэ → 9999-ийн дараа `MR-2026-10000` < `MR-2026-9999` → дугаар давхцана. Integration-д `mr-approval` + `mr-crud` нэг test-tenant-д зэрэг үүсгэдэг тул үе үе унадаг байв (Phase 4.8.3-аас хойш).
**Шийдэл (6.4.7):** `pg_advisory_xact_lock(hashtext('mr-number:<tenant>:<он>'))` → `max(substring(mr_number FROM '^MR-YYYY-([0-9]+)$')::int) + 1` (Кемпийн ZAS дугаартай ижил). Retry нөхцөл: `P2002` ба (target алга эсвэл `mr_?number`). Тест: integration 30 зэрэгцээ → 30×201, дараалсан (хуучин код дээр УНАСАН); unit (lock эхэлж, тоон max).
**Дүрэм:** "max+1" дугаарлалт бүр advisory lock эсвэл sequence-тэй байна; Prisma алдааны `meta`-д (target, modelName) найдахгүй — `code`-оор шийднэ. Дугаар/давхардалтай код бүрт зэрэгцээ integration тест заавал.

### [CI-004] Script-ийн нэр солиход CI-г шинэчлээгүй; CI-ийн env local-аас хоцорсон
**Тохиолдсон (6.4 төлөвлөхөд илэрсэн):** 6.1-д e2e `test` → `test:e2e` болгосон боловч `.github/workflows/ci.yml` нь `pnpm --filter e2e test` хэвээр (→ "Missing script"). Мөн CI-д `SUPABASE_SERVICE_ROLE_KEY` огт байгаагүй (integration-ийн `auth.admin.createUser`, e2e fixture ажиллахгүй), `JWT_SECRET` 18 тэмдэгт (`EnvConfig` min 32 → апп эхлэхгүй), e2e job-д Prisma generate / admin@test.mn / кемпийн эрх / `VITE_SUPABASE_*` алга, unit нь зөвхөн core-kernel (`turbo test:unit`). Өөрөөр хэлбэл CI өмнөөс улаан байсан байх магадлалтай.
**Шийдэл (6.4.1):** workflow-level env (`app_user` + `SYSTEM_DATABASE_URL`, 32+ JWT), "Supabase env" алхам (`supabase status -o env` → `$GITHUB_ENV`, service key mask), `pnpm test`, e2e: `db:generate` + `dev:test-user` + `camp_e2e_grant.sql` (supabase_admin) + `pnpm test:e2e`.
**Дүрэм:** package.json script / env / шаардлагатай урьдчилсан алхам өөрчлөгдөх бүрт `grep -rn "<хуучин нэр>" .github docker apps/*/Dockerfile` хийнэ; шинэ env хувьсагч → `.env.example` + CI + compose гурвууланд нэг дор. CI-г push хийсний дараа ногоон эсэхийг шалгахгүйгээр release хийхгүй.

---
