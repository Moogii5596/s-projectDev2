/**
 * Camp Module — Шат 4 Integration Test (үндсэн хөрөнгө, засвар + сэлбэгийн зардал)
 * ============================================================
 * Бодит DB + Auth + AppModule + HTTP. main.ts-тэй ИЖИЛ тохиргоо (configureApp) [VALID-001].
 *   хөрөнгө: ангилал, бүртгэл (анхны байршуулалт), шилжүүлэх (түүх), актлах (түгжээ)
 *   засвар: ZAS-{code}-{YYYY}-{NNNN} (зэрэгцээ үүсгэлт), өрөөний түгжээ (олон хүсэлт, гараар суллахгүй),
 *           төлвийн урсгал, сэлбэг, хаахад зөвхөн катерингийн сэлбэгийн зардал (НӨАТ), DB trigger түгжээ, RLS
 * ТУСДАА tenant → afterAll-д устгана. Ажиллуулах:
 *   pnpm --filter core-kernel test:integration -- test/camp-assets-maintenance.integration.spec.ts
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
import { todayUb } from '../src/modules/camp/attendance/camp-date';

const STAMP = Date.now();
const SLUG = `camp-am-it-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const EMAIL = `camp-am-admin-${STAMP}@example.com`;
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const YEAR = todayUb().slice(0, 4);

const dbUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_USER_URL = dbUrl.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');

let app: NestFastifyApplication;
let prismaAdmin: PrismaClient;
let prismaRls: PrismaClient;
let tenantId: string;
let token = '';
let authId = '';
const ids: Record<string, string> = {};

const api = () => supertest(app.getHttpServer());
const auth = () => ({ Authorization: `Bearer ${token}`, Host: HOST });
const V1 = '/api/v1/camp';
const camp = (path = '') => `${V1}/camps/${ids.c1}${path}`;
const roomStatus = async (id: string) => (await prismaAdmin.campRoom.findUniqueOrThrow({ where: { id } })).status;
const SETTINGS = () => ({
  vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: null,
});

/** POST → 201 (эсвэл заасан) ба body */
async function post(path: string, body: object = {}, expected = 201) {
  const r = await api().post(path).set(auth()).send(body);
  if (r.status !== expected) throw new Error(`${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'Camp AM IT', slug: SLUG, tier: TierType.TIER1 } })).id;

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
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  authId = data.user.id;
  ids.user = (await prismaAdmin.coreUser.create({ data: { tenantId, authId, email: EMAIL, fullName: 'admin', role: UserRole.ADMIN } })).id;
  const { data: s } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (!s?.session) throw new Error('signIn');
  token = s.session.access_token;

  // ── Мастер өгөгдөл (API-аар) ──
  ids.c1 = (await post(`${V1}/camps`, { code: 'C1', name: 'Кемп 1' })).id;
  const b = (await post(camp('/buildings'), { code: 'B1', name: 'Байр 1' })).id;
  ids.r101 = (await post(camp('/rooms'), { buildingId: b, roomNo: '101', capacity: 2 })).id;
  ids.r102 = (await post(camp('/rooms'), { buildingId: b, roomNo: '102', capacity: 2 })).id;
  ids.r103 = (await post(camp('/rooms'), { buildingId: b, roomNo: '103', capacity: 2 })).id;
  ids.catering = (await post(`${V1}/organizations`, { name: 'Катеринг ХХК', orgType: 'CONTRACTOR', serviceTypes: ['CATERING'] })).id;
  const st = await api().put(camp('/settings')).set(auth()).send({ ...SETTINGS(), cateringOrganizationId: ids.catering });
  if (st.status !== 200) throw new Error(`settings ${st.status} ${JSON.stringify(st.body)}`);
}, 120_000);

afterAll(async () => {
  await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (authId) await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {});
  await app?.close();
  await prismaRls?.$disconnect();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('🪑 Үндсэн хөрөнгө', () => {
  it('ангилал: үүсгэх 201, нэр давхар (том/жижиг үсэг) → 409', async () => {
    ids.cat = (await post(`${V1}/asset-categories`, { name: 'Тавилга' })).id;
    expect((await api().post(`${V1}/asset-categories`).set(auth()).send({ name: 'тавилга' })).status).toBe(409);
    const list = await api().get(`${V1}/asset-categories?activeOnly=false`).set(auth());
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Тавилга']);
  });

  it('бүртгэл: өрөөнд → анхны movement; агуулахад → movement-гүй; инвентарь давхар → 409', async () => {
    const a = await post(camp('/assets'), { categoryId: ids.cat, inventoryNo: 'INV-001', name: 'Ор', roomId: ids.r101, acquiredDate: '2026-01-15', acquiredCost: 450000.5 });
    ids.bed = a.id;
    expect(a).toMatchObject({ roomId: ids.r101, condition: 'GOOD', acquiredDate: '2026-01-15', acquiredCost: '450000.50' });
    ids.chair = (await post(camp('/assets'), { categoryId: ids.cat, inventoryNo: 'INV-002', name: 'Сандал' })).id;
    expect(await prismaAdmin.campAssetMovement.count({ where: { tenantId, assetId: ids.bed } })).toBe(1);
    expect(await prismaAdmin.campAssetMovement.count({ where: { tenantId, assetId: ids.chair } })).toBe(0);
    expect((await api().post(camp('/assets')).set(auth()).send({ categoryId: ids.cat, inventoryNo: 'INV-001', name: 'X' })).status).toBe(409);
    expect((await api().post(camp('/assets')).set(auth()).send({ categoryId: ids.cat, inventoryNo: 'INV-X', name: 'X', acquiredDate: '2026-02-30' })).status).toBe(400);
  });

  it('шилжүүлэх: 101 → 102 → агуулах; ижил байршил → 400; түүх шинэ нь эхэндээ', async () => {
    expect((await post(camp(`/assets/${ids.bed}/move`), { toRoomId: ids.r102, reason: 'Солив' }, 200)).roomId).toBe(ids.r102);
    expect((await post(camp(`/assets/${ids.bed}/move`), { toRoomId: null }, 200)).roomId).toBeNull();
    expect((await api().post(camp(`/assets/${ids.bed}/move`)).set(auth()).send({ toRoomId: null })).status).toBe(400);
    const h = await api().get(camp(`/assets/${ids.bed}/movements`)).set(auth());
    expect(h.status).toBe(200);
    expect(h.body.map((m: { fromRoomId: string | null; toRoomId: string | null }) => [m.fromRoomId, m.toRoomId])).toEqual([
      [ids.r102, null],
      [ids.r101, ids.r102],
      [null, ids.r101],
    ]);
    expect(h.body[1].reason).toBe('Солив');
    const wh = await api().get(camp('/assets?roomId=warehouse')).set(auth());
    expect(wh.body.data.map((a: { inventoryNo: string }) => a.inventoryNo).sort()).toEqual(['INV-001', 'INV-002']);
    await post(camp(`/assets/${ids.bed}/move`), { toRoomId: ids.r102 }, 200);
  });
});

describe('🔧 Засвар', () => {
  it('дугаар: ZAS-C1-YYYY-0001; зэрэгцээ 4 хүсэлт → давхардалгүй дараалал (advisory lock)', async () => {
    const m1 = await post(camp('/maintenance'), { roomId: ids.r101, title: 'Цорго гоожиж байна', blocksRoom: true, priority: 'HIGH' });
    ids.m1 = m1.id;
    expect(m1).toMatchObject({ requestNo: `ZAS-C1-${YEAR}-0001`, status: 'OPEN', blocksRoom: true, warnings: [] });
    const many = await Promise.all([1, 2, 3, 4].map(() => api().post(camp('/maintenance')).set(auth()).send({ roomId: ids.r103, title: 'Зэрэгцээ' })));
    expect(many.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(many.map((r) => r.body.requestNo).sort()).toEqual([2, 3, 4, 5].map((n) => `ZAS-C1-${YEAR}-000${n}`));
    for (const r of many) await post(camp(`/maintenance/${r.body.id}/cancel`), { reason: 'Тест' }, 200);
  });

  it('өрөөний түгжээ: blocksRoom → MAINTENANCE; гараар ACTIVE → 409; 2 дахь түгжээ', async () => {
    expect(await roomStatus(ids.r101)).toBe('MAINTENANCE');
    const manual = await api().patch(camp(`/rooms/${ids.r101}`)).set(auth()).send({ status: 'ACTIVE' });
    expect(manual.status).toBe(409);
    expect(manual.body.message).toContain(`ZAS-C1-${YEAR}-0001`);
    ids.m2 = (await post(camp('/maintenance'), { roomId: ids.r101, title: 'Цонх', blocksRoom: true })).id;
    expect(await roomStatus(ids.r101)).toBe('MAINTENANCE');
  });

  it('урсгал: start → сэлбэг → complete (өөр түгжээ байгаа тул өрөө MAINTENANCE хэвээр)', async () => {
    expect((await post(camp(`/maintenance/${ids.m1}/start`), {}, 200)).status).toBe('IN_PROGRESS');
    expect((await api().post(camp(`/maintenance/${ids.m1}/start`)).set(auth())).status).toBe(409);
    await post(camp(`/maintenance/${ids.m1}/parts`), { partName: 'Цорго', quantity: 2, unitPrice: 11000, source: 'CATERING_PURCHASED' });
    await post(camp(`/maintenance/${ids.m1}/parts`), { partName: 'Битүүмжлэл', quantity: 1.5, unit: 'м', unitPrice: 1000, vatIncluded: false, source: 'CATERING_PURCHASED' });
    ids.minePart = (await post(camp(`/maintenance/${ids.m1}/parts`), { partName: 'Хоолой', quantity: 3, source: 'MINE_SUPPLIED' })).id;
    expect((await api().post(camp(`/maintenance/${ids.m1}/parts`)).set(auth()).send({ partName: 'X', quantity: 1, source: 'CATERING_PURCHASED' })).status).toBe(400);
    const done = await post(camp(`/maintenance/${ids.m1}/complete`), {}, 200);
    expect(done).toMatchObject({ status: 'DONE', roomReleased: false });
    expect(done.cost.total).toEqual({ net: '21500.00', vat: '2150.00', gross: '23650.00' });
    expect(await roomStatus(ids.r101)).toBe('MAINTENANCE');
  });

  it('cancel (сүүлчийн түгжээ) → өрөө ACTIVE', async () => {
    expect((await api().post(camp(`/maintenance/${ids.m2}/cancel`)).set(auth()).send({})).status).toBe(400);
    const c = await post(camp(`/maintenance/${ids.m2}/cancel`), { reason: 'Давхар' }, 200);
    expect(c).toMatchObject({ status: 'CANCELLED', cancelReason: 'Давхар', roomReleased: true });
    expect(await roomStatus(ids.r101)).toBe('ACTIVE');
  });

  it('reopen → өрөөг дахин түгжинэ; complete → суллана', async () => {
    expect((await post(camp(`/maintenance/${ids.m1}/reopen`), {}, 200)).status).toBe('IN_PROGRESS');
    expect(await roomStatus(ids.r101)).toBe('MAINTENANCE');
    expect((await post(camp(`/maintenance/${ids.m1}/complete`), {}, 200)).roomReleased).toBe(true);
    expect(await roomStatus(ids.r101)).toBe('ACTIVE');
  });

  it('хаах: катеринг байгууллагагүй тохиргоо → 409; тохируулаад → зөвхөн катерингийн сэлбэгийн зардал', async () => {
    expect((await api().put(camp('/settings')).set(auth()).send({ ...SETTINGS(), cateringOrganizationId: null })).status).toBe(200);
    const no = await api().post(camp(`/maintenance/${ids.m1}/close`)).set(auth());
    expect(no.status).toBe(409);
    expect(no.body.message).toMatch(/катерингийн үйлчилгээ үзүүлэгч/);
    expect((await prismaAdmin.campMaintenanceRequest.findUniqueOrThrow({ where: { id: ids.m1 } })).status).toBe('DONE');
    expect((await api().put(camp('/settings')).set(auth()).send({ ...SETTINGS(), cateringOrganizationId: ids.catering })).status).toBe(200);

    const c = await post(camp(`/maintenance/${ids.m1}/close`), {}, 200);
    expect(c).toMatchObject({ status: 'CLOSED', costEntries: 2, closedBy: ids.user });
    const rows = await prismaAdmin.campCostEntry.findMany({ where: { tenantId }, orderBy: { grossAmount: 'desc' } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === 'MAINTENANCE_PART' && r.organizationId === ids.catering && r.campId === ids.c1)).toBe(true);
    expect(rows.map((r) => [r.netAmount.toFixed(2), r.vatAmount.toFixed(2), r.grossAmount.toFixed(2)])).toEqual([
      ['20000.00', '2000.00', '22000.00'],
      ['1500.00', '150.00', '1650.00'],
    ]);
    expect(rows[0].costDate.toISOString().slice(0, 10)).toBe(todayUb());
    expect(rows[0].description).toBe(`ZAS-C1-${YEAR}-0001: Цорго`);
  });

  it('хаагдсаны дараа: сэлбэг/төлөв → 409 (app); DB trigger ч хамгаална', async () => {
    expect((await api().delete(camp(`/maintenance/${ids.m1}/parts/${ids.minePart}`)).set(auth())).status).toBe(409);
    expect((await api().post(camp(`/maintenance/${ids.m1}/reopen`)).set(auth())).status).toBe(409);
    expect((await api().patch(camp(`/maintenance/${ids.m1}`)).set(auth()).send({ title: 'X' })).status).toBe(409);
    await expect(prismaAdmin.campMaintenancePart.delete({ where: { id: ids.minePart } })).rejects.toThrow(/CAMP_MAINTENANCE_LOCKED/);
    await expect(prismaAdmin.campMaintenanceRequest.update({ where: { id: ids.m1 }, data: { title: 'X' } })).rejects.toThrow(/CAMP_MAINTENANCE_LOCKED/);
    await expect(prismaAdmin.campCostEntry.updateMany({ where: { tenantId }, data: { description: 'x' } })).rejects.toThrow(/CAMP_COST_IMMUTABLE/);
  });

  it('INACTIVE өрөөг түгжих → 409; түгжихгүй хүсэлт OK', async () => {
    expect((await api().patch(camp(`/rooms/${ids.r103}`)).set(auth()).send({ status: 'INACTIVE' })).status).toBe(200);
    expect((await api().post(camp('/maintenance')).set(auth()).send({ roomId: ids.r103, title: 'X', blocksRoom: true })).status).toBe(409);
    expect(await prismaAdmin.campMaintenanceRequest.count({ where: { tenantId, title: 'X' } })).toBe(0); // rollback
    const ok = await post(camp('/maintenance'), { roomId: ids.r103, title: 'Y' });
    await post(camp(`/maintenance/${ok.id}/cancel`), { reason: 'Тест' }, 200);
  });

  it('катеринг байгууллагаас CATERING хасах → 409 (кемпийн тохиргоонд ашиглагдаж байна)', async () => {
    const r = await api().patch(`${V1}/organizations/${ids.catering}`).set(auth()).send({ serviceTypes: ['OTHER'] });
    expect(r.status).toBe(409);
  });
});

describe('🪑🔧 Хөрөнгө ба засвар', () => {
  it('зөвхөн хөрөнгө өгвөл түүний өрөө; нээлттэй засвартай → актлах 409', async () => {
    const m = await post(camp('/maintenance'), { assetId: ids.bed, title: 'Ор эвдэрсэн' });
    expect(m).toMatchObject({ roomId: ids.r102, assetId: ids.bed, blocksRoom: false });
    expect((await api().post(camp(`/assets/${ids.bed}/write-off`)).set(auth()).send({ reason: 'Эвдэрсэн' })).status).toBe(409);
    await post(camp(`/maintenance/${m.id}/cancel`), { reason: 'Засах боломжгүй' }, 200);
  });

  it('актлах → WRITTEN_OFF + агуулах + түүх; дараа нь засах/шилжүүлэх/засварт оруулах → 409', async () => {
    const w = await post(camp(`/assets/${ids.bed}/write-off`), { reason: 'Эвдэрсэн' }, 200);
    expect(w).toMatchObject({ condition: 'WRITTEN_OFF', roomId: null });
    expect(w.note).toContain('Эвдэрсэн');
    const h = await api().get(camp(`/assets/${ids.bed}/movements`)).set(auth());
    expect(h.body[0]).toMatchObject({ fromRoomId: ids.r102, toRoomId: null, reason: 'Актлав: Эвдэрсэн' });
    expect((await api().patch(camp(`/assets/${ids.bed}`)).set(auth()).send({ name: 'X' })).status).toBe(409);
    expect((await api().post(camp(`/assets/${ids.bed}/move`)).set(auth()).send({ toRoomId: ids.r101 })).status).toBe(409);
    expect((await api().post(camp('/maintenance')).set(auth()).send({ assetId: ids.bed, title: 'X' })).status).toBe(409);
    expect((await api().post(camp(`/assets/${ids.bed}/write-off`)).set(auth()).send({ reason: 'Дахин' })).status).toBe(409);
  });
});

describe('🔒 RLS', () => {
  it('app_user: өөр tenant context → 0; өөрийн → бүртгэлүүд', async () => {
    const countAs = (ctx: string) =>
      prismaRls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx}, true)`;
        return [
          await tx.campAsset.count({ where: { tenantId } }),
          await tx.campAssetMovement.count({ where: { tenantId } }),
          await tx.campMaintenanceRequest.count({ where: { tenantId } }),
          await tx.campMaintenancePart.count({ where: { tenantId } }),
          await tx.campCostEntry.count({ where: { tenantId } }),
        ];
      });
    expect(await countAs(OTHER_TENANT_ID)).toEqual([0, 0, 0, 0, 0]);
    // хөрөнгө 2; movement: анхны + 101→102 + 102→агуулах + агуулах→102 + актлах = 5; засвар 1+4+1+1+1 = 8; сэлбэг 3; зардал 2
    expect(await countAs(tenantId)).toEqual([2, 5, 8, 3, 2]);
  });
});
