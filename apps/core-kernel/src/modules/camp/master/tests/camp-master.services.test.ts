import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampEmployeeStatus, CampOrgServiceType, CampOrgType, CampShiftType, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { CampsService } from '../camps.service';
import { CampFacilitiesService } from '../camp-facilities.service';
import { CoreOrganizationsService } from '../../../core/organizations/core-organizations.service';
import { HrDepartmentsService } from '../../../hr/org/hr-departments.service';
import { HrCrewsService } from '../../../hr/org/hr-crews.service';
import { HrEmployeesService } from '../../../hr/employees/hr-employees.service';
import { encodeCursor } from '../../../../common/utils/cursor';

const P = CAMP_PERMISSIONS;
const CAMP = { id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true };

describe('CampsService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampsService;
  beforeEach(() => {
    s = setup();
    svc = new CampsService(s.prisma as never, s.access);
  });

  it('list: зөвхөн эрхтэй кемпүүд; global/admin → бүгд; эрхгүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }, { campId: 'c3', perms: [] }] });
    await svc.list('t1', 'a1', {});
    expect(s.tx.camp.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: { in: ['c1'] } });
    setActor(s.tx, { roles: [{ campId: null, perms: [P.REPORT_VIEW] }] });
    await svc.list('t1', 'a1', { activeOnly: true });
    expect(s.tx.camp.findMany.mock.calls[1][0].where).toEqual({ tenantId: 't1', isActive: true });
    setActor(s.tx, {});
    await expect(svc.list('t1', 'a1', {})).rejects.toThrow(ForbiddenException);
  });

  it('create: кемпийн master.manage хангалтгүй (tenant түвшин) → 403; global → кемп + анхдагч тохиргоо', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.create('t1', 'a1', { code: 'C2', name: 'Кемп 2' })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { role: UserRole.OWNER });
    s.tx.camp.create.mockResolvedValueOnce({ ...CAMP, id: 'c2' });
    await svc.create('t1', 'a1', { code: 'C2', name: 'Кемп 2' });
    expectTenantTx(s.tx, 't1');
    expect(s.tx.camp.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 't1', code: 'C2', name: 'Кемп 2', location: null } }));
    expect(s.tx.campSetting.create).toHaveBeenCalledWith({ data: { tenantId: 't1', campId: 'c2' } });
  });

  it('create: давхар код → 409 (тохиргоо үүсгэхгүй)', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.camp.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(svc.create('t1', 'a1', { code: 'C1', name: 'x' })).rejects.toThrow(ConflictException);
    expect(s.tx.campSetting.create).not.toHaveBeenCalled();
  });

  it('update: тухайн кемпийн master.manage хангалттай; байхгүй кемп → 404', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.update('t1', 'a1', 'c1', { name: 'N' })).rejects.toThrow(NotFoundException);
    s.tx.camp.findFirst.mockResolvedValueOnce(CAMP);
    await svc.update('t1', 'a1', 'c1', { isActive: false });
    expect(s.tx.camp.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: { isActive: false } }));
  });
});

