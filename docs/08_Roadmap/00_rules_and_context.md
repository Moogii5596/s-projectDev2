---
title: "RULE-01~21 — хатуу дүрэм (код бичих)"
type: "Guide"
status: "Active"
last_updated: 2026-10-13
tags: [rules]
---

# RULE-01~21 — хатуу дүрэм (код бичих)

> Хураангуй (нэг мөрөөр) [[CONTEXT]]-д; жишээ кодтой загвар [[08_Patterns]]-д. Энэ файл — **бүтэн текст ба шалтгаан**: дүрэм эргэлзээтэй үед л унш.
> Дүрэм өөрчлөх / нэмэх → энд + [[CONTEXT]]-ийн хураангуй + [[08_Patterns]] §1. Хуучин хэсгүүд (codebase v0.1.0, MVP, sprint файлууд): [[00_rules_codebase_v0.1]] — архив.

## ⚠️ ХАТУУ ДҮРМҮҮД (RULE-01 ~ RULE-21)

> Алхам болгонд шалгана. Зөрчвөл тест улаан болно.

### 🔷 DI / Module дүрмүүд

- **RULE-01** `overrideProvider()` → зөвхөн БАЙГАА provider солих. Шинэ → `providers: []`-д нэмнэ.
- **RULE-07** Guard/Interceptor → `AppModule`-д `{ provide: APP_GUARD, useExisting: XGuard }` ЗААВАЛ. Controller-д `@UseGuards` хэрэггүй. **`useClass` биш `useExisting`!**
- **RULE-08** NestJS + vitest → `unplugin-swc` суулгасан байна (`devDeps`-д аль хэдийн байна). esbuild нь `emitDecoratorMetadata` дэмждэггүй — бүх DI undefined болно.

### 🔷 Prisma / Database дүрмүүд

- **RULE-02** Prisma Enum → `import { MyEnum } from '@prisma/client'` — `as const` / string literal ХОРИГЛОНО.
- **RULE-03** RLS тохируулга → `SELECT set_config('app.tenant_id', ${tenantId}, true)` — `SET LOCAL` ХОРИГЛОНО.
- **RULE-04** `$executeRaw` + model query → ЗААВАЛ нэгдсэн `$transaction(async tx => { ... })` дотор.
- **RULE-05** UUID талбар БҮРТ → `@db.Uuid` annotation (id, tenantId, authId, FK бүгд).
- **RULE-14** Prisma `$use` middleware → `executeRaw`/`queryRaw` action guard ЗААВАЛ:
  ```typescript
  if (params.action === 'executeRaw' || params.action === 'queryRaw') return next(params);
  ```
  Энэ guard байхгүй бол middleware дотор `$executeRaw` дуудахад INFINITE LOOP → JS heap 4GB+ дуусна.

### 🔷 Migration дүрмүүд

- **RULE-11** Migration бүхэнд → `uuid_generate_v7()` ЗААВАЛ. `gen_random_uuid()` / `uuid_generate_v4()` ХОРИГЛОНО.
- **RULE-12** RLS Policy pattern — БҮГД ЭНЭ ЗАГВАР ([RLS-004], 2026-10-10 засварласан):
  ```sql
  ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
  ALTER TABLE my_table FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_my_table ON my_table
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  GRANT SELECT, INSERT, UPDATE, DELETE ON my_table TO app_user;
  ```
  - ❌ `AS RESTRICTIVE` ГАНЦААРАА → PostgreSQL permissive policy шаарддаг тул **0 мөр** буцаана.
  - ❌ `s_project_app_user` role **байхгүй** — зөв role нь `app_user`. GRANT-гүй бол `permission denied`.
  - `current_tenant_id()` функц **байхгүй** — ХЭЗЭЭ Ч ашиглаж болохгүй.
  - Дэлгэрэнгүй загвар: [[03_Module_Template]] §1. Жишээ: кемпийн migration-ууд (`camp_apply_tenant_rls()` helper, `20261009001_camp_rbac.sql`).
  - Хэрэгжсэн хуучин migration-ыг (RESTRICTIVE) checksum-аас болж засахгүй — шинэ migration-оор нэмж засна.
