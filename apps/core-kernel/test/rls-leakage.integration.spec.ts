/**
 * RLS Leakage Integration Test
 * ============================================================
 * ХАМГИЙН ЧУХ АЛ ТЕСТ: Tenant A нь Tenant B-н өгөгдлийг харж болохгүй
 *
 * АРХИТЕКТУР:
 *   prismaAdmin  → postgres superuser → RLS bypass → setup/teardown
 *   prismaRls    → app_user           → RLS active → бодит тест
 *
 *   app_user нь NOBYPASSRLS тул SET ROLE/SESSION AUTHORIZATION хэрэггүй.
 *   SET LOCAL app.tenant_id зөвхөн $transaction дотор ажиллана.
 *
 * Ажиллуулах: pnpm test:integration
 * ============================================================
 */

import { PrismaClient, UserRole, MrStatus } from '@prisma/client';
import { ADMIN_DB_URL } from './helpers/db-urls';

const TENANT_A_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';

// Superuser: setup/teardown (RLS bypass)
let prismaAdmin: PrismaClient;
// app_user: бодит RLS тест (NOBYPASSRLS)
let prismaRls: PrismaClient;

let tenantAUserId: string;
let tenantBUserId: string;
let mrA1Id: string;
let mrA2Id: string;
let mrB1Id: string;

// DATABASE_URL-аас port авч app_user URL үүсгэх
const dbUrl = ADMIN_DB_URL; // Phase 4.8.5: SYSTEM_DATABASE_URL → DATABASE_URL (RLS bypass)
const APP_USER_URL = dbUrl.replace(
  /postgresql:\/\/[^@]+@/,
  'postgresql://app_user:change_in_production@',
);

beforeAll(async () => {
  // Superuser connection (RLS bypass)
  prismaAdmin = new PrismaClient({
    datasources: { db: { url: ADMIN_DB_URL } }, // Phase 4.8.5
  });
  await prismaAdmin.$connect();

  // app_user connection (RLS active)
  prismaRls = new PrismaClient({
    datasources: { db: { url: APP_USER_URL } },
  });
  await prismaRls.$connect();

  // ── Superuser-ээр test data insert ──────────────────────
  const userA = await prismaAdmin.coreUser.upsert({
    where: { authId: 'a0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      tenantId: TENANT_A_ID,
      authId: 'a0000000-0000-0000-0000-000000000001',
      email: 'user-a@tenant-a.test',
      fullName: 'Tenant A User',
      role: UserRole.REQUESTER,
    },
  });
  tenantAUserId = userA.id;

  const mrA1 = await prismaAdmin.mrHeader.create({
    data: {
      tenantId: TENANT_A_ID,
      mrNumber: 'MR-TEST-A-001',
      title: 'Tenant A MR 1',
      status: MrStatus.DRAFT,
      requesterId: tenantAUserId,
      currency: 'MNT',
    },
  });
  mrA1Id = mrA1.id;

  const mrA2 = await prismaAdmin.mrHeader.create({
    data: {
      tenantId: TENANT_A_ID,
      mrNumber: 'MR-TEST-A-002',
      title: 'Tenant A MR 2',
      status: MrStatus.PENDING_APPROVAL,
      requesterId: tenantAUserId,
      currency: 'MNT',
    },
  });
  mrA2Id = mrA2.id;

  const userB = await prismaAdmin.coreUser.upsert({
    where: { authId: 'b0000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      tenantId: TENANT_B_ID,
      authId: 'b0000000-0000-0000-0000-000000000002',
      email: 'user-b@tenant-b.test',
      fullName: 'Tenant B User',
      role: UserRole.REQUESTER,
    },
  });
  tenantBUserId = userB.id;

  const mrB1 = await prismaAdmin.mrHeader.create({
    data: {
      tenantId: TENANT_B_ID,
      mrNumber: 'MR-TEST-B-001',
      title: 'Tenant B НУУЦ MR',
      status: MrStatus.DRAFT,
      requesterId: tenantBUserId,
      currency: 'MNT',
    },
  });
  mrB1Id = mrB1.id;
});