describe('CampFacilitiesService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampFacilitiesService;
  beforeEach(() => {
    s = setup();
    svc = new CampFacilitiesService(s.prisma as never, s.access, s.audit);
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('өрөө: room.manage эсвэл master.manage хангалттай; аль нь ч үгүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }] });
    await expect(svc.createRoom('t1', 'a1', 'c1', { buildingId: 'b1', roomNo: '101', capacity: 2 })).rejects.toThrow(/camp\.room\.manage \/ camp\.master\.manage/);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    s.tx.campBuilding.findFirst.mockResolvedValueOnce({ isActive: true });
    await svc.createRoom('t1', 'a1', 'c1', { buildingId: 'b1', roomNo: '101', capacity: 2 });
    expect(s.tx.campRoom.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tenantId: 't1', campId: 'c1', buildingId: 'b1', roomNo: '101', floor: null, capacity: 2, note: null },
    }));
  });

  it('өрөө: өөр кемпийн / идэвхгүй байр → 400; давхар дугаар → 409', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    await expect(svc.createRoom('t1', 'a1', 'c1', { buildingId: 'b9', roomNo: '1', capacity: 1 })).rejects.toThrow(/Байр энэ кемпэд олдсонгүй/);
    expect(s.tx.campBuilding.findFirst).toHaveBeenCalledWith({ where: { id: 'b9', tenantId: 't1', campId: 'c1' }, select: { isActive: true } });
    s.tx.campBuilding.findFirst.mockResolvedValueOnce({ isActive: false });
    await expect(svc.createRoom('t1', 'a1', 'c1', { buildingId: 'b1', roomNo: '1', capacity: 1 })).rejects.toThrow(/Идэвхгүй байранд/);
    s.tx.campBuilding.findFirst.mockResolvedValueOnce({ isActive: true });
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(svc.createRoom('t1', 'a1', 'c1', { buildingId: 'b1', roomNo: '101', capacity: 1 })).rejects.toThrow(ConflictException);
  });

  it('байр идэвхгүй болгох: INACTIVE биш өрөөтэй → 409; байр үүсгэх нь master.manage (room.manage биш)', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    s.tx.campBuilding.findFirst.mockResolvedValue({ id: 'b1' });
    s.tx.campRoom.count.mockResolvedValueOnce(3);
    await expect(svc.updateBuilding('t1', 'a1', 'c1', 'b1', { isActive: false })).rejects.toThrow(/идэвхтэй 3 өрөө/);
    expect(s.tx.campRoom.count).toHaveBeenCalledWith({ where: { tenantId: 't1', buildingId: 'b1', status: { not: 'INACTIVE' } } });
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    await expect(svc.createBuilding('t1', 'a1', 'c1', { code: 'B2', name: 'B2' })).rejects.toThrow(ForbiddenException);
  });

  it('өрөө засах: өөр өрөөтэй ижил дугаар → 409 (өөрийгөө хасна)', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ id: 'r1', buildingId: 'b1' }).mockResolvedValueOnce({ id: 'r2' });
    await expect(svc.updateRoom('t1', 'a1', 'c1', 'r1', { roomNo: '102' })).rejects.toThrow(ConflictException);
    expect(s.tx.campRoom.findFirst).toHaveBeenLastCalledWith({ where: { tenantId: 't1', buildingId: 'b1', roomNo: '102', NOT: { id: 'r1' } }, select: { id: true } });
  });

  it('өрөө засах (Шат 4): түгжих нээлттэй засвартай өрөөг гараар MAINTENANCE-ээс гаргахгүй → 409', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    s.tx.campRoom.findFirst.mockResolvedValue({ id: 'r1', buildingId: 'b1' });
    s.tx.campMaintenanceRequest.findFirst.mockResolvedValueOnce({ requestNo: 'ZAS-C1-2026-0003' });
    await expect(svc.updateRoom('t1', 'a1', 'c1', 'r1', { status: 'ACTIVE' })).rejects.toThrow(/ZAS-C1-2026-0003/);
    expect(s.tx.campMaintenanceRequest.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', roomId: 'r1', blocksRoom: true, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      select: { requestNo: true },
    });
    expect(s.tx.campRoom.update).not.toHaveBeenCalled();
    // MAINTENANCE болгох / төлөв хөндөхгүй засвар → шалгахгүй
    await svc.updateRoom('t1', 'a1', 'c1', 'r1', { status: 'MAINTENANCE' });
    await svc.updateRoom('t1', 'a1', 'c1', 'r1', { capacity: 3 });
    expect(s.tx.campMaintenanceRequest.findFirst).toHaveBeenCalledTimes(1);
    expect(s.tx.campRoom.update).toHaveBeenCalledTimes(2);
  });
});

