/**
 * Camp Module — Шат 2 Integration Test (эрх, тохиргоо, мастер өгөгдөл)
 * ============================================================
 * Бодит DB (Supabase local) + Supabase Auth + NestJS (AppModule) + HTTP.
 *   - Кодын permission каталог = DB каталог; шинэ tenant-д 3 системийн роль (trigger)
 *   - Эрх: tenant ADMIN (бүгд) / кемпийн роль (зөвхөн тэр кемп) / ролгүй (403)
 *   - Тохиргоо, байршил, хэлтэс + ээлжийн загвар, байр/өрөө, байгууллага, баг, ажилтан (cursor)
 *   - DB алдааны хөрвүүлэгч (camp-errors) БОДИТ Prisma алдаан дээр (P2002/P2003/trigger/EXCLUDE/CHECK)
 *   - RLS leakage (app_user)
 * ТУСДАА tenant (camp-it-<ts>) → afterAll-д tenant.delete (CASCADE). Ажиллуулах:
 *   pnpm --filter @s-project/core-kernel test:integration -- test/camp-master.integration.spec.ts
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, BadRequestException, ConflictException, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { CampShiftType, PrismaClient, TierType, UserRole } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { REDIS_CLIENT } from '../src/db/redis.module';
import { createRedisMock } from './helpers/redis-mock';
import { TenantAuthGuard } from '../src/auth/tenant-auth.guard';
import { TenantCacheService } from '../src/auth/tenant-cache.service';
import { CAMP_PERMISSION_CODES, campPermissionAvailableIn } from '../src/modules/camp/common/camp-permissions';
import { permissionModule } from '../src/modules/core/permissions/permission-registry';
import { toCampHttpError } from '../src/modules/camp/common/camp-errors';
import { configureApp } from '../src/common/http/configure-app';
import { ADMIN_DB_URL } from './helpers/db-urls';

const STAMP = Date.now();
const SLUG = `camp-it-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const CORE_RBAC = '/api/v1/core/rbac';
const EMAILS = {
  admin: `camp-admin-${STAMP}@example.com`,     // tenant ADMIN → кемпийн бүх эрх
  manager: `camp-mgr-${STAMP}@example.com`,     // REQUESTER + "Кемп менежер" (зөвхөн C1)
  nobody: `camp-none-${STAMP}@example.com`,     // REQUESTER, кемпийн рольгүй
};
type Who = keyof typeof EMAILS;
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const WEDNESDAY = '2026-10-07';

const dbUrl = ADMIN_DB_URL; // Phase 4.8.5: SYSTEM_DATABASE_URL → DATABASE_URL (RLS bypass)
const APP_USER_URL = dbUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let prismaRls: PrismaClient;
let tenantId: string;
const tokens: Record<Who, string> = { admin: '', manager: '', nobody: '' };
const coreIds: Record<Who, string> = { admin: '', manager: '', nobody: '' };
const authIds: string[] = [];
const ids: Record<string, string> = {};

const api = () => supertest(app.getHttpServer());
const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}`, Host: HOST });
const V1 = '/api/v1/camp';
const camp = (path = '') => `${V1}/camps/${ids.c1}${path}`;
/** v0.2.3 Блок 4 (QA-11): HR зам (хуучин `/camp/camps/:id/...` устсан) */
const hr = (path = '') => `/api/v1/hr/sites/${ids.c1}${path}`;

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'Camp IT', slug: SLUG, tier: TierType.TIER1 } })).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: <T = string>(key: string): T => process.env[key] as unknown as T })
    .overrideProvider(REDIS_CLIENT)
    .useValue(createRedisMock())
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  // main.ts-тэй ИЖИЛ тохиргоо (pipe, prefix, multipart) [VALID-001] — implicit conversion-ийн алдааг тест барина
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
  const roles: Record<Who, UserRole> = { admin: UserRole.ADMIN, manager: UserRole.REQUESTER, nobody: UserRole.REQUESTER };
  for (const who of Object.keys(EMAILS) as Who[]) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: EMAILS[who], password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
    authIds.push(data.user.id);
    coreIds[who] = (
      await prismaAdmin.coreUser.create({ data: { tenantId, authId: data.user.id, email: EMAILS[who], fullName: who, role: roles[who] } })
    ).id;
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

