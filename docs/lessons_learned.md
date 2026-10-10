# S Project — Lessons Learned (Нэгтгэсэн)

> **Энэ файл бол ҮНДСЭН нэгтгэсэн баримт.** MVP болон V1 Sprint явцад гарсан бүх алдаа, сургамж.
> Шинэ алдаа гарвал `## Ангилал > ### [TAG-NNN]` форматаар нэмнэ.
> `lessons_learned_MVP.md` — өмнөх нарийвчилсан файл (архив болгон хадгалагдсан).
> Шинэчлэгдсэн: 2026-09-21 | v0.4.0

---

## Хурдан лавлагаа (Quick Reference)

| Tag | Ангилал | Дүрэм |
|-----|---------|-------|
| ENUM-001/002 | Prisma Enum | `import { Enum } from '@prisma/client'` — string ХОРИГЛОНО → RULE-02 |
| DI-001 | afterAll chaining | `?.` optional chaining ЗААВАЛ → RULE-06 |
| DI-002/003 | overrideProvider | `providers[]` биш `.overrideProvider()` → RULE-01 |
| DI-008 | APP_GUARD double-import | `useExisting` pattern → RULE-07 |
| DI-009 | vitest esbuild | `unplugin-swc` ЗААВАЛ → RULE-08 |
| SQL-001 | $executeRawUnsafe | Tagged template `$executeRaw` → RULE-04 |
| CONFIG-001 | ConfigService | `process.env` fallback → RULE-03 adjacent |
| RLS-001 | SET LOCAL TX | Нэгдсэн `$transaction()` → RULE-04 |
| PATCH-001 | Prototype patch | Instance patch ашиглах → RULE-10 |
| PRISMA-001 | @db.Uuid | UUID талбар бүрт annotation → RULE-05 |
| PRISMA-002 | $use middleware | executeRaw guard нэмэх → RULE-14 |
| AUTH-001 | authId ≠ coreUserId | `resolveUserId()` → RULE-13 |
| DEP-001 | mapped-types | package.json шалгах |
| MODULE-001 | AuthModule import | Guard DI шаардлага |
| MIGRATE-001 | Enum ALTER TYPE | DROP дараалал → RULE-15 |
| MIGRATE-002 | Partial index | DROP index эхлээд → RULE-15 |
| RLS-002 | Superuser bypass | Dual PrismaClient → RULE-16 |
| SEED-001 | Seed ↔ enum зөрүү | Enum migration бүрт `seed.sql` шалгах, `supabase:reset`-ээр турших |
| ENV-001~005 | Шинэ машин (Windows) | PATH refresh, ExecutionPolicy, CLI devDependency, JWT key (`-o env`), 3 `.env` |
| RLS-003 | Empty UUID cast | null UUID ашиглах → RULE-16 |
| RESOLVE-001 | pnpm import type | `import type` → RULE-09 |
| VITEST-001 | Worker memory | pool: forks → RULE-18 |
| FE-001 | Pagination wrapper | `res.data.data` → RULE-17 |
| FE-002 | Vite CORS | `VITE_API_BASE_URL=''` → RULE-19 |
| FE-003 | DTO mismatch | Backend DTO шалгах → RULE-20 |
| CI-001 | turbo task script-гүй | `turbo --dry=json`-оор шалгах |
| CI-003 | ESLint config | Root `.eslintrc.cjs` |
| TEST-006 | JS default param + undefined | "байхгүй" = null |
| TEST-005 | Тест shell env-ээс хамааралтай | `test/setup/unit-env.ts` + бохир env-ээр шалгах |
| RLS-004 | RESTRICTIVE-only / app_user эрхгүй | PERMISSIVE TO app_user + FORCE + GRANT |
| MIG-001 | prisma db push | supabase migration up + db:generate |
| PERF-003 | Хүсэлт бүрт Supabase getUser | Redis cache ≤60с + single-flight + 503 ялгах |
| SEED-002 | reset → auth user алга | Studio Add user + auth_id UPDATE |
| PERF-001 | Load test 429 тоолоогүй | non2xx + алдааны зам бүрийг турших |
| PROC-002 | pkill/grep өөрийгөө олсон | PID файл, `[x]yz` bracket |
| TEST-003 | Integration Redis mock дутуу | `test/helpers/redis-mock.ts` + coverage тест |
| RL-001 | Rate limit Redis алдаа | fail-open + warn |
| SEC-001 | Guard membership | `isMember()` + "гишүүн биш tenant" тест заавал |
| TEST-002 | Vitest type-check хийхгүй | `tsc --noEmit` заавал |
| ARCH-001 | Mock тест integration нуусан | Бодит DB тест + wiring grep |
| PROC-001 | Скрипт давхар ажилласан | `if new in s: continue` |
| TEST-001 | env-д хамаарсан тест | `vi.stubEnv` + env-гүй ажиллуулж шалгах |
| ENV-009 | PowerShell pipe кирилл → `?` | `docker cp` + `psql -f` |
| TEST-007 | Supabase postgres superuser биш | RLS SQL тест → `supabase_admin` |
| ENV-010 | Хавтас зөөсний дараа workspace module алга | `pnpm install` (junction бүтэн замтай) |
| VALID-001 | `?x=false` → true (implicit conversion) | `@Transform(queryBool)` + тестийн pipe = main.ts |
| PRISMA-003 | Prisma алдааны текст `\"` escape-тэй | хэвийн болгох + SQLSTATE-ээр таних |
| CONC-001 | Snapshot бичих ↔ дэд мөр өөрчлөх race | эцэг мөрийг `FOR SHARE`; төлвийг эхэлж сольж дараа нь унш |
| PROC-003 | Тасарсан оролдлогын файл үлдэж холилдсон | эхлэхийн өмнө `git status`; "updated" хариу = дохио |
| TEST-008 | Playwright шошго дэд мөрөөр таарна | `exact: true`, `{' '}`, `scope="col"`; e2e-г dry-run |
| TEST-009 | Interception multipart файлгүй | upload-ийг бодит HTTP (proxy → echo)-ээр шалгах; axios FormData Content-Type |
| FE-004 | Шат 8 UI: lint/validation/mobile/Tailwind | react-hooks disable-гүй; `noValidate`; `min-w-0`/`grid-cols-1`; `inputSmCls`; `window.prompt` хориотой |
| PROC-004 | Python текст горим CRLF → LF болгосон | `open(p, newline='')`; засварын дараа `git diff --stat` мөрийн тоог шалгах |
| CURSOR-001 | Cursor-ийн id шалгаагүй → `::uuid` → 500 | `decodeCursor` UUID шалгаж 400 шиднэ (`common/utils/cursor`) |
| BUILD-001 | `start` = `dist/main`, build = `dist/src/main` | tsconfig `include` test-ийг агуулбал гаралт `dist/src/`; script-ийг build хийж ажиллуулж шалгах |
| CLUSTER-001 | Worker унахад саатуулгүй fork (crash loop) | `RestartPolicy` backoff 0→1с→…→30с; disconnect-ийг дахин асаахгүй |
| LOG-001 | Барьж авсан Prisma алдаа `prisma:error` лог | `PRISMA_LOG_LEVELS`; integration = `warn` |
| PROC-005 | Хуучин snapshot дээр ажиллах эрсдэл (хавтас зөөгдсөн, өөр session өөрчилсөн) | Ажил эхлэхийн өмнө төхөөрөмжөөс шинэ snapshot + hash-ийн manifest |
| RLS-005 | Policy буруу GUC нэр (`app.current_tenant_id`) уншсан | Бүх policy `app.tenant_id`; аудит §7-оор нөхцөлийг шалгах |
| RLS-006 | `current_tenant_id()` `''::uuid` → алдаа | `NULLIF(..., '')::uuid` — context-гүй = 0 мөр |
| RLS-007 | `set_config` transaction-ий гадна (`$use`, тусдаа statement) → үр дүнгүй | Tenant query бүр `inTenantTx` (`db/tenant-tx.ts`) |
| CACHE-001 | Төлөв шалгалт cache-ээс, өөрчлөлтийн дараа invalidate-гүй | Шалгалт transaction доторх шинэ мөрөөс; бичсэний дараа `invalidateTenant` |
| TEST-010 | Cloud-д Prisma engine татагдахгүй (403) | Harness: wasm engine + `@prisma/adapter-pg` (төсөлд орохгүй) |
| SEC-002 | `update({ where: { id } })` — өөр tenant-ийн мөрийг id-аар засах | `updateMany({ where: { id, tenantId } })` → count 0 → 404; HTTP 2-tenant тест |
| TEST-011 | Integration тест admin холболт = DATABASE_URL | `test/helpers/db-urls.ts` `ADMIN_DB_URL` (SYSTEM → DATABASE) |
| SEC-003 | Workflow definition эрхгүй + body шалгалтгүй | `requireRole(OWNER/ADMIN)` + class DTO (interface → шалгагдахгүй) |
| API-001 | `:id`-д `ParseUUIDPipe` алга → Prisma алдаа → 500 | Бүх UUID параметрт `ParseUUIDPipe`; route probe тест |
| HTTP-001 | `@Header(Content-Type)` + алдаа → Fastify 500 | Файлын header-ийг handler дотор амжилттай үед |
| EVT-001 | `FOR UPDATE SKIP LOCKED` transaction-гүй → түгжээ шууд суларна → давхар publish | Event бүр: lock → publish → UPDATE нэг transaction-д |
| EVT-002 | Retry бүрт CloudEvent id шинэ | Outbox-д хадгалсан `cloud_event_id`-аар publish (`fromOutbox`) |
| TEST-012 | `client.$queryRaw`-г monkeypatch → tx доторх query transaction-аас гарна | Instrument хийх бол tx-ийг биш, publisher/mock-ийг |

