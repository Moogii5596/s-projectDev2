/**
 * Material Requisition CRUD Integration Test
 * ============================================================
 * POST/GET/PUT/DELETE /api/v1/requisitions endpoint-уудыг
 * бодит NestJS app + Supertest + PostgreSQL-ээр тест хийнэ.
 *
 * АРХИТЕКТУР (tenant-auth-guard.integration.spec.ts-тэй адил):
 *   - prismaAdmin        → postgres superuser → tenant/user seed + teardown
 *   - Supabase Auth      → JWT token авах
 *   - NestJS TestApp     → FastifyAdapter + ValidationPipe + Redis override
 *   - Guard patch [DI-007] → TenantAuthGuard + TenantCacheService шууд patch
 *   - supertest          → HTTP endpoint тест
 *
 * ЯАГААД RLS АЖИЛДАГ?
 *   MR service-ийн query бүр `inTenantTx` (src/db/tenant-tx.ts) дотор: нэг transaction-д
 *   set_config('app.tenant_id', ...) → query → PostgreSQL RLS (`app_user` холболтод бодитоор шүүнэ).
 *   (Phase 4.8.3: хуучин `$use` middleware устсан — set_config transaction-ий гадна байсан [RLS-007].)
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
import { activateTestModules, grantTestDebugAccess } from './helpers/activate-test-modules';

// ── Redis mock — нийтлэг helper [TEST-003] (апп-ын бүх Redis командтай) ──
const redisMock = createRedisMock();

// ── Тестийн тогтмолууд ──────────────────────────────────────
const TEST_SLUG = process.env.DEV_TENANT_SLUG ?? 'test-tenant';
const TEST_EMAIL = `mr-crud-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'Test1234!';
const BASE_URL = '/api/v1/requisitions';

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let accessToken: string;
let testAuthUserId: string;
let testTenantId: string;
let testUserId: string;   // core_users.id — requesterId шалгахад хэрэгтэй

// ── Tenant resolver mock ────────────────────────────────────
function makeTenantResolver() {
  return async (slug: string): Promise<string | null> => {
    return slug === TEST_SLUG ? testTenantId : null;
  };
}

// ────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Superuser Prisma — RLS bypass
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
  await activateTestModules(prismaAdmin, [testTenantId], ['mr']);

  // 3. NestJS TestingModule
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: <T = string>(key: string): T => (process.env[key] as unknown as T),
    })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redisMock)
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  // main.ts-тэй ИЖИЛ тохиргоо (pipe, prefix, multipart) [VALID-001]
  await configureApp(app);

  // Global Exception Filter — init()-н ӨМНӨ [FILTER-001]
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

  // 4. TenantCacheService + TenantAuthGuard patch [DI-007]
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

  // 5. Supabase auth user үүсгэх
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'MR Test User' },
  });
  if (authError || !authData?.user) {
    throw new Error(`Supabase createUser алдаа: ${authError?.message}`);
  }
  testAuthUserId = authData.user.id;

  // 6. core_users бүртгэх
  const coreUser = await prismaAdmin.coreUser.create({
    data: {
      tenantId: testTenantId,
      authId: testAuthUserId,
      email: TEST_EMAIL,
      fullName: 'MR Test User',
      role: UserRole.REQUESTER,
    },
  });
  testUserId = coreUser.id;
  await grantTestDebugAccess(prismaAdmin, [testTenantId]);

  // 7. JWT авах
  const supabaseAnon = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError || !signInData?.session) {
    throw new Error(`SignIn алдаа: ${signInError?.message}`);
  }
  accessToken = signInData.session.access_token;
}, 60_000);

// ────────────────────────────────────────────────────────────
afterAll(async () => {
  // MR headers цэвэрлэх (items CASCADE дагана)
  await prismaAdmin?.mrHeader
    .deleteMany({ where: { tenantId: testTenantId, requesterId: testUserId } })
    .catch(() => {});

  // Supabase auth user устгах
  if (testAuthUserId) {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supabaseAdmin.auth.admin.deleteUser(testAuthUserId).catch(() => {});
  }

  await prismaAdmin?.coreUser
    .deleteMany({ where: { email: TEST_EMAIL } })
    .catch(() => {});

  if (app) await app.close();
  await prismaAdmin?.$disconnect();
});

// ────────────────────────────────────────────────────────────
// 6.2 POST /requisitions
// ────────────────────────────────────────────────────────────
describe('📋 POST /api/v1/requisitions — MR үүсгэх', () => {
  it('✅ DRAFT MR + items амжилттай үүсэх → 201', async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'Оффисын бичгийн хэрэгсэл',
        department: 'Захиргаа',
        notes: 'Яаралтай шаардлагатай',
        items: [
          { description: 'А4 цаас', quantity: 10, unitOfMeasure: 'BOX', unitPrice: 15000 },
          { description: 'Харандаа', quantity: 50, unitOfMeasure: 'PCS', unitPrice: 500 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('mrNumber');
    expect(res.body.mrNumber).toMatch(/^MR-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.title).toBe('Оффисын бичгийн хэрэгсэл');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(Number(res.body.totalAmount)).toBe(10 * 15000 + 50 * 500);
  });

  it('❌ Items хоосон бол → 400', async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'Тест шаардлага',
        items: [],  // хоосон array
      });

    expect(res.status).toBe(400);
  });

  it('❌ Token байхгүй бол → 401', async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .send({
        title: 'Тест',
        items: [{ description: 'Item', quantity: 1 }],
      });

    expect(res.status).toBe(401);
  });

  it('❌ Title байхгүй бол → 400', async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        // title байхгүй
        items: [{ description: 'Item', quantity: 1 }],
      });

    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// 6.3 GET /requisitions
// ────────────────────────────────────────────────────────────
describe('📋 GET /api/v1/requisitions — жагсаалт', () => {
  it('✅ Tenant-н MR жагсаалт → 200 + pagination', async () => {
    const res = await supertest(app.getHttpServer())
      .get(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('✅ ?status=DRAFT filter ажиллах', async () => {
    const res = await supertest(app.getHttpServer())
      .get(`${BASE_URL}?status=DRAFT`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((mr: any) => mr.status === 'DRAFT')).toBe(true);
  });

  it('✅ Буруу status filter → 400', async () => {
    const res = await supertest(app.getHttpServer())
      .get(`${BASE_URL}?status=INVALID_STATUS`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// 6.4 GET /requisitions/:id
// ────────────────────────────────────────────────────────────
describe('📋 GET /api/v1/requisitions/:id — дэлгэрэнгүй', () => {
  let createdMrId: string;

  beforeAll(async () => {
    // Тест MR үүсгэх
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'findOne тест MR',
        items: [{ description: 'Тест бараа', quantity: 2, unitPrice: 5000 }],
      });
    createdMrId = res.body.id;
  });

  it('✅ Зөв id → 200 + items nested', async () => {
    const res = await supertest(app.getHttpServer())
      .get(`${BASE_URL}/${createdMrId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdMrId);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body).toHaveProperty('requester');
  });

  it('❌ Байхгүй id → 404', async () => {
    const res = await supertest(app.getHttpServer())
      .get(`${BASE_URL}/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────
// 6.5 PUT /requisitions/:id
// ────────────────────────────────────────────────────────────
describe('📋 PUT /api/v1/requisitions/:id — засварлах', () => {
  let draftMrId: string;

  beforeAll(async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'Update тест MR',
        items: [{ description: 'Анхны бараа', quantity: 1, unitPrice: 1000 }],
      });
    draftMrId = res.body.id;
  });

  it('✅ DRAFT MR засварлах → 200', async () => {
    const res = await supertest(app.getHttpServer())
      .put(`${BASE_URL}/${draftMrId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'Шинэчлэгдсэн гарчиг',
        items: [
          { description: 'Шинэ бараа 1', quantity: 3, unitPrice: 2000 },
          { description: 'Шинэ бараа 2', quantity: 1, unitPrice: 5000 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Шинэчлэгдсэн гарчиг');
    expect(res.body.items).toHaveLength(2);
    // totalAmount = 3*2000 + 1*5000 = 11000
    expect(Number(res.body.totalAmount)).toBe(11000);
  });

  it('❌ Байхгүй id → 404', async () => {
    const res = await supertest(app.getHttpServer())
      .put(`${BASE_URL}/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({ title: 'Тест' });

    expect(res.status).toBe(404);
  });
});

// ────────────────────────────────────────────────────────────
// 6.6 DELETE /requisitions/:id
// ────────────────────────────────────────────────────────────
describe('📋 DELETE /api/v1/requisitions/:id — устгах', () => {
  let deletableMrId: string;

  beforeAll(async () => {
    const res = await supertest(app.getHttpServer())
      .post(BASE_URL)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`)
      .send({
        title: 'Устгах тест MR',
        items: [{ description: 'Бараа', quantity: 1, unitPrice: 500 }],
      });
    deletableMrId = res.body.id;
  });

  it('✅ DRAFT MR устгах → 204', async () => {
    const res = await supertest(app.getHttpServer())
      .delete(`${BASE_URL}/${deletableMrId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(204);

    // Устгагдсаныг баталгаажуулах
    const checkRes = await supertest(app.getHttpServer())
      .get(`${BASE_URL}/${deletableMrId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);
    expect(checkRes.status).toBe(404);
  });

  it('❌ Байхгүй id устгах → 404', async () => {
    const res = await supertest(app.getHttpServer())
      .delete(`${BASE_URL}/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${TEST_SLUG}.localhost`);

    expect(res.status).toBe(404);
  });
});