describe('🔑 Каталог ба анхдагч роль', () => {
  it('кодын CAMP_PERMISSIONS = DB core_permissions (код, модуль, хувилбар) — зөрөхгүй', async () => {
    const rows = await prismaAdmin.corePermission.findMany({ select: { code: true, module: true, availableIn: true } });
    expect(rows.map((p) => p.code).sort()).toEqual([...CAMP_PERMISSION_CODES].sort());
    for (const r of rows) {
      expect(r.module).toBe(permissionModule(r.code));
      expect(r.availableIn).toBe(campPermissionAvailableIn(r.code));
    }
  });

  it('/core/rbac нь одоогийн зам; хуучин RBAC зам устсан; me/permissions.modules', async () => {
    const core = await api().get('/api/v1/core/rbac/roles').set(as('admin'));
    expect(core.status).toBe(200);
    expect(core.headers.deprecation).toBeUndefined();
    const legacy = await api().get(`${V1}/roles`).set(as('admin'));
    expect(legacy.status).toBe(404);
    const me = await api().get('/api/v1/core/rbac/me/permissions').set(as('admin'));
    expect(me.status).toBe(200);
    expect(me.body.modules).toEqual(['camp', 'feed', 'hr']); // v0.2.3 feed; v0.2.4: core.debug.*/mr.* tenant admin-д автоматаар биш
    // ажилтны картаас нэвтрэх эрх — /camp-д үлдсэн (Deprecation-гүй)
    const opt = await api().get('/api/v1/core/rbac/invites/options').set(as('admin'));
    expect(opt.status).toBe(200);
  });

  it('шинэ tenant → 4 системийн роль (trigger; v0.2.2 Блок 1 — «Ажилтан» EMPLOYEE); GET /core/rbac/roles (ADMIN) 200', async () => {
    const res = await api().get(`${CORE_RBAC}/roles`).set(as('admin'));
    expect(res.status).toBe(200);
    const sys = res.body.filter((r: { isSystem: boolean }) => r.isSystem).map((r: { systemCode: string }) => r.systemCode).sort();
    expect(sys).toEqual(['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE'].sort());
    ids.roleManager = res.body.find((r: { systemCode: string }) => r.systemCode === 'CAMP_MANAGER').id;
  });

  it('рольгүй REQUESTER: /core/rbac/roles 403, /camp/camps 403, /core/rbac/me/permissions → хоосон', async () => {
    expect((await api().get(`${CORE_RBAC}/roles`).set(as('nobody'))).status).toBe(403);
    expect((await api().get(`${V1}/camps`).set(as('nobody'))).status).toBe(403);
    const me = await api().get(`${CORE_RBAC}/me/permissions`).set(as('nobody'));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ isTenantAdmin: false, permissions: [] });
  });
});

