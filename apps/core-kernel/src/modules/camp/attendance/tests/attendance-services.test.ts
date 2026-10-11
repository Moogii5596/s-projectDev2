import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampEmployeeStatus, CampImportStatus, CampRoomStatus, CampShiftType, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { CampAttendanceService } from '../camp-attendance.service';
import { CampShiftsService } from '../camp-shifts.service';
import { CampRoomsService, firstOverCapacityNight } from '../camp-rooms.service';
import { CampPresenceService } from '../camp-presence.service';

const P = CAMP_PERMISSIONS;
const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
const CAMP = { id: 'c1', code: 'C1', name: 'C1', isActive: true };
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ирц');
  ws.addRow(['employee_code', 'date', 'direction', 'meals', 'shift']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('CampAttendanceService — импорт (Шат 3.3)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampAttendanceService;
  const employees = [
    { id: 'e1', campId: 'c1', status: CampEmployeeStatus.ACTIVE, employeeCode: 'E1', crew: { rosterAnchorDate: d('2026-10-07') } },
    { id: 'e2', campId: 'c1', status: CampEmployeeStatus.ACTIVE, employeeCode: 'E2', crew: null },
  ];
  beforeEach(() => {
    s = setup();
    svc = new CampAttendanceService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.MOVEMENT_IMPORT] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.campEmployee.findMany.mockResolvedValue(employees);
  });

  it('movement.import эрхгүй → 403 (файл задалсны дараа ч DB-д бичихгүй)', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }] });
    await expect(svc.preview('t1', 'a1', 'c1', 'x.xlsx', await xlsx([['E1', '2026-10-07', 'ARRIVAL']]))).rejects.toThrow(ForbiddenException);
    expect(s.tx.campMovementImport.create).not.toHaveBeenCalled();
  });

  it('preview: PREVIEW бичлэг (мөрийн алдаа, parsed_rows) + мөр бүрийн төлөв; DB-д ирэлт бичихгүй', async () => {
    s.tx.campMovementImport.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: 'imp1', ...a.data }));
    const res = await svc.preview('t1', 'a1', 'c1', 'irts.xlsx', await xlsx([
      ['E1', '2026-10-07', 'ARRIVAL'],
      ['E2', '2026-10-07', 'ARRIVAL'],
      ['NOPE', '2026-10-07', 'ARRIVAL', 'NONE'],
    ]));
    expectTenantTx(s.tx, 't1');
    const data = s.tx.campMovementImport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 't1', campId: 'c1', fileName: 'irts.xlsx', status: 'PREVIEW', totalRows: 3, okRows: 1, errorRows: 2, uploadedBy: 'cu1' });
    expect(data.errors).toEqual([
      { row: 3, employeeCode: 'E2', messages: ['Ээлжийн бус ирэлт/явалтад хоол заавал (хоол идэхгүй бол NONE)'] },
      { row: 4, employeeCode: 'NOPE', messages: ['Ажилтан олдсонгүй: NOPE'] },
    ]);
    expect(data.parsedRows).toHaveLength(3);
    expect(res.summary).toEqual({ arrivals: 1, departures: 0, offRoster: 0, shiftAdjustments: 0, errorRows: 2 });
    expect(res.rows[0]).toMatchObject({ employeeCode: 'E1', kind: 'ROSTER', meals: ['DINNER'], errors: [] });
    expect(s.tx.campMovement.createManyAndReturn).not.toHaveBeenCalled();
  });

  const pending = (rows: unknown[]) => ({ id: 'imp1', status: CampImportStatus.PREVIEW, fileName: 'irts.xlsx', parsedRows: rows });
  const okRow = { row: 2, employeeCode: 'E1', date: '2026-10-07', direction: 'ARRIVAL', meals: null, shift: null, errors: [] };

  it('confirm: advisory lock → DB төлвийг дахин уншиж төлөвлөнө → бичнэ → CONFIRMED', async () => {
    s.tx.campMovementImport.findFirst.mockResolvedValueOnce(pending([okRow]));
    s.tx.campMovement.createManyAndReturn.mockResolvedValueOnce([{ id: 'm1', employeeId: 'e1', movementDate: d('2026-10-07'), direction: 'ARRIVAL' }]);
    const res = await svc.confirm('t1', 'a1', 'c1', 'imp1');
    expect(res).toEqual({ status: 'CONFIRMED', movements: 1, newStays: 1, closedStays: 0, adjustments: 0 });
    const sqls = s.tx.$executeRaw.mock.calls.map((c: unknown[]) => (c[0] as string[]).join('?'));
    expect(sqls[1]).toContain('pg_advisory_xact_lock');
    expect(s.prisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 120_000, maxWait: 10_000 });
    expect(s.tx.campMovement.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({
      tenantId: 't1', campId: 'c1', employeeId: 'e1', direction: 'ARRIVAL', kind: 'ROSTER', meals: ['DINNER'], importId: 'imp1', createdBy: 'cu1',
    });
    expect(s.tx.campStay.createMany.mock.calls[0][0].data[0]).toMatchObject({ employeeId: 'e1', arrivalMovementId: 'm1', departureMovementId: null, endDate: null });
    expect(s.tx.campMovementImport.update.mock.calls[0][0].data).toMatchObject({ status: 'CONFIRMED', confirmedBy: 'cu1', errorRows: 0 });
  });

  it('confirm: PREVIEW-ээс хойш төлөв өөрчлөгдөж алдаа гарвал → алдааг хадгалаад 409, юу ч бичихгүй (all-or-nothing)', async () => {
    s.tx.campMovementImport.findFirst.mockResolvedValueOnce(pending([okRow]));
    s.tx.campStay.findMany.mockResolvedValueOnce([{ id: 's0', employeeId: 'e1', startDate: d('2026-10-05'), endDate: null }]);
    await expect(svc.confirm('t1', 'a1', 'c1', 'imp1')).rejects.toThrow(/1 мөр алдаатай/);
    expect(s.tx.campMovement.createManyAndReturn).not.toHaveBeenCalled();
    expect(s.tx.campMovementImport.update.mock.calls[0][0].data).toMatchObject({ errorRows: 1, okRows: 0 });
  });

  it('confirm: CONFIRMED/CANCELLED → 409; байхгүй → 404', async () => {
    s.tx.campMovementImport.findFirst.mockResolvedValueOnce({ ...pending([]), status: CampImportStatus.CONFIRMED });
    await expect(svc.confirm('t1', 'a1', 'c1', 'imp1')).rejects.toThrow(/зөвхөн PREVIEW/);
    await expect(svc.confirm('t1', 'a1', 'c1', 'imp9')).rejects.toThrow(NotFoundException);
  });

  it('confirm: хаах stay зэрэгцээ өөрчлөгдсөн (updateMany 0) → 409', async () => {
    s.tx.campMovementImport.findFirst.mockResolvedValueOnce(pending([{ ...okRow, date: '2026-10-22', direction: 'DEPARTURE' }]));
    s.tx.campStay.findMany.mockResolvedValueOnce([{ id: 's1', employeeId: 'e1', startDate: d('2026-10-07'), endDate: null }]);
    s.tx.campMovement.createManyAndReturn.mockResolvedValueOnce([{ id: 'm2', employeeId: 'e1', movementDate: d('2026-10-22'), direction: 'DEPARTURE' }]);
    s.tx.campStay.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.confirm('t1', 'a1', 'c1', 'imp1')).rejects.toThrow(/зэрэгцээ/);
  });

  it('cancel: зөвхөн PREVIEW → CANCELLED; бусад → 409', async () => {
    s.tx.campMovementImport.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(svc.cancel('t1', 'a1', 'c1', 'imp1')).resolves.toEqual({ status: 'CANCELLED' });
    expect(s.tx.campMovementImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp1', tenantId: 't1', campId: 'c1', status: 'PREVIEW' }, data: { status: 'CANCELLED' } });
    s.tx.campMovementImport.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.cancel('t1', 'a1', 'c1', 'imp1')).rejects.toThrow(ConflictException);
  });

  it('гараар: ээлжийн бус хоолгүй → 400 (импортын ижил дүрэм); ростерын → бичнэ', async () => {
    s.tx.campEmployee.findFirst.mockResolvedValue({ employeeCode: 'E2' });
    await expect(svc.createMovement('t1', 'a1', 'c1', { employeeId: 'e2', date: '2026-10-08', direction: 'ARRIVAL' })).rejects.toThrow(/хоол заавал/);
    s.tx.campEmployee.findFirst.mockResolvedValue({ employeeCode: 'E1' });
    s.tx.campMovement.createManyAndReturn.mockResolvedValueOnce([{ id: 'm1', employeeId: 'e1', movementDate: d('2026-10-07'), direction: 'ARRIVAL' }]);
    const res = await svc.createMovement('t1', 'a1', 'c1', { employeeId: 'e1', date: '2026-10-07', direction: 'ARRIVAL' });
    expect(res).toMatchObject({ kind: 'ROSTER', meals: ['DINNER'] });
    expect(s.tx.campMovement.createManyAndReturn.mock.calls[0][0].data[0].importId).toBeNull();
  });

  it('гараар: өөр кемпийн ажилтан → 400; буруу огноо → 400', async () => {
    await expect(svc.createMovement('t1', 'a1', 'c1', { employeeId: 'x', date: '2026-10-07', direction: 'ARRIVAL' })).rejects.toThrow(/энэ кемпэд олдсонгүй/);
    await expect(svc.createMovement('t1', 'a1', 'c1', { employeeId: 'x', date: '2026-02-30', direction: 'ARRIVAL' })).rejects.toThrow(BadRequestException);
  });

  it('deleteMovement: дараагийн бүртгэлтэй → 409; ирэлт → нээлттэй stay устгана; явалт → stay дахин нээнэ', async () => {
    s.tx.campMovement.findFirst.mockResolvedValueOnce({ id: 'm1', employeeId: 'e1', movementDate: d('2026-10-07'), direction: 'ARRIVAL' }).mockResolvedValueOnce({ movementDate: d('2026-10-22') });
    await expect(svc.deleteMovement('t1', 'a1', 'c1', 'm1')).rejects.toThrow(/2026-10-22/);
    s.tx.campMovement.findFirst.mockResolvedValueOnce({ id: 'm1', employeeId: 'e1', movementDate: d('2026-10-07'), direction: 'ARRIVAL' }).mockResolvedValueOnce(null);
    await svc.deleteMovement('t1', 'a1', 'c1', 'm1');
    expect(s.tx.campStay.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', arrivalMovementId: 'm1', departureMovementId: null } });
    s.tx.campMovement.findFirst.mockResolvedValueOnce({ id: 'm2', employeeId: 'e1', movementDate: d('2026-10-22'), direction: 'DEPARTURE' }).mockResolvedValueOnce(null);
    await svc.deleteMovement('t1', 'a1', 'c1', 'm2');
    expect(s.tx.campStay.updateMany).toHaveBeenCalledWith({ where: { tenantId: 't1', departureMovementId: 'm2' }, data: { endDate: null, departureMovementId: null } });
    expect(s.tx.campMovement.delete).toHaveBeenCalledTimes(2);
  });

  it('listMovements: 93 хоногоос их муж / урвуу муж → 400', async () => {
    await expect(svc.listMovements('t1', 'a1', 'c1', { from: '2026-01-01', to: '2026-06-01' })).rejects.toThrow(/93 хоног/);
    await expect(svc.listMovements('t1', 'a1', 'c1', { from: '2026-10-10', to: '2026-10-01' })).rejects.toThrow(/өмнө/);
  });

  it('listStays: ирсэн / явсан / бүтэн өдөр', async () => {
    const emp = { id: 'e1', employeeCode: 'E1', fullName: 'Бат', department: { code: 'M', name: 'M' }, crew: null };
    s.tx.campStay.findMany.mockResolvedValueOnce([
      { id: 's1', startDate: d('2026-10-07'), endDate: null, employee: emp },
      { id: 's2', startDate: d('2026-09-23'), endDate: d('2026-10-07'), employee: emp },
      { id: 's3', startDate: d('2026-10-01'), endDate: null, employee: emp },
    ]);
    s.tx.campEmployee.findMany.mockResolvedValueOnce([]);
    const rows = await svc.listStays('t1', 'a1', 'c1', '2026-10-07');
    expect(rows.map((r) => r.dayType)).toEqual(['ARRIVAL', 'DEPARTURE', 'FULL_DAY']);
  });

  it('v0.2.1 listStays (C-14): мөр бүрт тооцоолсон ээлж (албан тушаалын загвар > хэлтсийнх), MOVEMENT, UNKNOWN; shift шүүлт', async () => {
    const emp = (id: string) => ({ id, employeeCode: id.toUpperCase(), fullName: id, department: { code: 'M', name: 'M' }, crew: null });
    s.tx.campStay.findMany.mockResolvedValue([
      { id: 's1', startDate: d('2026-10-07'), endDate: null, employee: emp('a') },
      { id: 's2', startDate: d('2026-10-01'), endDate: null, employee: emp('b') },
      { id: 's3', startDate: d('2026-10-01'), endDate: null, employee: emp('c') },
      { id: 's4', startDate: d('2026-10-01'), endDate: null, employee: emp('x') },
    ]);
    s.tx.campSetting.findFirst.mockResolvedValue(S);
    s.tx.campPositionSetting.findMany.mockResolvedValue([
      { positionId: 'p-night', mealLocationId: null, mealsIncluded: false, shiftPatterns: [{ dayFrom: 1, dayTo: 14, shift: 'NIGHT' }] },
    ]);
    const full = (id: string, positionId: string | null, crew: boolean) => ({
      id, employeeCode: id.toUpperCase(), fullName: id, position: null, positionId, mealLocationId: null, mealsIncluded: null,
      positionRef: positionId ? { name: 'Шөнийн харуул' } : null,
      // баггүй + холимог загвар → ээлж тодорхойгүй (UNKNOWN); баггүй + нэг төрлийн загвар бол тэр ээлж
      department: { code: 'M', mealLocationId: null, shiftPatterns: crew ? [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] : [{ dayFrom: 1, dayTo: 7, shift: 'DAY' }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' }] },
      crew: crew ? { rosterAnchorDate: d('2026-10-01') } : null, shiftAdjustments: [],
      stays: [{ startDate: d(id === 'a' ? '2026-10-07' : '2026-10-01'), endDate: null, arrivalMovement: { meals: [] }, departureMovement: null }],
    });
    s.tx.campEmployee.findMany.mockResolvedValue([full('a', null, true), full('b', null, true), full('c', 'p-night', true), full('x', null, false)]);
    const rows = await svc.listStays('t1', 'a1', 'c1', '2026-10-07');
    expect(rows.map((r) => [r.employee.employeeCode, r.shiftGroup, r.positionName, r.mealsIncluded])).toEqual([
      ['A', 'MOVEMENT', null, true],
      ['B', 'DAY', null, true],
      ['C', 'NIGHT', 'Шөнийн харуул', false],
      ['X', 'UNKNOWN', null, true],
    ]);
    expect((await svc.listStays('t1', 'a1', 'c1', '2026-10-07', 'NIGHT')).map((r) => r.employee.employeeCode)).toEqual(['C']);
    expect((await svc.listStays('t1', 'a1', 'c1', '2026-10-07', 'UNKNOWN')).map((r) => r.employee.employeeCode)).toEqual(['X']);
  });
});

describe('CampShiftsService (Шат 3.2)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampShiftsService;
  const dto = { employeeIds: ['e1', 'e2'], startDate: '2026-10-10', endDate: '2026-10-12', shift: CampShiftType.NIGHT, reasonType: 'SHIFT_CHANGE' as const };
  beforeEach(() => {
    s = setup();
    svc = new CampShiftsService(s.prisma as never, s.access);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.SHIFT_ADJUST] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
  });

  it('бөөнөөр: олдохгүй / идэвхгүй ажилтан → 400; нэг нь давхцвал бүгд 409 (кодыг нэрлэнэ)', async () => {
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{ id: 'e1', employeeCode: 'E1', status: 'ACTIVE' }]);
    await expect(svc.createAdjustments('t1', 'a1', 'c1', dto)).rejects.toThrow(/1 ажилтан энэ кемпэд олдсонгүй/);
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{ id: 'e1', employeeCode: 'E1', status: 'ACTIVE' }, { id: 'e2', employeeCode: 'E2', status: 'INACTIVE' }]);
    await expect(svc.createAdjustments('t1', 'a1', 'c1', dto)).rejects.toThrow(/Идэвхгүй ажилтан: E2/);
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{ id: 'e1', employeeCode: 'E1', status: 'ACTIVE' }, { id: 'e2', employeeCode: 'E2', status: 'ACTIVE' }]);
    s.tx.campShiftAdjustment.findMany.mockResolvedValueOnce([{ startDate: d('2026-10-12'), endDate: d('2026-10-15'), employee: { employeeCode: 'E2' } }]);
    await expect(svc.createAdjustments('t1', 'a1', 'c1', dto)).rejects.toThrow(/E2 \(2026-10-12 – 2026-10-15\)/);
    expect(s.tx.campShiftAdjustment.createMany).not.toHaveBeenCalled();
  });

  it('амжилттай → бүгдэд createMany (createdBy = core_users.id); OTHER шалтгаангүй → 400; урвуу муж → 400', async () => {
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{ id: 'e1', employeeCode: 'E1', status: 'ACTIVE' }, { id: 'e2', employeeCode: 'E2', status: 'ACTIVE' }]);
    await expect(svc.createAdjustments('t1', 'a1', 'c1', dto)).resolves.toEqual({ created: 2 });
    expect(s.tx.campShiftAdjustment.createMany.mock.calls[0][0].data[1]).toMatchObject({ tenantId: 't1', employeeId: 'e2', shift: 'NIGHT', reasonType: 'SHIFT_CHANGE', createdBy: 'cu1' });
    await expect(svc.createAdjustments('t1', 'a1', 'c1', { ...dto, reasonType: 'OTHER' })).rejects.toThrow(/reason заавал/);
    await expect(svc.createAdjustments('t1', 'a1', 'c1', { ...dto, endDate: '2026-10-01' })).rejects.toThrow(BadRequestException);
  });

  it('shift.adjust-гүй → 403; deleteAdjustment өөр кемпийнх → 404', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }] });
    await expect(svc.createAdjustments('t1', 'a1', 'c1', dto)).rejects.toThrow(/camp\.shift\.adjust/);
    setActor(s.tx, { role: UserRole.OWNER });
    await expect(svc.deleteAdjustment('t1', 'a1', 'c1', 'x')).rejects.toThrow(NotFoundException);
    expect(s.tx.campShiftAdjustment.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1', employee: { campId: 'c1' } }, select: { id: true } });
  });

  it('calendar: 31 хоногоос их → 400; ажилтан × өдөр (ээлж + эх сурвалж + байгаа эсэх)', async () => {
    await expect(svc.calendar('t1', 'a1', 'c1', { from: '2026-10-01', to: '2026-11-15' })).rejects.toThrow(/31 хоног/);
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{
      id: 'e1', employeeCode: 'E1', fullName: 'Бат',
      department: { code: 'MINE', shiftPatterns: [{ dayFrom: 1, dayTo: 7, shift: 'DAY' }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' }] },
      crew: { code: 'A', rosterAnchorDate: d('2026-10-07') },
      shiftAdjustments: [{ startDate: d('2026-10-09'), endDate: d('2026-10-09'), shift: 'NIGHT' }],
      stays: [{ startDate: d('2026-10-07'), endDate: d('2026-10-22') }],
    }]);
    const cal = await svc.calendar('t1', 'a1', 'c1', { from: '2026-10-07', to: '2026-10-09' });
    expect(cal.days).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(cal.employees[0].cells).toEqual([
      { date: '2026-10-07', shift: null, source: 'UNKNOWN', dayNo: 0, presence: 'ARRIVAL' },
      { date: '2026-10-08', shift: 'DAY', source: 'PATTERN', dayNo: 1, presence: 'FULL_DAY' },
      { date: '2026-10-09', shift: 'NIGHT', source: 'ADJUSTMENT', dayNo: 2, presence: 'FULL_DAY' },
    ]);
  });
});

