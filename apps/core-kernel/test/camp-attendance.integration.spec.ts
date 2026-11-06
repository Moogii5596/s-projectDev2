/**
 * Camp Module — Шат 3 Integration Test (ирц, ээлж, өрөө, хоолны суурь тоо)
 * ============================================================
 * Бодит DB + Auth + AppModule + HTTP (multipart upload). main.ts-тэй ИЖИЛ ValidationPipe [VALID-001] + multipart.
 * Ростер: 14 ажил, замын хоног амралтад — Лхагва (0) ирж, Пүрэв (15) явна. А баг anchor 2026-10-07, C баг 2026-10-21.
 *   xlsx PREVIEW (алдаатай) → CONFIRM 409 → засварласан xlsx → CONFIRM → давхар импорт илэрнэ
 *   хоолны суурь тоо (7/7, Пүрэвийн нэмэлт өдрийн хоол, багагүй ADM, явах өдөр), зохицуулалт, календарь,
 *   гараар бүртгэл/устгах, өрөөний багтаамж (хоногоор), самбар, RLS
 * ТУСДАА tenant → afterAll-д устгана. Ажиллуулах:
 *   pnpm --filter core-kernel test:integration -- test/camp-attendance.integration.spec.ts
 * ============================================================
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
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
const SLUG = `camp-att-it-${STAMP}`;
const HOST = `${SLUG}.example.com`;
const PASSWORD = 'Test1234!';
const EMAIL = `camp-att-admin-${STAMP}@example.com`;
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';

const dbUrl = ADMIN_DB_URL; // Phase 4.8.5: SYSTEM_DATABASE_URL → DATABASE_URL (RLS bypass)
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

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ирц');
  ws.addRow(['employee_code', 'date', 'direction', 'meals', 'shift']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const upload = async (rows: unknown[][]) => api().post(camp('/movement-imports')).set(auth()).attach('file', await xlsx(rows), 'irts.xlsx');
const presence = async (date: string) => {
  const r = await api().get(camp(`/presence?date=${date}`)).set(auth());
  expect(r.status).toBe(200);
  const loc = (id: string | null) => (id === ids.locCamp ? 'CAMP' : id === ids.locMine ? 'MINE' : String(id));
  // байршлын UUID-ийн эрэмбээс хамаарахгүй — эрэмбэлж харьцуулна
  return { ...r.body, simple: r.body.lines.map((l: { mealType: string; mealLocationId: string; count: number }) => `${l.mealType}@${loc(l.mealLocationId)}=${l.count}`).sort() };
};

beforeAll(async () => {
  prismaAdmin = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  prismaRls = new PrismaClient({ datasources: { db: { url: APP_USER_URL } } });
  await prismaAdmin.$connect();
  await prismaRls.$connect();
  tenantId = (await prismaAdmin.tenant.create({ data: { name: 'Camp Att IT', slug: SLUG, tier: TierType.TIER1 } })).id;

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
  await prismaAdmin.coreUser.create({ data: { tenantId, authId, email: EMAIL, fullName: 'admin', role: UserRole.ADMIN } });
  const { data: s } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (!s?.session) throw new Error('signIn');
  token = s.session.access_token;

  // ── Мастер өгөгдөл (API-аар) ──
  const post = async (path: string, body: object) => {
    const r = await api().post(path).set(auth()).send(body);
    if (r.status !== 201) throw new Error(`${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.id as string;
  };
  ids.c1 = await post(`${V1}/camps`, { code: 'C1', name: 'Кемп 1' });
  ids.locCamp = await post(camp('/meal-locations'), { name: 'Кемп гал тогоо' });
  ids.locMine = await post(camp('/meal-locations'), { name: 'Уулын хэсэг' });
  const st = await api().put(camp('/settings')).set(auth()).send({
    vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: ids.locCamp,
  });
  if (st.status !== 200) throw new Error(`settings ${st.status}`);
  // v0.2.1 (Q1, Д-4): хэлтэст хоолны байршил БАЙХГҮЙ (илгээсэн ч үл тооно) — уурхайчдын "Уул" нь албан тушаалын кемпийн анхдагч
  ids.mine = await post(camp('/departments'), {
    code: 'MINE', name: 'Уул', mealLocationId: ids.locCamp,
    shiftPattern: [{ dayFrom: 1, dayTo: 7, shift: 'DAY' }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' }],
  });
  ids.adm = await post(camp('/departments'), { code: 'ADM', name: 'Захиргаа', shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] });
  ids.posMiner = await post(`${V1}/positions`, { name: 'Уурхайчин' });
  const ps = await api().put(camp(`/position-settings/${ids.posMiner}`)).set(auth()).send({ mealLocationId: ids.locMine });
  if (ps.status !== 200) throw new Error(`position-settings ${ps.status} ${JSON.stringify(ps.body)}`);
  ids.crewA = await post(camp('/crews'), { code: 'A', rosterAnchorDate: '2026-10-07' });
  ids.crewC = await post(camp('/crews'), { code: 'C', rosterAnchorDate: '2026-10-21' });
  ids.org = await post(`${V1}/organizations`, { name: 'Уурхай', orgType: 'MAIN' });
  for (const [code, dept, crew] of [['E1', ids.mine, ids.crewA], ['E2', ids.mine, ids.crewA], ['E3', ids.adm, null], ['E4', ids.mine, ids.crewC]] as const) {
    ids[code] = await post(camp('/employees'), {
      organizationId: ids.org, departmentId: dept, crewId: crew, employeeCode: code, fullName: `Ажилтан ${code}`,
      ...(dept === ids.mine ? { positionId: ids.posMiner } : {}),
    });
  }
  const b = await post(camp('/buildings'), { code: 'B1', name: 'Байр 1' });
  ids.r101 = await post(camp('/rooms'), { buildingId: b, roomNo: '101', capacity: 1 });
  ids.r102 = await post(camp('/rooms'), { buildingId: b, roomNo: '102', capacity: 2 });
}, 120_000);

afterAll(async () => {
  await prismaAdmin?.tenant.delete({ where: { id: tenantId } }).catch((e) => console.error('[cleanup]', e));
  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  if (authId) await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {});
  await app?.close();
  await prismaRls?.$disconnect();
  await prismaAdmin?.$disconnect();
}, 30_000);

describe('📥 Ирцийн xlsx импорт', () => {
  it('загвар татах → xlsx', async () => {
    const r = await api().get(camp('/movement-imports/template')).set(auth());
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
  });

  it('алдаатай файл → PREVIEW (мөрийн алдаатай) → CONFIRM 409 (юу ч бичихгүй)', async () => {
    const r = await upload([
      ['E1', '2026-10-07', 'ARRIVAL'],
      ['E4', '2026-10-05', 'ARRIVAL'],                // ээлжийн бус, хоолгүй → алдаа
      ['NOPE', '2026-10-07', 'ARRIVAL', 'NONE'],      // ажилтан алга
    ]);
    expect(r.status).toBe(201);
    expect(r.body.import).toMatchObject({ status: 'PREVIEW', totalRows: 3, errorRows: 2 });
    expect(r.body.rows[1].errors[0]).toMatch(/хоол заавал/);
    const c = await api().post(camp(`/movement-imports/${r.body.import.id}/confirm`)).set(auth());
    expect(c.status).toBe(409);
    expect(c.body.errors).toHaveLength(2);
    expect(await prismaAdmin.hrMovement.count({ where: { tenantId } })).toBe(0);
    expect((await api().post(camp(`/movement-imports/${r.body.import.id}/cancel`)).set(auth())).status).toBe(200);
  });

  it('[R4.1] PREVIEW мөр засах / устгах → дахин төлөвлөнө (DB-д бичихгүй); validation; CANCEL-ийн дараа 409', async () => {
    const hr = (p: string) => `/api/v1/hr/sites/${ids.c1}${p}`;
    const r = await upload([
      ['E1', '2026-10-07', 'ARRIVAL'],
      ['E4', '2026-10-05', 'ARRIVAL'],                // мөр 3: хоолгүй → алдаа → устгана
      ['NOPE', '2026-10-07', 'ARRIVAL', 'NONE'],      // мөр 4: ажилтан алга → E3 болгоно
    ]);
    expect(r.body.import.errorRows).toBe(2);
    const id = r.body.import.id;
    const patch = (body: object) => api().patch(hr(`/movement-imports/${id}/rows`)).set(auth()).send(body);

    expect((await patch({ rows: [{ row: 0, deleted: true }] })).status).toBe(400);              // DTO
    expect((await patch({ rows: [{ row: 4 }] })).body.code).toBe('camp.err.attendance.13');      // аль нь ч алга
    expect((await patch({ rows: [{ row: 9, deleted: true }] })).body.code).toBe('camp.err.attendance.12');
    expect((await patch({ rows: [{ row: 4, employeeId: '00000000-0000-7000-8000-000000000000' }] })).body.code).toBe('camp.err.attendance.5');

    const e = await patch({ rows: [{ row: 3, deleted: true }, { row: 4, employeeId: ids.E3 }] });
    expect(e.status).toBe(200);
    expect(e.body.import).toMatchObject({ id, status: 'PREVIEW', totalRows: 2, okRows: 2, errorRows: 0 });
    expect(e.body.summary).toMatchObject({ arrivals: 2, errorRows: 0, deletedRows: 1 });
    expect(e.body.format).toBe('TEMPLATE');
    expect(e.body.rows.map((x: { row: number; deleted?: boolean; employeeCode: string }) => [x.row, !!x.deleted, x.employeeCode])).toEqual([[2, false, 'E1'], [3, true, 'E4'], [4, false, 'E3']]);
    const db = await prismaAdmin.hrMovementImport.findUniqueOrThrow({ where: { id } });
    expect(db).toMatchObject({ status: 'PREVIEW', totalRows: 2, errorRows: 0 });
    expect((db.parsedRows as { row: number; deleted?: boolean; edited?: unknown }[]).map((x) => [x.row, !!x.deleted, x.edited ?? null])).toEqual([[2, false, null], [3, true, null], [4, false, { fromCode: 'NOPE' }]]);
    expect(await prismaAdmin.hrMovement.count({ where: { tenantId } })).toBe(0);

    // сэргээхэд алдаа буцаж ирнэ
    const back = await patch({ rows: [{ row: 3, deleted: false }] });
    expect(back.body.import.errorRows).toBe(1);

    expect((await api().post(camp(`/movement-imports/${id}/cancel`)).set(auth())).status).toBe(200);
    const late = await patch({ rows: [{ row: 3, deleted: true }] });
    expect([late.status, late.body.code]).toEqual([409, 'camp.err.attendance.11']);
  });

  it('засварласан файл → CONFIRM: ростер/ээлжийн бус ангилал, stay нээх/хаах', async () => {
    const r = await upload([
      ['E1', '2026-10-07', 'ARRIVAL'],                          // А баг ирэх Лхагва → ROSTER, DINNER
      ['E2', '2026-10-07', 'ARRIVAL'],
      ['E2', '2026-10-12', 'DEPARTURE', 'BREAKFAST'],            // ээлжийн бус явалт
      ['E3', new Date(Date.UTC(2026, 9, 1)), 'ARRIVAL', 'DINNER'], // багагүй → OFF_ROSTER
      ['E4', '2026-09-23', 'ARRIVAL'],                           // C баг өмнөх мөчлөг (10-21 − 28)
      ['E4', '2026-10-08', 'DEPARTURE'],                         // C баг явах Пүрэв (өдөр 15) → ROSTER
    ]);
    expect(r.status).toBe(201);
    expect(r.body.import.errorRows).toBe(0);
    expect(r.body.rows.map((x: { kind: string }) => x.kind)).toEqual(['ROSTER', 'ROSTER', 'OFF_ROSTER', 'OFF_ROSTER', 'ROSTER', 'ROSTER']);
    ids.import = r.body.import.id;
    const c = await api().post(camp(`/movement-imports/${ids.import}/confirm`)).set(auth());
    expect(c.status).toBe(200);
    expect(c.body).toEqual({ status: 'CONFIRMED', movements: 6, newStays: 4, closedStays: 0, adjustments: 0 });
    expect((await api().post(camp(`/movement-imports/${ids.import}/confirm`)).set(auth())).status).toBe(409);
  });

  it('ижил файлыг дахин → давхардал PREVIEW-д илэрнэ', async () => {
    const r = await upload([['E1', '2026-10-07', 'ARRIVAL']]);
    expect(r.body.rows[0].errors).toContain('Энэ ирэлт/явалт аль хэдийн бүртгэгдсэн');
  });

  it('stays (2026-10-08): E4 явах өдөр, бусад бүтэн өдөр', async () => {
    const r = await api().get(camp('/stays?date=2026-10-08')).set(auth());
    const m = Object.fromEntries(r.body.map((x: { employee: { employeeCode: string }; dayType: string }) => [x.employee.employeeCode, x.dayType]));
    expect(m).toEqual({ E1: 'FULL_DAY', E2: 'FULL_DAY', E3: 'FULL_DAY', E4: 'DEPARTURE' });
  });
});

describe('🍽️ Хоолны суурь тоо (presence)', () => {
  it('2026-10-08 (Пүрэв, өдөр 1): MINE өдрийн ээлж (Өдөр@Уул), ADM нэг ээлжтэй (Өдөр@кемп), E4 явах — Өглөө', async () => {
    const p = await presence('2026-10-08');
    expect(p.presentCount).toBe(4);
    expect(p.simple).toEqual(['BREAKFAST@CAMP=4', 'LUNCH@CAMP=1', 'LUNCH@MINE=2', 'DINNER@CAMP=3'].sort());
    expect(p.personDays).toBe('3.3333');
    expect(p.warnings).toEqual({ unknownShift: [], noDefaultMealLocation: false });
  });

  it('2026-10-07 (Лхагва): E1/E2 ирэлт — Орой; E4 (C баг өдөр 14 — шөнө) бүтэн өдөр', async () => {
    const p = await presence('2026-10-07');
    expect(p.simple).toEqual(['BREAKFAST@CAMP=2', 'LUNCH@CAMP=1', 'DINNER@CAMP=4', 'NIGHT@MINE=1'].sort());
  });

  it('2026-10-15 (Пүрэв, өдөр 8): E1 шөнийн эхний өдөр → + Өдөр (кемп); E2 явсан', async () => {
    const p = await presence('2026-10-15');
    expect(p.simple).toEqual(['BREAKFAST@CAMP=2', 'LUNCH@CAMP=2', 'DINNER@CAMP=2', 'NIGHT@MINE=1'].sort());
  });

  it('ээлжийн зохицуулалт: E1 10-16..10-17 ӨДӨР → 10-16 өдрийн хоол уулд; давхцал → 409', async () => {
    const body = { employeeIds: [ids.E1], startDate: '2026-10-16', endDate: '2026-10-17', shift: 'DAY', reasonType: 'SHIFT_CHANGE' };
    expect((await api().post(camp('/shift-adjustments')).set(auth()).send(body)).status).toBe(201);
    expect((await api().post(camp('/shift-adjustments')).set(auth()).send({ ...body, startDate: '2026-10-17', endDate: '2026-10-18' })).status).toBe(409);
    const p = await presence('2026-10-16');
    expect(p.simple).toContain('LUNCH@MINE=1');
    expect(p.simple).not.toContain('NIGHT@MINE=1');
  });

  it('календарь: E1 10-07..10-09 (ирэх 0 / загвар)', async () => {
    const r = await api().get(camp(`/shift-calendar?from=2026-10-07&to=2026-10-09&departmentId=${ids.mine}`)).set(auth());
    expect(r.status).toBe(200);
    const e1 = r.body.employees.find((e: { employeeCode: string }) => e.employeeCode === 'E1');
    expect(e1.cells.map((c: { shift: string | null; source: string; presence: string | null }) => [c.shift, c.source, c.presence])).toEqual([
      [null, 'UNKNOWN', 'ARRIVAL'], ['DAY', 'PATTERN', 'FULL_DAY'], ['DAY', 'PATTERN', 'FULL_DAY'],
    ]);
  });
});

describe('✍️ Гараар бүртгэл', () => {
  it('ээлжийн бус ирэлт хоолгүй → 400; хоолтой → 201; сүүлийнхийг устгах → 200; өмнөхийг → 409', async () => {
    expect((await api().post(camp('/movements')).set(auth()).send({ employeeId: ids.E2, date: '2026-10-20', direction: 'ARRIVAL' })).status).toBe(400);
    const ok = await api().post(camp('/movements')).set(auth()).send({ employeeId: ids.E2, date: '2026-10-20', direction: 'ARRIVAL', meals: ['LUNCH', 'DINNER'], shift: 'NIGHT' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ kind: 'OFF_ROSTER', meals: ['LUNCH', 'DINNER'] });
    const list = await api().get(camp(`/movements?from=2026-10-01&to=2026-10-31&employeeId=${ids.E2}`)).set(auth());
    const byDate = Object.fromEntries(list.body.map((m: { movementDate: string; id: string }) => [m.movementDate, m.id]));
    expect((await api().delete(camp(`/movements/${byDate['2026-10-12']}`)).set(auth())).status).toBe(409);
    expect((await api().delete(camp(`/movements/${byDate['2026-10-20']}`)).set(auth())).status).toBe(200);
  });
});

describe('🛏️ Өрөө (хоногоор)', () => {
  it('E1 (А) → 101 (1 ор) 201; E4 (C) → 101 → 409 (10-07 шөнө давхцана); E4 → 102 201', async () => {
    expect((await api().post(camp('/room-allocations')).set(auth()).send({ employeeId: ids.E1, roomId: ids.r101, startDate: '2026-10-07' })).status).toBe(201);
    const over = await api().post(camp('/room-allocations')).set(auth()).send({ employeeId: ids.E4, roomId: ids.r101, startDate: '2026-10-07' });
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/2026-10-07-ний шөнө 2 хүн/);
    expect((await api().post(camp('/room-allocations')).set(auth()).send({ employeeId: ids.E4, roomId: ids.r102, startDate: '2026-10-07' })).status).toBe(201);
    expect((await api().post(camp('/room-allocations')).set(auth()).send({ employeeId: ids.E1, roomId: ids.r102, startDate: '2026-10-09', replaceCurrent: 'false' })).status).toBe(409);
  });

  it('самбар 2026-10-08: 101 FULL (E1), 102 VACANT (E4 явсан өдөр), өрөөгүй: E2, E3', async () => {
    const r = await api().get(camp('/room-board?date=2026-10-08')).set(auth());
    expect(r.status).toBe(200);
    const rooms = Object.fromEntries(r.body.rooms.map((x: { roomNo: string; occupancy: string }) => [x.roomNo, x.occupancy]));
    expect(rooms).toEqual({ 101: 'FULL', 102: 'VACANT' });
    expect(r.body.unassigned.map((u: { employeeCode: string }) => u.employeeCode).sort()).toEqual(['E2', 'E3']);
  });
});

describe('🔒 Validation ба RLS', () => {
  it('[VALID-001] ?activeOnly=false → идэвхгүй кемп ч гарна (implicit conversion true болгохгүй); rosterOffDays 1 → 400', async () => {
    const c2 = await api().post(`${V1}/camps`).set(auth()).send({ code: 'C2', name: 'Идэвхгүй кемп' });
    expect((await api().patch(`${V1}/camps/${c2.body.id}`).set(auth()).send({ isActive: false })).status).toBe(200);
    const all = await api().get(`${V1}/camps?activeOnly=false`).set(auth());
    expect(all.status).toBe(200);
    expect(all.body.map((c: { code: string }) => c.code)).toEqual(['C1', 'C2']);
    const active = await api().get(`${V1}/camps?activeOnly=true`).set(auth());
    expect(active.body.map((c: { code: string }) => c.code)).toEqual(['C1']);
    const bad = await api().put(camp('/settings')).set(auth()).send({
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 1, mealOrderCutoffTime: null, defaultMealLocationId: ids.locCamp,
    });
    expect(bad.status).toBe(400);
  });

  it('app_user: өөр tenant context → 0 бүртгэл/stay; өөрийн → >0', async () => {
    const countAs = (ctx: string) =>
      prismaRls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx}, true)`;
        return [await tx.hrMovement.count({ where: { tenantId } }), await tx.campStay.count({ where: { tenantId } }), await tx.hrMovementImport.count({ where: { tenantId } })];
      });
    expect(await countAs(OTHER_TENANT_ID)).toEqual([0, 0, 0]);
    const own = await countAs(tenantId);
    expect(own[0]).toBe(6);
    expect(own[1]).toBe(4);
  });
});

describe('📥 [R4] HR ShiftChange — PREVIEW, ростерын зөрүү, мөр засах', () => {
  const hr = (p: string) => `/api/v1/hr/sites/${ids.c1}${p}`;
  /** ShiftChange бүтэц: хуудасны нэрэнд огноо + төрөл, 1-р мөр гарчиг, 2-р мөр толгой */
  async function shiftChange(sheets: { name: string; rows: (string | number)[][] }[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    for (const s of sheets) {
      const ws = wb.addWorksheet(s.name);
      ws.addRow(['Ажилчдын жагсаалт']);
      ws.addRow(['Д/д', 'Shift', 'ID', 'Ажилтны овог', 'Ажилтны нэр', 'Албан тушаал', 'Хэлтэс']);
      s.rows.forEach((r) => ws.addRow(r));
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('C баг 2026-11-18 ирэх: нэрээр тулгана, ЗОХИЦУУЛАЛТ алгасна, ростерын зөрүү (E4); алдаатай мөрийг устгахад загвар / алгассан хуудас хэвээр', async () => {
    const e5 = await api().post(camp('/employees')).set(auth()).send({
      organizationId: ids.org, departmentId: ids.mine, crewId: ids.crewC, employeeCode: 'E5', lastName: 'Бат', firstName: 'Дорж', positionId: ids.posMiner,
    });
    expect(e5.status).toBe(201);
    const file = await shiftChange([
      { name: '2026.11.18 C ирэх', rows: [[1, 'C', 'NEW', 'Бат', 'Дорж', 'Уурхайчин', 'Уул'], [2, 'C', 'NEW', 'Үл', 'Мэдэгдэх', 'Уурхайчин', 'Уул']] },
      { name: 'ЗОХИЦУУЛАЛТ 2026.11.18', rows: [[1, 'C', 'NEW', 'Бат', 'Дорж', '', '']] },
    ]);
    const r = await api().post(hr('/movement-imports')).set(auth()).attach('file', file, 'ShiftChange.xlsx');
    expect(r.status).toBe(201);
    expect(r.body.format).toBe('SHIFTCHANGE');
    expect(r.body.skippedSheets).toEqual([{ sheet: 'ЗОХИЦУУЛАЛТ 2026.11.18', reason: 'LEGACY_ADJUSTMENT' }]);
    expect(r.body.import).toMatchObject({ totalRows: 2, errorRows: 1 });
    expect(r.body.rows[0]).toMatchObject({ employeeCode: 'E5', direction: 'ARRIVAL', kind: 'ROSTER', errors: [], source: { sheet: '2026.11.18 C ирэх', idType: 'NEW' } });
    expect(r.body.rows[1].errors.length).toBe(1);
    const gap = r.body.rosterGaps.find((g: { date: string; direction: string }) => g.date === '2026-11-18' && g.direction === 'ARRIVAL');
    const gapCodes = gap.employees.map((e: { employeeCode: string }) => e.employeeCode);
    expect(gapCodes).toContain('E4');
    expect(gapCodes).not.toContain('E5');

    const e = await api().patch(hr(`/movement-imports/${r.body.import.id}/rows`)).set(auth()).send({ rows: [{ row: r.body.rows[1].row, deleted: true }] });
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ format: 'SHIFTCHANGE', skippedSheets: [{ reason: 'LEGACY_ADJUSTMENT' }], import: { totalRows: 1, errorRows: 0 }, summary: { deletedRows: 1 } });
    expect(e.body.rosterGaps.length).toBeGreaterThan(0);
    expect((await api().post(hr(`/movement-imports/${r.body.import.id}/cancel`)).set(auth())).status).toBe(200);
  });
});
