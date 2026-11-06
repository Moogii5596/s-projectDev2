/**
 * v0.2.0 §1–§2 — UX/бөөнөөр оруулах backend integration
 *   FB-07 олон өрөө (байр үүсгэхдээ + "+ Олон өрөө"), байрны өрөө/багтаамжийн тоо
 *   FB-03 хэлтсийн идэвхтэй ажилтан / албан тушаалын тоо
 *   FB-14 ирцийн шүүлт + олон ажилтны ирц нэг дор (импортын урсгал)
 *   FB-12 өрөөний самбарын идэвхгүй ажилтан
 */
import { CampIt, createCampIt, WEDNESDAY } from './helpers/camp-it-app';

let it_: CampIt;
const emp = async (code: string, extra: Record<string, unknown> = {}) => {
  const r = await it_.api().post(it_.hr('/employees')).set(it_.as('admin')).send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, employeeCode: code, fullName: `Н ${code}`, ...extra });
  expect(r.status).toBe(201);
  return r.body.id as string;
};

beforeAll(async () => {
  it_ = await createCampIt('ux-it');
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('🏠 FB-07 олон өрөө', () => {
  it('байр + 24 өрөө нэг дор (угтвар, 01 хэлбэр, давхар, багтаамж); түүх 1 + 24', async () => {
    const res = await it_.api().post(it_.camp('/buildings')).set(it_.as('admin'))
      .send({ code: 'B7', name: 'Блок 7', rooms: { from: 1, to: 24, prefix: '7-', padTo: 2, floor: 1, capacity: 4 } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: 'B7', roomsCreated: 24, roomsSkipped: [] });
    it_.ids.b7 = res.body.id;
    const rooms = await it_.prismaAdmin.campRoom.findMany({ where: { tenantId: it_.tenantId, buildingId: it_.ids.b7 }, orderBy: { roomNo: 'asc' } });
    expect(rooms.map((r) => r.roomNo).slice(0, 3)).toEqual(['7-01', '7-02', '7-03']);
    expect(rooms[23]).toMatchObject({ roomNo: '7-24', floor: 1, capacity: 4 });
    expect(await it_.prismaAdmin.campAuditLog.count({ where: { tenantId: it_.tenantId, entityType: 'room', action: 'CREATE' } })).toBe(24);
  });

  it('"+ Олон өрөө": байгааг алгасна (анхдагч) → 19 шинэ, 5 алгассан; skipExisting=false → 409 + жагсаалт; юу ч нэмэгдэхгүй', async () => {
    const bad = await it_.api().post(it_.camp(`/buildings/${it_.ids.b7}/rooms/bulk`)).set(it_.as('admin', { 'Accept-Language': 'en' }))
      .send({ from: 20, to: 30, prefix: '7-', padTo: 2, capacity: 2, skipExisting: false });
    expect(bad.status).toBe(409);
    expect(bad.body).toMatchObject({ code: 'rooms.bulk_exists', params: { n: 5 } });
    expect(bad.body.message).toContain('7-20, 7-21');
    const ok = await it_.api().post(it_.camp(`/buildings/${it_.ids.b7}/rooms/bulk`)).set(it_.as('admin'))
      .send({ from: 20, to: 43, prefix: '7-', padTo: 2, capacity: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ created: 19, skipped: ['7-20', '7-21', '7-22', '7-23', '7-24'] });
    expect(await it_.prismaAdmin.campRoom.count({ where: { tenantId: it_.tenantId, buildingId: it_.ids.b7 } })).toBe(43);
  });

  it('хязгаар: > 500 → 400 rooms.bulk_too_many; to < from → 400; эрхгүй (manager) → 403', async () => {
    const big = await it_.api().post(it_.camp(`/buildings/${it_.ids.b7}/rooms/bulk`)).set(it_.as('admin')).send({ from: 1, to: 501, capacity: 1 });
    expect(big.status).toBe(400);
    expect(big.body.code).toBe('rooms.bulk_too_many');
    expect((await it_.api().post(it_.camp(`/buildings/${it_.ids.b7}/rooms/bulk`)).set(it_.as('admin')).send({ from: 5, to: 1, capacity: 1 })).body.code).toBe('rooms.bulk_range');
    expect((await it_.api().post(it_.camp(`/buildings/${it_.ids.b7}/rooms/bulk`)).set(it_.as('manager')).send({ from: 1, to: 2, capacity: 1 })).status).toBe(403);
  });

  it('байр үүсгэх + өрөөний алдаа (> 500) → байр ч үүсэхгүй (нэг transaction)', async () => {
    const res = await it_.api().post(it_.camp('/buildings')).set(it_.as('admin')).send({ code: 'B9', name: 'x', rooms: { from: 1, to: 600, capacity: 1 } });
    expect(res.status).toBe(400);
    expect(await it_.prismaAdmin.campBuilding.count({ where: { tenantId: it_.tenantId, code: 'B9' } })).toBe(0);
  });

  it('байрны жагсаалт: өрөөний тоо, идэвхтэй өрөө, нийт багтаамж', async () => {
    const room = await it_.prismaAdmin.campRoom.findFirstOrThrow({ where: { tenantId: it_.tenantId, roomNo: '7-43' } });
    await it_.api().patch(it_.camp(`/rooms/${room.id}`)).set(it_.as('admin')).send({ status: 'INACTIVE' });
    const list = await it_.api().get(it_.camp('/buildings')).set(it_.as('admin'));
    const b7 = list.body.find((b: { code: string }) => b.code === 'B7');
    expect(b7).toMatchObject({ _count: { rooms: 43 }, activeRooms: 42, capacity: 24 * 4 + 18 * 2 });
  });
});

describe('👥 FB-03 хэлтсийн тоо', () => {
  it('идэвхтэй ажилтан ба албан тушаалын тоо (идэвхгүй ажилтныг тоолохгүй)', async () => {
    await emp('D1', { position: 'Тогооч' });
    await emp('D2', { position: 'Тогооч' });
    await emp('D3', { position: 'Жолооч' });
    const gone = await emp('D4', { position: 'Инженер' });
    await it_.api().patch(it_.hr(`/employees/${gone}`)).set(it_.as('admin')).send({ status: 'INACTIVE' });
    const list = await it_.api().get(it_.hr('/departments')).set(it_.as('admin'));
    expect(list.body[0]).toMatchObject({ code: 'ADM', activeEmployees: 3, positions: 2, _count: { employees: 4 } });
  });
});

describe('🗓 FB-14 ирц', () => {
  it('олон ажилтны ирц нэг дор: ростерын ирэлт (хоол анхдагч) → PREVIEW → confirm', async () => {
    const a = await emp('R1', { crewId: it_.ids.crew, position: 'Тогооч' });
    const b = await emp('R2', { crewId: it_.ids.crew, position: 'Жолооч' });
    it_.ids.r1 = a;
    const pre = await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('admin')).send({ date: WEDNESDAY, direction: 'ARRIVAL', employeeIds: [a, b] });
    expect(pre.status).toBe(201);
    expect(pre.body.import).toMatchObject({ status: 'PREVIEW', totalRows: 2, errorRows: 0 });
    expect(pre.body.summary).toMatchObject({ arrivals: 2, offRoster: 0 });
    const ok = await it_.api().post(it_.hr(`/movement-imports/${pre.body.import.id}/confirm`)).set(it_.as('admin'));
    expect(ok.status).toBe(200);
    const mv = await it_.prismaAdmin.hrMovement.findMany({ where: { tenantId: it_.tenantId, employeeId: { in: [a, b] } } });
    expect(mv.map((m) => m.meals)).toEqual([['DINNER'], ['DINNER']]);
  });

  it('ээлжийн бус (ростергүй) + хоолгүй → мөрийн алдаа; өөр кемпийн/байхгүй ажилтан → 400', async () => {
    const x = await emp('X1');
    const pre = await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('admin')).send({ date: '2026-10-09', direction: 'ARRIVAL', employeeIds: [x] });
    expect(pre.body.import.errorRows).toBe(1);
    const withMeals = await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('admin')).send({ date: '2026-10-09', direction: 'ARRIVAL', meals: ['LUNCH', 'DINNER'], employeeIds: [x] });
    expect(withMeals.body.import.errorRows).toBe(0);
    const bad = await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('admin')).send({ date: '2026-10-09', direction: 'ARRIVAL', employeeIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(bad.status).toBe(400);
    expect((await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('nobody')).send({ date: '2026-10-09', direction: 'ARRIVAL', employeeIds: [x] })).status).toBe(403);
  });

  it('ирцийн жагсаалтын шүүлт: ростер, ростергүй, албан тушаал, код/нэр', async () => {
    const q = (s: string) => it_.api().get(it_.hr(`/movements?from=2026-10-01&to=2026-10-31${s}`)).set(it_.as('admin'));
    expect((await q('')).body).toHaveLength(2);
    expect((await q(`&crewId=${it_.ids.crew}`)).body).toHaveLength(2);
    expect((await q('&crewId=none')).body).toHaveLength(0);
    const cooks = (await q('&position=тогооч')).body;
    expect(cooks.map((m: { employee: { employeeCode: string; position: string } }) => m.employee.employeeCode)).toEqual(['R1']);
    expect((await q('&q=r2')).body).toHaveLength(1);
    expect((await q(`&departmentId=${it_.ids.dept}`)).body).toHaveLength(2);
    expect((await q('&crewId=bad')).status).toBe(400);
  });
});

describe('🛏 FB-12 өрөөний самбар', () => {
  it('идэвхгүй ажилтан хуваарилагдсан өрөө → inactiveOccupants', async () => {
    const room = await it_.prismaAdmin.campRoom.findFirstOrThrow({ where: { tenantId: it_.tenantId, roomNo: '7-01' } });
    const alloc = await it_.api().post(it_.camp('/room-allocations')).set(it_.as('admin')).send({ roomId: room.id, employeeId: it_.ids.r1, startDate: WEDNESDAY });
    expect(alloc.status).toBe(201);
    await it_.api().patch(it_.hr(`/employees/${it_.ids.r1}`)).set(it_.as('admin')).send({ status: 'INACTIVE' });
    const board = await it_.api().get(it_.camp('/room-board?date=2026-10-08')).set(it_.as('admin'));
    expect(board.status).toBe(200);
    const r = board.body.rooms.find((x: { roomNo: string }) => x.roomNo === '7-01');
    expect(r).toMatchObject({ inactiveOccupants: 1, allocatedCount: 1 });
    expect(r.occupants[0].status).toBe('INACTIVE');
  });
});
