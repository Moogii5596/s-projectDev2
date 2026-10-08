# S Project — Lessons Learned

## Migration алдаанууд

### [0004] CHECK constraint + ALTER TYPE алдаа
**Алдаа:** `operator does not exist: "TierType" = text`
**Шалтгаан:** CHECK constraint байхад native enum руу ALTER TYPE хийхэд PostgreSQL re-validate хийж text operator байхгүй болно.
**Шийдэл:** DROP CHECK constraints ЭХЛЭЭД, дараа нь CREATE ENUM → ALTER TYPE.

### [0004] Partial index + ALTER TYPE алдаа
**Алдаа:** `operator does not exist: "OutboxStatus" = text`
**Шалтгаан:** `WHERE status IN ('PENDING','FAILED')` гэсэн text WHERE clause-тай partial index байхад column type өөрчлөхөд алдаа гарна.
**Шийдэл:** DROP indexes → DROP CHECK → CREATE ENUM → ALTER TYPE → RECREATE indexes (энэ дарааллыг чанд баримт!).

---

## RLS тест алдаанууд

### Superuser нь RLS bypass хийдэг
**Алдаа:** postgres-ээр холбогдоход `FORCE ROW LEVEL SECURITY` ч гэсэн ажилладаггүй (superuser бүх policy bypass хийдэг).
**Шийдэл:** Dual PrismaClient pattern — `prismaAdmin` (postgres, setup/teardown) + `prismaRls` (app_user, бодит RLS тест).

### SET LOCAL transaction-гүйгээр ажиллахгүй
**Алдаа:** `SET LOCAL app.tenant_id` гэдэг нь explicit transaction-гүйгээр идэвхгүй — Prisma implicit transaction-д тус бүр шинэ connection авдаг.
**Шийдэл:** `prismaRls.$transaction(async tx => { await tx.$executeRawUnsafe("SET LOCAL ..."); return tx.model.findMany(); })`

### SET ROLE / SET SESSION AUTHORIZATION эрх хэрэгтэй
**Алдаа:** `permission denied to set role "app_user"` — postgres нь app_user-ийн member биш.
**Алдаа:** `permission denied to set session authorization` — Supabase local postgres нь true superuser биш.
**Шийдэл:** Role switch хийхийн оронд шууд app_user-ээр холбогдох URL ашиглах.

### Empty string UUID cast алдаа
**Алдаа:** `SET LOCAL app.tenant_id = ''` → `invalid input syntax for type uuid: ""` (22P02)
**Шалтгаан:** RLS policy нь `current_setting('app.tenant_id')::uuid` хийдэг тул хоосон string cast хийж чадахгүй.
**Шийдэл:** `'00000000-0000-0000-0000-000000000000'` (valid ч ямар ч tenant-тэй таарахгүй UUID) ашиглах.

---

## Prisma алдаанууд

### $use middleware + $executeRaw → Infinite Loop → JS heap out of memory
**Алдаа:** Worker terminated due to reaching memory limit (4GB+)
**Шалтгаан:** Prisma `$use` middleware нь `executeRaw`/`queryRaw`-г ч гэсэн intercept хийдэг. Middleware дотор `this.$executeRaw` дуудвал рекурс loop үүсгэж RAM дуусдаг.
**Шийдэл:** Middleware-д guard нэмэх:
```typescript
if (params.action === 'executeRaw' || params.action === 'queryRaw') {
  return next(params);
}
```

---

## AuthService алдаанууд

### getMe()-д буруу ID дамжуулах
**Алдаа:** `getMe(login.user.id, tenantId)` → хэрэглэгч олдохгүй (UnauthorizedException)
**Шалтгаан:** `login.user.id` нь database UUID (`coreUser.id`), харин `getMe(authId, ...)` нь Supabase Auth UUID (`authId`) хүлээдэг — хоёр өөр UUID.
**Шийдэл:** `AuthResponse`-д `authId` нэмж, тестэд `login.user.authId` ашиглах.

---

## Vitest тохиргоо

### Worker threads memory limit
**Алдаа:** Integration test-үүд worker threads-д ажиллахад memory limit хүрдэг.
**Шийдэл:** `vitest.integration.config.ts`-д `pool: 'forks'` + `singleFork: true` + `--max-old-space-size=4096` нэмэх.

---

## Аудит 2026-09-20 — 5 Хатуу Стандарт (Системийн Засвар)

