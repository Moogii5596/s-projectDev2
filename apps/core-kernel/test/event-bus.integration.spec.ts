/**
 * Phase 5 — Event Bus integration (2026-10-10)
 * ============================================================
 * 5.2 Гинж: MR үүсгэх → илгээх (төсөв COMMITTED, workflow, SLA, outbox) → батлах (SPENT) / татгалзах (RELEASED)
 *     → OutboxPoller → Redis `tenant.{id}.{type}` суваг руу CloudEvent (хадгалсан id-тай) [EVT-002/003]
 * 5.0 Зэрэгцээ 4 poller → event БҮР яг нэг удаа publish [EVT-001]
 * 5.3 Retry (retry_count++, backoff) → 3 дахь алдаа → DLQ төлөв + dlq_events; PUBLISHED дахин илгээгдэхгүй
 * Cron: vitest.integration.config.ts → OUTBOX_POLLER_CRON=off (тест poller-ийг шууд дуудна).
 * ТУСДАА 2 tenant (evt-ok/evt-fail-<ts>). Ажиллуулах: pnpm --filter @s-project/core-kernel test:integration
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { configureApp } from '../src/common/http/configure-app';
import { OutboxPollerService } from '../src/modules/event-bus/outbox-poller.service';
import { EventTypes } from '../src/modules/event-bus/interfaces/cloud-event.interface';
import { ADMIN_DB_URL } from './helpers/db-urls';
import { activateTestModules, grantTestDebugAccess } from './helpers/activate-test-modules';

const STAMP = Date.now();
const SLUG = { ok: `evt-ok-${STAMP}`, fail: `evt-fail-${STAMP}` };
const HOST = `${SLUG.ok}.example.com`;
const PASSWORD = 'Test1234!';
const USERS = { req: UserRole.REQUESTER, appr: UserRole.APPROVER } as const;
type Who = keyof typeof USERS;

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let poller: OutboxPollerService;
const tenant = { ok: '', fail: '' };
const tokens = {} as Record<Who, string>;
const authIds: string[] = [];
let allocationId = '';

/** Redis publish-ийг барьж авна; fail tenant-ийн суваг → алдаа (Redis унасан мэт) */
const published: { channel: string; event: { id: string; type: string; tenantid: string; data: Record<string, unknown> } }[] = [];
const redis = createRedisMock();
redis.publish = async (channel: string, message: string) => {
  if (tenant.fail && channel.startsWith(`tenant.${tenant.fail}.`)) throw new Error('redis down (test)');
  published.push({ channel, event: JSON.parse(message) });
  return 1;
};

