---
title: "Шинэ модуль нэмэх загвар (Module Template)"
type: "Database"
status: "Active"
last_updated: 2026-10-10
tags: [module]
---

# Шинэ модуль нэмэх загвар (Module Template)

> Phase 4.7 · 2026-10-08 · Жишээ: `vendor/` (хамгийн энгийн), `inventory/` (cursor + cache + атомик), `budget/` (MR hook + lock)
> Холбоотой: lessons_learned [RLS-004], [MIG-001], [TEST-004], [TEST-005], [TEST-006], [ASYNC-001]

## 1. Migration — `supabase/migrations/YYYYMMDDNNN_<module>.sql`

```sql
CREATE TABLE <items> (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),              -- RULE-11
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ... талбарууд + CHECK (жнь CHECK (btrim(name) <> ''), CHECK (qty >= 0))
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Cursor жагсаалт бол: (tenant_id, created_at DESC, id DESC)

ALTER TABLE <items> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <items> FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_<items> ON <items>
  AS PERMISSIVE FOR ALL TO app_user                                           -- ❌ RESTRICTIVE ганцаараа = 0 мөр
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON <items> TO app_user;                 -- ❌ мартвал permission denied
```

Хэрэглэх: `pnpm exec supabase migration up` → `pnpm db:generate`. **`prisma db push` хориотой** [MIG-001].

## 2. Prisma model — `apps/core-kernel/prisma/schema/<модуль>.prisma` (шинэ модуль → шинэ файл, R22)

- UUID талбар бүрт `@db.Uuid`, snake_case → `@map(...)`, `@@map("<items>")`
- `Tenant` model-д back-relation нэмэх (`<items> <Item>[]`)
- `GENERATED` багана ашиглахгүй (Prisma дэмжихгүй) — service-д тооцоол
- Expression/partial index → зөвхөн migration-д, schema-д тайлбар

## 3. NestJS — `apps/core-kernel/src/modules/<module>/`

```
<module>.module.ts      @Module({ controllers, providers, exports })  → AppModule.imports-д нэмнэ
<module>.controller.ts  @Controller('<route>')  — guard/interceptor decorator ХЭРЭГГҮЙ (RULE-07, APP_GUARD)
<module>.service.ts
<module>.dto.ts         class-validator + @Transform(trim) + @Type(() => Number)
tests/<module>.service.test.ts
```

Service-ийн заавал хэв маяг (нийтлэг хувилбар: `import { inTenantTx } from '../../db/tenant-tx'` — Phase 4.8.3 [RLS-007]):

```ts
private inTenantTx<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;   // RULE-04
    return fn(tx);
  });
}
```

| Шаардлага | Хэрэгсэл |
|---|---|
| Бичих эрх | `requireRole(tx, tenantId, authId, [UserRole.OWNER, UserRole.ADMIN])` (`common/helpers`) |
| Хэрэглэгч | `req.user.id` = Supabase authId ≠ `core_users.id` (RULE-13) — `requireRole` core_users.id буцаана |
| Where | **Үргэлж** `tenantId`-аар (RLS нь хоёр дахь хамгаалалт — app одоогоор superuser [RLS-004]) |
| Давхардал | `P2002` → `ConflictException` (409) |
| Тоо хэмжээ өөрчлөх | Атомик `UPDATE ... SET x = x + $d WHERE ... AND x + $d >= 0 RETURNING` |
| Cursor | `encodeCursor/decodeCursor` (`common/utils/cursor`) — `decodeCursor` өөрөө 400 шиднэ (id = UUID шалгана) [CURSOR-001], нөхцөл `created_at <= c AND (created_at < c OR id < cid)` + index `(tenant_id, created_at DESC, id DESC)` |
| Cache | `CacheService.buildKey('<module>', tenantId, ...)`, бичсэний дараа `invalidateTenant(tenantId)` |
| MR-ийн төлөвт хариу үйлдэл | `MrLifecycleService`-д дуудлага нэмэх (MR transaction дотор, алдаа → rollback) |
| Promise буцаах public method | `async` [ASYNC-001] |
| Redis-ийн шинэ команд | `test/helpers/redis-mock.ts`-д нэмэх (coverage тест барина) [TEST-003] |
| Env-ээс уншдаг шинэ тохиргоо | `test/setup/unit-env.ts` → `APP_BEHAVIOR_ENV_KEYS` [TEST-005] |

## 4. Тест (шалгах хуудас)

- [ ] **Unit** (`tests/*.test.ts`): эрх (403), validation/бизнес алдаа (400/404/409), гол логик; tx mock-оор `set_config` эхэлж дуудагдсаныг шалгах
- [ ] **Mutation:** гол нөхцөл бүрийг түр эвдэж тест унаж байгааг шалгах; алдааны мессежийг онцлог хэсгээр assert [TEST-004]
- [ ] **Бохир env:** `RATE_LIMIT_SHORT=1 DEPLOYMENT_MODE=dedicated DEDICATED_TENANT_SLUG=x pnpm test` [TEST-005]
- [ ] **Integration** (`test/<module>.integration.spec.ts`): **тусдаа tenant** үүсгэж `afterAll`-д `tenant.delete` (CASCADE); `createRedisMock()`; guard patch [DI-007]; HTTP-ээр эрх/CRUD
- [ ] **RLS leakage:** `app_user` (`change_in_production`) клиентээр өөр tenant context → 0 мөр, өөр tenant-ийн нэрээр бичих → татгалзана
- [ ] Helper-т "утгагүй"-г `null`-оор (`undefined` → default param) [TEST-006]; сөрөг тестэд "юу ч бичигдээгүй"-г assert
- [ ] `pnpm exec tsc --noEmit` (test-ийг оруулаад) + `eslint src test`

## 5. Баримт

- [[lessons_learned]] — засагдсан алдаа бүр
- [[01_analysis_and_plan_2026-10-08]] — явц