### [ENUM-001] Prisma Enum magic string зөрчил
**Алдаа файл:** `test/tenant-auth-guard.integration.spec.ts:63`
**Алдаа:** `tier: TierType.tier1` — `.tier1` нь DB @map утга, TypeScript enum биш
**Шалтгаан:** Prisma schema-д `TIER1 @map("tier1")` гэж тодорхойлогдсон тул TypeScript дэх нэр нь `TIER1`, DB-д хадгалагдах утга нь `tier1`.
**Шийдэл:** `tier: TierType.TIER1` — **ЗААВАЛ** `import { TierType } from '@prisma/client'` хийж, enum-ийн TypeScript нэрийг ашиглах.
**Дүрэм:** Prisma Enum-ийг хэзээ ч string literal-аар `"tier1"`, `"DRAFT"`, `"REQUESTER"` гэж бичиж болохгүй.

### [ENUM-002] Magic string enum бүх тестэд
**Алдаа файл:** `test/rls-leakage.integration.spec.ts`
**Алдаа:** `role: 'REQUESTER'`, `status: 'DRAFT'`, `status: 'PENDING_APPROVAL'`
**Шийдэл:** `UserRole.REQUESTER`, `MrStatus.DRAFT`, `MrStatus.PENDING_APPROVAL` + import нэмэх.

### [DI-001] afterAll optional chaining дутуу
**Алдаа файл:** Бүх интеграци тест
**Алдаа:** `await prismaAdmin.$disconnect()` — beforeAll-д алдаа гарвал prismaAdmin=undefined → secondary crash
**Шийдэл:** `await prismaAdmin?.$disconnect()` — `?.` optional chaining ЗААВАЛ.
**Дүрэм:** afterAll/afterEach дотор app, prisma, supabase зэрэг БҮГД `?.` ашиглах.

### [SQL-001] $executeRawUnsafe → SQL injection эрсдэл
**Алдаа файл:** `test/rls-leakage.integration.spec.ts`, `test/auth.integration.spec.ts`
**Алдаа:** `` await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`) ``
**Шийдэл:** `` await tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}` `` (tagged template = parameterized)
**Дүрэм:** `$executeRawUnsafe` нь ЗӨВХӨН статик string-д зориулагдсан. Хувьсагч орвол заавал `$executeRaw` tagged template ашиглах.

### [CONFIG-001] ConfigService defensive fallback
**Алдаа файл:** `src/config/env.config.ts`
**Алдаа:** `configService.get('KEY')` — ConfigModule inject хийгдээгүй тест/орчинд `undefined` буцааж Zod validation crash болно
**Шийдэл:** `configService.get('KEY') ?? process.env['KEY']` — process.env fallback нэмэх.
**Дүрэм:** EnvConfig-д ConfigService → process.env fallback ЗААВАЛ байна.

### [DI-002] providers[] vs overrideProvider — ConfigService зөрчил
**Алдаа файл:** `test/tenant-auth-guard.integration.spec.ts`
**Алдаа:** `Test.createTestingModule({ providers: [{ provide: ConfigService, useValue: {...} }] })` — providers[] дотор ConfigService тавих нь AppModule-ийн `ConfigModule.forRoot({ isGlobal: true })` -тай зөрчилдөж, AuthModule-ийн child DI (TenantCacheService гэх мэт) -г тасалдуулж `undefined` болгодог.
**Шалтгаан:** Test module-ийн `providers[]` нь root scope-д нэмэгдэх бол `isGlobal` ConfigModule нь module tree бүхэлд нөлөөлдөг — хоёр ConfigService instance тодорхойлогдоход NestJS DI resolution алдаа гаргадаг.
**Шийдэл:** `providers[]` дотор ХЭЗЭЭ ч override хийж болохгүй. ЗААВАЛ `.overrideProvider(ConfigService).useValue({...})` ашиглах.
**Дүрэм:** Тест модульд existing provider override хийхдээ `.overrideProvider()` chain ЗААВАЛ ашиглах. `providers[]` нь зөвхөн шинэ (module tree-д байхгүй) provider-т зориулагдсан.

