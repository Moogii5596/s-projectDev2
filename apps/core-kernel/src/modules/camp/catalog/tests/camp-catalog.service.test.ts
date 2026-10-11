import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampShiftType, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { CampCatalogService, normName, resolvePositionByName } from '../camp-catalog.service';

const P = CAMP_PERMISSIONS;
const CAMP = { id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true };

describe('v0.2.1 каталог — normName / resolvePositionByName', () => {
  it('normName: зай, том/жижиг үсэг үл хамаарна (DB-ийн lower(btrim) индекстэй нийцнэ)', () => {
    expect(normName('  Ахлах   Жолооч ')).toBe(normName('ахлах жолооч'));
    expect(normName('Жолооч')).not.toBe(normName('Жолоочийн туслах'));
  });

  it('resolvePositionByName: байгааг олно, байхгүй бол үүсгэнэ, идэвхгүйг (одоогийнх биш) → 400', async () => {
    const s = setup();
    s.tx.campPosition.findMany.mockResolvedValue([{ id: 'p1', name: 'Жолооч', isActive: true }, { id: 'p2', name: 'Хуучин', isActive: false }]);
    expect(await resolvePositionByName(s.tx as never, 't1', ' жолооч ')).toEqual({ id: 'p1', name: 'Жолооч', created: false });
    await expect(resolvePositionByName(s.tx as never, 't1', 'хуучин')).rejects.toThrow(BadRequestException);
    expect(await resolvePositionByName(s.tx as never, 't1', 'хуучин', 'p2')).toMatchObject({ id: 'p2', created: false });
    s.tx.campPosition.create.mockResolvedValueOnce({ id: 'p3', name: 'Тогооч' });
    expect(await resolvePositionByName(s.tx as never, 't1', '  Тогооч  ')).toEqual({ id: 'p3', name: 'Тогооч', created: true });
    expect(s.tx.campPosition.create.mock.calls[0][0].data).toEqual({ tenantId: 't1', name: 'Тогооч' });
  });
});

