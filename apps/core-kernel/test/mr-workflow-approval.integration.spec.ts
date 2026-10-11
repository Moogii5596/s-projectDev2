/**
 * Phase 6.0b [SEC-004] — MR батлалт workflow-ийн алхам, role, quorum-ийг дагана (2026-10-10)
 * ============================================================
 * Өмнө: `POST /requisitions/:id/approve` нь ямар ч гишүүнд (REQUESTER өөрийн MR-г ч) amount_rules-ийн
 * олон алхмыг алгасаж шууд APPROVED болгодог; workflow instance / SLA PENDING хэвээр үлддэг байв.
 *
 * Definition (amount_rules):
 *   < 1,000,000  → [APPROVER ×1]
 *   ≥ 1,000,000  → [APPROVER quorum 2] → [ADMIN ×1]
 * ТУСДАА tenant (wf-<ts>). Ажиллуулах: pnpm --filter @s-project/core-kernel test:integration
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { MrStatus, PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { configureApp } from '../src/common/http/configure-app';
import { ADMIN_DB_URL } from './helpers/db-urls';

const STAMP = Date.now();
const SLUG = `wf-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const USERS = {
  req: UserRole.REQUESTER,
  appr1: UserRole.APPROVER,
  appr2: UserRole.APPROVER,
  appr3: UserRole.APPROVER,
  admin: UserRole.ADMIN,
  viewer: UserRole.VIEWER,
} as const;
type Who = keyof typeof USERS;

const RULES = {
  amount_rules: [
    { min: 0, max: 1_000_000, steps: [{ order: 1, role: 'APPROVER', quorum: 1 }] },
    {
      min: 1_000_000,
      max: null,
      steps: [
        { order: 1, role: 'APPROVER', quorum: 2 },
        { order: 2, role: 'ADMIN', quorum: 1 },
      ],
    },
  ],
};

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let tenantId = '';
let allocationId = '';
const tokens = {} as Record<Who, string>;
const coreIds = {} as Record<Who, string>;
const authIds: string[] = [];

const api = () => supertest(app.getHttpServer());
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST });
const approve = (who: Who, id: string) => api().post(`/api/v1/requisitions/${id}/approve`).set(as(who)).send({});
const reject = (who: Who, id: string) => api().post(`/api/v1/requisitions/${id}/reject`).set(as(who)).send({ reason: 'үгүй' });

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  await prismaAdmin.$connect();
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'WF', slug: SLUG, tier: TierType.TIER1 } })).id;
  await prismaAdmin.workflowDefinition.create({
    data: { tenantId, name: 'wf-amount', stepsConfig: RULES, slaHours: 24, isActive: true },
  });
  const period = await prismaAdmin.budgetPeriod.create({
    data: { tenantId, name: 'WF', periodType: 'ANNUAL', startDate: new Date('2000-01-01'), endDate: new Date('2099-12-31') },
  });
  allocationId = (await prismaAdmin.budgetAllocation.create({
    data: { tenantId, periodId: period.id, department: 'IT', totalAmount: 100_000_000 },
  })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(createRedisMock())
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  app.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      const res = host.switchToHttp().getResponse() as any;
      if (exception instanceof HttpException) res.code(exception.getStatus()).send(exception.getResponse());
      else {
        console.error('[ERROR]', exception);
        res.code(500).send({ statusCode: 500, message: 'Internal server error' });
      }
    },
  } as ExceptionFilter);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // [DI-007] guard-ийн DI холбоос; tenant lookup бодит (системийн холболт)
  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = app.get(TenantCacheService);
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  for (const who of Object.keys(USERS) as Who[]) {
    const email = `wf-${who}-${STAMP}@example.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    coreIds[who] = (await prismaAdmin.coreUser.create({
      data: { tenantId, authId: data.user.id, email, fullName: who, role: USERS[who] },
    })).id;
    const { data: s } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }
}, 90_000);

afterAll(async () => {
  if (tenantId) await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  await app?.close();
  await prismaAdmin?.$disconnect();
}, 30_000);

const submitted = async (who: Who, title: string, amount: number) => {
  const c = await api().post('/api/v1/requisitions').set(as(who))
    .send({ title, department: 'IT', items: [{ description: title, quantity: 1, unitPrice: amount }] });
  expect(c.status).toBe(201);
  const s = await api().post(`/api/v1/requisitions/${c.body.id}/submit`).set(as(who)).send({});
  expect(s.status).toBe(200);
  return c.body.id as string;
};
const instanceOf = async (mrId: string) => {
  const mr = await prismaAdmin.mrHeader.findUniqueOrThrow({ where: { id: mrId } });
  return prismaAdmin.workflowInstance.findUniqueOrThrow({
    where: { id: mr.workflowInstanceId! },
    include: { slaLogs: { orderBy: { createdAt: 'asc' } }, stepLogs: { orderBy: { actedAt: 'asc' } } },
  });
};
const commitment = (mrId: string) => prismaAdmin.budgetCommitment.findUnique({ where: { mrHeaderId: mrId } });

describe('🔐 Эрх [SEC-004]', () => {
  it('REQUESTER өөрийн MR → 403; VIEWER/REQUESTER бусдын MR → 403; MR өөрчлөгдөхгүй', async () => {
    const id = await submitted('req', 'small-1', 500_000);
    const self = await approve('req', id);
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/Өөрийн/);
    expect((await reject('req', id)).status).toBe(403);
    const v = await approve('viewer', id);
    expect(v.status).toBe(403);
    expect(v.body.message).toBe('Энэ алхамд APPROVER эрх шаардлагатай');
    expect((await reject('viewer', id)).status).toBe(403);
    expect((await prismaAdmin.mrHeader.findUniqueOrThrow({ where: { id } })).status).toBe(MrStatus.PENDING_APPROVAL);
    expect(await prismaAdmin.approvalLog.count({ where: { mrId: id } })).toBe(0);
  });

  it('ADMIN өөрийн үүсгэсэн MR-г батлахгүй (override ч гэсэн)', async () => {
    const id = await submitted('admin', 'admin-own', 200_000);
    expect((await approve('admin', id)).status).toBe(403);
    expect((await approve('appr1', id)).status).toBe(200);
  });
});

describe('🪜 1 алхам (< 1,000,000)', () => {
  it('APPROVER → APPROVED; workflow APPROVED 1/1; SLA COMPLETED (escalation хөндөхгүй); төсөв SPENT', async () => {
    const id = await submitted('req', 'small-2', 300_000);
    const r = await approve('appr1', id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APPROVED');
    expect(r.body.workflow).toMatchObject({ status: 'APPROVED', currentStep: 1, totalSteps: 1 });
    expect(r.body.workflow.approvals).toEqual([expect.objectContaining({ stepIndex: 0, actorId: coreIds.appr1, action: 'APPROVED' })]);

    const inst = await instanceOf(id);
    expect(inst).toMatchObject({ status: 'APPROVED', currentStep: 1 });
    expect(inst.slaLogs.length).toBeGreaterThan(0);
    expect(inst.slaLogs.every((l) => l.status === 'COMPLETED' && l.completedAt)).toBe(true);
    expect((await commitment(id))!.status).toBe('SPENT');
  });
});

describe('🪜 2 алхам (≥ 1,000,000): APPROVER quorum 2 → ADMIN', () => {
  let id = '';

  it('submit → workflow 0/2, SLA 1-р алхамд (APPROVER)', async () => {
    id = await submitted('req', 'big-1', 5_000_000);
    const g = await api().get(`/api/v1/requisitions/${id}`).set(as('req'));
    expect(g.status).toBe(200);
    expect(g.body.workflow).toMatchObject({
      status: 'PENDING',
      currentStep: 0,
      totalSteps: 2,
      steps: [{ order: 1, role: 'APPROVER', quorum: 2 }, { order: 2, role: 'ADMIN', quorum: 1 }],
    });
    const inst = await instanceOf(id);
    expect(inst.slaLogs.map((l) => [l.stepOrder, l.status])).toEqual([[1, 'PENDING']]);
    expect([coreIds.appr1, coreIds.appr2, coreIds.appr3]).toContain(inst.slaLogs[0].assignedToId);
  });

  it('appr1 → quorum 1/2: алхам хэвээр, MR PENDING_APPROVAL; давтан → 200 өөрчлөлтгүй', async () => {
    const r = await approve('appr1', id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PENDING_APPROVAL');
    expect(r.body.workflow).toMatchObject({ currentStep: 0, totalSteps: 2 });
    const version = r.body.version;
    const again = await approve('appr1', id);
    expect(again.status).toBe(200);
    expect(again.body.version).toBe(version);
    expect(again.body.workflow.approvals).toHaveLength(1);
  });

  it('appr2 → quorum 2/2: 2-р алхам руу; 1-р SLA COMPLETED, 2-р SLA ADMIN-д PENDING', async () => {
    const r = await approve('appr2', id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PENDING_APPROVAL');
    expect(r.body.workflow).toMatchObject({ currentStep: 1, status: 'PENDING' });
    const inst = await instanceOf(id);
    expect(inst.slaLogs.map((l) => [l.stepOrder, l.status, l.assignedToId])).toEqual([
      [1, 'COMPLETED', expect.any(String)],
      [2, 'PENDING', coreIds.admin],
    ]);
    expect((await commitment(id))!.status).toBe('COMMITTED');
  });

  it('2-р алхам: APPROVER (appr3) → 403 "ADMIN эрх"; ADMIN → APPROVED, төсөв SPENT, MR_APPROVED 1 удаа', async () => {
    const w = await approve('appr3', id);
    expect(w.status).toBe(403);
    expect(w.body.message).toBe('Энэ алхамд ADMIN эрх шаардлагатай');

    const r = await approve('admin', id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'APPROVED', approvedBy: coreIds.admin });
    expect(r.body.workflow).toMatchObject({ status: 'APPROVED', currentStep: 2, totalSteps: 2 });
    expect(r.body.workflow.approvals.map((a: { actorId: string; stepIndex: number }) => [a.stepIndex, a.actorId])).toEqual([
      [0, coreIds.appr1],
      [0, coreIds.appr2],
      [1, coreIds.admin],
    ]);
    const inst = await instanceOf(id);
    expect(inst.status).toBe('APPROVED');
    expect(inst.slaLogs.some((l) => l.status === 'PENDING')).toBe(false);
    expect((await commitment(id))!.status).toBe('SPENT');
    expect(await prismaAdmin.outboxEvent.count({ where: { aggregateId: id, eventType: 'MR_APPROVED' } })).toBe(1);

    // батлагдсаны дараа: шинэ хүн → 403 (статус), өмнө баталсан → 200 (idempotent)
    expect((await approve('appr3', id)).status).toBe(403);
    expect((await approve('appr1', id)).status).toBe(200);
  });

  it('2-р алхамд ADMIN татгалзана → MR/workflow REJECTED, SLA хаагдана, төсөв RELEASED', async () => {
    const id2 = await submitted('req', 'big-2', 2_000_000);
    expect((await approve('appr1', id2)).status).toBe(200);
    expect((await approve('appr2', id2)).status).toBe(200);
    expect((await reject('appr3', id2)).status).toBe(403); // 2-р алхам ADMIN
    const r = await reject('admin', id2);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('REJECTED');
    expect(r.body.workflow.status).toBe('REJECTED');
    const inst = await instanceOf(id2);
    expect(inst.status).toBe('REJECTED');
    expect(inst.stepLogs.at(-1)).toMatchObject({ stepOrder: 1, action: 'REJECTED', actorId: coreIds.admin });
    expect(inst.slaLogs.some((l) => l.status === 'PENDING')).toBe(false);
    expect((await commitment(id2))!.status).toBe('RELEASED');
    expect((await approve('admin', id2)).status).toBe(403);
  });

  it('зэрэгцээ: quorum 2 алхамд 2 APPROVER нэг зэрэг → 2 удаа тоологдоно, алхам яг 1 удаа шилжинэ', async () => {
    const id3 = await submitted('req', 'big-3', 3_000_000);
    const [a, b] = await Promise.all([approve('appr1', id3), approve('appr2', id3)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const inst = await instanceOf(id3);
    expect(inst.currentStep).toBe(1);
    expect(inst.stepLogs.filter((l) => l.action === 'APPROVED')).toHaveLength(2);
    expect(inst.slaLogs.map((l) => [l.stepOrder, l.status])).toEqual([
      [1, 'COMPLETED'],
      [2, 'PENDING'],
    ]);
  });
});

describe('🗂 Хуучин MR (workflow instance-гүй)', () => {
  it('1 алхам APPROVER: VIEWER → 403, APPROVER → APPROVED (workflow LEGACY)', async () => {
    const mr = await prismaAdmin.mrHeader.create({
      data: {
        tenantId,
        mrNumber: `MR-LEGACY-${STAMP}`,
        title: 'legacy',
        status: MrStatus.PENDING_APPROVAL,
        requesterId: coreIds.req,
        totalAmount: 10_000,
      },
    });
    expect((await approve('viewer', mr.id)).status).toBe(403);
    const r = await approve('appr3', mr.id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APPROVED');
    expect(r.body.workflow).toMatchObject({ instanceId: null, status: 'LEGACY' });
  });
});

describe('🔢 MR дугаар [CONC-002]', () => {
  it('нэг tenant-д 30 зэрэгцээ үүсгэлт → бүгд 201, дугаар давхардалгүй, цувралаар', async () => {
    const before = await prismaAdmin.mrHeader.count({ where: { tenantId, mrNumber: { startsWith: `MR-${new Date().getFullYear()}-` } } });
    const rs = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        api().post('/api/v1/requisitions').set(as(i % 2 ? 'req' : 'appr1'))
          .send({ title: `conc-${i}`, items: [{ description: 'x', quantity: 1, unitPrice: 1 }] }),
      ),
    );
    // QA-09 (v0.2.1): унавал ЯМАР алдаа гарсныг (статус + body) мессежид харуулна — шалтгааныг таахгүй, баримтаар батална
    const bad = rs.map((r, i) => ({ i, status: r.status, body: r.status === 201 ? undefined : r.body })).filter((x) => x.status !== 201);
    expect(bad, `QA-09: ${JSON.stringify(bad)}`).toEqual([]);
    const nums = rs.map((r) => Number(String(r.body.mrNumber).split('-').pop())).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(30);
    expect(nums).toEqual(Array.from({ length: 30 }, (_, i) => before + 1 + i));
  }, 60_000);
});

it('төсөв: SPENT нийлбэр зөв (small-2 300k + big-1 5M + admin-own 200k)', async () => {
  const a = await prismaAdmin.budgetAllocation.findUniqueOrThrow({ where: { id: allocationId } });
  expect(Number(a.spentAmount)).toBe(5_500_000);
});

// ── SEC-005 (v0.1.6): POST /auth/register — зөвхөн OWNER/ADMIN, tenant = нэвтэрсэн хэрэглэгчийнх ──
describe('SEC-005 POST /auth/register', () => {
  const reg = (who: Who, email: string, host = HOST) =>
    api().post('/api/v1/auth/register').set({ ...as(who), Host: host }).send({ email, password: 'Password1234!', fullName: 'SEC-005' });

  it.each(['viewer', 'req', 'appr1'] as Who[])('%s → 403, Auth/core хэрэглэгч үүсэхгүй', async (who) => {
    const email = `sec005-${who}-${STAMP}@example.com`;
    const r = await reg(who, email);
    expect(r.status).toBe(403);
    expect(await prismaAdmin.coreUser.count({ where: { email } })).toBe(0);
  });

  it('admin → 201, өөрийн tenant-д REQUESTER (Host-оор өөр tenant сонгож чадахгүй — guard 403)', async () => {
    const email = `sec005-ok-${STAMP}@example.com`;
    const r = await reg('admin', email);
    expect(r.status).toBe(201);
    const u = await prismaAdmin.coreUser.findFirstOrThrow({ where: { email } });
    authIds.push(u.authId);
    expect(u).toMatchObject({ tenantId, role: 'REQUESTER' });

    const other = await reg('admin', `sec005-x-${STAMP}@example.com`, 'test-tenant.example.com');
    expect(other.status).toBe(403);
  });
});
