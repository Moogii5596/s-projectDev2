---
title: "Кодын хэв маяг ба загвар (RULE + жишээ файл)"
type: "Guide"
status: "Active"
last_updated: 2026-11-07
tags: [codebase, rules, patterns, testing]
---

# Кодын хэв маяг ба загвар (RULE + жишээ файл)

> RULE-ийн бүрэн текст ба шалтгаан: [[00_rules_and_context]] · алдааны түүх: [[lessons_learned]] · шинэ модулийн дэлгэрэнгүй загвар: [[03_Module_Template]].
> Энэ файл = **"яаж хийх вэ"** + хуулах жишээ файл. Шинэ код бичихийн өмнө тохирох хэсгийг унш. Эхлэх цэг: [[00_Codebase_Map]].

## 1. RULE хураангуй (бүлгээр)

| Бүлэг | Дүрэм |
|---|---|
| **DB / migration** | Schema = `supabase/migrations/*.sql` (MIG-001, `prisma db push` хориотой) · ID → `uuid_generate_v7()` (RULE-11) · UUID талбар бүрт Prisma `@db.Uuid` (RULE-05) · Enum өөрчлөх дараалал (RULE-15) · migration-ы дугаарыг **хэрэгжүүлэх үед** өгнө, apply хийгдсэнийг хэзээ ч нэрийг өөрчлөхгүй (MIG-002) |
| **RLS** | Tenant хүснэгт → ENABLE + FORCE + PERMISSIVE `TO app_user` policy + GRANT (RULE-12, RLS-004); Кемп/core-ийн шинэ хүснэгтэд `SELECT camp_apply_tenant_rls('<хүснэгт>');` · `set_config('app.tenant_id', …, true)` — `SET LOCAL` хориотой (RULE-03) · `$executeRaw` + query → нэг `$transaction` (RULE-04) → практикт **`inTenantTx`** |
| **NestJS** | Guard/Interceptor → `AppModule`-д `APP_GUARD` **`useExisting`** (RULE-07) · Prisma enum → `@prisma/client`-ээс (RULE-02) · `$use` middleware-д raw action guard (RULE-14) · type import → `import type` (RULE-09) · FK-д `core_users.id` (`resolveUserId`, RULE-13) |
| **API / DTO** | Response wrapper / pagination type (RULE-17) · frontend type = backend DTO нэр (RULE-20) · алдаа = код + параметр (`common/i18n/app-error.ts`), мессеж 3 хэлээр `messages.ts` |
| **Тест** | vitest + `unplugin-swc` (RULE-08) · `overrideProvider` зөвхөн байгаа provider-т (RULE-01) · `app.get(Service).method = mock`, prototype patch хориотой (RULE-10) · `afterAll` → `await app?.close()` (RULE-06) · RLS тест → dual PrismaClient (RULE-16) · integration → `pool: 'forks'`, `singleFork` (RULE-18) |
| **Frontend** | Dev-д Vite proxy (RULE-19) · DTO нэр ТАМ АДИЛ (RULE-20) · шинэ UI сан нэмэхгүй (`modules/camp/components/ui.tsx`) |
| **Баримт** | Код өөрчилсний дараа `pnpm docs:gen` + [[01_Backend_Modules]] / [[04_Frontend_Map]]-ийн хамаарах хэсэг (**RULE-21**) |

## 2. Backend — шинэ endpoint (Кемпийн хэв маяг)

Жишээ: `modules/camp/maintenance/` (controller → service → `maintenance-flow.ts` цэвэр логик), энгийн CRUD: `modules/vendor/`.