### [DI-003] Controller-ийн service dependency mock хийх шаардлага
**Алдаа файл:** `test/tenant-auth-guard.integration.spec.ts`
**Алдаа:** `TypeError: Cannot read properties of undefined (reading 'getTenantId')` at `auth.controller.ts:79`
**Шалтгаан:** `TenantCacheService` нь `PrismaTenantClientService` + `REDIS_CLIENT` хамааралтай. Integration тест орчинд энэ dependency chain DI зөрчил болж, `AuthController.tenantCacheService` нь `undefined` болдог.
**Шийдэл 1 (src):** `this.tenantCacheService?.getTenantId(slug) ?? null` — `?.` optional chaining нэмэх (defensive coding).
**Шийдэл 2 (test):** `.overrideProvider(TenantCacheService).useValue({ getTenantId: async (slug) => prismaAdmin.$queryRaw\`SELECT id FROM tenants WHERE slug = ${slug}...\`, invalidate: async () => {} })` — mock provider тавих.
**Дүрэм:** Controller-ийн гаднах сервис (Redis, Cache) -тэй холбоотой бүх методод `?.` optional chaining тавих. Тестэд external-dependent сервисүүдийг заавал mock хийх.

---

## 2026-09-20 — RLS + Instance Patch алдаанууд

### [RLS-001] SET LOCAL нь implicit transaction-аас хэтэрдэггүй
**Алдаа файл:** `src/auth/auth.service.ts` — `getMe()`
**Алдаа:** `$executeRaw(set_config('app.tenant_id', id, true))` → implicit TX1 commit → `findFirst` нь TX2-д ажиллана → `app.tenant_id` тохируулагдаагүй → RLS policy `''::uuid` cast → `22P02: invalid input syntax for type uuid: ""` → 500
**Шалтгаан:** `set_config(..., is_local=true)` нь ЗӨВХӨН одоогийн transaction-д хүчинтэй. Prisma-д `$executeRaw` болон `findFirst` тус бүр өөрийн implicit transaction-д ажилладаг. Тиймээс TX1-д тохируулсан setting TX2-д алга болдог.
**Шийдэл:** `this.prisma.$transaction(async tx => { await tx.$executeRaw(set_config); return tx.model.findFirst() })` — НЭГДСЭН transaction-д ажиллуулна. Middleware-ийн `this.$executeRaw` нь outer client-аар ажиллах тул TX-д нөлөөлөхгүй (harmless).
**Дүрэм:** `set_config(..., true)` болон дараа нь RLS-тай query хамт ажиллах БҮХЭН нэгдсэн `$transaction()` дотор байх ёстой.

### [PATCH-001] Prototype patch нь Vitest ESM interop-д ажиллахгүй
**Алдаа файл:** `test/tenant-auth-guard.integration.spec.ts`
**Алдаа:** `const { AuthService } = await import('...')` → `AuthService.prototype.getMe = patchFn` → `[DEBUG] PROTO getMe called` хэзээ ч гарахгүй
**Шалтгаан:** Vitest-ийн ESM module loader нь Node.js-ийн CommonJS require() cache-тэй ТУСДАА байж болно. Тиймээс test-н `import()` болон NestJS-ийн `require()` өөр `AuthService` class instance ашигладаг → prototype patch нь NestJS-ийн instance-д нөлөөлдөггүй.
**Шийдэл:** `app.get(AuthService)` → DI singleton instance → `instance.getMe = patchFn` — Instance-ийн өөрийн property нь prototype-с ЭРЭМБИЙН ДЭГ хайгддаг тул 100% найдвартай. Prototype patch-ийн оронд instance patch хэрэглэ.
**Дүрэм:** NestJS тестэд prototype patch ХЭЗЭЭ Ч хэрэглэж болохгүй. `app.get(ServiceClass).method = mock` гэж instance-д шууд хийх.

---

### [DEP-001] @nestjs/mapped-types суулгаагүй — PartialType ашиглах боломжгүй [MVP.3]
- **Тохиолдол**: `UpdateMrDto` дотор `PartialType(CreateMrDto)` ашиглах гэхэд `@nestjs/mapped-types` package.json-д байхгүй
- **Шийдэл**: Бүх optional талбарыг `@IsOptional()` decorator-тэй гараар тодорхойлох
- **Дүрэм**: `@nestjs/mapped-types` суулгаагүй бол `PartialType/OmitType/PickType` ашиглах боломжгүй — `package.json`-д байгаа эсэхийг эхлээд шалгах

---

