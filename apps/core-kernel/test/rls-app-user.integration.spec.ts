/**
 * Phase 4.8.2 — app_user RLS бүрэн хамрах хүрээ (2026-10-10)
 * ============================================================
 * Migration 20261010004_rls_app_user.sql-ийн дараа:
 *   - tenant_id-тай БҮХ хүснэгт app_user-ээр уншигдана (permission denied байхгүй)
 *   - context-гүй / хоосон context → 0 мөр (алдаа биш — current_tenant_id() NULLIF) [RLS-003]
 *   - Tenant A context → B-ийн мөр харагдахгүй, B-ийн нэрээр бичих → RLS татгалзана
 *   - tenants / super_admins → app_user эрхгүй (системийн холболтоор л)
 * prismaAdmin = DATABASE_URL (postgres, BYPASSRLS) → setup/teardown
 * prismaRls   = app_user (NOBYPASSRLS) → бодит шалгалт
 * ============================================================
 */
import { Prisma, PrismaClient, TierType } from '@prisma/client';

const STAMP = Date.now();
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_USER_URL = dbUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');

let prismaAdmin: PrismaClient;
let prismaRls: PrismaClient;
let tenantA: string;
let tenantB: string;
let tables: string[] = [];

/** app_user-ээр transaction; ctx === null бол set_config хийхгүй */
const asApp = <T>(ctx: string | null, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prismaRls.$transaction(async (tx) => {
    if (ctx !== null) await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx}, true)`;
    return fn(tx);
  });

const countRows = async (tx: Prisma.TransactionClient, table: string, where = '') => {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}" ${where}`);
  return rows[0].n;
};

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  tenantA = (await prismaAdmin.tenant.create({ data: { name: 'RLS A', slug: `rls-a-${STAMP}`, tier: TierType.TIER1 } })).id;
  tenantB = (await prismaAdmin.tenant.create({ data: { name: 'RLS B', slug: `rls-b-${STAMP}`, tier: TierType.TIER1 } })).id;
  tables = (
    await prismaAdmin.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      ORDER BY 1`
  ).map((r) => r.relname);
  await prismaAdmin.$executeRaw`
    INSERT INTO workflow_definitions (tenant_id, name, steps_config, is_active, created_at, updated_at)
    VALUES (${tenantB}::uuid, 'B-def', '{}'::jsonb, true, now(), now())`;
}, 60_000);

afterAll(async () => {
  for (const id of [tenantA, tenantB]) {
    if (id) await prismaAdmin?.tenant.delete({ where: { id } }).catch((e) => console.error('[cleanup]', e));
  }
  await prismaRls?.$disconnect();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('🔒 app_user — tenant хүснэгт бүр (4.8.2)', () => {
  it('tenant_id-тай хүснэгт 40+ олдсон (Camp, Budget, MR, Workflow …)', () => {
    expect(tables.length).toBeGreaterThanOrEqual(40);
    expect(tables).toEqual(expect.arrayContaining(['workflow_definitions', 'approval_logs', 'dlq_events', 'tenant_routes', 'mr_headers', 'core_users']));
  });

  it('context-гүй, хоосон context → 0 мөр; A context → алдаагүй (permission denied / ::uuid алдаа байхгүй)', async () => {
    const problems: string[] = [];
    for (const t of tables) {
      for (const ctx of [null, '', tenantA]) {
        try {
          const n = await asApp(ctx, (tx) => countRows(tx, t));
          if (ctx !== tenantA && n !== 0) problems.push(`${t} ctx=${String(ctx)} → ${n} мөр`);
        } catch (e) {
          problems.push(`${t} ctx=${String(ctx)}: ${(e as Error).message.split('\n').pop()}`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});

describe('🔒 app_user — tenant хоорондын тусгаарлалт (workflow_definitions)', () => {
  it('A context → B-ийн мөр 0; B context → өөрийн 1', async () => {
    expect(await asApp(tenantA, (tx) => countRows(tx, 'workflow_definitions', `WHERE tenant_id = '${tenantB}'`))).toBe(0);
    expect(await asApp(tenantB, (tx) => countRows(tx, 'workflow_definitions', `WHERE tenant_id = '${tenantB}'`))).toBe(1);
  });

  it('A context-оор B-ийн нэрээр бичих → RLS татгалзана; өөрийн нэрээр → OK', async () => {
    await expect(
      asApp(tenantA, (tx) => tx.$executeRaw`
        INSERT INTO workflow_definitions (tenant_id, name, steps_config, is_active, created_at, updated_at)
        VALUES (${tenantB}::uuid, 'x', '{}'::jsonb, true, now(), now())`),
    ).rejects.toThrow(/row-level security/);
    const inserted = await asApp(tenantA, (tx) => tx.$executeRaw`
      INSERT INTO workflow_definitions (tenant_id, name, steps_config, is_active, created_at, updated_at)
      VALUES (${tenantA}::uuid, 'a', '{}'::jsonb, true, now(), now())`);
    expect(inserted).toBe(1);
  });

  it('tenants / super_admins → app_user эрхгүй', async () => {
    await expect(asApp(tenantA, (tx) => countRows(tx, 'tenants'))).rejects.toThrow(/permission denied/);
    await expect(asApp(tenantA, (tx) => countRows(tx, 'super_admins'))).rejects.toThrow(/permission denied/);
  });
});