describe('v0.2.1 CampCatalogService — албан тушаал / байрны төрөл', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampCatalogService;
  beforeEach(() => {
    s = setup();
    svc = new CampCatalogService(s.prisma as never, s.access, s.audit);
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('create: зөвхөн нэг кемпэд master.manage → 403 (байгууллагын каталог); админ → нэр нормчилж үүсгэнэ', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.create('t1', 'a1', 'position', { name: 'Жолооч' })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.campPosition.findMany.mockResolvedValueOnce([]);
    await svc.create('t1', 'a1', 'position', { name: 'Ахлах   жолооч' });
    expectTenantTx(s.tx, 't1');
    expect(s.tx.campPosition.create.mock.calls[0][0].data).toEqual({ tenantId: 't1', name: 'Ахлах жолооч' });
  });

  it('create/update: давхардсан нэр (зай/үсэг үл хамаарна) → 409; update өөрийгөө хасна; олдохгүй → 404', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.campBuildingType.findMany.mockResolvedValue([{ id: 'bt1', name: 'Амьдрах байр' }]);
    await expect(svc.create('t1', 'a1', 'buildingType', { name: ' амьдрах  байр' })).rejects.toThrow(ConflictException);
    expect(s.tx.campBuildingType.create).not.toHaveBeenCalled();
    s.tx.campBuildingType.findFirst.mockResolvedValueOnce({ id: 'bt1' });
    await svc.update('t1', 'a1', 'buildingType', 'bt1', { name: 'Амьдрах байр' }); // өөрийнх → OK
    expect(s.tx.campBuildingType.update.mock.calls[0][0]).toMatchObject({ where: { id: 'bt1' }, data: { name: 'Амьдрах байр' } });
    await expect(svc.update('t1', 'a1', 'buildingType', 'nope', { isActive: false })).rejects.toThrow(NotFoundException);
  });

  it('list: албан тушаал бүрт идэвхтэй ажилтны тоо; эрхгүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.campPosition.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Жолооч', isActive: true }, { id: 'p2', name: 'Тогооч', isActive: true }]);
    s.tx.campEmployee.groupBy.mockResolvedValueOnce([{ positionId: 'p1', _count: { _all: 4 } }]);
    const rows = await svc.list('t1', 'a1', 'position', { activeOnly: true });
    expect(s.tx.campPosition.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', isActive: true });
    expect(rows.map((r) => [r.name, (r as { activeEmployees?: number }).activeEmployees])).toEqual([['Жолооч', 4], ['Тогооч', 0]]);
    setActor(s.tx, {});
    await expect(svc.list('t1', 'a1', 'position', {})).rejects.toThrow(ForbiddenException);
  });

  it('listSettings: идэвхгүй албан тушаалыг тохиргоо/ажилтангүй бол нууна; анхдагч утгууд', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.campPosition.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Жолооч', isActive: true },
      { id: 'p2', name: 'Хуучин', isActive: false },
      { id: 'p3', name: 'Хуучин2', isActive: false },
    ]);
    s.tx.campPositionSetting.findMany.mockResolvedValueOnce([
      { positionId: 'p1', mealLocationId: 'loc1', mealsIncluded: false, updatedAt: new Date(), mealLocation: { name: 'Уул' }, shiftPatterns: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] },
    ]);
    s.tx.campEmployee.groupBy.mockResolvedValueOnce([{ positionId: 'p2', _count: { _all: 1 } }]);
    const rows = await svc.listSettings('t1', 'a1', 'c1');
    expect(rows).toEqual([
      { positionId: 'p1', name: 'Жолооч', isActive: true, activeEmployees: 0, mealLocationId: 'loc1', mealLocationName: 'Уул', mealsIncluded: false, shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] },
      { positionId: 'p2', name: 'Хуучин', isActive: false, activeEmployees: 1, mealLocationId: null, mealLocationName: null, mealsIncluded: null, shiftPattern: [] },
    ]);
  });

  it('upsertSetting: кемпийн master.manage; өөр кемпийн байршил → 400; загвар ростерын урттай шалгагдаж дахин бичигдэнэ; audit', async () => {
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    s.tx.campPosition.findFirst.mockResolvedValue({ id: 'p1', name: 'Жолооч' });
    s.tx.campMealLocation.findFirst.mockResolvedValueOnce(null);
    await expect(svc.upsertSetting('t1', 'a1', 'c1', 'p1', { mealLocationId: 'loc9' })).rejects.toThrow(BadRequestException);
    expect(s.tx.campPositionSetting.upsert).not.toHaveBeenCalled();

    s.tx.campMealLocation.findFirst.mockResolvedValueOnce({ id: 'loc1', isActive: true });
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 });
    s.tx.campPositionSetting.upsert.mockResolvedValueOnce({ id: 'ps1' });
    s.tx.campPositionSetting.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ mealLocationId: 'loc1', mealsIncluded: false, shiftPatterns: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] });
    const res = await svc.upsertSetting('t1', 'a1', 'c1', 'p1', {
      mealLocationId: 'loc1', mealsIncluded: false, shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: CampShiftType.NIGHT }],
    });
    expect(s.tx.campPositionSetting.upsert.mock.calls[0][0]).toMatchObject({
      where: { tenantId_campId_positionId: { tenantId: 't1', campId: 'c1', positionId: 'p1' } },
      create: { tenantId: 't1', campId: 'c1', positionId: 'p1', mealLocationId: 'loc1', mealsIncluded: false },
      update: { mealLocationId: 'loc1', mealsIncluded: false },
    });
    expect(s.tx.campPositionShiftPattern.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', positionSettingId: 'ps1' } });
    expect(s.tx.campPositionShiftPattern.createMany).toHaveBeenCalledWith({ data: [{ tenantId: 't1', positionSettingId: 'ps1', dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] });
    expect(res).toMatchObject({ mealsIncluded: false });
    expect(s.tx.campAuditLog.create.mock.calls.length + s.tx.campAuditLog.createMany.mock.calls.length).toBeGreaterThan(0);

    // ростер 14 хоногийн загвар дутуу → 400, юу ч бичихгүй
    await expect(svc.upsertSetting('t1', 'a1', 'c1', 'p1', { shiftPattern: [{ dayFrom: 1, dayTo: 7, shift: CampShiftType.DAY }] })).rejects.toThrow(/8–14/);
    expect(s.tx.campPositionSetting.upsert).toHaveBeenCalledTimes(1);
    expect(s.tx.campPositionShiftPattern.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('upsertSetting: олдохгүй албан тушаал → 404; өөр кемпэд л эрхтэй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c2', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.upsertSetting('t1', 'a1', 'c1', 'p1', { mealsIncluded: true })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.upsertSetting('t1', 'a1', 'c1', 'nope', { mealsIncluded: true })).rejects.toThrow(NotFoundException);
  });
});
