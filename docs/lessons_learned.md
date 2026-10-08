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
| RLS-003 | Empty UUID cast | null UUID ашиглах → RULE-16 |
| RESOLVE-001 | pnpm import type | `import type` → RULE-09 |
| VITEST-001 | Worker memory | pool: forks → RULE-18 |
| FE-001 | Pagination wrapper | `res.data.data` → RULE-17 |
| FE-002 | Vite CORS | `VITE_API_BASE_URL=''` → RULE-19 |
| FE-003 | DTO mismatch | Backend DTO шалгах → RULE-20 |

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

## Changelog

| Огноо | Нэмэгдсэн зүйл |
|-------|----------------|
| 2026-09-21 | Бүх MVP + Sprint 5 алдааг нэгтгэж бүтэцтэй болгосон. RULE хөндлөн лавлагаа нэмсэн. |
| 2026-09-20 | MVP 4 аудит: ENUM-001/002, DI-001~003, SQL-001, CONFIG-001 нэмсэн |
| 2026-09-20 | RLS-001, PATCH-001, DI-008, DI-009, RESOLVE-001 нэмсэн |
| 2026-09-20 | FE-001, FE-002, FE-003 нэмсэн |
