---
title: "Multi-tenant тусгаарлалт ба RLS (одоогийн загвар)"
type: "Database"
status: "Active"
last_updated: 2026-10-13
tags: [database, rls, tenant, security]
---

# Multi-tenant тусгаарлалт ба RLS (одоогийн загвар)

> Хувилбар 2.0 (2026-10-13, бүрэн шинэчилсэн). Шийдвэр: [[ADR-001_Tenant_Isolation]] (§4.1 runtime) · хүснэгт бүрийн RLS / policy: [[03_DB_Catalog]] · код бичих загвар: [[08_Patterns]] §2–3 · анхны хувилбар (PgBouncer + `SET LOCAL` + Express — **одоо хориотой**): [[01_PostgreSQL_MultiTenant_RLS_Spec.v1]] — архив.

## 1. Зарчим
Нэг PostgreSQL (Supabase), tenant бүрийн өгөгдөл `tenant_id`-аар ялгагдана. **Тусгаарлалтыг DB баталгаажуулна** (RLS) — аппын код алдсан ч өөр tenant-ийн мөр харагдахгүй. Том байгууллага → тусдаа deploy (`DEPLOYMENT_MODE=dedicated`), RLS тэнд ч идэвхтэй.

## 2. DB роль ба холболт

| Холболт | Роль | RLS | Хэрэглээ |
|---|---|---|---|
| `DATABASE_URL` | `app_user` (NOBYPASSRLS, хүснэгтийн эзэн биш) | ✅ идэвхтэй | Бүх tenant өгөгдөл (апп асахад лог: `DB role "app_user" — RLS идэвхтэй`) |
| `SYSTEM_DATABASE_URL` | `postgres` (BYPASSRLS) | алгасна | Tenant хайх (slug), нэвтрэлт, onboarding, outbox poller, escalation cron, тест бэлтгэл — **tenant-ийн бизнес өгөгдөлд хэрэглэхгүй** |
| `DIRECT_URL` | `postgres` | — | Prisma introspect / generate |

`app_user`-ийн нууц үг: local = `change_in_production`; production-д заавал солино ([[03_Enterprise_VPC_Deployment]] §5.5).

## 3. Tenant context
```ts
inTenantTx(prisma, tenantId, async (tx) => { /* бүх query энд */ })
// = $transaction( SELECT set_config('app.tenant_id', $tenantId, true); …fn(tx) )
```
- `set_config(…, true)` — **зөвхөн тухайн transaction-д** (RULE-03; `SET LOCAL` / session түвшин хориотой). Transaction-ий гадуурх `prisma.model.*` → `app_user`-д 0 мөр / P2025.
- Connection pooler (PgBouncer transaction mode) нэмэгдсэн ч аюулгүй: context transaction-аас гарахгүй.
- Файл: `db/tenant-tx.ts`, Кемп `modules/camp/common/camp-tx.ts`. `AsyncLocalStorage` (`prisma-tenant-client.service.ts`) — request-ийн tenant-ийг дамжуулах л үүрэгтэй; RLS-ийг `inTenantTx` хангана.

## 4. Policy загвар (RULE-12, RLS-004)
```sql
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;            -- эзэн ч алгасахгүй
CREATE POLICY tenant_isolation_t ON t AS PERMISSIVE FOR ALL TO app_user
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON t TO app_user;
```
- Кемп / core-ийн шинэ хүснэгт: `SELECT camp_apply_tenant_rls('t');` (дээрхийг + `updated_at` trigger хийнэ).
- Хүүхэд хүснэгтийн FK-д `(tenant_id, parent_id)` нийлмэл түлхүүр → tenant хооронд холбоо үүсэх боломжгүй.
- Глобал хүснэгт (`tenant_id`-гүй): `tenants`, `camp_permissions`, `auth_guard.password_failures` — RLS-гүй (зориуд).
- RESTRICTIVE-only policy хориотой (RLS-004: PERMISSIVE байхгүй бол бүх мөр хаагдана).

## 5. Шалгалт
- `supabase/dev/rls_audit.sql` (зөвхөн уншина): RLS/FORCE/policy/grant-ийн дутагдал.
- Тест: `rls-leakage` (dual PrismaClient — RULE-16), `rls-app-user`, `tenant-isolation-http`, integration-ийг `app_user` ба `postgres` хоёроор ([[07_Test_Map]]).
- `pnpm docs:gen` → [[03_DB_Catalog]]: `⚠️ RLS-гүй (tenant_id-тэй!)` гэж гарвал **алдаа**.

## 6. Мэдэгдэж буй өр
- `packages/prisma-rls-extension` — `core-kernel`-ийн хамаарал боловч кодонд импортлогдоогүй (MVP-ийн үлдэгдэл) → устгах эсвэл ашиглах шийдвэр.
- Schema-per-tenant — ✖ татгалзсан (2026-10-08, ADR-001; код хасагдсан).
