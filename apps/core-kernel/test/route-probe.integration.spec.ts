/**
 * Phase 4.9.2–4.9.3 — Path параметртэй БҮХ route-ийн probe (2026-10-10)
 * ============================================================
 * Nest-ийн metadata-аас route-уудыг автоматаар цуглуулна (шинэ route нэмэгдэхэд өөрөө хамрагдана).
 * Tenant B-ийн OWNER (бүх requireRole-ыг давна) дараах id-уудаар дуудна:
 *   - санамсаргүй UUID (байхгүй / өөр tenant-ийн мөр) → 2xx БИШ, 5xx БИШ (404/403/400/409)
 *   - 'not-a-uuid' → 5xx БИШ (ParseUUIDPipe / шалгалт → 400, эсвэл 403/404)
 * 500 = шалгагдаагүй id DB-д хүрсэн (Prisma P2023/P2025) → IDOR/алдааны боловсруулалтын дохио.
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, DiscoveryModule } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { configureApp, GLOBAL_PREFIX } from '../src/common/http/configure-app';
import { ADMIN_DB_URL } from './helpers/db-urls';

const STAMP = Date.now();
const SLUG = `probe-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const EMAIL = `probe-owner-${STAMP}@example.com`;
const PASSWORD = 'Test1234!';

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let tenantId = '';
let authId = '';
let token = '';
const unexpected: string[] = [];
const routes: { method: string; path: string }[] = [];

const join = (...parts: string[]) => '/' + parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'Probe', slug: SLUG, tier: TierType.TIER1 } })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] })
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
      else res.code(500).send({ statusCode: 500, message: String((exception as Error)?.message ?? exception).slice(0, 200) });
    },
  } as ExceptionFilter);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const guard = app.get(TenantAuthGuard);
  (guard as any)['tenantCacheService'] = app.get(TenantCacheService);
  (guard as any)['configService'] = { get: (key: string) => process.env[key] };

  // Route-уудыг Nest metadata-аас
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const ctrlPaths = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const proto = Object.getPrototypeOf(instance);
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name];
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (methodPath === undefined || method === undefined) continue;
      for (const cp of ctrlPaths) {
        for (const mp of ([] as string[]).concat(methodPath)) {
          const path = join(GLOBAL_PREFIX, cp, mp);
          if (path.includes(':')) routes.push({ method: RequestMethod[method as number], path });
        }
      }
    }
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  authId = data.user.id;
  await prismaAdmin.coreUser.create({ data: { tenantId, authId, email: EMAIL, fullName: 'probe', role: UserRole.OWNER } });
  const { data: s } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (!s?.session) throw new Error('signIn');
  token = s.session.access_token;
}, 90_000);

afterAll(async () => {
  if (unexpected.length) console.error('[route-probe]\n' + unexpected.join('\n'));
  await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (authId) await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {});
  await app?.close();
  await prismaAdmin?.$disconnect();
}, 30_000);

/**
 * 2xx-ийг зөвхөн GET-д, ӨГӨГДӨЛГҮЙ хариу бол зөвшөөрнө (жнь өөр/байхгүй кемпийн жагсаалт → [] — tenant шүүлттэй тул юу ч алдагдахгүй),
 * мөн статик загвар файл (`/template`).
 */
const emptyOk = (r: { method: string; path: string }, res: supertest.Response) => {
  if (r.method !== 'GET') return false;
  if (r.path.endsWith('/template')) return true;
  // v0.2.2 Блок 3: урилга шалгах (нэвтрэлтгүй) — байхгүй токенд ч 200 { valid: false } (байгаа эсэхийг задруулахгүй, D-03)
  if (r.path.endsWith('/auth/invites/:token')) return (res.body as { valid?: unknown })?.valid === false;
  const b = res.body as unknown;
  if (Array.isArray(b)) return b.length === 0;
  if (b && typeof b === 'object') {
    const o = b as { data?: unknown };
    return Object.keys(o).length === 0 || (Array.isArray(o.data) && o.data.length === 0);
  }
  return false;
};

const call = (method: string, url: string) => {
  const agent = supertest(app.getHttpServer());
  const m = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const req = agent[m](url).set({ Authorization: `Bearer ${token}`, Host: HOST });
  return m === 'get' || m === 'delete' ? req : req.send({});
};

describe('🔎 Route probe — path параметртэй route бүр', () => {
  it('route-ууд олдсон (MR, workflow, camp, budget, inventory, vendor …)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(40);
    expect(routes.map((r) => r.path)).toEqual(expect.arrayContaining(['/api/v1/requisitions/:id', '/api/v1/workflow/definitions/:id']));
  });

  it('санамсаргүй UUID → 2xx/5xx биш; "not-a-uuid" → 5xx биш', async () => {
    for (const r of routes) {
      const uuidUrl = r.path.replace(/:[A-Za-z]+/g, () => crypto.randomUUID());
      const res1 = await call(r.method, uuidUrl);
      if (res1.status >= 500 || (res1.status >= 200 && res1.status < 300 && !emptyOk(r, res1))) {
        unexpected.push(`UUID     ${r.method} ${r.path} → ${res1.status} ${JSON.stringify(res1.body).slice(0, 160)}`);
      }
      const badUrl = r.path.replace(/:[A-Za-z]+/g, 'not-a-uuid');
      const res2 = await call(r.method, badUrl);
      if (res2.status >= 500) {
        unexpected.push(`BAD-ID   ${r.method} ${r.path} → ${res2.status} ${JSON.stringify(res2.body).slice(0, 160)}`);
      }
    }
    expect(unexpected).toEqual([]);
  }, 120_000);
});