---

## 1. DI / NestJS Module алдаанууд

### [DI-001] afterAll optional chaining дутуу
**Тохиолдсон:** MVP 4 интеграци тестүүд  
**Алдаа:** `await prismaAdmin.$disconnect()` → `beforeAll` алдаатай бол `prismaAdmin=undefined` → secondary crash  
**Шийдэл:** `await prismaAdmin?.$disconnect()`  
**→ RULE-06:** `afterAll`/`afterEach`-д `app`, `prisma`, `supabase` БҮГД `?.` ашиглах

---

### [DI-002] providers[] дотор override — ConfigService зөрчил
**Тохиолдсон:** MVP 4 `tenant-auth-guard.integration.spec.ts`  
**Алдаа:** `Test.createTestingModule({ providers: [{ provide: ConfigService, useValue: {...} }] })` → `isGlobal` ConfigModule-тай мөргөлдөж child DI тасрана  
**Шийдэл:** `.overrideProvider(ConfigService).useValue({...})` chain ашиглах  
**→ RULE-01:** `providers[]` = шинэ provider ЗӨВХӨН. Байгаа provider → `.overrideProvider()`

---

### [DI-003] Controller-ийн external service dependency undefined
**Тохиолдсон:** MVP 4 `tenant-auth-guard.integration.spec.ts`  
**Алдаа:** `TypeError: Cannot read properties of undefined (reading 'getTenantId')` — `TenantCacheService` DI chain зөрчил  
**Шийдэл 1 (src):** `this.tenantCacheService?.getTenantId(slug) ?? null` — optional chaining  
**Шийдэл 2 (тест):** `.overrideProvider(TenantCacheService).useValue({ getTenantId: async (slug) => ..., invalidate: async () => {} })`  
**→ RULE-01 + RULE-06:** External service-тэй бүх метод `?.` + тестэд mock хийх

---

### [DI-008] Module Double-Import → APP_GUARD useExisting
**Тохиолдсон:** MVP 4 интеграци тест, HTTP 500  
**Шалтгаан:** `MaterialRequisitionModule` → `AuthModule` import → NestJS **хоёр тусдаа DI scope** үүсгэдэг. Тестийн patch нь 1-р instance-д хийгдэх боловч MR controller нь 2-р instance ашигладаг.  
**Шийдэл:**
1. `MaterialRequisitionModule.imports`-аас `AuthModule` **устга**
2. `AppModule.providers`-д: `{ provide: APP_GUARD, useExisting: TenantAuthGuard }`
3. Controller-ийн `@UseGuards` / `@UseInterceptors` устга
**→ RULE-07:** Нэг guard/interceptor → `APP_GUARD useExisting` — олон module import ХОРИГЛОНО

---

### [DI-009] vitest esbuild → emitDecoratorMetadata дэмжихгүй
**Тохиолдсон:** MVP 4 бүх integration тест  
**Алдаа:** `this.configService`, `this.mrService` etc. → БҮГД `undefined`  
**Шалтгаан:** vitest анхдагч `esbuild` нь `emitDecoratorMetadata: true` TypeScript тохиргоог **огт дэмждэггүй** → `Reflect.getMetadata('design:paramtypes', ...)` → `undefined` → NestJS IoC бүх constructor injection алдагдана  
**Шийдэл:** `unplugin-swc` + `@swc/core` суулгаж `vitest.integration.config.ts`-д SWC plugin нэмэх  
**→ RULE-08:** NestJS + vitest → ЗААВАЛ `unplugin-swc`

---

## 2. Prisma / Database алдаанууд

### [ENUM-001] Prisma Enum TypeScript нэр vs DB @map утга
**Тохиолдсон:** MVP 4 `tenant-auth-guard.integration.spec.ts:63`  
**Алдаа:** `tier: TierType.tier1` — `.tier1` нь DB @map утга, TypeScript enum биш  
**Шалтгаан:** `TIER1 @map("tier1")` → TypeScript нэр = `TIER1`, DB утга = `tier1`  
**Шийдэл:** `tier: TierType.TIER1` + `import { TierType } from '@prisma/client'`  
**→ RULE-02:** Prisma Enum → TypeScript нэрийг ашиглах. String literal ХЭЗЭЭ Ч ХОРИГЛОНО

---

### [ENUM-002] Magic string enum бүх тестэд
**Тохиолдсон:** MVP 4 `rls-leakage.integration.spec.ts`  
**Алдаа:** `role: 'REQUESTER'`, `status: 'DRAFT'`, `status: 'PENDING_APPROVAL'`  
**Шийдэл:** `UserRole.REQUESTER`, `MrStatus.DRAFT`, `MrStatus.PENDING_APPROVAL`  
**→ RULE-02:** Дээрхтэй адил

---