describe('Өрөөний багтаамж — хоногоор (Шат 3.4)', () => {
  const A = '2026-10-07';
  const C = '2026-10-21';
  it('А ба C баг (14 хоногийн зөрүү) нэг ортой өрөө → солигдох Лхагва шөнө (C-ийн өмнөх мөчлөгийн 14-р өдөр) 2 хүн → хэтэрнэ', () => {
    const occ = [
      { employeeCode: 'A1', crewAnchor: A, startDate: '2026-10-07', endDate: null },
      { employeeCode: 'C1', crewAnchor: C, startDate: '2026-10-07', endDate: null },
    ];
    expect(firstOverCapacityNight(occ, 1, '2026-10-07', 28, S)).toEqual({ date: '2026-10-07', count: 2, codes: ['A1', 'C1'] });
    // 10-08 … 10-20: зөвхөн А; 10-21: дахин солигдох шөнө
    expect(firstOverCapacityNight(occ, 1, '2026-10-08', 28, S)?.date).toBe('2026-10-21');
    expect(firstOverCapacityNight(occ, 2, '2026-10-07', 28, S)).toBeNull();
  });
  it('А ба B баг (7 хоногийн зөрүү) → 7 хоног давхцана; багагүй ажилтан шөнө бүр тоологдоно; дууссан хуваарилалт тоологдохгүй', () => {
    const occ = [
      { employeeCode: 'A1', crewAnchor: A, startDate: '2026-10-01', endDate: null },
      { employeeCode: 'B1', crewAnchor: '2026-10-14', startDate: '2026-10-01', endDate: null },
    ];
    expect(firstOverCapacityNight(occ, 1, '2026-10-07', 28, S)?.date).toBe('2026-10-14');
    expect(firstOverCapacityNight([{ employeeCode: 'X', crewAnchor: null, startDate: '2026-10-01', endDate: null }, { employeeCode: 'A1', crewAnchor: A, startDate: '2026-10-01', endDate: null }], 1, '2026-10-07', 28, S)?.date).toBe('2026-10-07');
    expect(firstOverCapacityNight([{ employeeCode: 'X', crewAnchor: null, startDate: '2026-10-01', endDate: '2026-10-06' }, { employeeCode: 'A1', crewAnchor: A, startDate: '2026-10-07', endDate: null }], 1, '2026-10-07', 28, S)).toBeNull();
  });
});