### [MODULE-001] AuthModule-г MaterialRequisitionModule-д import хийх [MVP.3]
- **Шалтгаан**: `@UseGuards(TenantAuthGuard)` + `@UseInterceptors(TenantContextInterceptor)` нь DI-аар resolve хийгддэг
- **Шийдэл**: `MaterialRequisitionModule`-д `imports: [AuthModule]` нэмэх
- **Тайлбар**: `DatabaseModule` нь `@Global()` тул `PrismaTenantClientService` автоматаар inject хийгдэнэ, гэхэн AuthModule `@Global()` биш тул заавал import хийх хэрэгтэй

---

### [AUTH-001] request.user.id ≠ core_users.id — Supabase authId vs PostgreSQL UUID [MVP.3]
- **Алдаа**: `MrHeader.requesterId` FK constraint violation → Prisma FK error → unhandled exception → 500
- **Шалтгаан**: `TenantAuthGuard` нь `request.user = { id: user.id, ... }` гэж тохируулдаг ба `user.id` нь **Supabase auth UUID (authId)**, харин `MrHeader.requesterId` нь **`core_users.id` (PostgreSQL UUID)** руу FK байдаг. Эдгээр хоёр UUID өөр өөр.
- **Шийдэл**: Service-д `resolveUserId(tenantId, authId)` private helper нэмж, `create/update/remove` методуудад `authId → core_users.id` хөрвүүлэх:
  ```typescript
  private async resolveUserId(tenantId: string, authId: string): Promise<string> {
    const user = await this.prisma.coreUser.findFirst({
      where: { authId, tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Хэрэглэгч олдсонгүй');
    return user.id;
  }
  ```
- **Дүрэм**: `request.user.id` = Supabase auth UUID (authId) ҮРГЭЛЖ. FK reference хийхдээ **заавал** `core_users.id` руу resolve хийх. Guard-ийн user object-д `authId` ба `coreUserId` хоёуланг нь тавих нь илүү тодорхой байх болно.

---

### [PRISMA-001] Supabase RLS + Prisma: @db.Uuid annotation заавал шаардлагатай
- **Алдаа**: `cannot alter type of a column used in a policy definition` — `tenant_isolation_users_select` policy нь `tenant_id` column-д хамаарна
- **Шалтгаан**: Prisma schema-д `String` талбарт `@db.Uuid` байхгүй бол Prisma тэдгээрийг `TEXT` гэж ойлгоно. Тиймээс одоо байгаа `UUID` column-уудыг `TEXT` болгохоор оролдоход PostgreSQL-ийн RLS policy-тай мөргөлдөж алдаа гарна.
- **Шийдэл**: Бүх UUID column-д `@db.Uuid` annotation нэмэх:
  ```prisma
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  ```
- **Дүрэм**: Supabase ашиглах бүрт `id`, `tenantId`, FK болон `authId` зэрэг UUID талбар БҮРТ `@db.Uuid` заавал байх ёстой. Шинэ model нэмэх бүрт энэ annotation-ийг шалгах.

---

## Алдаа #8: `mrList.map is not a function` — Pagination Wrapper

**Огноо:** 2026-09-20  
**Файл:** `apps/web-shell/src/api/requisitions.ts`  
**Алдааны мессеж:** `TypeError: mrList.map is not a function`

### Шалтгаан
Backend `GET /api/v1/requisitions` нь plain array биш, **pagination wrapper** буцааж байна:
```json
{ "data": [...], "total": 10, "page": 1, "limit": 20 }
```
Харин frontend нь `res.data` (бүтэн wrapper объект)-г `MrHeader[]` гэж хүлээж авсан тул `.map()` ажиллаагүй.

### Зөв шийдэл
```ts
// ❌ Буруу
const res = await apiClient.get<MrHeader[]>(BASE)
return res.data

// ✅ Зөв
const res = await apiClient.get<PaginatedMrResponse>(BASE)
return res.data.data   // wrapper-ийн доторх array
```

### Дүрэм
Backend API-н response format-г шалгаж type-г зөв тодорхойлох. Pagination ашиглах үед `{ data, total, page, limit }` wrapper-ийг `res.data.data` гэж авна.

---

## Алдаа #9: CORS — Vite Proxy алгасагдсан

**Огноо:** 2026-09-20  
**Файл:** `apps/web-shell/.env`, `src/api/client.ts`

### Шалтгаан
`VITE_API_BASE_URL=http://localhost:3000` тохируулснаар Axios шууд `http://localhost:3000` (cross-origin) руу хандсан. Vite proxy (`/api` → `localhost:3000`) ажиллаагүй.