const api = () => supertest(app.getHttpServer());
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST });
const outbox = (where: Record<string, unknown>) => prismaAdmin.outboxEvent.findMany({ where, orderBy: { createdAt: 'asc' } });
const publishedFor = (cloudEventId: string | null) => published.filter((p) => p.event.id === cloudEventId);

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  await prismaAdmin.$connect();
  tenant.ok = (await prismaAdmin.tenant.create({ data: { name: 'EVT ok', slug: SLUG.ok, tier: TierType.TIER1 } })).id;
  tenant.fail = (await prismaAdmin.tenant.create({ data: { name: 'EVT fail', slug: SLUG.fail, tier: TierType.TIER1 } })).id;
  await activateTestModules(prismaAdmin, [tenant.ok, tenant.fail], ['mr', 'workflow', 'budget']);
  await prismaAdmin.workflowDefinition.create({
    data: { tenantId: tenant.ok, name: 'evt', stepsConfig: [{ order: 0, role: 'APPROVER', quorum: 1 }], isActive: true },
  });
  const period = await prismaAdmin.budgetPeriod.create({
    data: { tenantId: tenant.ok, name: 'EVT', periodType: 'ANNUAL', startDate: new Date('2000-01-01'), endDate: new Date('2099-12-31') },
  });
  allocationId = (await prismaAdmin.budgetAllocation.create({
    data: { tenantId: tenant.ok, periodId: period.id, department: 'IT', totalAmount: 1_000_000 },
  })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
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
  poller = app.get(OutboxPollerService);

  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = app.get(TenantCacheService);
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  for (const who of Object.keys(USERS) as Who[]) {
    const email = `evt-${who}-${STAMP}@example.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    await prismaAdmin.coreUser.create({ data: { tenantId: tenant.ok, authId: data.user.id, email, fullName: who, role: USERS[who] } });
    const { data: s } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }
  await grantTestDebugAccess(prismaAdmin, [tenant.ok, tenant.fail]);
}, 90_000);

afterAll(async () => {
  for (const id of Object.values(tenant)) {
    if (id) await prismaAdmin?.tenant.delete({ where: { id } }).catch((e) => console.error('[cleanup]', e));
  }
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  await app?.close();
  await prismaAdmin?.$disconnect();
}, 30_000);

/** Тест бүр зөвхөн өөрийн tenant-ийн event-ийг шалгана; poller бүх tenant-ийн бэлэн event-ийг боловсруулна */
const drain = async () => { while ((await poller.pollAndPublish()) > 0) { /* дуустал */ } };

const createMr = async (title: string, amount: number) => {
  const c = await api().post('/api/v1/requisitions').set(as('req'))
    .send({ title, department: 'IT', items: [{ description: title, quantity: 1, unitPrice: amount }] });
  expect(c.status).toBe(201);
  return c.body.id as string;
};

describe('🔗 5.2 Гинж: MR → Workflow → Budget → Outbox → Redis', () => {
  it('батлах зам: COMMITTED → SPENT; MR_SUBMITTED/MR_APPROVED → PUBLISHED, хадгалсан id-тай CloudEvent', async () => {
    const mrId = await createMr('EVT approve', 300_000);
    expect((await api().post(`/api/v1/requisitions/${mrId}/submit`).set(as('req')).send({})).status).toBe(200);

    const c1 = await prismaAdmin.budgetCommitment.findUnique({ where: { mrHeaderId: mrId } });
    expect(c1).toMatchObject({ status: 'COMMITTED' });
    expect(Number((await prismaAdmin.budgetAllocation.findUnique({ where: { id: allocationId } }))!.committedAmount)).toBe(300_000);
    const mr = await prismaAdmin.mrHeader.findUnique({ where: { id: mrId } });
    expect(mr!.workflowInstanceId).not.toBeNull();
    expect(await prismaAdmin.workflowSlaLog.count({ where: { instanceId: mr!.workflowInstanceId! } })).toBe(1);

    expect((await api().post(`/api/v1/requisitions/${mrId}/approve`).set(as('appr')).send({})).status).toBe(200);
    expect((await prismaAdmin.budgetCommitment.findUnique({ where: { mrHeaderId: mrId } }))!.status).toBe('SPENT');

    const before = await outbox({ tenantId: tenant.ok, aggregateId: mrId });
    expect(before.map((e) => [e.eventType, e.cloudEventType, e.status])).toEqual([
      ['MR_SUBMITTED', EventTypes.MR_SUBMITTED, 'PENDING'],
      ['MR_APPROVED', EventTypes.MR_APPROVED, 'PENDING'],
    ]);
    expect(before.every((e) => e.cloudEventId)).toBe(true);

    await drain();
    const after = await outbox({ tenantId: tenant.ok, aggregateId: mrId });
    expect(after.map((e) => e.status)).toEqual(['PUBLISHED', 'PUBLISHED']);
    for (const e of after) {
      const p = publishedFor(e.cloudEventId);
      expect(p).toHaveLength(1);
      expect(p[0].channel).toBe(`tenant.${tenant.ok}.${e.cloudEventType}`);
      expect(p[0].event).toMatchObject({ type: e.cloudEventType, tenantid: tenant.ok, data: { mrId } });
    }
  });

  it('татгалзах зам: RELEASED; MR_REJECTED → PUBLISHED', async () => {
    const mrId = await createMr('EVT reject', 100_000);
    expect((await api().post(`/api/v1/requisitions/${mrId}/submit`).set(as('req')).send({})).status).toBe(200);
    expect((await api().post(`/api/v1/requisitions/${mrId}/reject`).set(as('appr')).send({ reason: 'no' })).status).toBe(200);
    expect((await prismaAdmin.budgetCommitment.findUnique({ where: { mrHeaderId: mrId } }))!.status).toBe('RELEASED');
    await drain();
    const rejected = (await outbox({ tenantId: tenant.ok, aggregateId: mrId })).find((e) => e.eventType === 'MR_REJECTED')!;
    expect(rejected.status).toBe('PUBLISHED');
    expect(publishedFor(rejected.cloudEventId)[0].event.data).toMatchObject({ mrId, reason: 'no' });
    // allocation: 300k SPENT (1-р тест), 100k RELEASED → committed 0
    const a = await prismaAdmin.budgetAllocation.findUnique({ where: { id: allocationId } });
    expect([Number(a!.committedAmount), Number(a!.spentAmount)]).toEqual([0, 300_000]);
  });

  it('PUBLISHED event дахин илгээгдэхгүй', async () => {
    const n = published.length;
    await drain();
    expect(published.filter((p) => p.event.tenantid === tenant.ok)).toHaveLength(
      published.slice(0, n).filter((p) => p.event.tenantid === tenant.ok).length,
    );
  });
});

describe('🔒 5.0 Зэрэгцээ poller — event бүр яг нэг удаа [EVT-001]', () => {
  it('30 event, 4 poller зэрэг → publish тус бүр 1, бүгд PUBLISHED', async () => {
    const ids = Array.from({ length: 30 }, () => crypto.randomUUID());
    await prismaAdmin.outboxEvent.createMany({
      data: ids.map((cloudEventId, i) => ({
        tenantId: tenant.ok, aggregateType: 'TEST', aggregateId: crypto.randomUUID(), eventType: 'CONCURRENCY',
        cloudEventId, cloudEventType: 'mn.s-project.test.concurrency', payload: { i },
      })),
    });
    await Promise.all([poller.pollAndPublish(), poller.pollAndPublish(), poller.pollAndPublish(), poller.pollAndPublish()]);
    await drain();
    const counts = ids.map((id) => publishedFor(id).length);
    expect(counts).toEqual(ids.map(() => 1));
    expect(await prismaAdmin.outboxEvent.count({ where: { cloudEventId: { in: ids }, status: 'PUBLISHED' } })).toBe(30);
  });
});

describe('♻️ 5.3 Retry + DLQ', () => {
  it('алдаа → retry_count 1, backoff ~30с, PENDING; 3 дахь алдаа → DLQ төлөв + dlq_events (ижил transaction)', async () => {
    const [fresh, last] = await Promise.all([
      prismaAdmin.outboxEvent.create({ data: { tenantId: tenant.fail, aggregateType: 'TEST', aggregateId: crypto.randomUUID(), eventType: 'RETRY', payload: { n: 0 }, cloudEventId: crypto.randomUUID() } }),
      prismaAdmin.outboxEvent.create({ data: { tenantId: tenant.fail, aggregateType: 'TEST', aggregateId: crypto.randomUUID(), eventType: 'RETRY', payload: { n: 2 }, retryCount: 2, cloudEventId: crypto.randomUUID() } }),
    ]);
    await drain();

    const f = await prismaAdmin.outboxEvent.findUnique({ where: { id: fresh.id } });
    expect(f).toMatchObject({ status: 'PENDING', retryCount: 1, lastError: 'redis down (test)' });
    // DB-ийн цагаар (TZ / Prisma DateTime хөрвүүлэлтээс үл хамаарна)
    const [{ delay }] = await prismaAdmin.$queryRaw<{ delay: number }[]>`
      SELECT extract(epoch FROM next_retry_at - now())::float8 AS delay FROM outbox_events WHERE id = ${fresh.id}::uuid`;
    expect(delay).toBeGreaterThan(20);
    expect(delay).toBeLessThanOrEqual(31);

    const l = await prismaAdmin.outboxEvent.findUnique({ where: { id: last.id } });
    expect(l).toMatchObject({ status: 'DLQ', retryCount: 3 });
    const dlq = await prismaAdmin.dlqEvent.findMany({ where: { tenantId: tenant.fail } });
    expect(dlq).toHaveLength(1);
    expect(dlq[0]).toMatchObject({ errorMessage: 'redis down (test)', status: 'PENDING' });
    expect((dlq[0].originalEvent as { id: string }).id).toBe(last.id);

    // backoff хугацаа болоогүй тул дахин оролдохгүй; DLQ-ийг ч дахин авахгүй
    await drain();
    expect((await prismaAdmin.outboxEvent.findUnique({ where: { id: fresh.id } }))!.retryCount).toBe(1);
    expect(await prismaAdmin.dlqEvent.count({ where: { tenantId: tenant.fail } })).toBe(1);
  });
});