### [SQL-001] $executeRawUnsafe хувьсагчтай — SQL injection + алдаа
**Тохиолдсон:** MVP 4 `rls-leakage.integration.spec.ts`  
**Алдаа:** `` `SET LOCAL app.tenant_id = '${tenantId}'` `` → SQL injection эрсдэл  
**Шийдэл:** `` tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}` `` (tagged template = parameterized)  
**→ RULE-04:** `$executeRawUnsafe` = статик string ЗӨВХӨН. Хувьсагч → `$executeRaw` tagged template

---

### [PRISMA-001] @db.Uuid annotation дутуу → RLS мөргөлдөлт
**Тохиолдсон:** MVP 1-3  
**Алдаа:** `cannot alter type of a column used in a policy definition`  
**Шалтгаан:** `@db.Uuid` байхгүй → Prisma `TEXT` гэж ойлгоно → PostgreSQL RLS policy-тай мөргөлдөнө  
**Шийдэл:** `id String @id @default(uuid()) @db.Uuid`, `tenantId String @map("tenant_id") @db.Uuid`  
**→ RULE-05:** UUID талбар БҮРТ `@db.Uuid` — шинэ model нэмэхдээ эхлээд шалгах

---

### [PRISMA-002] $use middleware + $executeRaw → Infinite Loop → OOM
**Тохиолдсон:** MVP дотор middleware хэрэглэсэн үед  
**Алдаа:** Worker terminated, JS heap out of memory (4GB+)  
**Шалтгаан:** `$use` middleware нь `executeRaw`/`queryRaw`-г intercept хийдэг. Middleware дотор `$executeRaw` дуудвал рекурс loop  
**Шийдэл:**
```typescript
if (params.action === 'executeRaw' || params.action === 'queryRaw') {
  return next(params);
}
```
**→ RULE-14:** Prisma `$use` middleware → executeRaw guard ЗААВАЛ

---

### [RLS-001] SET LOCAL implicit transaction алдаа
**Тохиолдсон:** MVP `auth.service.ts` → `getMe()`  
**Алдаа:** `$executeRaw(set_config)` TX1 commit → `findFirst` TX2 → `app.tenant_id` тохируулагдаагүй → `''::uuid` cast → `22P02: invalid input syntax`  
**Шийдэл:** `this.prisma.$transaction(async tx => { await tx.$executeRaw(set_config); return tx.model.findFirst() })`  
**→ RULE-04 (RULE-03 adjacent):** `set_config` + query НЭГДСЭН `$transaction()` дотор

---

### [RLS-002] Superuser нь FORCE RLS ч bypass хийдэг
**Тохиолдсон:** MVP 4 RLS leakage тест  
**Алдаа:** `postgres` user-ээр холбогдоход бүх RLS policy алгасагдана  
**Шийдэл:** Dual PrismaClient — `prismaAdmin` (postgres, setup/teardown) + `prismaRls` (app_user, бодит тест)  
**→ RULE-16:** RLS тест → dual PrismaClient ЗААВАЛ

---

### [RLS-003] Empty string UUID cast алдаа
**Тохиолдсон:** MVP 4 тест  
**Алдаа:** `SET LOCAL app.tenant_id = ''` → `invalid input syntax for type uuid: ""`  
**Шалтгаан:** RLS policy `current_setting('app.tenant_id')::uuid` → хоосон string cast амжилтгүй  
**Шийдэл:** `NULLIF(current_setting('app.tenant_id', true), '')::uuid` (RULE-12 аль хэдийн хамардаг)  
**→ RULE-12 + RULE-16:** `NULLIF` pattern ЗААВАЛ; тестэд null UUID `'00000000-0000-0000-0000-000000000000'` ашиглах

---

## 3. Migration алдаанууд

### [MIGRATE-001] CHECK constraint байхад ALTER TYPE
**Тохиолдсон:** Migration 0004  
**Алдаа:** `operator does not exist: "TierType" = text`  
**Шалтгаан:** CHECK constraint байхад native enum руу ALTER TYPE хийхэд PostgreSQL re-validate → text operator байхгүй  
**Шийдэл:** DROP CHECK → CREATE ENUM → ALTER TYPE → RECREATE CHECK  
**→ RULE-15:** Enum өөрчлөх migration дараалал

---

### [MIGRATE-002] Partial index байхад ALTER TYPE
**Тохиолдсон:** Migration 0004  
**Алдаа:** `operator does not exist: "OutboxStatus" = text`  
**Шалтгаан:** `WHERE status IN ('PENDING','FAILED')` text WHERE clause-тай partial index байхад column type өөрчлөхөд алдаа  
**Шийдэл:** DROP index → DROP CHECK → CREATE ENUM → ALTER TYPE → RECREATE index  
**→ RULE-15:** Index-г ЭХЛЭЭД drop хийх

---

## 4. Auth / User алдаанууд

### [AUTH-001] request.user.id ≠ core_users.id
**Тохиолдсон:** MVP 3 `MrHeader.requesterId` FK violation  
**Алдаа:** `Prisma FK error → unhandled exception → 500`  
**Шалтгаан:** `TenantAuthGuard` → `request.user = { id: user.id }` → `user.id` = Supabase auth UUID ≠ `core_users.id`  
**Шийдэл:**
```typescript
private async resolveUserId(tenantId: string, authId: string): Promise<string> {
  const user = await this.prisma.coreUser.findFirst({
    where: { authId, tenantId }, select: { id: true },
  });
  if (!user) throw new NotFoundException('Хэрэглэгч олдсонгүй');
  return user.id;
}
```
**→ RULE-13:** FK → `core_users.id` ЗААВАЛ. Guard-д `authId` ба `coreUserId` хоёуланг нь тавих нь ойлгомжтой

---

### [AUTH-002] core_users дутуу бичлэг (seed script)
**Тохиолдсон:** MVP 5 тестийн үед  
**Алдаа:** `resolveUserId()` → `null` → 404  
**Шалтгаан:** `auth.users`-д бүртгэлтэй ч `core_users`-д тохирох record байхгүй  
**Шийдэл:** Seed script нь `auth.users` + `core_users` **хоёуланг** үүсгэх ёстой  
**→ RULE-13 adjacent:** Шинэ орчинд суулгасны дараа seed script шалгах

---

## 5. Тест тохиргооны алдаанууд

### [PATCH-001] Prototype patch → ESM interop-д ажиллахгүй
**Тохиолдсон:** MVP 4 `tenant-auth-guard.integration.spec.ts`  
**Алдаа:** `AuthService.prototype.getMe = patchFn` → `[DEBUG] PROTO getMe called` хэзээ ч гарахгүй  
**Шалтгаан:** Vitest ESM module loader болон NestJS require() өөр `AuthService` class instance ашигладаг → prototype patch нөлөөлөхгүй  
**Шийдэл:** `app.get(AuthService).getMe = patchFn` — instance property нь prototype-с өмнө хайгддаг  
**→ RULE-10:** NestJS тестэд prototype patch ХЭЗЭЭ Ч ХОРИГЛОНО

---

### [VITEST-001] Worker threads memory limit
**Тохиолдсон:** MVP 4 integration test suite  
**Алдаа:** Worker terminated due to reaching memory limit  
**Шийдэл:** `vitest.integration.config.ts`-д:
```typescript
test: { pool: 'forks', poolOptions: { forks: { singleFork: true } } }
```
+ `--max-old-space-size=4096` flag  
**→ RULE-18:** Integration тест → `pool: 'forks'` ЗААВАЛ

---

## 6. pnpm / Module Resolution алдаанууд

### [RESOLVE-001] pnpm strict-mode transitive dep → Vite "Failed to load url"
**Тохиолдсон:** MVP 5 frontend dev server  
**Алдаа:** `Error: Failed to load url fastify`  
**Шалтгаан:** pnpm strict-mode → `fastify` нь `@nestjs/platform-fastify`-ийн transitive dep → symlink байхгүй → Vite resolve амжилтгүй  
**Шийдэл:** `import { FastifyRequest } from 'fastify'` → `import type { FastifyRequest } from 'fastify'`  
**→ RULE-09:** Зөвхөн type-д ашиглаж буй import → `import type` ЗААВАЛ

---

### [DEP-001] @nestjs/mapped-types суулгаагүй
**Тохиолдсон:** MVP 3  
**Алдаа:** `PartialType(CreateMrDto)` ажиллахгүй  
**Шийдэл:** `package.json` шалгаж суулгах, эсвэл `@IsOptional()` decorator-тэй гараар бичих

---

### [MODULE-001] AuthModule import дутуу
**Тохиолдсон:** MVP 3  
**Шалтгаан:** `@UseGuards(TenantAuthGuard)` DI-аар resolve → `AuthModule` import хэрэгтэй  
**Шийдэл:** `MaterialRequisitionModule.imports: [AuthModule]` нэмэх  
**Тайлбар:** Энэ алдаа нь DI-008-г үүсгэсэн → одоо APP_GUARD useExisting pattern-д шийдэгдсэн

---

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

## 8. Config / Environment алдаанууд

### [CONFIG-001] ConfigService defensive fallback дутуу
**Тохиолдсон:** MVP 4 `env.config.ts`  
**Алдаа:** ConfigModule inject хийгдээгүй орчинд `configService.get('KEY')` → `undefined` → Zod validation crash  
**Шийдэл:** `configService.get('KEY') ?? process.env['KEY']` — process.env fallback ЗААВАЛ

---

## 9. E2E тест (Sprint 5)

### E2E META чеклист — Playwright бичихэд баримтлах зүйлс

```
✅ page.getByRole() > page.waitForSelector() — илүү найдвартай
✅ page.waitForURL() — navigation дараах state шалгах
✅ Multi-tenant тест → тусдаа env var (MULTI_TENANT_E2E) хамгааллын цаана байх
✅ Test isolation: beforeEach-д fresh state үүсгэх (seed → test → cleanup)
✅ Error screenshot: onFailure -> screenshot хадгалах
✅ Timeout: slow UI action-д explicit timeout тавих (5000ms+)
✅ API state → UI reflection: waitForResponse ашиглах
```

---

## 10. Sprint 5: Docker / CI / E2E алдаанууд (root lessons_learned.md-ээс нэгтгэсэн)

---

### [S5-E1] Docker build: `Cannot find module typescript/bin/tsc`

**Шалтгаан:** Dockerfile нь зөвхөн `apps/<pkg>/package.json` хуулж байсан бол бусад workspace-ийн `package.json`-г орхидог. pnpm symlink-г зөв тохируулж чадахгүй.

**Зөв шийдэл:** `pnpm dlx turbo prune --scope=<pkg> --docker` ашиглах.
- `/out/json/` → workspace бүтэцтэй зөвхөн package.json файлууд
- `/out/full/` → бүрэн source code

**Зөв Dockerfile pattern:**
```dockerfile
FROM node:20-alpine AS pruner
RUN pnpm dlx turbo prune --scope=@s-project/core-kernel --docker
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@s-project/core-kernel
```

---

### [S5-E2] `pnpm --filter e2e add @playwright/test` → lockfile update хийсэнгүй

**Шалтгаан:** `apps/e2e` нь шинэ package болохоор lockfile-д байгаагүй. `pnpm install` нь "up to date" гэж буцаад шинэ package суулгасангүй.

**Зөв шийдэл:** `pnpm --filter e2e add -D @playwright/test@1.48.0` ашиглах (add, not install).
- Энэ нь lockfile-г шинэчлэн зөв суулгана.

---

### [S5-E3] Windows дээр `pnpm --filter e2e exec playwright install chromium` → `Cannot find module @playwright/test/cli.js`

**Шалтгаан:** Windows дээр pnpm workspace cross-links-г **NTFS junction** болгон үүсгэдэг.  
`apps/e2e/node_modules/@playwright/test` нь 0-byte NTFS junction → Linux VM bridge дээр "Input/output error" болдог.  
`node-linker=hoisted` тохируулсан ч workspace-level symlink/junction үүсдэг.

**Зөв шийдэл:** Root `node_modules/@playwright/test/cli.js` бодит файл байдаг тул:
```bash
# Local Windows PowerShell:
node node_modules/@playwright/test/cli.js install chromium

# Эсвэл convenience script (root package.json-д нэмсэн):
pnpm playwright:install