describe('CampRoomsService (Шат 3.4)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampRoomsService;
  const emp = { id: 'e1', employeeCode: 'A1', status: CampEmployeeStatus.ACTIVE, crew: { rosterAnchorDate: d('2026-10-07') } };
  const room = { id: 'r1', roomNo: '101', capacity: 1, status: CampRoomStatus.ACTIVE };
  const dto = { employeeId: 'e1', roomId: 'r1', startDate: '2026-10-07' };
  beforeEach(() => {
    s = setup();
    svc = new CampRoomsService(s.prisma as never, s.access);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.campEmployee.findFirst.mockResolvedValue(emp);
    s.tx.campRoom.findFirst.mockResolvedValue(room);
  });

  it('room.manage-гүй → 403; өрөө MAINTENANCE → 400; ажилтан идэвхгүй → 400', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MASTER_MANAGE] }] });
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).rejects.toThrow(/camp\.room\.manage/);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROOM_MANAGE] }] });
    s.tx.campRoom.findFirst.mockResolvedValueOnce({ ...room, status: CampRoomStatus.MAINTENANCE });
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).rejects.toThrow(/MAINTENANCE/);
    s.tx.campEmployee.findFirst.mockResolvedValueOnce({ ...emp, status: CampEmployeeStatus.INACTIVE });
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).rejects.toThrow(/идэвхгүй/);
  });

  it('багтаамж хэтрэх → 409 (шөнө, тоо, кодууд); хэтрэхгүй → үүсгэнэ', async () => {
    s.tx.campRoomAllocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { startDate: d('2026-10-01'), endDate: null, employee: { employeeCode: 'C1', crew: { rosterAnchorDate: d('2026-10-21') } } },
    ]);
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).rejects.toThrow(/2026-10-07-ний шөнө 2 хүн хонох \(багтаамж 1\) — A1, C1/);
    expect(s.tx.campRoomAllocation.create).not.toHaveBeenCalled();
    s.tx.campRoom.findFirst.mockResolvedValue({ ...room, capacity: 2 });
    s.tx.campRoomAllocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    s.tx.campRoomAllocation.create.mockResolvedValueOnce({ id: 'ra1', roomId: 'r1', employeeId: 'e1', startDate: d('2026-10-07'), endDate: null });
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).resolves.toMatchObject({ id: 'ra1', startDate: '2026-10-07', replacedAllocationId: null });
  });

  it('одоогийн хуваарилалттай: replaceCurrent-гүй → 409; replaceCurrent → өмнөх өдрөөр дуусгаад шилжүүлнэ (өөрийгөө тоолохгүй)', async () => {
    const current = [{ id: 'old', startDate: d('2026-09-01'), endDate: null, room: { roomNo: '099' } }];
    s.tx.campRoomAllocation.findMany.mockResolvedValueOnce(current);
    await expect(svc.allocate('t1', 'a1', 'c1', dto)).rejects.toThrow(/099 өрөөнд 2026-09-01-ээс/);
    s.tx.campRoomAllocation.findMany.mockResolvedValueOnce(current).mockResolvedValueOnce([]);
    s.tx.campRoomAllocation.create.mockResolvedValueOnce({ id: 'new', roomId: 'r1', employeeId: 'e1', startDate: d('2026-10-07'), endDate: null });
    await svc.allocate('t1', 'a1', 'c1', { ...dto, replaceCurrent: true });
    expect(s.tx.campRoomAllocation.findMany.mock.calls[2][0].where.NOT).toEqual({ id: 'old' });
    expect(s.tx.campRoomAllocation.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { endDate: d('2026-10-06') } });
  });

  it('end: дууссан → 409; эхлэхээс өмнө → 400', async () => {
    s.tx.campRoomAllocation.findFirst.mockResolvedValueOnce({ id: 'ra1', startDate: d('2026-10-07'), endDate: d('2026-10-10') });
    await expect(svc.end('t1', 'a1', 'c1', 'ra1', { endDate: '2026-10-20' })).rejects.toThrow(ConflictException);
    s.tx.campRoomAllocation.findFirst.mockResolvedValueOnce({ id: 'ra1', startDate: d('2026-10-07'), endDate: null });
    await expect(svc.end('t1', 'a1', 'c1', 'ra1', { endDate: '2026-10-01' })).rejects.toThrow(/өмнө/);
  });

  it('самбар: D шөнө хонож буй (stay endDate > D) → PARTIAL/FULL/VACANT, "өрөөгүй" жагсаалт', async () => {
    const e = (id: string) => ({ id, employeeCode: id.toUpperCase(), fullName: id, crew: null, department: { code: 'M' } });
    s.tx.campRoom.findMany.mockResolvedValueOnce([
      { id: 'r1', roomNo: '101', floor: 1, capacity: 2, status: 'ACTIVE', building: { code: 'B', name: 'B' } },
      { id: 'r2', roomNo: '102', floor: 1, capacity: 1, status: 'ACTIVE', building: { code: 'B', name: 'B' } },
      { id: 'r3', roomNo: '103', floor: 1, capacity: 1, status: 'ACTIVE', building: { code: 'B', name: 'B' } },
    ]);
    s.tx.campRoomAllocation.findMany.mockResolvedValueOnce([{ roomId: 'r1', employee: e('a') }, { roomId: 'r1', employee: e('b') }, { roomId: 'r2', employee: e('c') }]);
    s.tx.campStay.findMany.mockResolvedValueOnce([{ employee: e('a') }, { employee: e('c') }, { employee: e('z') }]);
    const b = await svc.board('t1', 'a1', 'c1', '2026-10-07');
    expect(s.tx.campStay.findMany.mock.calls[0][0].where.OR).toEqual([{ endDate: null }, { endDate: { gt: d('2026-10-07') } }]);
    expect(b.rooms.map((r) => [r.roomNo, r.allocatedCount, r.presentCount, r.occupancy])).toEqual([['101', 2, 1, 'PARTIAL'], ['102', 1, 1, 'FULL'], ['103', 0, 0, 'VACANT']]);
    expect(b.unassigned.map((u) => u.employeeCode)).toEqual(['Z']);
    expect(b.totals).toEqual({ rooms: 3, capacity: 4, present: 2, vacant: 1, full: 1 });
  });

  it('v0.2.1 самбар (C-12): өрөө бүрийн хөрөнгө (актлагдаагүй) + нээлттэй засвар; totals өөрчлөгдөхгүй (snapshot A = B)', async () => {
    s.tx.campRoom.findMany.mockResolvedValueOnce([
      { id: 'r1', roomNo: '101', floor: 1, capacity: 2, status: 'ACTIVE', building: { code: 'B', name: 'B' } },
      { id: 'r2', roomNo: '102', floor: 1, capacity: 1, status: 'ACTIVE', building: { code: 'B', name: 'B' } },
    ]);
    s.tx.campAsset.findMany.mockResolvedValueOnce([
      { id: 'as1', roomId: 'r1', inventoryNo: 'INV-1', name: 'Хөргөгч', condition: 'GOOD' },
      { id: 'as2', roomId: 'r1', inventoryNo: 'INV-2', name: 'Ор', condition: 'DAMAGED' },
    ]);
    s.tx.campMaintenanceRequest.findMany.mockResolvedValueOnce([
      { id: 'm1', roomId: 'r2', requestNo: 'ZAS-1', title: 'Ус гоожиж байна', priority: 'HIGH', status: 'OPEN', blocksRoom: false },
    ]);
    const b = await svc.board('t1', 'a1', 'c1', '2026-10-07');
    expect(s.tx.campAsset.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', campId: 'c1', roomId: { not: null }, condition: { not: 'WRITTEN_OFF' } });
    expect(s.tx.campMaintenanceRequest.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', campId: 'c1', roomId: { not: null }, status: { in: ['OPEN', 'IN_PROGRESS'] } });
    expect(b.rooms[0].assets).toEqual([
      { id: 'as1', inventoryNo: 'INV-1', name: 'Хөргөгч', condition: 'GOOD' },
      { id: 'as2', inventoryNo: 'INV-2', name: 'Ор', condition: 'DAMAGED' },
    ]);
    expect(b.rooms[0].openMaintenance).toEqual([]);
    expect(b.rooms[1].assets).toEqual([]);
    expect(b.rooms[1].openMaintenance).toEqual([{ id: 'm1', requestNo: 'ZAS-1', title: 'Ус гоожиж байна', priority: 'HIGH', status: 'OPEN', blocksRoom: false }]);
    expect(Object.keys(b.totals)).toEqual(['rooms', 'capacity', 'present', 'vacant', 'full']);
  });
});

