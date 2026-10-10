/**
 * Phase 4.8.5 — Tenant тусгаарлалт HTTP-ээр (MR + Workflow definition) — 2026-10-10
 * ============================================================
 * Tenant B-ийн хэрэглэгч Tenant A-ийн MR / workflow definition-ийг id-аар ч харж, засаж, батлаж ЧАДАХГҮЙ.
 * Апп `DATABASE_URL`-ээр (app_user бол RLS идэвхтэй) ажиллана; tenant slug → id нь БОДИТ
 * `TenantCacheService.getTenantId` (системийн холболт, Phase 4.8.4) — patch хийхгүй.
 * ТУСДАА 2 tenant (iso-a/b-<ts>). Ажиллуулах: pnpm --filter @s-project/core-kernel test:integration
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
import { ADMIN_DB_URL } from './helpers/db-urls';

const STAMP = Date.now();
const SLUG = { a: `iso-a-${STAMP}`, b: `iso-b-${STAMP}` };
const HOST = { a: `${SLUG.a}.example.com`, b: `${SLUG.b}.example.com` };
const PASSWORD = 'Test1234!';
const USERS = {
  aReq: { tenant: 'a', role: UserRole.REQUESTER },
  aAppr: { tenant: 'a', role: UserRole.APPROVER },
  bAppr: { tenant: 'b', role: UserRole.APPROVER },
  bAdmin: { tenant: 'b', role: UserRole.ADMIN }, // Phase 4.9.1: definition засах эрхтэй
  aAdmin: { tenant: 'a', role: UserRole.ADMIN },
} as const;
type Who = keyof typeof USERS;

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
const tenantIds: Record<'a' | 'b', string> = { a: '', b: '' };
const tokens = {} as Record<Who, string>;
const authIds: string[] = [];
let mrId = '';
let defA = '';

const api = () => supertest(app.getHttpServer());
const as = (who: Who, host: 'a' | 'b' = USERS[who].tenant) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST[host] });

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  await prismaAdmin.$connect();
  for (const t of ['a', 'b'] as const) {
    tenantIds[t] = (await prismaAdmin.tenant.create({ data: { name: `ISO ${t}`, slug: SLUG[t], tier: TierType.TIER1 } })).id;
  }
  defA = (await prismaAdmin.workflowDefinition.create({
    data: { tenantId: tenantIds.a, name: 'A-def', stepsConfig: [{ order: 0, role: 'APPROVER', quorum: 1 }], isActive: true },
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

  // [DI-007] guard-ийн DI холбоос; getTenantId-г PATCH ХИЙХГҮЙ — бодит системийн DB lookup
  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = app.get(TenantCacheService);
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  for (const who of Object.keys(USERS) as Who[]) {
    const email = `iso-${who.toLowerCase()}-${STAMP}@example.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    await prismaAdmin.coreUser.create({
      data: { tenantId: tenantIds[USERS[who].tenant], authId: data.user.id, email, fullName: who, role: USERS[who].role },
    });
    const { data: s } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }
}, 90_000);

afterAll(async () => {
  for (const id of Object.values(tenantIds)) {
    if (id) await prismaAdmin?.tenant.delete({ where: { id } }).catch((e) => console.error('[cleanup]', e));
  }
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  await app?.close();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('🧱 MR — tenant тусгаарлалт', () => {
  it('A: MR үүсгэх → 201, илгээх → PENDING_APPROVAL (бодит tenant lookup)', async () => {
    const c = await api().post('/api/v1/requisitions').set(as('aReq'))
      .send({ title: 'ISO MR', items: [{ description: 'x', quantity: 1, unitPrice: 1000 }] });
    expect(c.status).toBe(201);
    mrId = c.body.id;
    const s = await api().post(`/api/v1/requisitions/${mrId}/submit`).set(as('aReq')).send({});
    expect(s.status).toBe(200);
    expect(s.body.status).toBe('PENDING_APPROVAL');
  });

  it('B: жагсаалтад A-ийн MR алга; id-аар унших/засах/батлах/татгалзах → 404', async () => {
    const list = await api().get('/api/v1/requisitions').set(as('bAppr'));
    expect(list.status).toBe(200);
    expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(mrId);
    expect((await api().get(`/api/v1/requisitions/${mrId}`).set(as('bAppr'))).status).toBe(404);
    expect((await api().put(`/api/v1/requisitions/${mrId}`).set(as('bAppr')).send({ title: 'hack' })).status).toBe(404);
    expect((await api().post(`/api/v1/requisitions/${mrId}/approve`).set(as('bAppr')).send({})).status).toBe(404);
    expect((await api().post(`/api/v1/requisitions/${mrId}/reject`).set(as('bAppr')).send({ reason: 'x' })).status).toBe(404);
    const row = await prismaAdmin.mrHeader.findUnique({ where: { id: mrId } });
    expect(row).toMatchObject({ status: 'PENDING_APPROVAL', title: 'ISO MR' });
  });

  it('B-ийн хэрэглэгч A-ийн Host-оор → 403 (гишүүн биш, SEC-001)', async () => {
    expect((await api().get(`/api/v1/requisitions/${mrId}`).set(as('bAppr', 'a'))).status).toBe(403);
  });

  it('A-ийн approver → APPROVED', async () => {
    const r = await api().post(`/api/v1/requisitions/${mrId}/approve`).set(as('aAppr')).send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APPROVED');
  });
});

describe('🧱 Workflow definition — tenant тусгаарлалт [SEC-002] + эрх/validation [SEC-003]', () => {
  const RULES = { amount_rules: [{ min: 0, max: null, steps: [{ order: 1, role: 'APPROVER', quorum: 1 }] }] };

  it('B: жагсаалтад A-ийн definition алга; B ADMIN A-ийн id-аар засах → 404, A-ийнх өөрчлөгдөхгүй', async () => {
    const list = await api().get('/api/v1/workflow/definitions').set(as('bAppr'));
    expect(list.status).toBe(200);
    expect(list.body.map((d: { id: string }) => d.id)).not.toContain(defA);
    const put = await api().put(`/api/v1/workflow/definitions/${defA}`).set(as('bAdmin'))
      .send({ name: 'hacked', stepsConfig: RULES });
    expect(put.status).toBe(404);
    expect((await prismaAdmin.workflowDefinition.findUnique({ where: { id: defA } }))!.name).toBe('A-def');
  });

  it('APPROVER / REQUESTER → үүсгэх, засах 403 (өмнө нь гишүүн бүр чаддаг байсан)', async () => {
    expect((await api().post('/api/v1/workflow/definitions').set(as('aReq')).send({ name: 'x', stepsConfig: RULES })).status).toBe(403);
    expect((await api().put(`/api/v1/workflow/definitions/${defA}`).set(as('aAppr')).send({ name: 'x', stepsConfig: RULES })).status).toBe(403);
    expect((await prismaAdmin.workflowDefinition.findUnique({ where: { id: defA } }))!.name).toBe('A-def');
  });

  it('body validation → 400 (байхгүй role, хоосон name, илүү талбар); UUID биш id → 400', async () => {
    const bad = [
      { name: 'x', stepsConfig: [{ order: 0, role: 'BOSS' }] },
      { name: '  ', stepsConfig: RULES },
      { name: 'x', stepsConfig: RULES, tenantId: tenantIds.b },
    ];
    for (const body of bad) {
      expect((await api().post('/api/v1/workflow/definitions').set(as('aAdmin')).send(body)).status).toBe(400);
    }
    expect((await api().put('/api/v1/workflow/definitions/not-a-uuid').set(as('aAdmin')).send({ name: 'x', stepsConfig: RULES })).status).toBe(400);
  });

  it('A ADMIN → үүсгэх 201 (өөрийн tenant-д), засах 200', async () => {
    const c = await api().post('/api/v1/workflow/definitions').set(as('aAdmin')).send({ name: 'A-new', stepsConfig: RULES, slaHours: 24 });
    expect(c.status).toBe(201);
    expect(c.body.tenantId).toBe(tenantIds.a);
    const u = await api().put(`/api/v1/workflow/definitions/${c.body.id}`).set(as('aAdmin')).send({ name: 'A-new2', stepsConfig: RULES });
    expect(u.status).toBe(200);
    expect(u.body.name).toBe('A-new2');
  });
});
