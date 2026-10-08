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
**Цаашид:** `pnpm dev:test-user` script (Phase 3.6.5 — санал).

---

## Changelog

| Огноо | Нэмэгдсэн зүйл |
|-------|----------------|
| 2026-10-08 | §12: SEED-001, ENV-001~005 нэмэв (шинэ машин дээр Supabase on Docker тохиргоо) |
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
