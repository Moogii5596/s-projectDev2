/**
 * TenantAuthGuard Integration Test
 * ============================================================
 * GET /api/v1/auth/me endpoint-ийг бодит NestJS app + Supertest-ээр тест хийнэ.
 *
 * АРХИТЕКТУР:
 *   - Redis mock         → Redis сервер шаардахгүй
 *   - prismaAdmin        → postgres superuser → tenant/user setup/teardown
 *   - NestJS TestApp     → FastifyAdapter + ValidationPipe + Redis override
 *   - Direct DB setup    → AuthService.register() тойрч, prismaAdmin + supabaseAdmin-аар
 *                          шууд Supabase Auth user + core_users бүртгэнэ
 *   - Direct svc patch   → app.get(TenantCacheService) → getTenantId-г орлуулна
 *                          app.get(TenantAuthGuard)    → tenantCacheService-г force-assign
 *   - supertest          → HTTP endpoint тест (4 тест)
 *
 * ЯАГААД DIRECT SETUP?
 *   AuthService.register() нь PrismaTenantClientService-ийн $use middleware +
 *   tenantStorage context-тэй нарийн зааглалтай тул integration тест орчинд
 *   coreUser.create алдаа гаргадаг.  Тиймээс prismaAdmin (superuser, RLS bypass)-аар
 *   шууд бүртгэж, supabaseAdmin-аар JWT авна.
 *
 * ЯАГААД DIRECT PATCH?
 *   NestJS DI init дарааллын улмаас TenantAuthGuard-ын tenantCacheService field нь
 *   undefined болдог. app.get() дараа force-assign хийснээр засна.
 *
 * СЦЕНАРИ:
 *   ✗ Token байхгүй              → 401
 *   ✗ Хүчингүй токен             → 401
 *   ✗ Буруу tenant (Host header) → 403
 *   ✗ Өөр tenant-ийн Host (гишүүн биш) → 403  [SEC-001]
 *   ✓ Хүчинтэй токен + зөв tenant → 200
 * ============================================================
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ExceptionFilter, ArgumentsHost, HttpException, UnauthorizedException } from '@nestjs/common';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, TierType, UserRole } from '@prisma/client';

import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { configureApp } from '../src/common/http/configure-app';

// ── Redis mock — нийтлэг helper [TEST-003] (апп-ын бүх Redis командтай) ──
const redisMock = createRedisMock();

const TEST_SLUG = process.env.DEV_TENANT_SLUG ?? 'test-tenant';
const TEST_EMAIL = `guard-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'Test1234!';
// SEC-001: тест хэрэглэгч гишүүн БИШ өөр tenant (DB-д бодитоор байна)
const OTHER_SLUG = `sec001-other-${Date.now()}`;

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let accessToken: string;
let testAuthUserId: string;  // afterAll cleanup-д ашиглах
let testTenantId: string;    // upsert-ийн буцаасан ID — mock-д шууд ашиглах
let otherTenantId: string;   // SEC-001

// getTenantId патчийн функц — TEST_SLUG → testTenantId, бусад → null
function makeTenantResolver() {
  return async (slug: string): Promise<string | null> => {
    const result =
      slug === TEST_SLUG ? testTenantId : slug === OTHER_SLUG ? otherTenantId : null;
    console.error('[PATCH] getTenantId slug:', slug, '→', result ?? 'null');
    return result;
  };
}

// ────────────────────────────────────────────────────────────
beforeAll(async () => {
  // ── 1. Superuser Prisma — setup/teardown (RLS bypass) ─────
  prismaAdmin = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  await prismaAdmin.$connect();

  // ── 2. Tenant баталгаажуулах — ID-г upsert return value-аас авна ──
  const upsertedTenant = await prismaAdmin.tenant.upsert({
    where: { slug: TEST_SLUG },
    update: { isActive: true },
    create: { name: 'Test Tenant', slug: TEST_SLUG, tier: TierType.TIER1 },
  });
  testTenantId = upsertedTenant.id;

  // SEC-001: тест хэрэглэгчийн харьяалагддаггүй 2 дахь tenant
  const otherTenant = await prismaAdmin.tenant.create({
    data: { name: 'SEC-001 Other Tenant', slug: OTHER_SLUG, tier: TierType.TIER1 },
  });
  otherTenantId = otherTenant.id;
  console.error('[DEBUG] testTenantId:', testTenantId, 'TEST_SLUG:', TEST_SLUG);

  // ── 3. NestJS TestingModule — ConfigService + REDIS_CLIENT override ──
  //    TenantCacheService-г энд override хийхгүй — app.init()-ийн дараа
  //    жинхэнэ instance дээр шууд patch хийнэ (AuthModule scope асуудлаас зайлсхийх)
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: <T = string>(key: string): T =>
        (process.env[key] as unknown as T),
    })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redisMock)
    .overrideProvider(AuthService)
    .useValue({
      // prismaAdmin (postgres superuser, RLS bypass) ашиглан шууд query хийнэ.
      // app.get() instance patch [DI-005] ажиллахгүй байгаагийн оронд
      // overrideProvider нь DI level-д AuthController.authService-г 100% орлуулна [DI-006]
      getMe: async (authId: string, tenantId: string) => {
        console.error('[DEBUG] OVERRIDE getMe — authId:', authId, 'tenantId:', tenantId);
        const user = await prismaAdmin.coreUser.findFirst({
          where: { authId, tenantId },
          select: {
            id: true, email: true, fullName: true,
            role: true, tenantId: true, isActive: true, createdAt: true,
          },
        });
        console.error('[DEBUG] OVERRIDE getMe result:', JSON.stringify(user));
        if (!user) throw new UnauthorizedException('Хэрэглэгч олдсонгүй');
        return user;
      },
      register: async () => { throw new Error('Not used in this test'); },
      login: async () => { throw new Error('Not used in this test'); },
    })
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  // main.ts-тэй ИЖИЛ тохиргоо (pipe, prefix, multipart) [VALID-001]
  await configureApp(app);

  // ── 3a. Global Exception Filter — app.init()-ын ӨМНӨ бүртгэх [FILTER-001] ──
  //    Fastify adapter: init()-ын дараа useGlobalFilters() дуудсан ч БҮРТГЭГДЭХГҮЙ!
  //    Fastify нь init()-д plugin/hook-уудыг bake хийдэг тул заавал ӨМНӨ нь нэмэх.
  app.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      console.error('[ERROR] Exception filter caught:',
        exception instanceof Error ? exception.stack : String(exception));
      const ctx = host.switchToHttp();
      const res = ctx.getResponse() as any;
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const body = exception.getResponse();
        typeof res.code === 'function'
          ? res.code(status).send(body)
          : res.status(status).send(body);
      } else {
        typeof res.code === 'function'
          ? res.code(500).send({ statusCode: 500, message: 'Internal server error' })
          : res.status(500).send({ statusCode: 500, message: 'Internal server error' });
      }
    },
  } as ExceptionFilter);

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // ── 4. TenantCacheService патчлах + guard-д force-assign хийх ──
  //    Strategy A: TenantCacheService singleton дээр getTenantId орлуулна
  //    Strategy B: TenantAuthGuard-д tenantCacheService нь undefined байж болох тул
  //                force-assign хийнэ (NestJS DI init дарааллын асуудал)
  const patchFn = makeTenantResolver();
  let patchedSvc: TenantCacheService | null = null;

  try {
    patchedSvc = app.get(TenantCacheService);
    patchedSvc!.getTenantId = patchFn;
    console.error('[DEBUG] Patched TenantCacheService directly ✓');
  } catch (e) {
    console.error('[WARN] Could not get TenantCacheService:', String(e));
  }

  // Guard-ийн ХОЁР constructor param (configService + tenantCacheService) undefined байна [DI-004]
  // NestJS DI init дарааллын улмаас — force-assign хийж засна
  try {
    const guard = app.get(TenantAuthGuard);
    if (patchedSvc) {
      (guard as any)['tenantCacheService'] = patchedSvc;
    } else {
      console.error('[WARN] patchedSvc is null — tenantCacheService force-assign алгасав');
    }
    // configService ч undefined байна — force-assign хийнэ [DI-004]
    const configMock = { get: (key: string) => process.env[key] };
    (guard as any)['configService'] = configMock;
    console.error('[DEBUG] Force-assigned configService + tenantCacheService to TenantAuthGuard ✓');
  } catch (e) {
    console.error('[WARN] Could not get TenantAuthGuard:', String(e));
  }

  // ── 5. AuthController.authService-г ШУУД PATCH хийх [DI-007] ──
  //    overrideProvider(AuthService) нь ESM/Vitest scope-ийн улмаас
  //    AuthModule-ийн DI container-д хүрэхгүй → authService undefined болдог.
  //    Шийдэл: app.get(AuthController) → controller SINGLETON instance →
  //    authService property-г шууд орлуул.
  //    (Controller singleton тул request handler болон app.get() НЭГЭН instance)
  const mockAuthService = {
    getMe: async (authId: string, tenantId: string) => {
      console.error('[DEBUG] CTRL_PATCH getMe — authId:', authId, 'tenantId:', tenantId);
      const user = await prismaAdmin.coreUser.findFirst({
        where: { authId, tenantId },
        select: {
          id: true, email: true, fullName: true,
          role: true, tenantId: true, isActive: true, createdAt: true,
        },
      });
      console.error('[DEBUG] CTRL_PATCH getMe result:', JSON.stringify(user));
      if (!user) throw new UnauthorizedException('Хэрэглэгч олдсонгүй');
      return user;
    },
    register: async () => { throw new Error('Not used in this test'); },
    login: async () => { throw new Error('Not used in this test'); },
  };

  try {
    const authController = app.get(AuthController);
    (authController as any)['authService'] = mockAuthService;
    const verify = typeof (authController as any)['authService']?.getMe;
    console.error('[DEBUG] AuthController.authService patched ✓ getMe type:', verify);
  } catch (e) {
    console.error('[WARN] Could not get AuthController for patch:', String(e));
  }

  // ── 6. Test хэрэглэгч бүртгэх — AuthService тойрч, шууд DB + Supabase ──
  //    AuthService.register()-ийн PrismaTenantClientService middleware-тэй
  //    зааглалт тест орчинд асуудал үүсгэдэг тул prismaAdmin-аар шууд бичнэ.
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 5a. Supabase Auth user үүсгэх
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Guard Test User' },
  });
  if (authError || !authData?.user) {
    throw new Error(`Supabase createUser алдаа: ${authError?.message}`);
  }
  testAuthUserId = authData.user.id;
  console.error('[DEBUG] Supabase auth user created, authId:', testAuthUserId);

  // 5b. core_users-д бүртгэх (prismaAdmin → postgres superuser → RLS bypass)
  await prismaAdmin.coreUser.create({
    data: {
      tenantId: testTenantId,
      authId: testAuthUserId,
      email: TEST_EMAIL,
      fullName: 'Guard Test User',
      role: UserRole.REQUESTER,  // [ENUM-001] TypeScript enum — magic string биш
    },
  });
  console.error('[DEBUG] core_users record created ✓');

  // 5c. JWT авах — anon key-тэй client ашиглан signInWithPassword
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
  console.error('[DEBUG] Access token obtained ✓');
}, 60_000);

// ────────────────────────────────────────────────────────────
afterAll(async () => {
  // Supabase Auth user устгах
  if (testAuthUserId) {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supabaseAdmin.auth.admin.deleteUser(testAuthUserId).catch(() => {});
  }

  // core_users устгах
  await prismaAdmin?.coreUser
    .deleteMany({ where: { email: TEST_EMAIL } })
    .catch(() => {});

  // SEC-001 tenant устгах
  await prismaAdmin?.tenant
    .deleteMany({ where: { slug: OTHER_SLUG } })
    .catch(() => {});

  if (app) await app.close();
  await prismaAdmin?.$disconnect();
});

// ────────────────────────────────────────────────────────────
describe('🔐 TenantAuthGuard — GET /api/v1/auth/me', () => {
  it('Authorization header байхгүй → 401', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me');

    expect(res.status).toBe(401);
  });

  it('Хүчингүй (garbage) токен → 401', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt.token');

    expect(res.status).toBe(401);
  });

  it('Буруу tenant slug (DB-д байхгүй) → 403', async () => {
    // Host header-ийг localhost-аас өөр болгоход guard subdomain-ээс slug авна:
    // 'nonexistent-tenant.example.com' → slug='nonexistent-tenant' → mock null буцаана → 403
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', 'nonexistent-tenant.example.com');

    expect(res.status).toBe(403);
  });

  it('SEC-001: хүчинтэй токен + DB-д БАЙГАА өөр tenant (гишүүн биш) → 403', async () => {
    // Өмнө нь: guard зөвхөн tenant байгаа эсэхийг шалгадаг байсан → 200 буцааж
    // B tenant-ийн өгөгдөл (RLS app.tenant_id=B) харагдах эрсдэлтэй байсан.
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Host', `${OTHER_SLUG}.example.com`);

    expect(res.status).toBe(403);
  });

  it('Хүчинтэй токен + зөв tenant → 200', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    console.error('[DEBUG] Response status:', res.status);
    console.error('[DEBUG] Response body:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_EMAIL);
    expect(res.body.tenantId).toBeDefined();
  });
});