describe('CoreOrganizationsService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CoreOrganizationsService;
  beforeEach(() => {
    s = setup();
    svc = new CoreOrganizationsService(s.prisma as never, s.access);
  });

  it('list: аль нэг кемпэд эрхтэй бол уншина; шүүлт', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.HAUL_CREATE] }] });
    await svc.list('t1', 'a1', { serviceType: CampOrgServiceType.SEWAGE_DISPOSAL, orgType: CampOrgType.CONTRACTOR });
    expect(s.tx.coreOrganization.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', serviceTypes: { has: 'SEWAGE_DISPOSAL' }, orgType: 'CONTRACTOR' });
  });

  it('create: кемпийн master.manage хангалтгүй → 403; давхар регистр → 409', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.create('t1', 'a1', { name: 'X', orgType: CampOrgType.MAIN })).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { roles: [{ campId: null, perms: [P.MASTER_MANAGE] }] });
    s.tx.coreOrganization.findFirst.mockResolvedValueOnce({ name: 'Уурхай ХХК' });
    await expect(svc.create('t1', 'a1', { name: 'X', regNumber: '111', orgType: CampOrgType.MAIN })).rejects.toThrow(/Регистр 111 "Уурхай ХХК"/);
  });

  it('регистргүй байгууллага давхардал шалгахгүй; null талбарууд', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    await svc.create('t1', 'a1', { name: 'X', orgType: CampOrgType.CONTRACTOR, serviceTypes: [CampOrgServiceType.CATERING] });
    expect(s.tx.coreOrganization.findFirst).not.toHaveBeenCalled();
    expect(s.tx.coreOrganization.create.mock.calls[0][0].data).toEqual({
      tenantId: 't1', name: 'X', regNumber: null, orgType: 'CONTRACTOR', serviceTypes: ['CATERING'], contactName: null, phone: null, email: null,
    });
  });

  it('кемпийн катеринг байгууллагаас CATERING хасах / идэвхгүй болгох → 409 (кемпийн кодыг нэрлэнэ); бусад төрөл өөрчлөхөд шалгахгүй', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.coreOrganization.findFirst.mockResolvedValue({ id: 'o1' });
    s.tx.campSetting.findMany.mockResolvedValue([{ camp: { code: 'C1' } }]);
    await expect(svc.update('t1', 'a1', 'o1', { serviceTypes: [CampOrgServiceType.OTHER] })).rejects.toThrow(/катеринг байгууллага \(C1\)/);
    await expect(svc.update('t1', 'a1', 'o1', { isActive: false })).rejects.toThrow(/C1/);
    expect(s.tx.campSetting.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1', cateringOrganizationId: 'o1' }, select: { camp: { select: { code: true } } } });
    s.tx.campSetting.findMany.mockClear();
    await svc.update('t1', 'a1', 'o1', { serviceTypes: [CampOrgServiceType.CATERING, CampOrgServiceType.OTHER] });
    expect(s.tx.campSetting.findMany).not.toHaveBeenCalled();
  });

  it('идэвхгүй болгох: идэвхтэй ажилтан / гэрээ → 409; зөвхөн ирсэн талбарыг шинэчилнэ', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.coreOrganization.findFirst.mockResolvedValue({ id: 'o1' });
    s.tx.hrEmployee.count.mockResolvedValueOnce(0);
    s.tx.campContract.count.mockResolvedValueOnce(1);
    await expect(svc.update('t1', 'a1', 'o1', { isActive: false })).rejects.toThrow(/0 ажилтан, 1 гэрээ/);
    s.tx.coreOrganization.findFirst.mockResolvedValueOnce({ id: 'o1' }).mockResolvedValueOnce(null);
    await svc.update('t1', 'a1', 'o1', { phone: null, regNumber: '222' });
    expect(s.tx.coreOrganization.update.mock.calls[0][0].data).toEqual({ phone: null, regNumber: '222' });
  });
});

