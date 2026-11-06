/**
 * v0.2.0 §0.2 — `camp:snapshot` (staging дадлага A = B) integration:
 *   - бодит DB-ээс хоол (хоол × байршил), өрөөний самбар, тоонууд; API-ийн presence-тэй таарна
 *   - ижил өгөгдөл → A = B; өгөгдөл өөрчлөгдвөл зөрүүг замаар нь харуулна
 *   - READ ONLY transaction (бичихийг DB өөрөө хориглоно)
 */
import { buildSnapshot, compareSnapshots } from '../src/scripts/camp-snapshot';
import { CampIt, createCampIt, WEDNESDAY } from './helpers/camp-it-app';

let it_: CampIt;
const TODAY = '2026-10-10'; // Бямба: ростерын ирэлтээс (Лхагва) хойш 3 хоног

beforeAll(async () => {
  it_ = await createCampIt('snap-it');
  const emp = async (code: string) => {
    const r = await it_.api().post(it_.hr('/employees')).set(it_.as('admin')).send({ organizationId: it_.ids.org, departmentId: it_.ids.dept, crewId: it_.ids.crew, employeeCode: code, fullName: `Н ${code}` });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  const a = await emp('S1');
  const b = await emp('S2');
  it_.ids.s1 = a;
  const pre = await it_.api().post(it_.hr('/movement-imports/manual')).set(it_.as('admin')).send({ date: WEDNESDAY, direction: 'ARRIVAL', employeeIds: [a, b] });
  expect(pre.status).toBe(201);
  expect((await it_.api().post(it_.hr(`/movement-imports/${pre.body.import.id}/confirm`)).set(it_.as('admin'))).status).toBe(200);
  const room = await it_.api().post(it_.camp('/rooms')).set(it_.as('admin')).send({ buildingId: it_.ids.b1, roomNo: '101', capacity: 2 });
  expect(room.status).toBe(201);
  const alloc = await it_.api().post(it_.camp('/room-allocations')).set(it_.as('admin')).send({ employeeId: a, roomId: room.body.id, startDate: WEDNESDAY });
  expect(alloc.status).toBe(201);
}, 180_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('📸 camp:snapshot', () => {
  it('хоол / өрөө / тоо; API-ийн presence-тэй ижил; ижил өгөгдөл → A = B', async () => {
    const opts = { today: TODAY, tenantSlug: it_.slug, db: 'it', pastDays: 4, futureDays: 1 };
    const a = await buildSnapshot(it_.prismaAdmin, opts);
    expect(a.from).toBe('2026-10-06');
    expect(a.to).toBe('2026-10-11');
    const c = a.camps[`${it_.slug}/C1`];
    expect(Object.keys(c.meals)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(c.meals['2026-10-06']).toEqual({ present: 0, personDays: '0.0000', meals: {}, unknownShift: 0 });
    // Лхагва ростерын ирэлт → Орой (кемпийн гал тогоо)
    expect(c.meals[WEDNESDAY]).toMatchObject({ present: 2, meals: { 'DINNER@Гал тогоо': 2 } });
    const api = await it_.api().get(it_.camp(`/presence?date=${TODAY}`)).set(it_.as('admin'));
    expect(api.status).toBe(200);
    expect(c.meals[TODAY].present).toBe(api.body.presentCount);
    expect(c.meals[TODAY].personDays).toBe(api.body.personDays);
    expect(c.rooms).toMatchObject({ rooms: 1, capacity: 2, present: 1, unassigned: 1 });
    expect(c.counts).toMatchObject({ 'employees.ACTIVE': 2, movements: 2, stays: 2, allocations: 1, departments: 1, crews: 1, buildings: 1 });

    const b = await buildSnapshot(it_.prismaAdmin, opts);
    expect(compareSnapshots(a, b)).toEqual([]);
  });

  it('өгөгдөл өөрчлөгдвөл зөрүүг замаар нь харуулна', async () => {
    const opts = { today: TODAY, tenantSlug: it_.slug, db: 'it', pastDays: 1, futureDays: 0 };
    const a = await buildSnapshot(it_.prismaAdmin, opts);
    await it_.api().patch(it_.hr(`/employees/${it_.ids.s1}`)).set(it_.as('admin')).send({ status: 'INACTIVE' });
    const b = await buildSnapshot(it_.prismaAdmin, opts);
    const diff = compareSnapshots(a, b);
    expect(diff).toContain(`camps.${it_.slug}/C1.counts.employees.ACTIVE: 2 → 1`);
    expect(diff).toContain(`camps.${it_.slug}/C1.counts.employees.INACTIVE: (алга) → 1`);
    expect(compareSnapshots(a, { ...a, today: '2026-10-11' })).toEqual(['today: "2026-10-10" → "2026-10-11"']);
  });

  it('үл мэдэгдэх slug → алдаа', async () => {
    await expect(buildSnapshot(it_.prismaAdmin, { today: TODAY, tenantSlug: 'no-such-tenant-x', db: 'it' })).rejects.toThrow(/олдсонгүй/);
  });
});
