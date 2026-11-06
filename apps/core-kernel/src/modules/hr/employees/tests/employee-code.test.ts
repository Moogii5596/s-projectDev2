import { describe, it, expect, beforeEach } from 'vitest';
import { CAMP_PERMISSIONS } from '../../../camp/common/camp-permissions';
import { setActor, setup } from '../../../camp/common/tests/camp-test-utils';
import { HrEmployeesService } from '../hr-employees.service';
import { nextAutoCode } from '../employee-code';

const P = CAMP_PERMISSIONS;

describe('nextAutoCode (R7)', () => {
  it('эхнийх Z0001; хамгийн их + 1 (ажлаас гарсныг ч тооцно — дахин ашиглахгүй); 9999 → 5 орон', () => {
    expect(nextAutoCode('Z', [])).toBe('Z0001');
    expect(nextAutoCode('Z', ['Z0003', 'Z0001', 'Z0009'])).toBe('Z0010');
    expect(nextAutoCode('Z', ['Z9999'])).toBe('Z10000');
    expect(nextAutoCode('Z', ['Z10000', 'Z0002'])).toBe('Z10001');
  });

  it('өөр хэлбэрийн кодыг үл тооно (Z12, ZX001, 10001, бусад угтвар)', () => {
    expect(nextAutoCode('Z', ['Z12', 'ZX0001', '10001', 'W0050', 'Z0004A'])).toBe('Z0001');
    expect(nextAutoCode('GR', ['GR0007', 'Z0100'])).toBe('GR0008');
  });
});

describe('HrEmployeesService.create — автомат код (R7)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeesService;
  beforeEach(() => {
    s = setup();
    svc = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.EMPLOYEE_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue({ id: 'c1', code: 'C1', name: 'Кемп 1', isActive: true });
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.campSetting.findFirst.mockResolvedValue({ rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3, defaultMealLocationId: null, autoCodePrefix: 'Z' });
    s.tx.hrEmployee.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: 'e1', fullName: 'Автобус Жолооч 1', ...a.data }));
  });

  it('код өгөөгүй → lock → tenant-ийн Z кодоос дараагийнх', async () => {
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([{ employeeCode: 'Z0001' }, { employeeCode: 'Z0002' }]);
    const res = await svc.create('t1', 'a1', 'c1', { organizationId: 'o1', departmentId: 'd1', lastName: 'Автобус', firstName: 'Жолооч 1' });
    expect(res.employeeCode).toBe('Z0003');
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data.employeeCode).toBe('Z0003');
    expect(s.tx.hrEmployee.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', employeeCode: { startsWith: 'Z' } });
    const sqls = s.tx.$executeRaw.mock.calls.map((c: unknown[]) => (c[0] as string[]).join('?'));
    expect(sqls.some((q: string) => q.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  it('код өгсөн бол автомат код үүсгэхгүй', async () => {
    await svc.create('t1', 'a1', 'c1', { organizationId: 'o1', departmentId: 'd1', employeeCode: '10001', fullName: 'Бат' });
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data.employeeCode).toBe('10001');
    expect(s.tx.hrEmployee.findMany.mock.calls.some((c: { where?: { employeeCode?: unknown } }[]) => !!c[0]?.where?.employeeCode)).toBe(false);
  });
});

describe('HrEmployeesService.update — S9 «HR ID хүлээгдэж байна» (R9)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeesService;
  const pending = [{ field: 'employeeCode', code: 'row.hr_id_pending', value: '' }];
  beforeEach(() => {
    s = setup();
    svc = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.EMPLOYEE_MANAGE] }] });
    s.tx.hrEmployee.findFirst.mockImplementation(async (a: { select?: { dataIssues?: boolean }; where?: { employeeCode?: string } }) =>
      a.select?.dataIssues ? { dataIssues: pending } : a.where?.employeeCode ? null : { id: 'e1', employeeCode: 'Z0005', fullName: 'Бат Дорж', status: 'ACTIVE' },
    );
    s.tx.hrEmployee.update.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: 'e1', employeeCode: 'Z0005', fullName: 'Бат Дорж', ...a.data }));
  });

  it('код өөрчлөгдвөл тэмдэг арилна', async () => {
    await svc.update('t1', 'a1', 'c1', 'e1', { employeeCode: '10077' });
    expect(s.tx.hrEmployee.update.mock.calls[0][0].data).toMatchObject({ employeeCode: '10077', dataIssues: [] });
  });

  it('ижил кодыг (маягт үргэлж илгээдэг) дахин илгээвэл тэмдэг үлдэнэ', async () => {
    await svc.update('t1', 'a1', 'c1', 'e1', { employeeCode: 'Z0005', phone: null });
    expect(s.tx.hrEmployee.update.mock.calls[0][0].data.dataIssues).toBeUndefined();
  });
});
