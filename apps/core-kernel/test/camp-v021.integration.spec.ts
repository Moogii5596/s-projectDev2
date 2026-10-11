/**
 * v0.2.1 — хоолны тооцооны загвар (албан тушаал, ажилтан) + C-12/C-14 backend integration
 *   Q1/Д-1/Д-2: ажлын хоолны байршил, хоол авах, ээлжийн загвар = ажилтан ?? албан тушаал(кемп) ?? анхдагч
 *   C-04 хоолгүй ажилтан: ирцэд тоологдоно, хоолонд үгүй · олноор үйлдэл
 *   C-14 ирцийн жагсаалт ээлжээр · C-12 байранд хөрөнгө, байрны төрөл, өрөөний самбар
 *   RLS: шинэ каталогийн хүснэгтүүд өөр tenant-д харагдахгүй (app_user)
 */
import { asTenant, CampIt, createCampIt, V1, WEDNESDAY } from './helpers/camp-it-app';

let it_: CampIt;
const ids: Record<string, string> = {};
const post = async (path: string, body: object, status = 201) => {
  const r = await it_.api().post(path).set(it_.as('admin')).send(body);
  if (r.status !== status) throw new Error(`${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as Record<string, string>;
};
const locName = (id: string | null) => (id === it_.ids.loc ? 'camp' : id === ids.locPost ? 'post' : String(id));
const presence = async (date: string) => {
  const r = await it_.api().get(it_.camp(`/presence?date=${date}`)).set(it_.as('admin'));
  expect(r.status).toBe(200);
  return {
    ...r.body,
    simple: (r.body.lines as { mealType: string; mealLocationId: string | null; count: number }[]).map((l) => `${l.mealType}@${locName(l.mealLocationId)}=${l.count}`).sort(),
  };
};
const stays = async (q: string) => {
  const r = await it_.api().get(it_.camp(`/stays?${q}`)).set(it_.as('admin'));
  expect(r.status).toBe(200);
  return r.body as { employee: { employeeCode: string }; shiftGroup: string; positionName: string | null; mealsIncluded: boolean }[];
};

beforeAll(async () => {
  it_ = await createCampIt('v021-it');
  ids.locPost = (await post(it_.camp('/meal-locations'), { name: 'Харуулын пост' })).id;
  ids.ops = (await post(it_.camp('/departments'), { code: 'OPS', name: 'Үйл ажиллагаа', shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] })).id;
  ids.guard = (await post(`${V1}/positions`, { name: 'Харуул' })).id;
  const ps = await it_.api().put(it_.camp(`/position-settings/${ids.guard}`)).set(it_.as('admin'))
    .send({ mealLocationId: ids.locPost, shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] });
  expect(ps.status).toBe(200);
  const emp = async (code: string, extra: object) =>
    (await post(it_.camp('/employees'), { organizationId: it_.ids.org, departmentId: ids.ops, crewId: it_.ids.crew, employeeCode: code, fullName: `Н ${code}`, ...extra })).id;
  ids.G1 = await emp('G1', { positionId: ids.guard }); // албан тушаалын загвар (шөнө) + байршил (пост)
  ids.D1 = await emp('D1', {}); // хэлтсийн загвар (өдөр), анхдагч байршил
  ids.N1 = await emp('N1', { mealsIncluded: false }); // хоолгүй
  ids.O1 = await emp('O1', { mealLocationId: ids.locPost }); // ажилтны override
  for (const c of ['G1', 'D1', 'N1', 'O1']) await post(it_.camp('/movements'), { employeeId: ids[c], date: WEDNESDAY, direction: 'ARRIVAL' });
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('🍽️ Хоолны байршил / хоол авах / ээлж — ажилтан ?? албан тушаал ?? анхдагч', () => {
  it('2026-10-09: G1 шөнө (албан тушаал) Шөнө@пост, D1 өдөр Өдөр@кемп, O1 Өдөр@пост (override), N1 ирцэд бий ч хоолгүй', async () => {
    const p = await presence('2026-10-09');
    expect(p.presentCount).toBe(4);
    expect(p.noMealCount).toBe(1);
    expect(p.simple).toEqual(['BREAKFAST@camp=3', 'DINNER@camp=3', 'LUNCH@camp=1', 'LUNCH@post=1', 'NIGHT@post=1']);
    expect(p.warnings.unknownShift).toEqual([]);
  });

  it('2026-10-07 (ирэх өдөр): хоолгүй ажилтан ирэх өдрийн оройн хоолонд ч орохгүй', async () => {
    const p = await presence(WEDNESDAY);
    expect(p.presentCount).toBe(4);
    expect(p.simple).toEqual(['DINNER@camp=3']);
  });

  it('албан тушаалын анхдагчийг өөрчлөхөд тухайн албан тушаалын ажилтны тооцоо шууд өөрчлөгдөнө (хоол авах = үгүй → дахин тийм)', async () => {
    const off = await it_.api().put(it_.camp(`/position-settings/${ids.guard}`)).set(it_.as('admin')).send({ mealsIncluded: false });
    expect(off.status).toBe(200);
    expect((await presence('2026-10-09')).noMealCount).toBe(2);
    await it_.api().put(it_.camp(`/position-settings/${ids.guard}`)).set(it_.as('admin')).send({ mealsIncluded: null });
    expect((await presence('2026-10-09')).noMealCount).toBe(1);
    const list = await it_.api().get(it_.camp('/position-settings')).set(it_.as('admin'));
    expect(list.body.find((r: { positionId: string }) => r.positionId === ids.guard)).toMatchObject({
      name: 'Харуул', activeEmployees: 1, mealLocationId: ids.locPost, mealsIncluded: null, shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }],
    });
    expect(await it_.prismaAdmin.campAuditLog.count({ where: { tenantId: it_.tenantId, entityType: 'position_setting' } })).toBe(3);
  });

  it('олноор: D1, O1 хоолгүй → 3 хоолгүй, нэг transaction + audit; буцаах (null) → анхны тоо', async () => {
    const r = await it_.api().post(it_.camp('/employees/bulk')).set(it_.as('admin')).send({ ids: [ids.D1, ids.O1], mealsIncluded: false });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ updated: 2 });
    const p = await presence('2026-10-09');
    expect(p.noMealCount).toBe(3);
    expect(p.simple).toEqual(['BREAKFAST@camp=1', 'DINNER@camp=1', 'NIGHT@post=1']);
    const emp = await it_.api().get(it_.camp(`/employees/${ids.O1}`)).set(it_.as('admin'));
    expect(emp.body.effective).toMatchObject({ mealLocationId: ids.locPost, mealLocationSource: 'EMPLOYEE', mealsIncluded: false, mealsIncludedSource: 'EMPLOYEE' });
    await it_.api().post(it_.camp('/employees/bulk')).set(it_.as('admin')).send({ ids: [ids.D1, ids.O1], mealsIncluded: null });
    expect((await presence('2026-10-09')).noMealCount).toBe(1);
    // эрхгүй (manager-т employee.manage бий эсэхээс үл хамааран) өөр кемпийн / байхгүй id → 400, юу ч өөрчлөгдөхгүй
    const bad = await it_.api().post(it_.camp('/employees/bulk')).set(it_.as('admin')).send({ ids: [ids.D1, '0192a3b4-0000-7000-8000-000000000999'], mealsIncluded: false });
    expect(bad.status).toBe(400);
    expect((await presence('2026-10-09')).noMealCount).toBe(1);
    expect((await it_.api().post(it_.camp('/employees/bulk')).set(it_.as('nobody')).send({ ids: [ids.D1], mealsIncluded: false })).status).toBe(403);
  });

  it('хоолны байршил ашиглагдаж байхад идэвхгүй болгох → 409 (ажилтан 1, албан тушаал 1)', async () => {
    const r = await it_.api().patch(it_.camp(`/meal-locations/${ids.locPost}`)).set(it_.as('admin')).send({ isActive: false });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'camp.err.settings.9', params: { employees: 1, positions: 1 } });
  });

  it('ростерын урт өөрчлөх: энэ кемпэд загвартай албан тушаал байвал → 409 (нэрийг нэрлэнэ)', async () => {
    await it_.api().put(it_.camp(`/departments/${ids.ops}/shift-pattern`)).set(it_.as('admin')).send({ segments: [] });
    const r = await it_.api().put(it_.camp('/settings')).set(it_.as('admin')).send({
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 10, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: it_.ids.loc,
    });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'camp.err.settings.10' });
    expect(r.body.message).toMatch(/Харуул/);
    await it_.api().put(it_.camp(`/departments/${ids.ops}/shift-pattern`)).set(it_.as('admin')).send({ segments: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] });
  });
});

describe('📋 C-14 ирцийн жагсаалт — тооцоолсон ээлжээр', () => {
  it('2026-10-09: G1 NIGHT (албан тушаал), бусад DAY; shift=NIGHT шүүлт; албан тушаал, хоол авах багана', async () => {
    const all = await stays('date=2026-10-09');
    expect(all.map((r) => [r.employee.employeeCode, r.shiftGroup, r.positionName, r.mealsIncluded]).sort()).toEqual([
      ['D1', 'DAY', null, true], ['G1', 'NIGHT', 'Харуул', true], ['N1', 'DAY', null, false], ['O1', 'DAY', null, true],
    ]);
    expect((await stays('date=2026-10-09&shift=NIGHT')).map((r) => r.employee.employeeCode)).toEqual(['G1']);
    expect((await stays(`date=${WEDNESDAY}&shift=MOVEMENT`)).length).toBe(4);
    expect((await stays(`date=${WEDNESDAY}&shift=DAY`)).length).toBe(0);
    expect((await it_.api().get(it_.camp('/stays?date=2026-10-09&shift=EVENING')).set(it_.as('admin'))).status).toBe(400);
  });
});

describe('🏢 C-12 байрны төрөл, байранд хөрөнгө, өрөөний самбар', () => {
  it('байрны төрөл (байгууллагын каталог): давхардал 409, байранд оноох, manager (нэг кемп) каталог үүсгэх → 403', async () => {
    ids.btLiving = (await post(`${V1}/building-types`, { name: 'Амьдрах байр' })).id;
    expect((await it_.api().post(`${V1}/building-types`).set(it_.as('admin')).send({ name: '  амьдрах   БАЙР ' })).status).toBe(409);
    expect((await it_.api().post(`${V1}/building-types`).set(it_.as('manager')).send({ name: 'Агуулах' })).status).toBe(403);
    const b = await it_.api().patch(it_.camp(`/buildings/${it_.ids.b1}`)).set(it_.as('admin')).send({ typeId: ids.btLiving });
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ typeId: ids.btLiving, type: { name: 'Амьдрах байр' } });
    const list = await it_.api().get(`${V1}/building-types`).set(it_.as('manager'));
    expect(list.body.find((t: { id: string }) => t.id === ids.btLiving)).toMatchObject({ buildings: 1 });
  });

  it('хөрөнгө байранд → өрөө рүү → movement-д байр/өрөө; байранд хөрөнгөтэй байрыг идэвхгүй → 409', async () => {
    const cat = await post(`${V1}/asset-categories`, { name: 'Гал хамгаалал' });
    ids.room = (await post(it_.camp('/rooms'), { buildingId: it_.ids.b1, roomNo: '201', capacity: 2 })).id;
    const a = await post(it_.camp('/assets'), { categoryId: cat.id, inventoryNo: 'FX-1', name: 'Гал унтраагуур', buildingId: it_.ids.b1 });
    expect(a).toMatchObject({ buildingId: it_.ids.b1, roomId: null, building: { code: 'B1' } });
    ids.asset = a.id;
    const both = await it_.api().post(it_.camp('/assets')).set(it_.as('admin')).send({ categoryId: cat.id, inventoryNo: 'FX-2', name: 'x', buildingId: it_.ids.b1, roomId: ids.room });
    expect(both.status).toBe(400);

    const deact = await it_.api().patch(it_.camp(`/buildings/${it_.ids.b1}`)).set(it_.as('admin')).send({ isActive: false });
    expect(deact.status).toBe(409);

    const mv = await it_.api().post(it_.camp(`/assets/${ids.asset}/move`)).set(it_.as('admin')).send({ toRoomId: ids.room, reason: 'Коридороос өрөө рүү' });
    expect(mv.status).toBe(200);
    expect(mv.body).toMatchObject({ roomId: ids.room, buildingId: null });
    const hist = await it_.api().get(it_.camp(`/assets/${ids.asset}/movements`)).set(it_.as('admin'));
    expect(hist.body.map((m: { fromBuilding: { code: string } | null; toBuilding: { code: string } | null; toRoom: { roomNo: string } | null }) => [m.fromBuilding?.code ?? null, m.toBuilding?.code ?? null, m.toRoom?.roomNo ?? null])).toEqual([
      ['B1', null, '201'],
      [null, 'B1', null],
    ]);
    const inB1 = await it_.api().get(it_.camp(`/assets?buildingId=${it_.ids.b1}`)).set(it_.as('admin'));
    expect(inB1.body.data.map((x: { inventoryNo: string }) => x.inventoryNo)).toEqual(['FX-1']); // өрөөнд орсон ч тухайн байрных
  });

  it('өрөөний самбар: өрөөний хөрөнгө + нээлттэй засвар; totals өөрчлөгдөөгүй', async () => {
    const m = await post(it_.camp('/maintenance'), { roomId: ids.room, title: 'Цонх хагарсан' });
    const r = await it_.api().get(it_.camp('/room-board?date=2026-10-09')).set(it_.as('admin'));
    expect(r.status).toBe(200);
    const room = r.body.rooms.find((x: { id: string }) => x.id === ids.room);
    expect(room.assets).toEqual([{ id: ids.asset, inventoryNo: 'FX-1', name: 'Гал унтраагуур', condition: 'GOOD' }]);
    expect(room.openMaintenance).toEqual([expect.objectContaining({ id: m.id, title: 'Цонх хагарсан', status: 'OPEN' })]);
    expect(Object.keys(r.body.totals)).toEqual(['rooms', 'capacity', 'present', 'vacant', 'full']);
  });
});

describe('🔒 RLS — шинэ хүснэгтүүд (app_user)', () => {
  it('camp_positions / camp_position_settings / camp_position_shift_patterns / camp_building_types: өөр tenant-ийн контекстод 0', async () => {
    const OTHER = '00000000-0000-0000-0000-000000000002';
    const where = { tenantId: it_.tenantId };
    const mine = await asTenant(it_.prismaRls, it_.tenantId, async (tx) => [
      await tx.campPosition.count({ where }), await tx.campPositionSetting.count({ where }),
      await tx.campPositionShiftPattern.count({ where }), await tx.campBuildingType.count({ where }),
    ]);
    expect(mine.every((n) => n > 0)).toBe(true);
    const other = await asTenant(it_.prismaRls, OTHER, async (tx) => [
      await tx.campPosition.count({ where }), await tx.campPositionSetting.count({ where }),
      await tx.campPositionShiftPattern.count({ where }), await tx.campBuildingType.count({ where }),
    ]);
    expect(other).toEqual([0, 0, 0, 0]);
  });
});