```ts
// controller — зөвхөн params/DTO; логикгүй
@Post()
@HttpCode(201)
create(@Req() req: FastifyRequest, @Param('campId', uuid()) campId: string, @Body() dto: CreateXDto) {
  const u = reqUser(req);                       // u.id = authId (RULE-13)
  return this.svc.create(u.tenantId, u.id, campId, dto);
}

// service — public метод бүр ижил бүтэцтэй
async create(tenantId: string, authId: string, campId: string, dto: CreateXDto) {
  return withCampErrors(() =>                    // DB алдаа → HTTP (нөөц хамгаалалт)
    inTenantTx(this.prisma, tenantId, async (tx) => {               // RLS context + нэг tx
      const userId = await this.access.require(tx, tenantId, authId, campId, P.X_MANAGE); // эрх → core_users.id
      // … бизнес логик (цэвэр функцээ тусад нь файлд — unit тест) …
      // audit хэрэгтэй бол camp-audit.service, зардал бол costs/cost-entry-writer
    }),
  );
}
```

- Унших endpoint → `access.requireAccess(...)` (гишүүнчлэл); бичих → `access.require(..., P.CODE)`.
- Шинэ эрх: migration INSERT `camp_permissions` + `camp-permissions.ts` + (хэрэгтэй бол) `camp_seed_default_roles` → [[05_Permissions_Catalog]].
- Шинэ public route → `@SkipAuth()`; шинэ модуль → `camp.module.ts` (эсвэл `app.module.ts`)-д бүртгэ.
- Алдааны код: `badRequest('camp.err.<area>.<n>')` + `messages.ts`-д mn/en/zh.

## 3. Migration — шинэ хүснэгт

Жишээ: `supabase/migrations/20261013005_core_user_invites.sql`.

```sql
CREATE TABLE camp_example (
  id         UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),   -- RULE-11
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id    UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, camp_id) REFERENCES camps (tenant_id, id) ON DELETE CASCADE  -- tenant хооронд холилдохгүй
);
SELECT camp_apply_tenant_rls('camp_example');  -- ENABLE + FORCE + policy + GRANT app_user + updated_at trigger
```

- Дараа нь: `apps/core-kernel/prisma/schema/<модуль>.prisma`-д model (R22) (`@db.Uuid` бүрт) → `pnpm db:generate` → `pnpm supabase:reset` (local) → `pnpm docs:gen` ([[03_DB_Catalog]]).
- Пилот/staging-д өгөгдөлтэй хүснэгт өөрчлөх → `camp:snapshot` A = B ([[04_Pilot_Camp_Windows]]).
- RLS аудит: `supabase/dev/rls_audit.sql`.

## 4. Тест

| Төрөл | Хаана | Жишээ | Анхаарах |
|---|---|---|---|
| Unit (цэвэр функц / service mock) | `src/**/tests/*.test.ts`, `*.spec.ts` | `modules/camp/maintenance/tests/camp-maintenance.service.test.ts` | DB-гүй; golden файл — `attendance/tests/__golden__` |
| Integration (бодит PG + RLS) | `apps/core-kernel/test/*.integration.spec.ts` | `camp-v022-invite.integration.spec.ts` | `test/helpers/camp-it-app.ts` (app + хэрэглэгч: admin/manager/nobody), `db-urls.ts`, `redis-mock.ts`; `configure-app` заавал (VALID-001) |
| Frontend unit | `apps/web-shell/src/**/tests` | `modules/camp/lib/tests` | `test/setup.ts` |
| E2E | `apps/e2e/tests/*.spec.ts` | `camp-v021.spec.ts` | fixture: `pnpm --filter core-kernel e2e:fixture`; Кемп → `supabase/dev/camp_e2e_grant.sql` |

- Шалгах дараалал (танд өгөхөөс өмнө): `pnpm type-check` → `pnpm lint` → холбогдох unit → холбогдох integration → (UI бол) e2e/хөтөч. **Бүтэн тестийг дахин дахин ажиллуулахгүй** — [[07_Test_Map]]-аас хамаарах файлыг сонго.
- Шинэ эрх/хүснэгт → `camp-master.integration` (каталог тулгалт), `rls-leakage` / `rls-app-user`.

## 5. Frontend
→ [[04_Frontend_Map]] §6 (шинэ хуудас), §4 (орчуулга).

## 6. Блок дуусгах шалгуур (DoD)
→ repo-ийн root `AGENTS.md` §2 (бүх агентад нэг; 2026-11-07-нд шинэчилсэн). Энд давтахгүй.