describe('🏕️ Кемп, тохиргоо, байршил', () => {
  it('ADMIN кемп үүсгэнэ (201) → анхдагч тохиргоо хамт; давхар код → 409; validation → 400', async () => {
    const c1 = await api().post(`${V1}/camps`).set(as('admin')).send({ code: 'C1', name: 'Кемп 1', location: 'Өмнөговь' });
    expect(c1.status).toBe(201);
    ids.c1 = c1.body.id;
    ids.c2 = (await api().post(`${V1}/camps`).set(as('admin')).send({ code: 'C2', name: 'Кемп 2' })).body.id;
    expect((await api().post(`${V1}/camps`).set(as('admin')).send({ code: 'C1', name: 'dup' })).status).toBe(409);
    expect((await api().post(`${V1}/camps`).set(as('admin')).send({ code: 'Кемп', name: 'x' })).status).toBe(400);
    const st = await api().get(camp('/settings')).set(as('admin'));
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ configured: true, vatRate: '10', changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14 });
  });

  it('хоол идэх байршил: 2 үүсгэнэ, давхар нэр → 409; тохиргоонд анхдагч → 200; өөр кемпийн байршил → 400', async () => {
    const mk = (path: string, name: string) => api().post(path).set(as('admin')).send({ name });
    ids.locCamp = (await mk(camp('/meal-locations'), 'Кемп гал тогоо')).body.id;
    ids.locMine = (await mk(camp('/meal-locations'), 'Уулын хэсэг')).body.id;
    ids.locC2 = (await mk(`${V1}/camps/${ids.c2}/meal-locations`, 'C2 гал тогоо')).body.id;
    expect((await mk(camp('/meal-locations'), 'Уулын хэсэг')).status).toBe(409);

    const base = { vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: '15:00' };
    expect((await api().put(camp('/settings')).set(as('admin')).send({ ...base, defaultMealLocationId: ids.locC2 })).status).toBe(400);
    const ok = await api().put(camp('/settings')).set(as('admin')).send({ ...base, defaultMealLocationId: ids.locCamp });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ mealOrderCutoffTime: '15:00', defaultMealLocationId: ids.locCamp });
  });

  it('анхдагч байршлыг идэвхгүй болгох → 409', async () => {
    expect((await api().patch(camp(`/meal-locations/${ids.locCamp}`)).set(as('admin')).send({ isActive: false })).status).toBe(409);
  });
});