### Зөв шийдэл
```env
# ВИТЕ proxy ашиглахын тулд baseURL хоосон байх ёстой
VITE_API_BASE_URL=
```
```ts
baseURL: import.meta.env.VITE_API_BASE_URL || '',
// '' → same-origin → Vite proxy → CORS алга
```

### Дүрэм
Dev орчинд API хандалт Vite proxy-оор хийгдэх ёстой. `VITE_API_BASE_URL` хоосон байна → relative URL → proxy → CORS-гүй.

---

## Алдаа #10: 400 Bad Request — DTO Field Name Mismatch

**Огноо:** 2026-09-20  
**Файл:** `apps/web-shell/src/types/mr.types.ts`, `MRCreatePage.tsx`

### Шалтгаан
Frontend `CreateMrItemDto`-н field names backend DTO-тай таарахгүй байсан:

| Frontend (буруу) | Backend DTO (зөв) |
|---|---|
| `itemName` | `description` |
| `unit` | `unitOfMeasure` |

Backend `class-validator` validation-оор 400 буцаана.

### Зөв шийдэл
Frontend type болон form-г backend DTO-тай нэг адил field names ашиглахаар засах.

### Дүрэм
**Backend DTO-н field names-г эхлээд шалгаж** frontend type бич. `create-mr-item.dto.ts` файлыг харах.

---

## Алдаа #11: 404 — core_users дутуу бичлэг (resolveUserId)

**Огноо:** 2026-09-21  
**Файл:** `apps/core-kernel/src/modules/material-requisition/services/material-requisition.service.ts`

### Шалтгаан
`admin@test.mn` хэрэглэгч Supabase `auth.users`-д бүртгэлтэй байсан ч `core_users` хүснэгтэд тохирох record байгаагүй. `resolveUserId()` нь `core_users.findFirst({ where: { authId, tenantId } })` → `null` → `NotFoundException` → HTTP 404 буцаадаг. Харин `GET` endpoints (`findAll`, `findOne`) `resolveUserId()` дуудахгүй тул зөв ажилладаг байсан.

```typescript
private async resolveUserId(tenantId: string, authId: string): Promise<string> {
  const user = await this.prisma.coreUser.findFirst({
    where: { authId, tenantId }, select: { id: true },
  });
  if (!user) throw new NotFoundException('Хэрэглэгч олдсонгүй'); // ← 404
  return user.id;
}
```

### Шийдэл
1. Supabase Studio SQL Editor-т `core_users`-д INSERT хийж засав.
2. Seed script-д auth user бүрт `core_users` record нэмсэн — дахин суулгахад автоматаар үүснэ.

### Дүрэм
- Шинэ орчинд суулгасны дараа seed script нь `auth.users` болон `core_users` **хоёуланг нь** үүсгэх ёстой.
- `resolveUserId()` дуудах бүх endpoint (create, update, remove, submit, approve, reject)-д тохирох `core_users` record заавал байна.
- Хэрэглэгч нэмэхдээ `auth.users` + `core_users` хоёуланг синк байлгах (AuthService.register() аль хэдийн хийдэг — seed-д ч мөн адил байх).

---

## [DI-008] Module Double-Import → APP_GUARD useExisting Pattern

**Алдааны шинж**: Тест `app.get(TenantAuthGuard)` ашиглан guard-ийг patch хийдэг ч HTTP 500 буцаж байсан (`this.configService is undefined`, `this.mrService is undefined`).

**Шалтгаан**: `MaterialRequisitionModule` нь `AuthModule`-ийг импортлосноор NestJS **хоёр тусдаа DI scope** үүсгэдэг:
1. `AppModule → AuthModule` → нэг `TenantAuthGuard` instance (test patch хийсэн)
2. `AppModule → MaterialRequisitionModule → AuthModule` → **өөр** `TenantAuthGuard` instance (patch хийгдээгүй)

MR controller нь 2-р instance-ийг ашигладаг учир `overrideProvider(ConfigService)` хүрдэггүй.

**Зөв шийдэл**:
1. `MaterialRequisitionModule.imports`-аас `AuthModule`-ийг **устга**
2. `AppModule.providers`-д глобал бүртгэл хий:
   ```typescript
   { provide: APP_GUARD, useExisting: TenantAuthGuard },
   { provide: APP_INTERCEPTOR, useExisting: TenantContextInterceptor },
   ```