describe('HrDepartmentsService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrDepartmentsService;
  beforeEach(() => {
    s = setup();
    svc = new HrDepartmentsService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('create: байршил өөр кемпийнх → 400; загвартай үүсгэхэд ростерын урттай шалгаж нэгтгэн бичнэ', async () => {
    s.tx.hrDepartment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'new-id' });
    s.tx.campSetting.findFirst.mockResolvedValueOnce({ rosterOnDays: 14, changeoverWeekday: 3 });
    await svc.create('t1', 'a1', 'c1', {
      code: 'MINE', name: 'Уул', mealLocationId: 'l1',
      shiftPattern: [{ dayFrom: 8, dayTo: 14, shift: CampShiftType.NIGHT }, { dayFrom: 1, dayTo: 7, shift: CampShiftType.DAY }],
    });
    expect(s.tx.hrDepartmentShiftPattern.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', departmentId: 'new-id' } });
    expect(s.tx.hrDepartmentShiftPattern.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 't1', departmentId: 'new-id', dayFrom: 1, dayTo: 7, shift: 'DAY' },
        { tenantId: 't1', departmentId: 'new-id', dayFrom: 8, dayTo: 14, shift: 'NIGHT' },
      ],
    });
    // v0.2.1 (Д-4): хэлтсийн хоолны байршлыг үл тооно (хуучин клиент илгээсэн ч бичихгүй, шалгахгүй)
    expect(s.tx.campMealLocation.findFirst).not.toHaveBeenCalled();
    expect(s.tx.hrDepartment.create.mock.calls[0][0].data).not.toHaveProperty('mealLocationId');
  });

  it('setShiftPattern: цоорхойтой → 400 (юу ч устгахгүй); хоосон → устгаад бичихгүй', async () => {
    s.tx.hrDepartment.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(svc.setShiftPattern('t1', 'a1', 'c1', 'd1', { segments: [{ dayFrom: 1, dayTo: 7, shift: CampShiftType.DAY }] })).rejects.toThrow(/Дутуу: 8–14/);
    expect(s.tx.hrDepartmentShiftPattern.deleteMany).not.toHaveBeenCalled();
    await svc.setShiftPattern('t1', 'a1', 'c1', 'd1', { segments: [] });
    expect(s.tx.hrDepartmentShiftPattern.deleteMany).toHaveBeenCalledTimes(1);
    expect(s.tx.hrDepartmentShiftPattern.createMany).not.toHaveBeenCalled();
  });

  it('setShiftPattern: кемпийн ростер 10 хоног бол 1–10 шаардана; хэлтэс өөр кемпийнх → 404', async () => {
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 10, changeoverWeekday: 3 });
    await expect(svc.setShiftPattern('t1', 'a1', 'c1', 'd9', { segments: [] })).rejects.toThrow(NotFoundException);
    s.tx.hrDepartment.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(svc.setShiftPattern('t1', 'a1', 'c1', 'd1', { segments: [{ dayFrom: 1, dayTo: 14, shift: CampShiftType.DAY }] })).rejects.toThrow(/≤ 10/);
    await svc.setShiftPattern('t1', 'a1', 'c1', 'd1', { segments: [{ dayFrom: 1, dayTo: 10, shift: CampShiftType.DAY }] });
    expect(s.tx.hrDepartmentShiftPattern.createMany).toHaveBeenCalledTimes(1);
  });

  it('update: идэвхтэй ажилтантай хэлтэс идэвхгүй → 409; v0.2.1: mealLocationId-г үл тооно', async () => {
    s.tx.hrDepartment.findFirst.mockResolvedValue({ id: 'd1' });
    s.tx.hrEmployee.count.mockResolvedValueOnce(4);
    await expect(svc.update('t1', 'a1', 'c1', 'd1', { isActive: false })).rejects.toThrow(/идэвхтэй 4 ажилтан/);
    expect(s.tx.hrDepartment.update).not.toHaveBeenCalled();
    await svc.update('t1', 'a1', 'c1', 'd1', { mealLocationId: 'l9' });
    expect(s.tx.campMealLocation.findFirst).not.toHaveBeenCalled();
    expect(s.tx.hrDepartment.update.mock.calls[0][0].data).not.toHaveProperty('mealLocationId');
  });
});

describe('HrCrewsService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrCrewsService;
  beforeEach(() => {
    s = setup();
    svc = new HrCrewsService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('ирэх өдөр солигдох гарагтай таарахгүй → 400 (гарагийг нэрлэнэ); таарвал Date-ээр хадгалж YYYY-MM-DD буцаана', async () => {
    await expect(svc.create('t1', 'a1', 'c1', { code: 'A', rosterAnchorDate: '2026-10-08' })).rejects.toThrow(/Пүрэв.*Лхагва/);
    s.tx.hrCrew.create.mockResolvedValueOnce({ id: 'cr1', code: 'A', name: null, rosterAnchorDate: new Date('2026-10-07T00:00:00Z'), isActive: true, createdAt: new Date(), updatedAt: new Date() });
    const res = await svc.create('t1', 'a1', 'c1', { code: 'A', rosterAnchorDate: '2026-10-07' });
    expect(s.tx.hrCrew.create.mock.calls[0][0].data.rosterAnchorDate.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(res.rosterAnchorDate).toBe('2026-10-07');
  });

  it('кемп солигдох гарагийг Даваа (1) болговол Даваа шаардана; оршин байхгүй огноо → 400', async () => {
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14, changeoverWeekday: 1 });
    await expect(svc.create('t1', 'a1', 'c1', { code: 'A', rosterAnchorDate: '2026-10-07' })).rejects.toThrow(/Даваа/);
    await expect(svc.create('t1', 'a1', 'c1', { code: 'A', rosterAnchorDate: '2026-02-30' })).rejects.toThrow(/буруу огноо/);
  });

  it('идэвхтэй ажилтантай баг идэвхгүй → 409', async () => {
    s.tx.hrCrew.findFirst.mockResolvedValue({ id: 'cr1' });
    s.tx.hrEmployee.count.mockResolvedValueOnce(12);
    await expect(svc.update('t1', 'a1', 'c1', 'cr1', { isActive: false })).rejects.toThrow(/идэвхтэй 12 ажилтан/);
  });
});

