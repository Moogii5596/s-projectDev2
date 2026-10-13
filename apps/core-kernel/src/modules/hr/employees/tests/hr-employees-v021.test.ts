import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CAMP_PERMISSIONS } from '../../../camp/common/camp-permissions';
import { setActor, setup } from '../../../camp/common/tests/camp-test-utils';
import { HrEmployeesService } from '../hr-employees.service';

const P = CAMP_PERMISSIONS;
const CAMP = { id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true };
const emp = (id: string, over: Record<string, unknown> = {}) => ({
  id, employeeCode: id.toUpperCase(), fullName: id, position: null, positionId: null, mealLocationId: null, mealsIncluded: null,
  status: 'ACTIVE', organizationId: 'o1', departmentId: 'd1', crewId: null, phone: null, email: null, ...over,
});

describe('v0.2.1 HrEmployeesService — албан тушаал, хоолны байршил, хоол авах', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeesService;
  beforeEach(() => {
    s = setup();
    svc = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.EMPLOYEE_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3, defaultMealLocationId: 'loc-camp' });
  });

  it('create: хуучин клиентийн `position` текст → каталогоос олно/үүсгэнэ (positionId + нэр хоёуланг бичнэ)', async () => {
    s.tx.hrPosition.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Жолооч', isActive: true }]);
    s.tx.hrEmployee.create.mockResolvedValueOnce(emp('e1'));
    await svc.create('t1', 'a1', 'c1', { organizationId: 'o1', departmentId: 'd1', employeeCode: 'E1', fullName: 'Бат', position: ' жолооч ' });
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data).toMatchObject({ positionId: 'p1', position: 'Жолооч', mealLocationId: null, mealsIncluded: null });
  });

  it('create: өөр кемпийн / идэвхгүй хоолны байршил → 400; идэвхгүй албан тушаал → 400', async () => {
    s.tx.campMealLocation.findFirst.mockResolvedValueOnce(null);
    await expect(svc.create('t1', 'a1', 'c1', { organizationId: 'o1', departmentId: 'd1', employeeCode: 'E1', fullName: 'Бат', mealLocationId: 'loc9' })).rejects.toThrow(BadRequestException);
    s.tx.hrPosition.findFirst.mockResolvedValueOnce({ id: 'p2', name: 'Хуучин', isActive: false });
    await expect(svc.create('t1', 'a1', 'c1', { organizationId: 'o1', departmentId: 'd1', employeeCode: 'E1', fullName: 'Бат', positionId: 'p2' })).rejects.toThrow(/Хуучин/);
    expect(s.tx.hrEmployee.create).not.toHaveBeenCalled();
  });

  it('list: effective = ажилтан ?? албан тушаал(кемп) ?? анхдагч; эх сурвалжийг заана', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([
      emp('a', { mealLocationId: 'loc-own', mealsIncluded: true, positionId: 'p1' }),
      emp('b', { positionId: 'p1' }),
      emp('c'),
    ]);
    s.tx.campPositionSetting.findMany.mockResolvedValueOnce([{ positionId: 'p1', mealLocationId: 'loc-mine', mealsIncluded: false, shiftPatterns: [] }]);
    s.tx.campMealLocation.findMany.mockResolvedValueOnce([{ id: 'loc-own', name: 'Өөрийн' }, { id: 'loc-mine', name: 'Уул' }, { id: 'loc-camp', name: 'Кемп' }]);
    const res = await svc.list('t1', 'a1', 'c1', {});
    expect(res.data.map((r) => r.effective)).toEqual([
      { mealLocationId: 'loc-own', mealLocationName: 'Өөрийн', mealLocationSource: 'EMPLOYEE', mealsIncluded: true, mealsIncludedSource: 'EMPLOYEE' },
      { mealLocationId: 'loc-mine', mealLocationName: 'Уул', mealLocationSource: 'POSITION', mealsIncluded: false, mealsIncludedSource: 'POSITION' },
      { mealLocationId: 'loc-camp', mealLocationName: 'Кемп', mealLocationSource: 'DEFAULT', mealsIncluded: true, mealsIncludedSource: 'DEFAULT' },
    ]);
  });

  it('bulkUpdate: нэг updateMany + ажилтан бүрт audit; хоосон үйлдэл → 400; олдохгүй id → 400 (юу ч бичихгүй); эрхгүй → 403', async () => {
    s.tx.hrEmployee.findMany
      .mockResolvedValueOnce([emp('e1'), emp('e2')])
      .mockResolvedValueOnce([emp('e1', { mealsIncluded: false }), emp('e2', { mealsIncluded: false })]);
    const res = await svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1', 'e2'], mealsIncluded: false });
    expect(res).toEqual({ updated: 2 });
    expect(s.tx.hrEmployee.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't1', campId: 'c1', id: { in: ['e1', 'e2'] } }, data: { mealsIncluded: false } });
    expect(s.tx.campAuditLog.createMany.mock.calls[0][0].data).toHaveLength(2);

    await expect(svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1'] })).rejects.toThrow(BadRequestException);
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([emp('e1')]);
    await expect(svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1', 'eX'], mealsIncluded: true })).rejects.toThrow(/1/);
    expect(s.tx.hrEmployee.updateMany).toHaveBeenCalledTimes(1);

    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.REPORT_VIEW] }] });
    await expect(svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1'], mealsIncluded: true })).rejects.toThrow(ForbiddenException);
  });

  it('bulkUpdate: хоолны байршил (кемпийнх шалгана) + албан тушаал (каталог) нэг дор; null = цэвэрлэх (анхдагч руу)', async () => {
    s.tx.hrEmployee.findMany.mockResolvedValue([emp('e1')]);
    s.tx.campMealLocation.findFirst.mockResolvedValueOnce({ id: 'loc1', isActive: true });
    s.tx.hrPosition.findFirst.mockResolvedValueOnce({ id: 'p1', name: 'Жолооч', isActive: true });
    await svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1'], mealLocationId: 'loc1', positionId: 'p1' });
    expect(s.tx.hrEmployee.updateMany.mock.calls[0][0].data).toEqual({ mealLocationId: 'loc1', positionId: 'p1', position: 'Жолооч' });
    await svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1'], mealLocationId: null, mealsIncluded: null });
    expect(s.tx.hrEmployee.updateMany.mock.calls[1][0].data).toEqual({ mealLocationId: null, mealsIncluded: null });
  });
});