describe('🏢 Хэлтэс + ээлжийн загвар, баг, байр/өрөө, байгууллага', () => {
  it('хэлтэс: 7/7 загвартай (201); цоорхой загвар → 400 мессежтэй; v0.2.1: хоолны байршлыг үл тооно', async () => {
    const mine = await api().post(hr('/departments')).set(as('admin')).send({
      code: 'MINE', name: 'Уул засвар', mealLocationId: ids.locMine,
      shiftPattern: [{ dayFrom: 8, dayTo: 14, shift: CampShiftType.NIGHT }, { dayFrom: 1, dayTo: 7, shift: CampShiftType.DAY }],
    });
    expect(mine.status).toBe(201);
    expect(mine.body.shiftPatterns).toEqual([
      { dayFrom: 1, dayTo: 7, shift: 'DAY' },
      { dayFrom: 8, dayTo: 14, shift: 'NIGHT' },
    ]);
    ids.deptMine = mine.body.id;
    ids.deptAdm = (await api().post(hr('/departments')).set(as('admin')).send({ code: 'ADM', name: 'Захиргаа', mealLocationId: ids.locCamp })).body.id;

    const gap = await api().put(hr(`/departments/${ids.deptAdm}/shift-pattern`)).set(as('admin')).send({ segments: [{ dayFrom: 1, dayTo: 10, shift: 'DAY' }] });
    expect(gap.status).toBe(400);
    expect(gap.body.message).toMatch(/Дутуу: 11–14/);
    const full = await api().put(hr(`/departments/${ids.deptAdm}/shift-pattern`)).set(as('admin')).send({ segments: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] });
    expect(full.status).toBe(200);
    // v0.2.1 (Д-4): хэлтсийн хоолны байршлыг үл тооно — хуучин клиент (өөр кемпийн байршилтай ч) эвдрэхгүй, DB-д бичигдэхгүй
    const legacy = await api().post(hr('/departments')).set(as('admin')).send({ code: 'X', name: 'x', mealLocationId: ids.locC2 });
    expect(legacy.status).toBe(201);
    expect((await prismaAdmin.hrDepartment.findUniqueOrThrow({ where: { id: legacy.body.id } })).mealLocationId).toBeNull();
    expect((await prismaAdmin.hrDepartment.findUniqueOrThrow({ where: { id: ids.deptMine } })).mealLocationId).toBeNull();
  });

  it('загвартай хэлтэс байхад ростерын урт өөрчлөх → 409', async () => {
    const res = await api().put(camp('/settings')).set(as('admin')).send({
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 10, rosterOffDays: 18, mealOrderCutoffTime: null, defaultMealLocationId: ids.locCamp,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ADM, MINE/);
  });

  it('баг: Лхагва → 201 (YYYY-MM-DD); Пүрэв → 400', async () => {
    const a = await api().post(hr('/crews')).set(as('admin')).send({ code: 'A', rosterAnchorDate: WEDNESDAY });
    expect(a.status).toBe(201);
    expect(a.body.rosterAnchorDate).toBe(WEDNESDAY);
    ids.crewA = a.body.id;
    expect((await api().post(hr('/crews')).set(as('admin')).send({ code: 'B', rosterAnchorDate: '2026-10-08' })).status).toBe(400);
  });

  it('байр, өрөө: 201; capacity 0 → 400; өөр кемпийн байр → 400', async () => {
    ids.b1 = (await api().post(camp('/buildings')).set(as('admin')).send({ code: 'B1', name: 'Байр 1' })).body.id;
    const r = await api().post(camp('/rooms')).set(as('admin')).send({ buildingId: ids.b1, roomNo: '101', capacity: 2, floor: 1 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ roomNo: '101', capacity: 2, status: 'ACTIVE', building: { code: 'B1' } });
    expect((await api().post(camp('/rooms')).set(as('admin')).send({ buildingId: ids.b1, roomNo: '102', capacity: 0 })).status).toBe(400);
    const b9 = (await api().post(`${V1}/camps/${ids.c2}/buildings`).set(as('admin')).send({ code: 'B9', name: 'C2 байр' })).body.id;
    expect((await api().post(camp('/rooms')).set(as('admin')).send({ buildingId: b9, roomNo: '1', capacity: 1 })).status).toBe(400);
    expect((await api().patch(camp(`/buildings/${ids.b1}`)).set(as('admin')).send({ isActive: false })).status).toBe(409);
  });

  it('байгууллага: 201; давхар регистр → 409', async () => {
    const o = await api().post(`/api/v1/core/organizations`).set(as('admin')).send({
      name: 'Уурхай ХХК', regNumber: `R${STAMP}`, orgType: 'MAIN', serviceTypes: ['CATERING', 'WASTE_TRANSPORT'],
    });
    expect(o.status).toBe(201);
    expect(o.body.serviceTypes).toEqual(['CATERING', 'WASTE_TRANSPORT']);
    ids.org = o.body.id;
    const types = await api().get('/api/v1/core/organizations/service-types').set(as('admin')).expect(200);
    expect(types.body.map((item: { code: string }) => item.code)).toContain('CATERING');
    expect(await prismaAdmin.coreOrganizationServiceType.count({ where: { tenantId, organizationId: ids.org } })).toBe(2);
    expect((await api().post(`/api/v1/core/organizations`).set(as('admin')).send({
      name: 'Invalid service', orgType: 'CONTRACTOR', serviceTypes: ['NOT_IN_CATALOG'],
    })).status).toBe(400);
    expect((await api().post(`/api/v1/core/organizations`).set(as('admin')).send({ name: 'Dup', regNumber: `R${STAMP}`, orgType: 'CONTRACTOR' })).status).toBe(409);
  });
});

describe('👷 Ажилтан', () => {
  it('3 ажилтан (201); давхар код → 409; өөр кемпийн хэлтэс → 400', async () => {
    for (const [code, dept] of [['E001', ids.deptMine], ['E002', ids.deptMine], ['E003', ids.deptAdm]] as const) {
      const res = await api().post(hr('/employees')).set(as('admin')).send({
        organizationId: ids.org, departmentId: dept, crewId: code === 'E003' ? null : ids.crewA, employeeCode: code, fullName: `Ажилтан ${code}`,
      });
      expect(res.status).toBe(201);
    }
    expect((await api().post(hr('/employees')).set(as('admin')).send({ organizationId: ids.org, departmentId: ids.deptAdm, employeeCode: 'E001', fullName: 'dup' })).status).toBe(409);
    const c2dept = await api().post(`/api/v1/hr/sites/${ids.c2}/departments`).set(as('admin')).send({ code: 'D', name: 'd', mealLocationId: ids.locC2 });
    expect((await api().post(hr('/employees')).set(as('admin')).send({ organizationId: ids.org, departmentId: c2dept.body.id, employeeCode: 'E009', fullName: 'x' })).status).toBe(400);
  });

  it('cursor: limit=2 → 2 + nextCursor → 1 (давхардалгүй); хайлт; буруу cursor → 400', async () => {
    const p1 = await api().get(hr('/employees?limit=2')).set(as('admin'));
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ hasMore: true });
    const p2 = await api().get(hr(`/employees?limit=2&cursor=${p1.body.nextCursor}`)).set(as('admin'));
    expect(p2.body).toMatchObject({ hasMore: false, nextCursor: null });
    const codes = [...p1.body.data, ...p2.body.data].map((e: { employeeCode: string }) => e.employeeCode).sort();
    expect(codes).toEqual(['E001', 'E002', 'E003']);
    const q = await api().get(hr('/employees?q=e003')).set(as('admin'));
    expect(q.body.data.map((e: { employeeCode: string }) => e.employeeCode)).toEqual(['E003']);
    expect((await api().get(hr('/employees?cursor=garbage')).set(as('admin'))).status).toBe(400);
  });

  it('идэвхтэй ажилтантай хэлтэс идэвхгүй болгох → 409', async () => {
    expect((await api().patch(hr(`/departments/${ids.deptMine}`)).set(as('admin')).send({ isActive: false })).status).toBe(409);
  });
});

