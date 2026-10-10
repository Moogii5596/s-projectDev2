/**
 * Хөнгөн модулиудын Integration Test — Phase 4.2–4.4 (Inventory-lite, Vendor-lite, Report-lite)
 * ============================================================
 * Зорилго: платформ шинэ модулийг зөв "залгаж" байгааг батлах —
 *   эрх (ADMIN vs REQUESTER), validation, cursor pagination, атомик өөрчлөлт,
 *   олон модулиас унших тайлан + CSV файл, RLS leakage (app_user).
 * ТУСДАА tenant (lite-it-<ts>). Ажиллуулах: pnpm --filter @s-project/core-kernel test:integration
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
const SLUG = `lite-it-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const EMAILS = { admin: `lite-admin-${STAMP}@example.com`, requester: `lite-req-${STAMP}@example.com` };
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const dbUrl = ADMIN_DB_URL; // Phase 4.8.5: SYSTEM_DATABASE_URL → DATABASE_URL (RLS bypass)
const APP_USER_URL = dbUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let prismaRls: PrismaClient;
let tenantId: string;
const tokens: Record<keyof typeof EMAILS, string> = { admin: '', requester: '' };
const authIds: string[] = [];

const api = () => supertest(app.getHttpServer());
const as = (who: keyof typeof EMAILS) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST });

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'Lite IT', slug: SLUG, tier: TierType.TIER1 } })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(createRedisMock())
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  // main.ts-тэй ИЖИЛ тохиргоо (pipe, prefix, multipart) [VALID-001]
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

  const cache = app.get(TenantCacheService);
  cache.getTenantId = async (slug: string) => (slug === SLUG ? tenantId : null);
  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = cache;
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const roles = { admin: UserRole.ADMIN, requester: UserRole.REQUESTER } as const;
  for (const who of Object.keys(EMAILS) as (keyof typeof EMAILS)[]) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: EMAILS[who], password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    await prismaAdmin.coreUser.create({ data: { tenantId, authId: data.user.id, email: EMAILS[who], fullName: who, role: roles[who] } });
    const { data: s } = await anon.auth.signInWithPassword({ email: EMAILS[who], password: PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }
}, 90_000);

afterAll(async () => {
  await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  await app?.close();
  await prismaRls?.$disconnect();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('📦 Inventory-lite', () => {
  let itemId: string;

  it('REQUESTER үүсгэх → 403; validation → 400', async () => {
    expect((await api().post('/api/v1/inventory/items').set(as('requester')).send({ sku: 'X', name: 'X' })).status).toBe(403);
    expect((await api().post('/api/v1/inventory/items').set(as('admin')).send({ sku: '', name: 'X' })).status).toBe(400);
  });

  it('ADMIN: 3 бараа (1 нь бага үлдэгдэлтэй) → 201; давхар SKU → 409', async () => {
    for (const [sku, quantity, minThreshold] of [['A-1', 10, 0], ['A-2', 2, 5], ['A-3', 7, 0]] as const) {
      const res = await api().post('/api/v1/inventory/items').set(as('admin')).send({ sku, name: sku, quantity, minThreshold });
      expect(res.status).toBe(201);
      if (sku === 'A-1') itemId = res.body.id;
    }
    expect((await api().post('/api/v1/inventory/items').set(as('admin')).send({ sku: 'A-1', name: 'dup' })).status).toBe(409);
  });

  it('Cursor: limit=2 → 2 + nextCursor → үлдсэн 1 (давхардалгүй)', async () => {
    const p1 = await api().get('/api/v1/inventory/items?limit=2').set(as('requester'));
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await api().get(`/api/v1/inventory/items?limit=2&cursor=${p1.body.nextCursor}`).set(as('requester'));
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.hasMore).toBe(false);
    const skus = [...p1.body.data, ...p2.body.data].map((d: { sku: string }) => d.sku).sort();
    expect(skus).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('lowStock=true → зөвхөн A-2; буруу cursor → 400', async () => {
    const low = await api().get('/api/v1/inventory/items?lowStock=true').set(as('requester'));
    expect(low.body.data.map((d: { sku: string }) => d.sku)).toEqual(['A-2']);
    expect((await api().get('/api/v1/inventory/items?cursor=garbage').set(as('requester'))).status).toBe(400);
  });

  it('adjust: +5 → 15; −100 → 400 (сөрөг болохгүй); буруу UUID → 400', async () => {
    const up = await api().patch(`/api/v1/inventory/items/${itemId}/adjust`).set(as('admin')).send({ delta: 5 });
    expect(up.status).toBe(200);
    expect(up.body.quantity).toBe('15');
    expect((await api().patch(`/api/v1/inventory/items/${itemId}/adjust`).set(as('admin')).send({ delta: -100 })).status).toBe(400);
    expect((await api().patch('/api/v1/inventory/items/not-a-uuid/adjust').set(as('admin')).send({ delta: 1 })).status).toBe(400);
  });
});

describe('🏢 Vendor-lite', () => {
  it('REQUESTER → 403; ADMIN үүсгэх → 201; идэвхгүй болгох → activeOnly-д харагдахгүй', async () => {
    expect((await api().post('/api/v1/vendors').set(as('requester')).send({ name: 'X' })).status).toBe(403);
    const v1 = await api().post('/api/v1/vendors').set(as('admin')).send({ name: 'Alpha LLC', regNumber: '1234567' });
    const v2 = await api().post('/api/v1/vendors').set(as('admin')).send({ name: 'Beta LLC' });
    expect([v1.status, v2.status]).toEqual([201, 201]);
    expect((await api().patch(`/api/v1/vendors/${v2.body.id}`).set(as('admin')).send({ isActive: false })).status).toBe(200);
    const active = await api().get('/api/v1/vendors?activeOnly=true').set(as('requester'));
    expect(active.body.map((v: { name: string }) => v.name)).toEqual(['Alpha LLC']);
    expect((await api().get('/api/v1/vendors').set(as('requester'))).body).toHaveLength(2);
  });
});

describe('📊 Report-lite', () => {
  it('summary: модулиудын тоо', async () => {
    const res = await api().get('/api/v1/reports/summary').set(as('requester'));
    expect(res.status).toBe(200);
    expect(res.body.inventory).toEqual({ items: 3, lowStock: 1 });
    expect(res.body.vendors).toEqual({ total: 2, active: 1 });
    expect(res.body.budget.enforced).toBe(false);
    expect(res.body.requisitions.total).toBe(0);
  });

  it('summary.csv: text/csv + attachment + BOM', async () => {
    const res = await api().get('/api/v1/reports/summary.csv').set(as('requester')).buffer(true).parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (data += c));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect((res.body as string).charCodeAt(0)).toBe(0xfeff);
    expect(res.body as string).toContain('inventory,low_stock,1');
  });
});

describe('🔒 RLS leakage (app_user)', () => {
  const countAs = (ctx: string) =>
    prismaRls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx}, true)`;
      return [await tx.inventoryItem.count({ where: { tenantId } }), await tx.vendor.count({ where: { tenantId } })];
    });

  it('өөр tenant context → [0, 0]; өөрийн → [3, 2]', async () => {
    expect(await countAs(OTHER_TENANT_ID)).toEqual([0, 0]);
    expect(await countAs(tenantId)).toEqual([3, 2]);
  });
});