# CI (Ubuntu) - энэ нь ажиллана:
node node_modules/@playwright/test/cli.js install chromium --with-deps
```

**CI yml засвар:** `pnpm --filter e2e exec playwright install` → `node node_modules/@playwright/test/cli.js install chromium --with-deps`

**Дүрэм:** Windows NTFS junction ≠ Linux symlink. pnpm workspace packages-г Windows дээр native PowerShell-ээс ажиллуулах.

---

### [S5-E4] `docker-compose.prod.yml` WARN: `SUPABASE_URL` not set

**Шалтгаан:** `${SUPABASE_URL}` хувьсагч `.env` файлд байхгүй үед Docker Compose анхааруулга гаргадаг.

**Зөв шийдэл:** Default утга ашиглах: `${SUPABASE_URL:-}`

---

### [S5-E5] `pnpm install --force` → +110, дараа нь `pnpm install` → -110 (cycle)

**Шалтгаан:** `--force` нь cache-г цэвэрлэж дахин суулгахад зарим package-г давхардуулдаг бөгөөд дараагийн `install` нь давхардлыг арилгадаг.

**Дүрэм:** Шинэ package нэмэхдээ `pnpm --filter <pkg> add -D <package>` ашигла, `--force` ашиглахаас зайлсхий.


---

### [S5-E6] `Cannot find module apps/web-shell/node_modules/vite/bin/vite.js` (Windows)

**Шалтгаан:** `.npmrc`-д `node-linker=hoisted` нэмэхийн өмнө үүссэн workspace-level NTFS junction-ууд (`apps/*/node_modules/*`) хуучин `.pnpm` store-г заасан хугарсан байсан. `pnpm install` нь root-д зөв суулгасан ч хуучин junction-г цэвэрлэсэнгүй.

**Шинж тэмдэг:** 
- `apps/web-shell/node_modules/vite` — хугарсан NTFS junction
- `apps/e2e/node_modules/@playwright/test` — хугарсан NTFS junction  
- PowerShell-д ч ажиллахгүй (зөвхөн VM bridge асуудал биш)

**Зөв шийдэл:**
```powershell
# 1. Бүх workspace-level node_modules устгах
Get-ChildItem -Path apps -Recurse -Directory -Filter "node_modules" | Remove-Item -Recurse -Force

# 2. Дахин суулгах (node-linker=hoisted root-д нэгтгэнэ)
pnpm install

# 3. Шалгах
Test-Path node_modules\vite\bin\vite.js           # True
Test-Path node_modules\@playwright\test\cli.js    # True
```

**Дүрэм:** `node-linker=hoisted` тохируулга өөрчлөгдсөний дараа `pnpm install` хийхийн өмнө `apps/*/node_modules` устга. `node-linker=hoisted` горимд workspace packages өөрийн `node_modules` хэрэггүй — Node.js directory tree-г дагаж root-оос хайна.

---

### [S5-E7] `Module '"@prisma/client"' has no exported member 'Prisma'` — 97 алдаа

**Шалтгаан:** `apps/*/node_modules` устгаж `pnpm install` хийсний дараа **Prisma client дахин генерацлагдаагүй**. `@prisma/client` package суулгагдсан ч `.prisma/client` (generated types: `PrismaClient`, `Prisma`, model types) байхгүй болсон.

**Шинж тэмдэг:** `Module '"@prisma/client"' has no exported member 'PrismaClient'`, `'Prisma'`, `'MrStatus'` гэх мэт массаар алдаа.

**Зөв шийдэл:**
```powershell
pnpm db:generate
# эсвэл
pnpm --filter core-kernel exec prisma generate
```

**Дүрэм:** `node_modules` устгаж дахин `pnpm install` хийсний дараа **заавал** `prisma generate` ажиллуулах. Root `package.json`-д `postinstall: "prisma generate"` нэмэх сонголт бий (автоматжуулах).

---

## [S5-E8] Health endpoint 401 — NestJS global prefix давхардсан

**Алдаа:**
```
E2E test: GET /api/v1/health → 401 (expected 200)
```

**Шалтгаан:**
`main.ts`-д `app.setGlobalPrefix('api/v1')` тохируулсан байхад `HealthController`-д `@Controller('api/v1/health')` гэж бичсэн. Үр дүнд бодит URL `/api/v1/api/v1/health` болж, E2E тест `/api/v1/health` руу хандахад `TenantAuthGuard` хариулж 401 буцааж байсан. (`@SkipAuth()` зөв ажиллаж байсан — зүгээр л буруу URL дээр хандаж байсан.)

**Шийдэл:**
```typescript
// БУРУУ:
@Controller('api/v1/health')

// ЗӨВ: Global prefix-г давхардуулахгүй
@Controller('health')
// Үр дүн: /api/v1/health
```

**Дүгнэлт:** `setGlobalPrefix` ашиглах үед controller-уудад prefix давтаж бичихгүй байх. Route нь зөвхөн controller-specific хэсгийг агуулна.

---

## [S5-E9] E2E login selector timeout — Монгол label, htmlFor холболтгүй

**Алдаа:**
```
page.getByLabel(/email/i) → Timeout: locator not found
page.getByLabel(/password/i) → Timeout: locator not found
```

**Шалтгаан:**
`LoginPage.tsx`-ийн label текст нь `И-мэйл` / `Нууц үг` (Монгол) байсан ба `/email/i` regex-тэй таарахгүй. Мөн `<label>` ба `<input>` нь `htmlFor`/`id` холболтгүй байсан тул Playwright `getByLabel()` нь label-ыг input-тай холбож чаддаггүй байсан.

**Шийдэл 1 (тест):** `auth.helper.ts` + `auth.spec.ts`-д `getByLabel` орондоо type-based selector ашиглана:
```typescript
// БУРУУ:
await page.getByLabel(/email/i).fill(email);

// ЗӨВ: HTML type attribute-д тулгуурлана — хэл хамаарахгүй
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
```

**Шийдэл 2 (UI):** `LoginPage.tsx`-д `id` + `htmlFor` нэмсэн:
```tsx
<label htmlFor="email">И-мэйл</label>
<input id="email" type="email" ... />
```

**Дүгнэлт:** Монгол UI ашиглах үед `getByLabel(/english/i)` ажиллахгүй. Input-уудад `id` + label-д `htmlFor` заавал нэмэх (accessibility + testability). E2E selector-ийн хамгийн найдвартай хувилбар: `input[type]` эсвэл `data-testid`.


---

## [S5-E10] FST_ERR_DUPLICATED_ROUTE — AppController + HealthController ижил route

**Алдаа:**
```
FastifyError: Method 'GET' already declared for route '/api/v1/health'
FST_ERR_DUPLICATED_ROUTE
```

**Шалтгаан:**
`AppController` нь `@Controller()` + `@Get('health')` → глобал prefix-тэй `GET /api/v1/health`.
`HealthController` нь `@Controller('health')` + `@Get()` → мөн `GET /api/v1/health`.
Fastify нэг route-г хоёр удаа бүртгэхийг хориглодог.

**Шийдэл:**
`AppController`-аас `health()` method-г хасаж, liveness-д зориулсан `healthz()`-г (`/api/v1/healthz`) үлдээсэн.
`HealthModule` + `HealthController` нь full health response (`version`, `status`) буцааж хэвээр ажиллана.

**Дүгнэлт:** Шинэ controller/module нэмэхдээ `AppController`-д аль route-ууд байгааг эхлэж шалгана. "Health" гэх мэт нийтлэг нэртэй endpoint-ууд давхардах магадлал өндөр.


---

## [S5-E11] LoginPage /login redirect байхгүй — нэвтэрсэн хэрэглэгч дахин /login-д орвол stuck болно

**Алдаа:**
```
E2E: login → /login давтан очвол → URL хэвээр /login байна (expected: /requisitions)
```

**Шалтгаан:**
`App.tsx`-д `/login` route нь ямар ч auth шалгалтгүй. `ProtectedRoute` нь зөвхөн `/protected` route-уудаас `/login`-д redirect хийдэг, харин `/login`-д ирсэн authenticated хэрэглэгчийг `/requisitions` руу чиглүүлдэггүй байсан.

**Шийдэл:**
`LoginPage.tsx`-д `useAuth()` hook-тэй `useEffect` нэмж, `!loading && user` үед `navigate('/requisitions', { replace: true })` дуудна:
```tsx
useEffect(() => {
  if (!loading && user) {
    navigate('/requisitions', { replace: true })
  }
}, [user, loading, navigate])
```
`loading` үед spinner харуулж, redirect болтол UI хоосон биш байна.

**Дүгнэлт:** Auth-тай ямар ч app-д `/login` page нь "already authenticated" тохиолдлыг зохицуулах ёстой.

---

## [S5-E12] E2E getByRole('link') timeout — MRListPage-д `<button>`, `<a>` биш

**Алдаа:**
```
page.getByRole('link', { name: /шинэ|new|үүсгэх|create/i }) → timeout
```

**Шалтгаан:**
`MRListPage.tsx` дахь "Шинэ MR үүсгэх" element нь `<button onClick={() => navigate(...)}>` — HTML `<a>` биш. Playwright-ийн `getByRole('link')` нь зөвхөн `<a>` эсвэл `role="link"` attribute-тай элементийг хайдаг.

**Шийдэл:**
```typescript
// БУРУУ:
await page.getByRole('link', { name: /шинэ|new|үүсгэх|create/i }).click();

// ЗӨВ:
await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
```

**Дүгнэлт:** E2E тест бичихдээ UI-ийн бодит HTML element-ийг шалгана — `navigate()` ашигласан `<button>` нь navigation хийдэг ч `role="link"` биш байна. `.first()` нэмэх нь хуудасны олон давхцсан button-ийн аюулаас сэргийлнэ.


---

## [S5-E13] MR create form submit-д navigation болохгүй — item fields хоосон (frontend validation)

**Алдаа:**
```
page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/) → Timeout 30000ms
```

**Шалтгаан:**
`MRCreatePage.tsx`-д form submit хийхэд `items[0].description` хоосон байвал frontend validation `"1 дүгээр мөрийн нэр хоосон байна"` алдаа харуулж, navigation хийхгүй. E2E тест зөвхөн `title` бөглөж, item fields-г бөглөдөггүй байсан.

**Шийдэл:**
E2E тест дотор MR create form-д `title` бөглөхөөс гадна item fields-г бөглөнө:
```typescript
await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E тест бараа');
await page.locator('input[type="number"]').first().fill('1');
```

**Дүгнэлт:** Form тест бичихдээ required field-уудыг бүгдийг бөглөх. Frontend validation error нь navigation болохгүй болгодог тул `waitForURL` timeout-аар л илэрдэг — screenshot авбал error message харагдах байсан.


---

## [S5-E14] E2E status text mismatch — StatusBadge Монгол хэл, тест Англи хэл хайсан

**Алдаа:**
```
getByText(/draft/i)         → not found  (UI: "Ноорог")
getByText(/pending/i)       → not found  (UI: "Батлуулж байна")
getByText(/approved/i)      → not found  (UI: "Батлагдсан")
getByRole('button', /approve|зөвшөөрөх/i) → not found (UI: "✅ Батлах")
```

**Шалтгаан:**
`StatusBadge.tsx`-д status label-ууд нь бүгд Монгол хэлтэй:
```typescript
DRAFT          → 'Ноорог'
PENDING_APPROVAL → 'Батлуулж байна'
APPROVED       → 'Батлагдсан'
REJECTED       → 'Татгалзсан'
```
E2E тест нь English/mixed regex ашигласан ба UI-ийн бодит текстэд таарахгүй байсан.

**Шийдэл:**
```typescript
// БУРУУ → ЗӨВ
getByText(/draft/i)              → getByText(/ноорог/i)
getByText(/pending|хүлээгдэж/i) → getByText(/батлуулж байна/i)
getByText(/approved|зөвшөөрсөн/i) → getByText(/батлагдсан/i)
getByRole('button', { name: /approve|зөвшөөрөх/i }) → getByRole('button', { name: /батлах/i })
getByText(/rejected|татгалзсан/i) → getByText(/татгалзсан/i) ✓ (unchanged)
```

**Дүгнэлт:** Монгол UI дахь E2E тест бичихдээ UI дахь бодит текстийг харж regex бичих. Тест эхний удаа алдаагааргүй болохоор StatusBadge болон button-уудын label-ийг тогтоон бичих. `data-testid` attribute нэмэх нь хэлнээс үл хамаарах, хамгийн найдвартай арга.


---

## [S5-E15] Playwright strict mode violation — regex нь олон элементэд таарсан
**Огноо:** 2026-09-21
**Алдаа:** `strict mode violation: getByText(/батлагдсан/i) resolved to 2 elements`
**Шалтгаан:** `/батлагдсан/i` regex нь `<span>Батлагдсан</span>` (StatusBadge) болон `<div>✅ Энэ MR батлагдсан байна</div>` хоёуланд таарч байсан. Playwright strict mode-д нэгээс олон элемент олдвол алдаа гаргадаг.
**Зөв шийдэл:** `page.getByText('Батлагдсан', { exact: true })` — зөвхөн StatusBadge-ийн `<span>`-тэй таарна. Мөн `'Татгалзсан'`-д ижил зарчим хэрэглэнэ.
**Хичээл:** Статус шалгах үед `{ exact: true }` ашиглах, эсвэл `.first()` тодорхой заана.

---

## [S5-E16] RejectModal getByLabel ажиллахгүй — htmlFor/id холболт байхгүй
**Огноо:** 2026-09-21
**Алдаа:** `getByLabel(/reason|шалтгаан/i)` → `isVisible()` = false → if block алгасагдаж reject action дуусгагдахгүй
**Шалтгаан:** `RejectModal.tsx`-д `<label>` болон `<textarea>` хоёрт `htmlFor`/`id` холболт байхгүй. Playwright `getByLabel` нь label-input association шаарддаг.
**Зөв шийдэл:** Modal container (`'.fixed.inset-0'`) дотроос `page.locator('textarea').first()` болон `page.locator('.fixed.inset-0').getByRole('button', { name: /татгалзах/i })` ашиглах. `if (isVisible)` conditonal-ийн оронд modal заавал гарна гэж үздэг.
**Хичээл:** `getByLabel` ашиглахаас өмнө `htmlFor`/`id` холболт байгаа эсэхийг шалгах. Modal-ын дотоод элементүүдийг container-аар нь isolate хийх.

---

## [META] E2E тест бичихийн өмнө шалгах чеклист — Sprint 5-аас сурсан зүйл

Sprint 5 E2E debugging явцад 9 алдаа давтагдсаны ихэнх нь **тест бичихийн өмнө UI-ийг шалгаагүйгаас** үүссэн. Дараах чеклистийг E2E тест бичихийн ӨМНӨ дандаа гүйцэтгэнэ:

### 1. URL & Routing шалгалт
- [ ] `setGlobalPrefix('api/v1')` байгаа бол controller path-д `api/v1` давтаж бичихгүй
- [ ] Frontend route-ийн redirect logic (ProtectedRoute, useEffect redirect) тест сценарид тооцсон эсэх

### 2. HTML element шалгалт (тест бичихийн ӨМНӨ DevTools-д харах)
- [ ] Navigation хийдэг `<button>` vs `<a>` — `getByRole('link')` зөвхөн `<a>`-д ажиллана
- [ ] `getByLabel()` ашиглах бол `htmlFor`/`id` холболт байгаа эсэх
- [ ] Form required field-ууд бүгд бөглөгдсөн эсэх (validation error = navigation болохгүй)

### 3. UI текст шалгалт
- [ ] Button/badge-ийн бодит текстийг (`textContent`) DevTools-д харна
- [ ] Монгол UI → regex-д Монгол үг ашиглана (`/батлах/i` биш `/approve/i`)
- [ ] Нэг хуудсанд ижил текст 2+ элементэд байвал `{ exact: true }` эсвэл container locator ашиглана

### 4. Modal шалгалт
- [ ] Modal trigger → modal container → modal дотоод элемент гэж isolate хийнэ
- [ ] `if (isVisible())` conditional-оос зайлсхийх — conditional алгасагдаж action дуусгагдахгүй болдог

### Гол зарчим: **"Тест бичихийн өмнө browser-д нээгээд бодит UI-г нүдээр харна"**

---

## 11. CI / Тест орчны алдаанууд (2026-10-08)

### [CI-001] CI-ийн `test:unit` алхам чимээгүй "ногоон" — юу ч ажиллаагүй
**Алдаа:** `ci.yml` → `pnpm turbo test:unit`, гэтэл ямар ч package-д `test:unit` script байгаагүй. Turbo script-гүй task-ийг алгасдаг тул алхам **алдаагүй дуусч**, unit тест огт ажиллаагүй.
**Шалтгаан:** `turbo.json`-д task тодорхойлсон ч `package.json` script нэмээгүй.
**Шийдэл:** `apps/core-kernel/package.json`-д `"test:unit": "vitest run"` нэмэв.
**Урьдчилан сэргийлэх:** CI-д шинэ turbo task нэмэх бүрт `npx turbo <task> --dry=json`-оор бодит command-тай package байгаа эсэхийг шалгана.

### [CI-002] CI-д `supabase db push` — remote project link шаарддаг
**Алдаа:** `supabase db push` нь `supabase link` хийсэн remote project руу migration түлхдэг; local CI-д link байхгүй → унана.
**Шийдэл:** Алхмыг устгав. `supabase start` нь `supabase/migrations/*.sql` + `seed.sql`-г автоматаар ажиллуулдаг. Дахин цэвэрлэх шаардлагатай бол `supabase db reset`.

### [CI-003] ESLint тохиргооны файл огт байгаагүй → `lint` алхам унадаг
**Алдаа:** `ESLint couldn't find a configuration file`.
**Шийдэл:** Root-д `.eslintrc.cjs` (ESLint 8 legacy) — зөвхөн root devDependencies (`@typescript-eslint/*`) ашигласан тул lockfile өөрчлөгдөөгүй. `no-explicit-any`, `no-unused-vars` → `warn`.
**Сурвалж:** `Prisma.XGetPayload<{}>` → `ban-types` алдаа. Оронд нь `@prisma/client`-ийн model type (`MrHeader`, `WorkflowDefinition`) ашиглана — утга нь ижил.

### [TEST-001] Constructor/field-д `createClient(process.env[...]!)` → env-гүй орчинд тест унана
**Алдаа:** `supabaseUrl is required.` — `TenantOnboardingService` field initializer-т Supabase client үүсгэдэг. Local `.env`-тэй үед давж, CI (SERVICE_ROLE_KEY-гүй) дээр 6 тест унадаг байсан.
**Шийдэл (тест):** `beforeEach`-д `vi.stubEnv('SUPABASE_URL', ...)`, `vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', ...)`.
**Дүрэм:** Unit тест `.env`-ээс хамаарах ёсгүй. Тестийг **env-гүй** ажиллуулж шалгана: `env -u SUPABASE_URL npx vitest run`.
**Цаашид:** Service-үүдэд `process.env[...]!` (non-null assertion) ашиглахгүй — ConfigService + startup validation.

---

## 12. Local орчин / Шинэ машин тохиргоо (2026-10-08)

> Төслийг GitHub-аас шинэ Windows машин дээр clone хийж Supabase-г Docker дээр асаах явцад гарсан. Бүрэн заавар: `docs/07_Tech_Stack_and_Environment/02_Local_Supabase_Docker_Windows.md`

### [SEED-001] Enum migration-ий дараа `seed.sql` хуучин утгатай үлдсэн → `supabase start` унав
**Алдаа:** `failed to send batch: ERROR: invalid input value for enum "TierType": "starter" (SQLSTATE 22P02)` — 15 migration амжилттай, seed дээр унаж контейнерүүд зогссон.
**Шалтгаан:** `0004_add_native_enums.sql` нь `tenants.tier`-ийг TEXT → `TierType ('tier1','tier2','tier3')` болгосон, гэтэл `seed.sql` `'starter'` хэвээр. Хуучин машинд DB 0004-өөс өмнө үүссэн тул seed дахин ажиллаагүй — алдаа **нуугдмал** байсан.
**Шийдэл:** `seed.sql`: `'starter'` → `'tier1'` (Prisma `@default(TIER1)`-тэй таарна).
**Урьдчилан сэргийлэх:** TEXT→enum эсвэл CHECK constraint өөрчлөх migration бүрт `grep -n "<багана>" supabase/seed.sql` хийж хуучин утгыг шинэчилнэ. Migration нэмсний дараа **цэвэр DB дээр** `pnpm supabase:reset`-ээр бүх migration + seed-ийг туршина.

### [ENV-001] `docker` / `node` / `pnpm` — `is not recognized` (суусан байхад)
**Шалтгаан:** Терминал програм суулгахаас өмнө нээгдсэн → хуучин PATH. Docker Desktop **per-user** суувал `%LOCALAPPDATA%\Programs\DockerDesktop`-д байдаг (`C:\Program Files` биш) — буруу замаар шалгаж "суугаагүй" гэж андуурсан.
**Шийдэл:** Терминал (VS Code бол бүхэлд нь) дахин нээх, эсвэл:
`$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
**Дүрэм:** Суулгасан эсэхийг замаар биш registry-ээр шалгана: `HKLM` **болон** `HKCU` `...\Uninstall\*`.

### [ENV-002] `npm.ps1 cannot be loaded because running scripts is disabled`
**Шалтгаан:** Windows PowerShell-ийн анхдагч ExecutionPolicy `.ps1` хориглодог.
**Шийдэл:** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (admin шаардахгүй).

### [ENV-003] Supabase CLI-г `npm install -g supabase`-ээр суулгах — дэмжигдэхгүй
**Шалтгаан:** README-д `npm install -g supabase@latest` гэж буруу заасан байсан. Supabase CLI npm global суулгалтыг дэмждэггүй.
**Шийдэл:** Root devDependency: `pnpm add -D supabase -w` (одоо `package.json`-д орсон → `pnpm install` хангалттай). Баг бүхэлдээ ижил хувилбар, `pnpm supabase:*` script-ууд ажиллана.
**Тэмдэглэл:** `pnpm add` дээр `Packages: +25 -147` гарсан ч lockfile-д зөвхөн нэмэлт орсон (`git diff pnpm-lock.yaml`-аар шалгасан) — `-147` нь `node_modules` бүтэц.

### [ENV-004] Шинэ CLI `sb_publishable_…` / `sb_secret_…` key харуулдаг — код JWT key хүлээдэг
**Шалтгаан:** Supabase CLI v2.1xx+ `supabase status`-д шинэ форматын API key харуулдаг. Манай код `@supabase/supabase-js ^2.46` + `auth.getUser(token)` нь хуучин JWT `anon` / `service_role` key-тэй ажилладаг.
**Шийдэл:** `pnpm supabase status -o env` → `ANON_KEY`, `SERVICE_ROLE_KEY` (`eyJ…`-ээр эхэлнэ).
**Дүрэм:** `.env`-д `sb_` угтвартай key оруулахгүй (supabase-js шинэчлэх хүртэл).

### [ENV-005] Шинэ машинд 3 `.env` файл хэрэгтэй — GitHub-д байдаггүй
**Шалтгаан:** `.env` нь `.gitignore`-д. Prisma (`apps/core-kernel`) root `.env`-г уншдаггүй, frontend `apps/web-shell/.env`-ээс `VITE_*` уншина.
**Шийдэл:** `.env`, `apps/core-kernel/.env`, `apps/web-shell/.env` — `.env.example`-уудаас автоматаар үүсгэх скрипт баримтын §1.5-д.
**Анхаар:** PowerShell 5.1 `Set-Content -Encoding utf8` BOM нэмдэг → `[IO.File]::WriteAllText(..., (New-Object System.Text.UTF8Encoding $false))` ашиглана.

---

### [ENV-006] `prisma generate` → `EPERM: operation not permitted, rename ...query_engine-windows.dll.node.tmp...`
**Шалтгаан:** Windows дээр ажиллаж буй Node процесс (`pnpm dev`) Prisma query engine DLL-ийг ачаалсан → файл түгжигдсэн, солих боломжгүй.
**Шийдэл:** `pnpm dev`-г зогсоох (Ctrl+C) → `pnpm db:generate` → дахин `pnpm dev`. Давтагдвал `Get-Process node`, VS Code Prisma extension-ийг хаах.
**Анхаар:** Prisma schema өөрчлөгдсөн бол generate **заавал** — хуучин client устгагдсан багана (жнь `schema_name`) руу query хийж runtime алдаа өгнө; unit тест (mock) үүнийг барихгүй.

### [ENV-007] Шинэ машин дээр `pnpm e2e` → 8 тест 3–5ms-д унана: `browserType.launch: Executable doesn't exist ... chromium-1140\chrome-win\chrome.exe`
**Шалтгаан:** Playwright-ийн Chromium нь `pnpm install`-ээр суудаггүй (хэрэглэгчийн `AppData\Local\ms-playwright`-д тусад нь татагдана). Зөвхөн API тест (`health endpoint`) давна.
**Шийдэл:** `pnpm playwright:install` (root script — [S5-E3]-ыг үз; `pnpm --filter e2e exec playwright install` ажиллахгүй).
**Дүрэм:** Шинэ машины шалгах жагсаалтад `pnpm playwright:install` заавал.

### [ENV-008] E2E: login амжилттай ч "MR жагсаалт татахад алдаа гарлаа" — CORS
**Алдаа:** `requisition-flow`, `workflow-multistep` 4 тест "Шинэ MR" товч / хүснэгт олдохгүй timeout. DB-ийн `auth_id` зөв, membership асуудалгүй байсан.
**Шалтгаан:** `apps/web-shell/.env.example`-д `VITE_API_BASE_URL=http://localhost:3000` → хөтөч `:5173`-аас `:3000` руу шууд (cross-origin) хандана. `core-kernel` (`main.ts`) CORS идэвхжүүлээгүй тул хөтөч хүсэлтийг хаадаг. Supabase Auth (54321) өөрөө CORS зөвшөөрдөг тул login ажилласан нь асуудлыг нуусан.
**Шийдэл:** `VITE_API_BASE_URL=` (хоосон) → `client.ts` same-origin `/api` → Vite proxy → `:3000`. `.env` болон `.env.example` хоёуланг засав. Vite-г дахин асаах (`.env`-г зөвхөн эхлэхдээ уншдаг).
**Дүрэм:** `.env.example`-ийн утга кодын тайлбартай (`client.ts`) зөрчилдөж болохгүй. Frontend API алдаа гарвал эхлээд DevTools → Network (CORS / status)-ийг шалгаж, дараа нь DB-г сэжиглэ.

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


## 15. Camp Module (2026-10-09)

### [ENV-009] PowerShell pipe (`Get-Content ... | docker exec -i ... psql`) кирилл үсгийг `?` болгодог
**Алдаа:** `camp_schema_test.sql`-ийг pipe-ээр өгөхөд NOTICE-ууд `????` болж гарсан — зөвхөн дэлгэц биш, **SQL текст өөрөө** эвдэрнэ (`'Кемп админ'` → `'?????'`) → өгөгдөл буруу бичигдэх / тест худал унах эрсдэлтэй.
**Шалтгаан:** Windows PowerShell 5.1-ийн `$OutputEncoding` анхдагчаар US-ASCII — native програм руу pipe хийхэд ASCII-аас бусад тэмдэгт `?` болно.
**Шийдэл:** Файлыг контейнер руу хуулж `-f`-ээр ажиллуулна: `docker cp file.sql "${db}:/tmp/x.sql"` → `docker exec $db psql ... -f /tmp/x.sql`. Гаралтыг уншихад `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`.
**Дүрэм:** Монгол текст агуулсан SQL-ийг PowerShell pipe-ээр ХЭЗЭЭ Ч өгөхгүй.

### [TEST-007] Supabase local-д `postgres` superuser биш → `SET ROLE app_user` хориотой
**Алдаа:** `ERROR: permission denied to set role "app_user"` (RLS тест `app_user` болж шилжих үед).
**Шалтгаан:** Supabase-ийн `postgres` role нь BYPASSRLS-тэй ч superuser биш, `app_user`-ийн гишүүн биш. Cloud-ийн цэвэр PostgreSQL дээр `postgres` = superuser байсан тул тест тэнд давсан — орчны ялгаа.
**Шийдэл:** SQL-ээр RLS тест хийхдээ Supabase-ийн superuser `supabase_admin`-аар холбогдоно: `docker exec -e PGPASSWORD=postgres $db psql -h 127.0.0.1 -U supabase_admin ...`. (`GRANT app_user TO postgres` хийхгүй — role-ийн эрхийг байнга өөрчилнө.)
**Дүрэм:** Supabase дээр ажиллах SQL скриптийг бичихдээ `postgres` = superuser гэж бүү тооц (RLS-002-той холбоотой: bypass нь BYPASSRLS-ээс, superuser-ээс биш).


### [ENV-010] Төслийн хавтсыг зөөсний дараа `tsc`: `Cannot find module '@s-project/shared-types'`
**Алдаа:** `TS2307` — `import type { RequestUser } from '@s-project/shared-types'` бүхий 5 controller. Код өөрчлөгдөөгүй.
**Шалтгаан:** pnpm (Windows) workspace package-ийг **junction**-оор холбодог, junction нь **бүтэн замтай**. Төслийг `E:\MoogiiDev\s-project` → `E:\MoogiiDev\Dev\s-project` зөөхөд `apps/core-kernel/node_modules/@s-project/*` хуучин зам руу заасаар үлдэж тасарсан.
**Оношлох:** `(Get-Item apps\core-kernel\node_modules\@s-project\shared-types).Target` → хуучин зам гарвал энэ.
**Шийдэл:** `pnpm install --frozen-lockfile` (node_modules-ийг дахин үүсгэнэ; `pnpm dev` зогссон байх [ENV-006]).
**Дүрэм:** Төслийн хавтсыг зөөх/нэр солих бүрт `pnpm install` заавал.


### [PRISMA-003] Prisma 5-ийн DB алдааны мессеж Rust Debug хэлбэртэй — хашилт escape-тэй (`\"`)
**Алдаа:** `camp-errors.ts` EXCLUDE/CHECK алдааг 409/400 болгож чадаагүй (integration 2/25 унав) — unit тест давсан, учир нь тестийн мессежийг гараар "цэвэр" хэлбэрээр бичсэн байсан.
**Шалтгаан:** `PrismaClientUnknownRequestError.message` = `... PostgresError { code: "23514", message: "... violates check constraint \"camp_rooms_capacity_check\"" ... }` — regex `constraint "(...)"` нь `\"`-тэй таарахгүй. Trigger-ийн мессеж (`CAMP_*: ...`) хашилтгүй тул давсан.
**Шийдэл:** мессежийг эхлээд `.replace(/\\"/g, '"')`-ээр хэвийн болгох + SQLSTATE (`code: "23P01"` EXCLUDE, `"23514"` CHECK)-ээр нөөц таних. Unit тестэд Prisma-гийн бодит хэлбэрийн мессеж нэмсэн.
**Дүрэм:** DB/гадаад системийн алдааны текстэд тулгуурласан код бичихдээ (1) mock-ийн мессежийг **бодит гаралтаас хуулж** бичнэ, (2) integration тестэд бодит алдаан дээр баталгаажуулна, (3) боломжтой бол текст биш код (SQLSTATE)-оор танина.


### [VALID-001] 🔴 `enableImplicitConversion` → query `?activeOnly=false` нь `true` болдог
**Алдаа:** main.ts-ийн ValidationPipe `transformOptions: { enableImplicitConversion: true }` — class-transformer нь `@Transform`-оос ӨМНӨ declared type-аар хөрвүүлнэ: `Boolean('false') === true`. `@Transform(({ value }) => value === 'true')` нь аль хэдийн `true` болсон утга авна → `?activeOnly=false` = шүүлттэй. Camp, vendor (`activeOnly`), inventory (`lowStock`), budget (`activeOnly`) — бүгд нөлөөлөгдсөн.
**Яагаад нуугдсан:** integration тестүүд `new ValidationPipe({ whitelist: true, transform: true })` — main.ts-ээс ӨӨР тохиргоо (implicit conversion, forbidNonWhitelisted байхгүй).
**Шийдэл:** `src/common/utils/query-bool.ts` → `queryBool` анхны утгыг (`obj[key]`) уншина; 4 модульд хэрэглэсэн. Camp integration тестүүд main.ts-тэй ИЖИЛ pipe ашигладаг болсон + регресс тест (хуучин кодоор унадгийг шалгасан).
**Дүрэм:** (1) Query boolean → ЗААВАЛ `@Transform(queryBool)`. (2) Integration тестийн app тохиргоо (pipe, prefix, plugin) main.ts-тэй ИЖИЛ байх — өөр бол production алдааг нуудаг. (3) ✅ Шат 4.0: `src/common/http/configure-app.ts` → `main.ts` ба БҮХ integration spec `await configureApp(app)` (шинэ spec ч заавал).

---

### [CONC-001] 🔴 Snapshot бичих (засвар хаах → зардал) ба дэд мөр (сэлбэг) өөрчлөх race — trigger-ийн SELECT түгжээ авдаггүй
**Илэрсэн:** Шат 4.4 дизайн шалгалт (Шат 1-ийн `camp_maintenance_parts_protect` trigger). Production-д гараагүй.
**Алдаа:** Trigger хүсэлтийн төлвийг энгийн `SELECT`-ээр уншдаг байсан. READ COMMITTED-д: A transaction засварыг CLOSED болгож сэлбэгийг уншиж зардал бичиж байх зуур B transaction сэлбэг нэмбэл B-ийн trigger commit хийгдээгүй CLOSED-ийг харахгүй (DONE гэж харна) → сэлбэг нэмэгдэнэ, харин зардалд ОРОХГҮЙ → тайлан ба сэлбэгийн жагсаалт зөрнө.
**Шийдэл:** (1) Migration `20261010002` §4: trigger `SELECT ... FOR SHARE` — хаах transaction-ийн мөрийн түгжээг хүлээгээд CLOSED-ийг харж татгалзана. (2) Хаах үед төлвийг ЭХЛЭЭД CLOSED болгож (мөр түгжигдэнэ), ДАРАА нь сэлбэг уншина → өмнө нь эхэлсэн сэлбэгийн transaction commit хийгдтэл UPDATE хүлээнэ. Хоёр чиглэлийг 2 psql session-оор шалгасан (хүлээгээд татгалзсан / хоцорсон сэлбэгийг харсан).
**Дүрэм:** Эцэг мөрийн төлвөөс хамаарч дэд мөр бичихийг хориглох trigger/код → эцэг мөрийг `FOR SHARE` (эсвэл `FOR UPDATE`)-ээр унш. "Төлөв солих + дэд мөрөөс snapshot" үйлдэлд төлвийг эхэлж сольж, дараа нь дэд мөрийг унш. Нэгээс олон хүсэлт нэг нөөцийг (өрөөний төлөв) суллах/түгжих бол нөөцийн мөрийг `FOR UPDATE`-аар түгж.

---

### [PROC-003] Ажлын хавтсанд тасарсан өмнөх оролдлогын commit хийгдээгүй файлууд үлдэж шинэ кодтой холилдсон
**Тохиолдсон:** Шат 8 багц 1 (web-shell). Өмнөх (хадгалагдаагүй, таны машин руу бичигдээгүй) оролдлогын `modules/camp/*`, `App.tsx`/`Layout.tsx` өөрчлөлт, e2e spec cloud-ийн хавтсанд үлдсэн байв. Шинэ кодын 4 файл хуучинг нь дарж бичиж, хоёр өөр бүтэц (`campApi.ts` ↔ `camp-api.ts`, `shiftPattern.ts` ↔ `shift-pattern.ts`, `routes.tsx` ↔ `CampRoutes.tsx`) зэрэгцэн оршсон; `App.tsx` хоёр давхар route-тэй болсон.
**Шийдэл:** Хуучин файлуудыг scratch руу нөөцлөөд устгасан; `App.tsx`, `Layout.tsx`-ийг HEAD-ээс сэргээгээд зөвхөн шинэ өөрчлөлтийг дахин хэрэглэсэн; таны машин дээр хуучин хувилбар байхгүйг (device_list_dir) шалгасан. Ашиглах боломжтой хэсгийг (e2e grant SQL, vitest config) хянаж, шинэ UI-д тааруулж үлдээсэн.
**Дүрэм:** Багц/шат эхлэхийн өмнө `git status --short`-ийг ЗААВАЛ шалгаж, untracked/modified файл бүрийн гарал үүслийг тодруулна. Шинэ файл бичихэд "created" биш "updated" гэсэн хариу ирвэл зогсож шалгана.

---

### [TEST-008] Playwright: `getByLabel`/`getByRole(name)` анхдагчаар том жижиг үсэг үл харгалзсан ДЭД мөр хайдаг
**Тохиолдсон:** Шат 8 багц 2 — хуурамч API-тай браузерын шалгалт, e2e dry-run. `getByLabel('Өрөө')` нь "Одоогийн өрөөг …" checkbox болон dialog-ийн `aria-label`-тай ("Өрөө шилжүүлэх") давхцаж strict mode алдаа өгсөн; `'Эхлэх огноо'`, `'Ээлж'` (↔ "Хэлтэс, ээлж" холбоос), `'1-р өдөр'` (↔ "11-р өдөр") мөн адил. `<span>{code}</span>{name}` хоорондоо зайгүй тул нэр "E1Бат" болж regex таараагүй. `<th>` нь `scope`-гүй үед columnheader гэж танигдаагүй.
**Шийдэл:** Тогтмол шошгод `{ exact: true }`; нэр/кодын хооронд `{' '}`; хүснэгтийн толгойд `scope="col"`; давтагдах элементэд (өрөөгүй ажилтны chip) `role="group"` + `aria-label`.
**Дүрэм:** e2e/UI тест бичихдээ богино шошгыг ЗААВАЛ `exact`; spec-ийг таны машинд өгөхөөс өмнө хуурамч backend дээр dry-run хийнэ (энэ удаа spec-ийн 2 selector-ийн алдааг илрүүлсэн).
**Дахин (багц 3, dry-run-аас ӨМНӨ кодыг уншихад илэрсэн):** `Modal`-ын "×" товч `aria-label="Хаах"` тул `getByRole('button', { name: /Хаах/ })` нь "Хаах (зардал бүртгэх)" товчтой давхцана → бүтэн нэрээр сонгосон. Дүрэм нэмэлт: цонх доторх товчийг сонгохдоо ui-kit-ийн өөрийн товчны нэр ("Хаах", "Болих")-тэй давхцах эсэхийг шалгана.

### [TEST-009] Playwright route interception multipart файлын агуулгыг дамжуулдаггүй (`postDataBuffer` хоосон)
**Тохиолдсон:** Шат 8 багц 2 — xlsx upload-ийн mock шалгалт "file талбар/xlsx алга" гэж унасан; бодит алдаа биш (CDP файл blob-ийг interception-д өгдөггүй).
**Шийдэл:** Upload-ийг `route.continue()`-ээр vite proxy → жижиг echo сервер (localhost:3000) руу бодитоор илгээж байт, boundary, файлын нэрийг шалгасан (6512 байт xlsx → 6750 байт multipart). UI урсгалын mock нь зөвхөн Content-Type-ийг шалгана. Мөн axios-ийн анхдагч `Content-Type: application/json` FormData-г JSON болгодог тул upload-д `'multipart/form-data'` гэж тодорхой өгсөн (boundary-г browser нэмнэ).
**Дүрэм:** Файл илгээх хүсэлтийг mock interception-ээр биш бодит HTTP-ээр шалгана; axios-ийн JSON анхдагчтай client-ээр FormData илгээхдээ Content-Type-ийг тодорхой заана.

### [FE-004] Шат 8 frontend — хуурамч API-тай браузерын шалгалтаар илэрсэн UI алдаанууд (хэрэглэгчид хүрэхээс өмнө зассан)
**Тохиолдсон:** Шат 8 багц 1–2 (cloud дээр tsc/eslint + 1400px/390px браузер шалгалт).
1. `// eslint-disable-next-line react-hooks/exhaustive-deps` → web-shell-ийн eslint-д react-hooks plugin **байхгүй** тул "Definition for rule … was not found" алдаа. **Шийдэл:** ийм comment бичихгүй; dependency-г зөв өгөх эсвэл логикийг effect-ээс гаргах.
2. Браузерын native validation (`required`, `type=number`) **англи** мессеж харуулсан. **Шийдэл:** form-д `noValidate`, шалгалтыг монгол мессежтэйгээр өөрсдөө (эсвэл backend-ийн монгол алдааг `ErrorBox`-оор).
3. 390px-д хэвтээ гүйлгээ гарсан (grid, урт товч, nav). **Шийдэл:** `grid-cols-1 sm:grid-cols-N`, Card-д `min-w-0`, товчинд `whitespace-nowrap`, nav `flex-wrap`/`overflow-x-auto`; хүснэгт card дотроо гүйлгэгдэнэ.
4. Tailwind class давхцал (`inputCls` + `py-1 text-sm` → аль нь ялах нь CSS-ийн дарааллаас хамаарна). **Шийдэл:** тусдаа `inputSmCls` хувилбар.
5. `window.prompt` (нэр засах) — тест хийх боломжгүй, mobile-д муу. **Шийдэл:** inline засвар.
**Дүрэм:** UI багц бүрийг хэрэглэгчид өгөхөөс өмнө 1400px + 390px-д `scrollWidth ≤ innerWidth` шалгаж, screenshot-оор нүдээр харна; native dialog/validation ашиглахгүй.

### [PROC-004] Баримт засахад Python `open()` текст горим CRLF файлыг бүхэлд нь LF болгосон
**Тохиолдсон:** Шат 9 — `CHANGELOG.md`, `project-status.md`, `00_rules_and_context.md` (CRLF) дээр хэдхэн мөр нэмэхэд `git diff --stat` 387/328/168 мөр өөрчлөгдсөн гэж харуулсан (universal newlines уншихдаа `\r\n` → `\n`, бичихдээ `\n`). Төхөөрөмж рүү хадгалахаас ӨМНӨ илэрсэн.
**Шийдэл:** Мөрийн төгсгөлийг сэргээсэн (`sed 's/$/\r/'`) → diff зөвхөн нэмсэн мөрүүд.
**Дүрэм:** Засварлах скриптэд `open(p, newline='')`; засварын дараа `git diff --stat`-ийн мөрийн тоо нь бодит өөрчлөлттэй таарч байгааг заавал шалгана (CRLF: `App.tsx`, `Layout.tsx`, `web-shell/package.json`, эдгээр 3 баримт).

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
**Дүрэм:** Танд өгөх команд бүрийг төслийн `package.json` script-ээс (эсвэл `pnpm <bin>`) авна — глобал суулгалт гэж үзэхгүй; заавар бичихээс өмнө `docs/07_.../02_Local_Supabase_Docker_Windows.md`-ийн командтай тулгана.

### [DOC-001] Баримт кодоос хоцорсон: runbook `pnpm db:push` зөвлөдөг (MIG-001-тэй зөрчилдөнө), INDEX `v0.4.0`, CHANGELOG-д хэрэгжээгүй төлөвлөгөө
**Тохиолдсон (Phase 6.2 аудит):** `02_Local_Supabase_Docker_Windows.md` §1.6 + README "Migration ажиллуулах: `pnpm db:push`"; `docs/INDEX.md` хуучин дугаарлалт (`v0.4.0`) ба байхгүй `docs/tasks/*`; CHANGELOG `[Unreleased]` = schema-per-tenant (цуцлагдсан); `00_index.md` Sprint 9–11 "хүлээгдэж байна"; `.env.example`/VPC жишээ `postgres` (RLS алгасна); `CLUSTER_RESTART_*`, `SYSTEM_DATABASE_URL` root compose-д алга.
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

## Changelog

| Огноо | Нэмэгдсэн зүйл |
|-------|----------------|
| 2026-10-10 | §19 (Phase 6.4.7): CONC-002 (зэрэгцээ MR дугаар), TEST-015 дүгнэлт засав |
| 2026-10-10 | §19 (Phase 6.4): CI-004 (CI script/env хоцорсон) |
| 2026-10-10 | §19 (Phase 6.3): TEST-015 (dev + integration зэрэг → flaky) |
| 2026-10-10 | §19 (Phase 6.2): DOC-001 (баримт кодоос хоцорсон) |
| 2026-10-10 | §19: PROC-007 (заавар → `pnpm supabase:*`) |
| 2026-10-10 | §19 (Phase 6.1): TEST-014 (`pnpm test` ↔ e2e, fixture, auth rate limit) |
| 2026-10-10 | §19 (Phase 6.0b): SEC-004 (MR батлалт workflow/role/өөрийгөө батлахыг шалгадаггүй) |
| 2026-10-10 | §19 (Phase 6.0): PROC-006 (ижил staged нэр → хуучин агуулга), FE-005 (цэвэр логик API импортгүй), TEST-013 (harness headless_shell) |
| 2026-10-10 | §18 (Phase 5): EVT-001, EVT-002/003, TEST-012 |
| 2026-10-10 | §17 (Phase 4.9): SEC-003, API-001, HTTP-001; route probe тест |
| 2026-10-10 | §17 (Phase 4.8.5): SEC-002 (workflow definition cross-tenant update), TEST-011; RLS-004 шийдэл |
| 2026-10-10 | §17 (Phase 4.8.3): RLS-007 (set_config transaction-ий гадна), CACHE-001 (MR cache), TEST-010 (Prisma wasm harness) |
| 2026-10-10 | §17 (Phase 4.8.2): RLS-005 (буруу GUC policy), RLS-006 (`current_tenant_id` NULLIF) |
| 2026-10-10 | §16 (Phase 3.6): CURSOR-001, BUILD-001, CLUSTER-001, LOG-001, PROC-005; SEED-002 → `pnpm dev:test-user` |
| 2026-10-10 | §15: PROC-004 (Python CRLF → LF) |
| 2026-10-10 | §15: FE-004 (Шат 8 UI — lint, native validation, mobile, Tailwind, prompt); Шат 9 аудит: Шат 1–8-ын алдаа бүгд бүртгэгдсэн |
| 2026-10-10 | §15: TEST-008 нэмэлт (Modal-ын "×" = "Хаах" давхцал, багц 3) |
| 2026-10-10 | §15: TEST-008 (Playwright шошгын дэд мөр), TEST-009 (interception multipart) |
| 2026-10-10 | §15: PROC-003 (тасарсан оролдлогын үлдэгдэл файл) |
| 2026-10-09 | §15: CONC-001 (засвар хаах ↔ сэлбэг race, trigger `FOR SHARE`); VALID-001 дүрэм (3) хэрэгжсэн (`configureApp`) |
| 2026-10-09 | §15: VALID-001 (implicit conversion → boolean query буруу) |
| 2026-10-09 | §15: PRISMA-003 (Prisma алдааны мессеж escape-тэй) |
| 2026-10-09 | §15: ENV-009 (PowerShell pipe → кирилл `?`), TEST-007 (Supabase `postgres` superuser биш), ENV-010 (хавтас зөөхөд pnpm junction тасрах) |
| 2026-10-08 | ENV-007 (Playwright Chromium), ENV-008 (web-shell `VITE_API_BASE_URL` → CORS) нэмэв |
| 2026-10-08 | §12: SEED-001, ENV-001~005 нэмэв (шинэ машин дээр Supabase on Docker тохиргоо) |
| 2026-10-08 | TEST-006 нэмэв |
| 2026-10-08 | TEST-005 нэмэв |
| 2026-10-08 | RLS-004, MIG-001, TEST-004, ASYNC-001 нэмэв (Phase 4.1) |
| 2026-10-08 | PERF-003, SEED-002 нэмэв (Phase 3.7) |
| 2026-10-08 | PERF-001, PERF-002, PROC-002 нэмэв (Phase 3) |
| 2026-10-08 | TEST-003, RL-001 нэмэв (Phase 2.9) |
| 2026-10-08 | SEC-001, TEST-002 нэмэв (Phase 2.8) |
| 2026-10-08 | ENV-006 нэмэв (Windows Prisma DLL lock) |
| 2026-10-08 | ARCH-001, PROC-001 нэмэв (Phase 2, ADR-001) |
| 2026-10-08 | CI-001~003, TEST-001 нэмэв (Phase 1 CI засвар) |
| 2026-10-08 | Root `lessons_learned.md` (S5-E1~E16, META чеклист)-г 10-р хэсэг болгон нэгтгэв. Үндсэн файл = `docs/lessons_learned.md` |
| 2026-09-21 | Бүх MVP + Sprint 5 алдааг нэгтгэж бүтэцтэй болгосон. RULE хөндлөн лавлагаа нэмсэн. |
| 2026-09-20 | MVP 4 аудит: ENUM-001/002, DI-001~003, SQL-001, CONFIG-001 нэмсэн |
| 2026-09-20 | RLS-001, PATCH-001, DI-008, DI-009, RESOLVE-001 нэмсэн |
| 2026-09-20 | FE-001, FE-002, FE-003 нэмсэн |