describe('👥 Кемпийн роль → эрх (зөвхөн тэр кемпэд)', () => {
  it('manager-т "Кемп менежер" (C1) оноох → 201; давхар → 409; өөр tenant-ийн хэрэглэгч → 400', async () => {
    const res = await api().post(`${CORE_RBAC}/user-roles`).set(as('admin')).send({ userId: coreIds.manager, roleId: ids.roleManager, campId: ids.c1 });
    expect(res.status).toBe(201);
    ids.urManager = res.body.id;
    expect((await api().post(`${CORE_RBAC}/user-roles`).set(as('admin')).send({ userId: coreIds.manager, roleId: ids.roleManager, campId: ids.c1 })).status).toBe(409);
    const foreign = await prismaAdmin.coreUser.findFirst({ where: { NOT: { tenantId } }, select: { id: true } });
    if (foreign) {
      expect((await api().post(`${CORE_RBAC}/user-roles`).set(as('admin')).send({ userId: foreign.id, roleId: ids.roleManager })).status).toBe(400);
    }
  });

  it('manager: C1 уншина (200), C2 → 403; кемп жагсаалтад зөвхөн C1; ажилтан үүсгэх эрхгүй → 403', async () => {
    expect((await api().get(hr('/employees')).set(as('manager'))).status).toBe(200);
    expect((await api().get(`/api/v1/hr/sites/${ids.c2}/departments`).set(as('manager'))).status).toBe(403);
    const list = await api().get(`${V1}/camps`).set(as('manager'));
    expect(list.body.map((c: { code: string }) => c.code)).toEqual(['C1']);
    const me = await api().get(`${CORE_RBAC}/me/permissions?campId=${ids.c1}`).set(as('manager'));
    expect(me.body.permissions).toContain('camp.meal.order');
    expect(me.body.permissions).not.toContain('camp.employee.manage');
    expect((await api().post(hr('/employees')).set(as('manager')).send({ organizationId: ids.org, departmentId: ids.deptAdm, employeeCode: 'E010', fullName: 'x' })).status).toBe(403);
  });

  it('админ "Кемп менежер"-т employee.manage нэмж ХЭРЭГЖҮҮЛЭХЭД manager үүсгэж чадна (201); буцааж хэрэгжүүлэхэд 403 (v0.2.2: загвар ≠ автомат)', async () => {
    const roles = (await api().get(`${CORE_RBAC}/roles`).set(as('admin'))).body;
    const original: string[] = roles.find((r: { id: string }) => r.id === ids.roleManager).permissionCodes;
    const put = (codes: string[]) => api().put(`${CORE_RBAC}/roles/${ids.roleManager}/permissions`).set(as('admin')).send({ permissionCodes: codes });
    const apply = () => api().post(`${CORE_RBAC}/roles/${ids.roleManager}/apply`).set(as('admin')).send({});
    const added = await put([...original, 'hr.employee.manage']);
    expect(added.status).toBe(200);
    expect(added.body.pendingUsers).toBeGreaterThan(0);
    // ADR-003 §2.4: хэрэгжүүлэхээс өмнө эрх өөрчлөгдөхгүй
    expect((await api().post(hr('/employees')).set(as('manager')).send({ organizationId: ids.org, departmentId: ids.deptAdm, employeeCode: 'E012', fullName: 'x' })).status).toBe(403);
    expect((await apply()).status).toBe(200);
    const ok = await api().post(hr('/employees')).set(as('manager')).send({ organizationId: ids.org, departmentId: ids.deptAdm, employeeCode: 'E010', fullName: 'Менежерийн нэмсэн' });
    expect(ok.status).toBe(201);
    expect((await put(original)).status).toBe(200);
    expect((await apply()).status).toBe(200);
    expect((await api().post(hr('/employees')).set(as('manager')).send({ organizationId: ids.org, departmentId: ids.deptAdm, employeeCode: 'E011', fullName: 'x' })).status).toBe(403);
    expect((await put(['camp.unknown.perm'])).status).toBe(400);
  });

  it('системийн роль устгах → 409; энгийн роль үүсгэж/устгах → 201/200; роль хассанаар manager эрхгүй болно', async () => {
    expect((await api().delete(`${CORE_RBAC}/roles/${ids.roleManager}`).set(as('admin'))).status).toBe(409);
    const custom = await api().post(`${CORE_RBAC}/roles`).set(as('admin')).send({ name: 'Нягтлан', permissionCodes: ['camp.report.view'] });
    expect(custom.status).toBe(201);
    expect((await api().delete(`${CORE_RBAC}/roles/${custom.body.id}`).set(as('admin'))).status).toBe(200);
    expect((await api().delete(`${CORE_RBAC}/user-roles/${ids.urManager}`).set(as('admin'))).status).toBe(200);
    expect((await api().get(hr('/employees')).set(as('manager'))).status).toBe(403);
  });
});

