/**
 * Budget Module Integration Test — Phase 4.1 (Sprint 9.B)
 * ============================================================
 * Бодит NestJS app + Supabase Auth + PostgreSQL:
 *   - /api/v1/budget CRUD + эрх (ADMIN vs REQUESTER)
 *   - MR submit → төсөв commit / хүрэлцэхгүй → 400 (MR DRAFT хэвээр)
 *   - MR approve → SPENT, reject → RELEASED
 *   - RLS leakage: app_user (NOBYPASSRLS) — өөр tenant-ийн төсөв харагдахгүй
 *
 * ТУСДАА tenant (budget-it-<ts>) — test-tenant-д төсөв үүсгэвэл бусад MR тестийн
 * хэлтэсгүй MR-ууд 400 болно (шийдвэр: tenant төсөвтэй бол заавал).
 * Ажиллуулах: pnpm --filter @s-project/core-kernel test:integration
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';

const SLUG = `budget-it-${Date.now()}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const EMAILS = {
  admin: `budget-admin-${Date.now()}@example.com`,
  requester: `budget-req-${Date.now()}@example.com`,
  approver: `budget-apr-${Date.now()}@example.com`,
};
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002'; // tenant-b (0003 migration)

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_USER_URL = dbUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let prismaRls: PrismaClient;
let tenantId: string;
const tokens: Record<keyof typeof EMAILS, string> = { admin: '', requester: '', approver: '' };
const authIds: string[] = [];
let periodId: string;
let allocationId: string;

const api = () => supertest(app.getHttpServer());
const as = (who: keyof typeof EMAILS) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST });

async function allocation() {
  return prismaAdmin.budgetAllocation.findUniqueOrThrow({ where: { id: allocationId } });
}

// [TEST-006] `null` = хэлтэсгүй. `undefined` дамжуулбал JS default param ('IT') ажиллана!
async function createMr(amount: number, department: string | null = 'IT'): Promise<string> {
  const res = await api()
    .post('/api/v1/requisitions')
    .set(as('requester'))
    .send({ title: `Budget MR ${amount}`, ...(department !== null ? { department } : {}), items: [{ description: 'x', quantity: 1, unitPrice: amount }] });
  expect(res.status).toBe(201);
  return res.body.id;
}
const submit = (id: string) => api().post(`/api/v1/requisitions/${id}/submit`).set(as('requester')).send({});

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();

  const tenant = await prismaAdmin.tenant.create({ data: { name: 'Budget IT Tenant', slug: SLUG, tier: TierType.TIER1 } });
  tenantId = tenant.id;
  // MR submit идэвхтэй workflow definition шаарддаг (шинэ tenant-д migration seed хийгээгүй)
  await prismaAdmin.workflowDefinition.create({
    data: { tenantId, name: 'Budget IT', stepsConfig: [{ order: 0, role: 'APPROVER', quorum: 1 }], isActive: true },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(createRedisMock())
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      const res = host.switchToHttp().getResponse() as any;
      if (exception instanceof HttpException) {
        res.code(exception.getStatus()).send(exception.getResponse());
      } else {
        console.error('[ERROR]', exception);
        res.code(500).send({ statusCode: 500, message: 'Internal server error' });
      }
    },
  } as ExceptionFilter);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // [DI-007] guard patch — slug → tenantId (бусад integration тестүүдтэй ижил)
  const cache = app.get(TenantCacheService);
  cache.getTenantId = async (slug: string) => (slug === SLUG ? tenantId : null);
  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = cache;
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const roles = { admin: UserRole.ADMIN, requester: UserRole.REQUESTER, approver: UserRole.APPROVER } as const;
  for (const who of Object.keys(EMAILS) as (keyof typeof EMAILS)[]) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: EMAILS[who], password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    await prismaAdmin.coreUser.create({
      data: { tenantId, authId: data.user.id, email: EMAILS[who], fullName: who, role: roles[who] },
    });
    const { data: s } = await anon.auth.signInWithPassword({ email: EMAILS[who], password: PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }
}, 90_000);

afterAll(async () => {
  // tenant CASCADE → budget, MR, core_users, workflow ...
  await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  await app?.close();
  await prismaRls?.$disconnect();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('🧾 Budget API', () => {
  it('Төсөвгүй үед хяналтгүй: хэлтэсгүй MR submit → 200', async () => {
    const id = await createMr(1000, null);
    expect((await submit(id)).status).toBe(200);
  });

  it('REQUESTER хугацаа үүсгэх → 403', async () => {
    const res = await api().post('/api/v1/budget/periods').set(as('requester'))
      .send({ name: '2026', periodType: 'ANNUAL', startDate: '2026-01-01', endDate: '2099-12-31' });
    expect(res.status).toBe(403);
  });

  it('ADMIN: хугацаа + IT 1,000,000 төсөв → 201; давхар " it " → 409', async () => {
    const p = await api().post('/api/v1/budget/periods').set(as('admin'))
      .send({ name: 'IT test', periodType: 'ANNUAL', startDate: '2020-01-01', endDate: '2099-12-31' });
    expect(p.status).toBe(201);
    periodId = p.body.id;

    const a = await api().post('/api/v1/budget/allocations').set(as('admin'))
      .send({ periodId, department: 'IT', totalAmount: 1_000_000 });
    expect(a.status).toBe(201);
    allocationId = a.body.id;

    const dup = await api().post('/api/v1/budget/allocations').set(as('admin'))
      .send({ periodId, department: ' it ', totalAmount: 5 });
    expect(dup.status).toBe(409);
  });

  it('GET allocations → remainingAmount; POST check', async () => {
    const list = await api().get('/api/v1/budget/allocations').set(as('requester'));
    expect(list.status).toBe(200);
    expect(Number(list.body[0].remainingAmount)).toBe(1_000_000);
    const chk = await api().post('/api/v1/budget/check').set(as('requester')).send({ department: 'it', amount: 2_000_000 });
    expect(chk.body).toMatchObject({ enforced: true, ok: false });
  });
});

describe('🔗 MR ↔ Budget (transaction дотор)', () => {
  let approvedMrId: string;

  it('600,000 MR submit → 200, committed 600,000, commitment COMMITTED', async () => {
    approvedMrId = await createMr(600_000);
    expect((await submit(approvedMrId)).status).toBe(200);
    expect(Number((await allocation()).committedAmount)).toBe(600_000);
    const c = await prismaAdmin.budgetCommitment.findUniqueOrThrow({ where: { mrHeaderId: approvedMrId } });
    expect(c.status).toBe('COMMITTED');
  });

  it('500,000 MR submit → 400 (үлдэгдэл 400,000), MR DRAFT хэвээр, committed өөрчлөгдөхгүй', async () => {
    const id = await createMr(500_000);
    const res = await submit(id);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('400000.00');
    const mr = await prismaAdmin.mrHeader.findUniqueOrThrow({ where: { id } });
    expect(mr.status).toBe('DRAFT');
    expect(mr.workflowInstanceId).toBeNull(); // workflow ч үүсээгүй (rollback)
    expect(Number((await allocation()).committedAmount)).toBe(600_000);
  });

  it('Төсөвтэй болсны дараа хэлтэсгүй MR → 400', async () => {
    const id = await createMr(10, null);
    const res = await submit(id);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('department');
    expect(Number((await allocation()).committedAmount)).toBe(600_000); // юу ч бүртгэгдээгүй
  });

  it('Approve → SPENT: committed 0, spent 600,000', async () => {
    const res = await api().post(`/api/v1/requisitions/${approvedMrId}/approve`).set(as('approver')).send({});
    expect(res.status).toBe(200);
    const a = await allocation();
    expect([Number(a.committedAmount), Number(a.spentAmount)]).toEqual([0, 600_000]);
    expect((await prismaAdmin.budgetCommitment.findUniqueOrThrow({ where: { mrHeaderId: approvedMrId } })).status).toBe('SPENT');
  });

  it('300,000 submit → reject → RELEASED, committed буцна', async () => {
    const id = await createMr(300_000);
    expect((await submit(id)).status).toBe(200);
    expect(Number((await allocation()).committedAmount)).toBe(300_000);
    const rej = await api().post(`/api/v1/requisitions/${id}/reject`).set(as('approver')).send({ reason: 'test' });
    expect(rej.status).toBe(200);
    expect(Number((await allocation()).committedAmount)).toBe(0);
    expect((await prismaAdmin.budgetCommitment.findUniqueOrThrow({ where: { mrHeaderId: id } })).status).toBe('RELEASED');
  });
});

describe('🔒 RLS leakage (app_user, NOBYPASSRLS)', () => {
  const countAs = (ctxTenant: string) =>
    prismaRls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctxTenant}, true)`;
      const [periods, allocations, commitments] = await Promise.all([
        tx.budgetPeriod.count({ where: { tenantId } }),
        tx.budgetAllocation.count({ where: { tenantId } }),
        tx.budgetCommitment.count({ where: { tenantId } }),
      ]);
      return { periods, allocations, commitments };
    });

  it('өөр tenant context → 0 / 0 / 0', async () => {
    expect(await countAs(OTHER_TENANT_ID)).toEqual({ periods: 0, allocations: 0, commitments: 0 });
  });

  it('өөрийн tenant context → харагдана', async () => {
    const own = await countAs(tenantId);
    expect(own.periods).toBe(1);
    expect(own.allocations).toBe(1);
    expect(own.commitments).toBeGreaterThanOrEqual(2);
  });

  it('өөр tenant-ийн нэрээр бичих → RLS татгалзана', async () => {
    await expect(
      prismaRls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${OTHER_TENANT_ID}, true)`;
        return tx.budgetPeriod.create({
          data: { tenantId, name: 'hack', periodType: 'ANNUAL', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
        });
      }),
    ).rejects.toThrow();
  });
});