describe('HrEmployeesService (Шат 2.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeesService;
  const dto = { organizationId: 'o1', departmentId: 'd1', crewId: 'cr1', employeeCode: 'E001', fullName: 'Бат' };
  const okRefs = () => {
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrCrew.findFirst.mockResolvedValue({ isActive: true });
  };
  beforeEach(() => {
    s = setup();
    svc = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.EMPLOYEE_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('create: employee.manage-гүй → 403', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/hr\.employee\.manage/);
  });

  it('create: байгууллага/хэлтэс/баг байхгүй эсвэл идэвхгүй → 400; хэлтэс/багийг тухайн кемпээр хайна', async () => {
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/Байгууллага олдсонгүй/);
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/Хэлтэс энэ кемпэд олдсонгүй/);
    expect(s.tx.hrDepartment.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', tenantId: 't1', campId: 'c1' }, select: { isActive: true } });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: false });
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/Хэлтэс идэвхгүй/);
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrCrew.findFirst.mockResolvedValue({ isActive: false });
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/Ростер идэвхгүй/);
    expect(s.tx.hrEmployee.create).not.toHaveBeenCalled();
  });

  it('create: давхар код → 409 (нэрийг хэлнэ); багагүй (crewId null) зөвшөөрнө', async () => {
    okRefs();
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce({ fullName: 'Дорж' });
    await expect(svc.create('t1', 'a1', 'c1', dto)).rejects.toThrow(/"E001" \(Дорж\)/);
    s.tx.hrCrew.findFirst.mockClear();
    await svc.create('t1', 'a1', 'c1', { ...dto, crewId: null });
    expect(s.tx.hrCrew.findFirst).not.toHaveBeenCalled();
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', campId: 'c1', crewId: null, employeeCode: 'E001', position: null });
  });

  it('update: crewId null → багаас хасна (шалгахгүй); зөвхөн ирсэн талбар; код давхардал өөрийгөө хасна', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce({ id: 'e1' }).mockResolvedValueOnce(null);
    await svc.update('t1', 'a1', 'c1', 'e1', { crewId: null, status: CampEmployeeStatus.INACTIVE, employeeCode: 'E002' });
    expect(s.tx.hrCrew.findFirst).not.toHaveBeenCalled();
    expect(s.tx.hrEmployee.findFirst).toHaveBeenCalledWith({ where: { tenantId: 't1', employeeCode: 'E002', status: { not: 'TERMINATED' }, NOT: { id: 'e1' } }, select: { fullName: true } });
    expect(s.tx.hrEmployee.update.mock.calls[0][0].data).toEqual({ crewId: null, employeeCode: 'E002', status: 'INACTIVE' });
  });

  it('list: буруу cursor → 400 (DB-д хүрэхгүй); limit+1 авч hasMore/nextCursor; шүүлт + хайлт', async () => {
    await expect(svc.list('t1', 'a1', 'c1', { cursor: 'garbage' })).rejects.toThrow(BadRequestException);
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    const mk = (i: number) => ({ id: `e${i}`, createdAt: new Date(Date.UTC(2026, 9, 9, 0, 0, 10 - i)) });
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([mk(1), mk(2), mk(3)]);
    const page = await svc.list('t1', 'a1', 'c1', { limit: 2, departmentId: 'd1', q: 'бат' });
    const args = s.tx.hrEmployee.findMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.where).toMatchObject({ tenantId: 't1', campId: 'c1', departmentId: 'd1' });
    expect(args.where.OR).toEqual([{ employeeCode: { contains: 'бат', mode: 'insensitive' } }, { fullName: { contains: 'бат', mode: 'insensitive' } }]);
    expect(page.data).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeCursor('e2', mk(2).createdAt));
  });

  it('list: cursor → (createdAt < c) OR (createdAt = c AND id < cid); сүүлийн хуудас → nextCursor null', async () => {
    const c = new Date('2026-10-09T00:00:05.000Z');
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([{ id: 'e9', createdAt: c }]);
    const e5 = '00000000-0000-0000-0000-0000000000e5'; // [3.6.3] cursor id нь UUID байх ёстой
    const page = await svc.list('t1', 'a1', 'c1', { cursor: encodeCursor(e5, c) });
    expect(s.tx.hrEmployee.findMany.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ createdAt: { lt: c } }, { createdAt: c, id: { lt: e5 } }] },
    ]);
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('list/get: эрхгүй кемп → 403; өөр кемпийн ажилтан → 404', async () => {
    await expect(svc.list('t1', 'a1', 'c2', {})).rejects.toThrow(ForbiddenException);
    await expect(svc.get('t1', 'a1', 'c1', 'e1')).rejects.toThrow(NotFoundException);
    expect(s.tx.hrEmployee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1', tenantId: 't1', campId: 'c1' } }));
  });
});