describe('🧯 camp-errors — БОДИТ Prisma алдаан дээр', () => {
  const mapped = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return toCampHttpError(e);
    }
    throw new Error('алдаа гарах ёстой байсан');
  };

  it('P2002 (unique) → 409', async () => {
    const e = await mapped(prismaAdmin.camp.create({ data: { tenantId, code: 'C1', name: 'dup' } }));
    expect(e).toBeInstanceOf(ConflictException);
  });

  it('trigger CAMP_SYSTEM_ROLE → 409 (v0.2.4 I18N-02: бүртгэлтэй кодоор орчуулагдана)', async () => {
    const e = await mapped(prismaAdmin.coreRole.delete({ where: { id: ids.roleManager } }));
    expect(e, String((e as Error).message)).toBeInstanceOf(ConflictException);
    expect((e as Error).message).toBe('Системийн ролийг устгах эсвэл кодыг өөрчлөх боломжгүй');
  });

  it('EXCLUDE (ээлжийн загвар давхцал) → 409', async () => {
    const e = await mapped(prismaAdmin.hrDepartmentShiftPattern.create({ data: { tenantId, departmentId: ids.deptMine, dayFrom: 7, dayTo: 9, shift: CampShiftType.DAY } }));
    expect(e, String((e as Error).message)).toBeInstanceOf(ConflictException);
    expect((e as Error).message).toBe('Хугацаа/муж давхцаж байна (ex_camp_shift_patterns_overlap)');
  });

  it('CHECK (capacity 0) → 400', async () => {
    const e = await mapped(prismaAdmin.campRoom.create({ data: { tenantId, campId: ids.c1, buildingId: ids.b1, roomNo: 'X0', capacity: 0 } }));
    expect(e, String((e as Error).message)).toBeInstanceOf(BadRequestException);
    expect((e as Error).message).toBe('Өгөгдөл дүрэм зөрчиж байна (camp_rooms_capacity_check)');
  });

  it('composite FK (өөр кемпийн хэлтэс) → 400', async () => {
    const e = await mapped(prismaAdmin.hrEmployee.create({
      data: { tenantId, campId: ids.c2, organizationId: ids.org, departmentId: ids.deptMine, employeeCode: 'FK1', fullName: 'x' },
    }));
    expect(e).toBeInstanceOf(BadRequestException);
  });
});