3. `useExisting` ашигладаг учир `AuthModule`-ийн экспортлосон instance-ийг дахин ашигладаг → `app.get(TenantAuthGuard)` нь ЯАГААД ЧΗΩ globally applied guard-тай адил instance байна
4. Controller дээрх `@UseGuards` / `@UseInterceptors` decorator-уудыг устга (APP_GUARD/APP_INTERCEPTOR автоматаар бүх route-д хэрэглэгдэнэ)

**Дүрэм**: Нэг guard/interceptor-ийг олон дахин module-д импортлох ХОРИГЛОНО. Ганцхан APP_GUARD useExisting ашиглана.

---

## [DI-009] vitest/esbuild emitDecoratorMetadata дэмжилтгүй → SWC ашиглах

**Алдааны шинж**: Integration тестүүдэд NestJS DI-р тарьсан БҮХИЙ Л dependency (`configService`, `tenantCacheService`, `mrService`, `authService`) `undefined` буцаж байсан. HTTP 500 алдаа гарч байсан.

**Жишээ алдаанууд**:
- `TypeError: Cannot read properties of undefined (reading 'get')` — `tenant-auth.guard.ts:34` (`this.configService`)
- `TypeError: Cannot read properties of undefined (reading 'create')` — `material-requisition.controller.ts:34` (`this.mrService`)

**Үндсэн шалтгаан**: `vitest` анхдагч байдлаар `esbuild`-ийг TypeScript transformer болгон ашигладаг. Гэвч `esbuild` нь `emitDecoratorMetadata: true` TypeScript тохиргоог **огт дэмждэггүй**. Ингэснээр:
1. `Reflect.getMetadata('design:paramtypes', ClassName)` → `undefined` буцдаг
2. NestJS IoC container constructor parameter types-ийг тодорхойлж чадахгүй
3. БҮХИЙ Л constructor injection → `undefined`

`tsconfig.json`-д `"emitDecoratorMetadata": true` байсан ч vitest esbuild-ийг ашигладаг тул **тэр тохиргоог огт уншдаггүй**.

**Зөв шийдэл**: `unplugin-swc` + `@swc/core` суулгаж, `vitest.integration.config.ts`-д SWC plugin нэмэх:

```typescript
// vitest.integration.config.ts
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'commonjs' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true },
      },
    }),
  ],
  // ... test config
});
```

**package.json devDependencies нэмсэн**:
```json
"unplugin-swc": "^1.4.4",
"@swc/core": "^1.7.26"
```

**Нэмэлт хамгаалалт**: `tenant-auth.guard.ts`-д `process.env` fallback нэмэх:
```typescript
const supabaseUrl = this.configService?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL']!;
const supabaseAnonKey = this.configService?.get<string>('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY']!;
```

**Дүрэм**: NestJS + vitest хослолд ЗААВАЛ `unplugin-swc` ашиглах. esbuild decorator metadata дэмждэггүй тул NestJS DI хэзээ ч ажиллахгүй.

---

## [RESOLVE-001] pnpm strict-mode transitive dep → vite "Failed to load url" алдаа

**Алдааны шинж**: `Error: Failed to load url fastify (resolved id: fastify) in material-requisition.controller.ts`

**Шалтгаан**: pnpm strict-mode-д зөвхөн шууд (direct) dependency-ууд `node_modules/<pkg>` symlink авдаг. `fastify` нь `@nestjs/platform-fastify`-ийн transitive dependency тул `apps/core-kernel/node_modules/fastify` symlink байхгүй. vite module resolve хийхдээ энэ symlink-г хайж олохгүйгээр `Failed to load url fastify` crash болдог.

**Зөв шийдэл**: Зөвхөн type annotation болгон ашиглаж буй import-уудыг `import type` болгон солих:
```typescript
// БУРУУ — vite runtime-д resolve хийхийг оролдоно
import { FastifyRequest } from 'fastify';

// ЗӨВХӨН — TypeScript compile-д erase болж, vite resolve хийхгүй
import type { FastifyRequest } from 'fastify';
```

**Дүрэм**: Controller болон бусад файлд зөвхөн type-д ашиглаж буй БҮХИЙ Л гадаад package import-уудыг `import type` болгох. Энэ нь pnpm strict-mode болон vite module resolution аль аль-д тохирсон зөв TypeScript хэрэглүүр.