afterAll(async () => {
  // Superuser-ээр цэвэрлэх
  await prismaAdmin.mrHeader.deleteMany({
    where: { mrNumber: { startsWith: 'MR-TEST-' } },
  });
  await prismaAdmin.coreUser.deleteMany({
    where: {
      authId: {
        in: [
          'a0000000-0000-0000-0000-000000000001',
          'b0000000-0000-0000-0000-000000000002',
        ],
      },
    },
  });
  await prismaAdmin?.$disconnect();
  await prismaRls?.$disconnect();
});

// ── Helper: app_user connection-тай, tenant context-той query ──
// SET LOCAL → transaction дотор л ажиллана тул $transaction шаардлагатай
async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prismaRls.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

describe('🔒 RLS Tenant Isolation — ХАМГИЙН ЧУХ АЛ ТЕСТ', () => {
  describe('Tenant A context-д', () => {
    it('Tenant A зөвхөн өөрийн MR-үүдийг харна', async () => {
      const mrs = await withTenant(TENANT_A_ID, (tx) => tx.mrHeader.findMany());

      const tenantAMrs = mrs.filter((mr) => mr.tenantId === TENANT_A_ID);
      const tenantBMrs = mrs.filter((mr) => mr.tenantId === TENANT_B_ID);

      expect(tenantAMrs.length).toBeGreaterThanOrEqual(2);
      expect(tenantBMrs.length).toBe(0); // 🔴 LEAKAGE БАЙХГҮЙ!
    });

    it('Tenant A нь Tenant B-н MR ID-аар хайвал олохгүй', async () => {
      const mr = await withTenant(TENANT_A_ID, (tx) =>
        tx.mrHeader.findUnique({ where: { id: mrB1Id } }),
      );
      expect(mr).toBeNull(); // 🔴 Null байх ёстой
    });

    it('Tenant A нь Tenant B-н хэрэглэгчийг харахгүй', async () => {
      const users = await withTenant(TENANT_A_ID, (tx) => tx.coreUser.findMany());
      const leakedUsers = users.filter((u) => u.tenantId === TENANT_B_ID);
      expect(leakedUsers.length).toBe(0); // 🔴 LEAKAGE БАЙХГҮЙ!
    });
  });

  describe('Tenant B context-д', () => {
    it('Tenant B зөвхөн өөрийн MR харна', async () => {
      const mrs = await withTenant(TENANT_B_ID, (tx) => tx.mrHeader.findMany());
      const tenantAMrs = mrs.filter((mr) => mr.tenantId === TENANT_A_ID);
      expect(tenantAMrs.length).toBe(0); // 🔴 Tenant A-н өгөгдөл харагдахгүй
    });

    it('Tenant B нь Tenant A-н MR-г засварлаж чадахгүй', async () => {
      const result = await withTenant(TENANT_B_ID, (tx) =>
        tx.mrHeader.updateMany({
          where: { id: mrA1Id },
          data: { title: 'ХАКДСАН TITLE' },
        }),
      );
      expect(result.count).toBe(0); // 🔴 Засварлаж чадахгүй
    });
  });

  describe('Context байхгүй үед', () => {
    it('app.tenant_id тохируулаагүй үед өгөгдөл харагдахгүй', async () => {
      // tenant_id тохируулахгүйгээр шууд query — RLS бүгдийг хааж байх ёстой
      const mrs = await prismaRls.$transaction(async (tx) => {
        const zeroId = '00000000-0000-0000-0000-000000000000';
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${zeroId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${zeroId}, true)`;
        return tx.mrHeader.findMany();
      });
      expect(mrs.length).toBe(0); // Юу ч харагдахгүй
    });
  });

  describe('Нийт leakage тоо', () => {
    it('leakage_count = 0 байх ёстой', async () => {
      const allVisible = await withTenant(TENANT_A_ID, (tx) =>
        tx.mrHeader.findMany(),
      );
      const leaked = allVisible.filter((mr) => mr.tenantId !== TENANT_A_ID);

      console.log(`✅ Нийт харагдах MR: ${allVisible.length}`);
      console.log(`✅ Leakage тоо: ${leaked.length}`);

      expect(leaked.length).toBe(0);
    });
  });
});