describe('🔒 RLS leakage (app_user)', () => {
  const countAs = (ctx: string) =>
    prismaRls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx}, true)`;
      return [
        await tx.camp.count({ where: { tenantId } }),
        await tx.hrEmployee.count({ where: { tenantId } }),
        await tx.coreRole.count({ where: { tenantId } }),
      ];
    });

  it('өөр tenant context → [0,0,0]; өөрийн → [2,4,4] (кемп, ажилтан, роль — v0.2.2: 4 системийн роль)', async () => {
    expect(await countAs(OTHER_TENANT_ID)).toEqual([0, 0, 0]);
    expect(await countAs(tenantId)).toEqual([2, 4, 4]);
  });

  it('өөр tenant context-оос энэ tenant-ийн нэрээр бичих → татгалзана', async () => {
    await expect(
      prismaRls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${OTHER_TENANT_ID}, true)`;
        await tx.camp.create({ data: { tenantId, code: 'HACK', name: 'x' } });
      }),
    ).rejects.toThrow();
    expect(await prismaAdmin.camp.count({ where: { tenantId, code: 'HACK' } })).toBe(0);
  });
});

describe('🆔 [R7] Кодгүй ажилтан — автомат код (PIL-25)', () => {
  const c2 = (path = '') => `${V1}/camps/${ids.c2}${path}`;
  // QA-12: HR замууд /hr/sites/:id — хуучин /camp/camps/:id/{employees,departments} устсан
  const hr2 = (path = '') => `/api/v1/hr/sites/${ids.c2}${path}`;
  const mkEmp = (path: string, dept: string, body: object = {}) =>
    api().post(path).set(as('admin')).send({ organizationId: ids.org, departmentId: dept, lastName: 'Автобус', firstName: 'Жолооч', ...body });

  it('код өгөөгүй → Z0001, Z0002 (зэрэг үүсгэхэд давхардахгүй); код солих → дараагийнх түүнээс; угтвар тохиргоо (кемп бүр)', async () => {
    const dept = (await api().post(hr2('/departments')).set(as('admin')).send({ code: 'GRD', name: 'Харуул', mealLocationId: ids.locC2 })).body.id;
    const r = await Promise.all([mkEmp(hr2('/employees'), dept), mkEmp(hr2('/employees'), dept), mkEmp(hr2('/employees'), dept)]);
    expect(r.map((x) => x.status)).toEqual([201, 201, 201]);
    expect(r.map((x) => x.body.employeeCode).sort()).toEqual(['Z0001', 'Z0002', 'Z0003']);

    // HR ID ирсэн / гараар солих (R7.4) — Z0003 → Z0007 → дараагийн автомат Z0008
    const third = r.find((x) => x.body.employeeCode === 'Z0003')!.body.id;
    expect((await api().patch(hr2(`/employees/${third}`)).set(as('admin')).send({ employeeCode: 'Z0007' })).status).toBe(200);
    expect((await mkEmp(hr2('/employees'), dept)).body.employeeCode).toBe('Z0008');

    const base = { vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: null };
    expect((await api().put(c2('/settings')).set(as('admin')).send({ ...base, autoCodePrefix: 'Z1' })).status).toBe(400);
    const st = await api().put(c2('/settings')).set(as('admin')).send({ ...base, autoCodePrefix: 'gr' });
    expect([st.status, st.body.autoCodePrefix]).toEqual([200, 'GR']);
    expect((await mkEmp(hr2('/employees'), dept)).body.employeeCode).toBe('GR0001');
    // C1-ийн угтвар Z хэвээр, дугаарлалт tenant даяар
    expect((await mkEmp(hr('/employees'), ids.deptAdm)).body.employeeCode).toBe('Z0009');
    // угтвар өгөөгүй PUT → өөрчлөхгүй
    expect((await api().put(c2('/settings')).set(as('admin')).send(base)).body.autoCodePrefix).toBe('GR');
  });
});
