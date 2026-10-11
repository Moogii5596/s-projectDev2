/**
 * v0.2.0 — Кемпийн integration тестийн нийтлэг бэлтгэл (2026-10-11)
 * ============================================================
 * Тусдаа tenant + AppModule (main.ts-тэй ижил configureApp) + Supabase Auth хэрэглэгчид + үндсэн мастер өгөгдөл
 * (кемп C1, тохиргоо, хоолны байршил, хэлтэс ADM, байгууллага, ростер A, байр B1). Тест бүр өөрийн STAMP-тай.
 * Хэрэглэгчид: admin (tenant ADMIN), manager (REQUESTER + "Кемп менежер" C1), nobody (рольгүй).
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { CampRoleCode, PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../../src/app/app.module';
import { REDIS_CLIENT } from '../../src/db/redis.module';
import { createRedisMock } from './redis-mock';
import { TenantAuthGuard } from '../../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../../src/auth/tenant-cache.service';
import { configureApp } from '../../src/common/http/configure-app';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './db-urls';

export type Who = 'admin' | 'manager' | 'nobody';
export const IT_PASSWORD = 'Test1234!';
export const WEDNESDAY = '2026-10-07';
export const V1 = '/api/v1/camp';

export interface CampIt {
  app: NestFastifyApplication;
  prismaAdmin: PrismaClient;
  prismaRls: PrismaClient;
  tenantId: string;
  slug: string;
  host: string;
  coreIds: Record<Who, string>;
  ids: Record<string, string>;
  api: () => ReturnType<typeof supertest>;
  as: (who: Who, extra?: Record<string, string>) => Record<string, string>;
  camp: (path?: string) => string;
  close: () => Promise<void>;
}

export async function createCampIt(prefix: string): Promise<CampIt> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const slug = `${prefix}-${stamp}`;
  const host = `${slug}.example.com`;
  const prismaAdmin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  const tenantId = (await prismaAdmin.tenant.create({ data: { name: `IT ${prefix}`, slug, tier: TierType.TIER1 } })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(createRedisMock())
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app);
  app.useGlobalFilters({
    catch(exception: unknown, h: ArgumentsHost) {
      const res = h.switchToHttp().getResponse() as { code: (n: number) => { send: (b: unknown) => void } };
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
  cache.getTenantId = async (s: string) => (s === slug ? tenantId : null);
  const guard = app.get(TenantAuthGuard) as unknown as Record<string, unknown>;
  guard['tenantCacheService'] = cache;
  guard['configService'] = { get: (key: string) => process.env[key] };

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const roles: Record<Who, UserRole> = { admin: UserRole.ADMIN, manager: UserRole.REQUESTER, nobody: UserRole.REQUESTER };
  const tokens: Record<Who, string> = { admin: '', manager: '', nobody: '' };
  const coreIds: Record<Who, string> = { admin: '', manager: '', nobody: '' };
  const authIds: string[] = [];
  for (const who of Object.keys(roles) as Who[]) {
    const email = `${prefix}-${who}-${stamp}@example.com`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: IT_PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    coreIds[who] = (await prismaAdmin.coreUser.create({ data: { tenantId, authId: data.user.id, email, fullName: `IT ${who}`, role: roles[who] } })).id;
    const { data: s } = await anon.auth.signInWithPassword({ email, password: IT_PASSWORD });
    if (!s?.session) throw new Error(`signIn ${who}`);
    tokens[who] = s.session.access_token;
  }

  const ids: Record<string, string> = {};
  const api = () => supertest(app.getHttpServer());
  const as = (who: Who, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${tokens[who]}`, Host: host, ...extra });
  const camp = (path = '') => `${V1}/camps/${ids.c1}${path}`;
  const must = async (p: Promise<supertest.Response>, label: string) => {
    const r = await p;
    if (r.status >= 300) throw new Error(`${label}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as Record<string, string>;
  };

  // Мастер өгөгдөл
  ids.c1 = (await must(api().post(`${V1}/camps`).set(as('admin')).send({ code: 'C1', name: 'Кемп 1' }), 'camp')).id;
  ids.loc = (await must(api().post(camp('/meal-locations')).set(as('admin')).send({ name: 'Гал тогоо' }), 'loc')).id;
  await must(
    api().put(camp('/settings')).set(as('admin')).send({
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: ids.loc,
    }),
    'settings',
  );
  ids.dept = (await must(api().post(camp('/departments')).set(as('admin')).send({ code: 'ADM', name: 'Захиргаа', mealLocationId: ids.loc }), 'dept')).id;
  ids.org = (await must(api().post(`${V1}/organizations`).set(as('admin')).send({ name: 'Уурхай ХХК', regNumber: `R${stamp}`, orgType: 'MAIN' }), 'org')).id;
  ids.orgReg = `R${stamp}`;
  ids.crew = (await must(api().post(camp('/crews')).set(as('admin')).send({ code: 'A', rosterAnchorDate: WEDNESDAY }), 'crew')).id;
  ids.b1 = (await must(api().post(camp('/buildings')).set(as('admin')).send({ code: 'B1', name: 'Байр 1' }), 'building')).id;

  // manager = "Кемп менежер" (C1)
  const rolesList = (await api().get(`${V1}/roles`).set(as('admin'))).body as { id: string; systemCode: string | null }[];
  ids.roleManager = rolesList.find((r) => r.systemCode === CampRoleCode.CAMP_MANAGER)!.id;
  await must(api().post(`${V1}/user-roles`).set(as('admin')).send({ userId: coreIds.manager, roleId: ids.roleManager, campId: ids.c1 }), 'user-role');

  const close = async () => {
    await prismaAdmin.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
    for (const id of authIds) await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
    await app.close();
    await prismaRls.$disconnect();
    await prismaAdmin.$disconnect();
  };

  return { app, prismaAdmin, prismaRls, tenantId, slug, host, coreIds, ids, api, as, camp, close };
}

/** app_user (RLS) холболтоор тухайн tenant-ийн контекстод уншина */
export async function asTenant<T>(prismaRls: PrismaClient, tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return prismaRls.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx as unknown as PrismaClient);
  });
}