- **RULE-15** Enum/type өөрчлөх migration ДАРААЛАЛ — ЯАГААД ЧΗΩ ЭНЭ ДАРААЛАЛ:
  ```sql
  -- 1. Partial index DROP (WHERE clause-тай)
  DROP INDEX IF EXISTS idx_...;
  -- 2. CHECK constraint DROP
  ALTER TABLE t DROP CONSTRAINT IF EXISTS chk_...;
  -- 3. ENUM үүсгэх / rename
  CREATE TYPE new_enum AS ENUM (...);
  -- 4. ALTER TYPE
  ALTER TABLE t ALTER COLUMN col TYPE new_enum USING col::text::new_enum;
  -- 5. Index, constraint дахин үүсгэх
  CREATE INDEX idx_... ON t(col);
  ```
  Дараалал буруу бол: `operator does not exist` / `cannot alter type of a column used in a policy` алдаа.

### 🔷 Auth / User дүрмүүд

- **RULE-13** `actor_id` / `user_id` FK → `core_users.id` (PostgreSQL UUID) ЗААВАЛ. `auth_id` шууд FK болохгүй. `resolveUserId(authId, tenantId)` helper дамжуулна.

### 🔷 Тест дүрмүүд

- **RULE-06** `afterAll` / `afterEach` → `await app?.close()` optional chaining заавал.
- **RULE-10** Тестэд `ServiceClass.prototype.method = mock` ХОРИГЛОНО → `app.get(ServiceClass).method = mock`
- **RULE-16** RLS integration тест → dual PrismaClient pattern ЗААВАЛ:
  ```typescript
  // prismaAdmin (postgres user) — setup/teardown ЗӨВХӨН
  // prismaRls   (app_user)      — бодит RLS тест
  // Шалтгаан: superuser нь FORCE RLS ч гэсэн bypass хийдэг
  ```
  Empty string UUID cast алдаа → `'00000000-0000-0000-0000-000000000000'` (valid, ямар ч tenant-тэй таарахгүй) ашиглах.
- **RULE-18** vitest integration тест → `pool: 'forks'` + `singleFork: true` + `--max-old-space-size=4096` заавал. Worker threads-д memory limit хүрдэг.

### 🔷 pnpm / TypeScript дүрмүүд

- **RULE-09** pnpm strict-mode: зөвхөн type annotation → `import type { X } from 'pkg'`.

### 🔷 Frontend дүрмүүд

- **RULE-17** Backend API response wrapper → type зөв тодорхойлох. Pagination:
  ```typescript
  // ❌ Буруу
  const res = await apiClient.get<MrHeader[]>(BASE)
  return res.data                // wrapper объект!

  // ✅ Зөв
  const res = await apiClient.get<PaginatedResponse<MrHeader>>(BASE)
  return res.data.data           // wrapper-ийн доторх array
  ```
- **RULE-19** Dev орчинд Vite proxy ЗААВАЛ ашиглах:
  ```env
  # .env
  VITE_API_BASE_URL=   # хоосон → relative URL → Vite proxy → CORS алга
  # ХОРИГЛОНО: VITE_API_BASE_URL=http://localhost:3000 → CORS алдаа
  ```
- **RULE-20** Frontend DTO field names → backend DTO-тай ТАМ АДИЛ байх ёстой. Эхлээд `*.dto.ts` файл шалгах, дараа frontend type бич.
- **RULE-21** (2026-10-13) Код өөрчилсөн блок бүрийн төгсгөлд: `pnpm docs:gen` → `pnpm docs:check` ✓ + [[01_Backend_Modules]] / [[04_Frontend_Map]]-ийн хамаарах хэсгийг шинэчилнэ. Автомат каталогийг (`docs/09_Codebase/0[235679]_*`) гараар засахгүй. Шалтгаан: баримт кодоос хоцорвол (DOC-001) хөгжүүлэлтийн чат кодыг дахин уншиж контекст алдана. DoD: [[08_Patterns]] §6.

---

## 🩺 Алдаанаас дүрэм олох
- `SECURITY_ALERT` → tenantStorage.run() wrap дутуу — RULE-03/04 шалгах
- `Cannot read properties of undefined` in DI → RULE-07 `useExisting` шалгах; RULE-08 `unplugin-swc` шалгах
- `Failed to load url` in Vite → RULE-09 `import type` шалгах
- `actor_id FK violation` → RULE-13 `resolveUserId()` дутуу
- `JS heap out of memory` in Prisma → RULE-14 middleware guard дутуу
- `operator does not exist` in migration → RULE-15 enum өөрчлөх дараалал буруу
- `map is not a function` in frontend → RULE-17 pagination wrapper шалгах
- `CORS error` in frontend → RULE-19 `VITE_API_BASE_URL` хоосон байна уу?
- `400 Bad Request` DTO mismatch → RULE-20 field names шалгах
