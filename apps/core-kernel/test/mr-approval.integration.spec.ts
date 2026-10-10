/**
 * Material Requisition Approval Flow Integration Test
 * ============================================================
 * POST /api/v1/requisitions/:id/submit
 * POST /api/v1/requisitions/:id/approve
 * POST /api/v1/requisitions/:id/reject
 *
 * ТЕСТИЙН ХАМРАХ ХҮРЭЭorder:
 *   - Submit: DRAFT → PENDING_APPROVAL
 *   - Approve: PENDING_APPROVAL → APPROVED (+ idempotency)
 *   - Reject: PENDING_APPROVAL → REJECTED (+ idempotency)
 *   - Full flow: DRAFT → submit → approve → давхар approve (idempotent)
 *   - Outbox events DB-д бичигдсэн байгааг шалгах
 * ============================================================
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, TierType, UserRole } from '@prisma/client';

import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { configureApp } from '../src/common/http/configure-app';
import { ADMIN_DB_URL } from './helpers/db-urls';

// ── Redis mock — нийтлэг helper [TEST-003] (апп-ын бүх Redis командтай) ──
const redisMock = createRedisMock();

// ── Тогтмолууд ─────────────────────────────────────────────
const TEST_SLUG    = process.env.DEV_TENANT_SLUG ?? 'test-tenant';
const REQUESTER_EMAIL  = `mr-approval-req-${Date.now()}@example.com`;
const APPROVER_EMAIL   = `mr-approval-apr-${Date.now()}@example.com`;
const TEST_PASSWORD    = 'Test1234!';
const BASE_URL         = '/api/v1/requisitions';

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;

let requesterToken: string;
let approverToken: string;

let testTenantId: string;
let requesterAuthId: string;
let approverAuthId: string;

// ────────────────────────────────────────────────────────────
// Helper: MR үүсгэж ID буцаах
// ────────────────────────────────────────────────────────────
async function createDraftMr(token: string): Promise<string> {
  const res = await supertest(app.getHttpServer())
    .post(BASE_URL)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-slug', TEST_SLUG)
    .send({
      title: 'Approval Test MR',
      department: 'Test Dept',
      items: [{ description: 'Item A', quantity: 2, unitPrice: 1000 }],
    });
  expect(res.status).toBe(201);
  return res.body.id;
}

// ── Tenant resolver mock ────────────────────────────────────
function makeTenantResolver() {
  return async (slug: string): Promise<string | null> => {
    return slug === TEST_SLUG ? testTenantId : null;
  };
}

// ────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Superuser Prisma
  prismaAdmin = new PrismaClient({
    datasources: { db: { url: ADMIN_DB_URL } }, // Phase 4.8.5
  });
  await prismaAdmin.$connect();

  // 2. Tenant upsert
  const upsertedTenant = await prismaAdmin.tenant.upsert({
    where: { slug: TEST_SLUG },
    update: { isActive: true },
    create: { name: 'Test Tenant', slug: TEST_SLUG, tier: TierType.TIER1 },
  });
  testTenantId = upsertedTenant.id;

  // 3. NestJS TestingModule
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redisMock)
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  // main.ts-тэй ИЖИЛ тохиргоо (pipe, prefix, multipart) [VALID-001]
  await configureApp(app);

  app.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const res = ctx.getResponse() as any;
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const body = exception.getResponse();
        typeof res.code === 'function'
          ? res.code(status).send(body)
          : res.status(status).send(body);
      } else {
        console.error('[ERROR]', exception);
        typeof res.code === 'function'
          ? res.code(500).send({ statusCode: 500, message: 'Internal server error' })
          : res.status(500).send({ statusCode: 500, message: 'Internal server error' });
      }
    },
  } as ExceptionFilter);

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // 4. Guard patch [DI-007]
  const patchFn = makeTenantResolver();
  let patchedSvc: TenantCacheService | null = null;
  try {
    patchedSvc = app.get(TenantCacheService);
    patchedSvc!.getTenantId = patchFn;
  } catch (e) {
    console.error('[WARN] TenantCacheService patch алдаа:', String(e));
  }
  try {
    const guard = app.get(TenantAuthGuard);
    if (patchedSvc) (guard as any)['tenantCacheService'] = patchedSvc;
    (guard as any)['configService'] = { get: (key: string) => process.env[key] };
  } catch (e) {
    console.error('[WARN] TenantAuthGuard patch алдаа:', String(e));
  }

  // 5. Supabase admin client
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 6. Requester хэрэглэгч үүсгэх
  const { data: reqData, error: reqErr } = await supabaseAdmin.auth.admin.createUser({
    email: REQUESTER_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Approval Requester' },
  });
  if (reqErr || !reqData?.user) throw new Error(`Requester createUser алдаа: ${reqErr?.message}`);
  requesterAuthId = reqData.user.id;
  await prismaAdmin.coreUser.create({
    data: { tenantId: testTenantId, authId: requesterAuthId, email: REQUESTER_EMAIL, fullName: 'Approval Requester', role: UserRole.REQUESTER },
  });

  // 7. Approver хэрэглэгч үүсгэх
  const { data: aprData, error: aprErr } = await supabaseAdmin.auth.admin.createUser({
    email: APPROVER_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Approval Approver' },
  });
  if (aprErr || !aprData?.user) throw new Error(`Approver createUser алдаа: ${aprErr?.message}`);
  approverAuthId = aprData.user.id;
  await prismaAdmin.coreUser.create({
    data: { tenantId: testTenantId, authId: approverAuthId, email: APPROVER_EMAIL, fullName: 'Approval Approver', role: UserRole.APPROVER },
  });

  // 8. JWT авах
  const supabaseAnon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  const { data: reqSignIn } = await supabaseAnon.auth.signInWithPassword({ email: REQUESTER_EMAIL, password: TEST_PASSWORD });
  if (!reqSignIn?.session) throw new Error('Requester signIn алдаа');
  requesterToken = reqSignIn.session.access_token;

  const { data: aprSignIn } = await supabaseAnon.auth.signInWithPassword({ email: APPROVER_EMAIL, password: TEST_PASSWORD });
  if (!aprSignIn?.session) throw new Error('Approver signIn алдаа');
  approverToken = aprSignIn.session.access_token;
}, 60_000);

// ────────────────────────────────────────────────────────────
afterAll(async () => {
  await prismaAdmin?.approvalLog
    .deleteMany({ where: { tenantId: testTenantId } })
    .catch(() => {});
  await prismaAdmin?.outboxEvent
    .deleteMany({ where: { tenantId: testTenantId } })
    .catch(() => {});
  await prismaAdmin?.mrHeader
    .deleteMany({ where: { tenantId: testTenantId } })
    .catch(() => {});

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (requesterAuthId) await supabaseAdmin.auth.admin.deleteUser(requesterAuthId).catch(() => {});
  if (approverAuthId) await supabaseAdmin.auth.admin.deleteUser(approverAuthId).catch(() => {});

  await prismaAdmin?.coreUser
    .deleteMany({ where: { tenantId: testTenantId, email: { in: [REQUESTER_EMAIL, APPROVER_EMAIL] } } })
    .catch(() => {});

  await app?.close();
  await prismaAdmin?.$disconnect();
}, 30_000);

// ============================================================
// SUBMIT тест
// ============================================================
describe('POST /requisitions/:id/submit', () => {
  it('✅ DRAFT → submit → 200, status = PENDING_APPROVAL', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    expect(res.body.version).toBeGreaterThan(1);
  });

  it('❌ PENDING_APPROVAL MR-г дахин submit хийх → 403', async () => {
    const mrId = await createDraftMr(requesterToken);
    // Эхлээд submit
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    // Дахин submit
    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(403);
  });

  it('❌ Approver (өөр хэрэглэгч) submit хийх → 403', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(403);
  });

  it('❌ Token байхгүй → 401', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(401);
  });
});

// ============================================================
// APPROVE тест
// ============================================================
describe('POST /requisitions/:id/approve', () => {
  it('✅ PENDING_APPROVAL → approve → 200, status = APPROVED', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ notes: 'Батлагдлаа' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
  });

  it('✅ Давхар approve → 200 (idempotent)', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    // Эхний approve
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    // Хоёр дахь approve — idempotent буцаах ёстой
    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(200);

    // DB-д зөвхөн 1 л approval log байна
    const logs = await prismaAdmin.approvalLog.findMany({
      where: { mrId, action: 'APPROVED' },
    });
    expect(logs).toHaveLength(1);
  });

  it('❌ DRAFT MR-г approve хийх → 403', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(403);
  });

  it('❌ Token байхгүй → 401', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    expect(res.status).toBe(401);
  });
});

// ============================================================
// REJECT тест
// ============================================================
describe('POST /requisitions/:id/reject', () => {
  it('✅ PENDING_APPROVAL → reject → 200, status = REJECTED', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ reason: 'Буруу тодорхойлолт' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });

  it('✅ Давхар reject → 200 (idempotent)', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ reason: 'Шалтгаан 1' });

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ reason: 'Шалтгаан 2' });

    expect(res.status).toBe(200);

    // DB-д 1 л log
    const logs = await prismaAdmin.approvalLog.findMany({
      where: { mrId, action: 'REJECTED' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].reason).toBe('Шалтгаан 1'); // Эхний reason хадгалагдсан
  });

  it('❌ reason байхгүй → 400', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({}); // reason байхгүй

    expect(res.status).toBe(400);
  });

  it('❌ DRAFT MR-г reject хийх → 403', async () => {
    const mrId = await createDraftMr(requesterToken);

    const res = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ reason: 'Шалтгаан' });

    expect(res.status).toBe(403);
  });
});

// ============================================================
// FULL FLOW тест
// ============================================================
describe('Full approval flow', () => {
  it('✅ DRAFT → submit → approve → давхар approve (idempotent) + version шалгах', async () => {
    const mrId = await createDraftMr(requesterToken);

    // 1. Submit
    const submitRes = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe('PENDING_APPROVAL');
    const versionAfterSubmit = submitRes.body.version;

    // 2. Approve
    const approveRes = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    expect(approveRes.body.version).toBeGreaterThan(versionAfterSubmit);

    // 3. Давхар approve → idempotent
    const idempotentRes = await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});
    expect(idempotentRes.status).toBe(200);
  });
});

// ============================================================
// OUTBOX EVENT тест
// ============================================================
describe('Outbox events', () => {
  it('✅ Submit → MR_SUBMITTED event DB-д бичигдсэн байна', async () => {
    const mrId = await createDraftMr(requesterToken);

    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    const events = await prismaAdmin.outboxEvent.findMany({
      where: { aggregateId: mrId, eventType: 'MR_SUBMITTED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].aggregateType).toBe('MR');
  });

  it('✅ Approve → MR_APPROVED event DB-д бичигдсэн байна', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    const events = await prismaAdmin.outboxEvent.findMany({
      where: { aggregateId: mrId, eventType: 'MR_APPROVED' },
    });
    expect(events).toHaveLength(1);
  });

  it('✅ Reject → MR_REJECTED event DB-д бичигдсэн байна', async () => {
    const mrId = await createDraftMr(requesterToken);
    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/submit`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({});

    await supertest(app.getHttpServer())
      .post(`${BASE_URL}/${mrId}/reject`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('x-tenant-slug', TEST_SLUG)
      .send({ reason: 'Test reject' });

    const events = await prismaAdmin.outboxEvent.findMany({
      where: { aggregateId: mrId, eventType: 'MR_REJECTED' },
    });
    expect(events).toHaveLength(1);
  });
});