describe('CampPresenceService (Шат 3.5) — DB → тооцоо', () => {
  it('D ба D−1-ийг хамарсан stay-тэй ажилтнуудыг ачаалж, байршлын нэр нэмнэ', async () => {
    const s = setup();
    const svc = new CampPresenceService(s.prisma as never, s.access);
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.MEAL_ORDER] }] });
    s.tx.camp.findFirst.mockResolvedValue(CAMP);
    s.tx.campSetting.findFirst.mockResolvedValueOnce({ ...S, defaultMealLocationId: 'loc-camp' });
    s.tx.campEmployee.findMany.mockResolvedValueOnce([{
      id: 'e1', employeeCode: 'E1', fullName: 'Бат',
      // v0.2.1 (Q1): ажлын хоолны байршил ажилтан дээр (migration хэлтсийнхийг хуулсан); хэлтсийнх уншигдахгүй
      positionId: null, mealLocationId: 'loc-mine', mealsIncluded: null, positionRef: null,
      department: { code: 'MINE', mealLocationId: 'loc-OLD-ignored', shiftPatterns: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] },
      crew: { rosterAnchorDate: d('2026-10-07') }, shiftAdjustments: [],
      stays: [{ startDate: d('2026-10-07'), endDate: null, arrivalMovement: { meals: ['DINNER'] }, departureMovement: null }],
    }]);
    s.tx.campMealLocation.findMany.mockResolvedValueOnce([{ id: 'loc-camp', name: 'Кемп гал тогоо' }, { id: 'loc-mine', name: 'Уулын хэсэг' }]);
    const r = await svc.presence('t1', 'a1', 'c1', '2026-10-08');
    expect(s.tx.campEmployee.findMany.mock.calls[0][0].where.stays.some).toEqual({ startDate: { lte: d('2026-10-08') }, OR: [{ endDate: null }, { endDate: { gte: d('2026-10-07') } }] });
    expect(r.lines).toEqual([
      { mealType: 'BREAKFAST', mealLocationId: 'loc-camp', count: 1, mealLocationName: 'Кемп гал тогоо' },
      { mealType: 'LUNCH', mealLocationId: 'loc-mine', count: 1, mealLocationName: 'Уулын хэсэг' },
      { mealType: 'DINNER', mealLocationId: 'loc-camp', count: 1, mealLocationName: 'Кемп гал тогоо' },
    ]);
  });
});
