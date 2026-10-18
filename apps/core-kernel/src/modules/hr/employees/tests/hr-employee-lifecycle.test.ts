/**
 * v0.2.2 Блок 5 — ажлаас гаргах (D-07), дахин ажилд авах (Q-C, Q-C2), профайл + PII лог (D-08, B5-Q6)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CampAuditAction, CampEmployeeStatus, UserRole } from '@prisma/client';
import { CAMP_PERMISSIONS } from '../../../camp/common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../../camp/common/tests/camp-test-utils';
import { MESSAGES } from '../../../../common/i18n/messages';
import { HrEmployeesService } from '../hr-employees.service';
import { HrEmployeeHooks } from '../employee-hooks';
import { HrEmployeeLifecycleService, terminationDateError, terminationUserBlocker } from '../hr-employee-lifecycle.service';
import { todayUb } from '../../../camp/common/camp-date';

const P = CAMP_PERMISSIONS;
const TODAY = todayUb();
const USER = { id: 'u-emp', authId: 'auth-emp', role: UserRole.REQUESTER, isActive: true, fullName: 'Бат', email: 'u@sino.login.invalid' };
const emp = (over: Record<string, unknown> = {}) => ({
  id: 'e1', employeeCode: 'SH1', fullName: 'Бат', status: CampEmployeeStatus.ACTIVE, userId: USER.id, user: USER, ...over,
});

describe('цэвэр функц', () => {
  it('terminationDateError: буруу огноо, ирээдүй', () => {
    expect(terminationDateError('2026-02-30', '2026-10-17')).toBe('camp.err.employees.terminate_date');
    expect(terminationDateError('2026-10-18', '2026-10-17')).toBe('camp.err.employees.terminate_future');
    expect(terminationDateError('2026-10-17', '2026-10-17')).toBeNull();
    expect(terminationDateError('2025-01-01', '2026-10-17')).toBeNull();
  });

  it('terminationUserBlocker: эрхгүй / идэвхгүй → null; өөрийгөө; сүүлийн OWNER', () => {
    expect(terminationUserBlocker(null, 'me', 0)).toBeNull();
    expect(terminationUserBlocker({ id: 'me', role: 'ADMIN', isActive: false }, 'me', 0)).toBeNull();
    expect(terminationUserBlocker({ id: 'me', role: 'ADMIN', isActive: true }, 'me', 0)).toBe('camp.err.user.1');
    expect(terminationUserBlocker({ id: 'o', role: 'OWNER', isActive: true }, 'me', 1)).toBe('camp.err.user.2');
    expect(terminationUserBlocker({ id: 'o', role: 'OWNER', isActive: true }, 'me', 2)).toBeNull();
    // SEC-009: системийн админы нэвтрэх эрхийг Кемп админ хаахгүй
    expect(terminationUserBlocker({ id: 'a', role: 'ADMIN', isActive: true }, 'me', 0, false)).toBe('camp.err.access.admin');
    expect(terminationUserBlocker({ id: 'o', role: 'OWNER', isActive: true }, 'me', 2, false)).toBe('camp.err.access.admin');
    expect(terminationUserBlocker({ id: 'u', role: 'REQUESTER', isActive: true }, 'me', 0, false)).toBeNull();
  });

  it('шинэ мессеж mn/en/zh', () => {
    for (const k of [
      'camp.err.employees.terminated', 'camp.err.employees.bulk_terminated', 'camp.err.employees.already_terminated',
      'camp.err.employees.terminate_date', 'camp.err.employees.terminate_future', 'camp.err.employees.movements_after',
      'camp.err.employees.departure', 'camp.err.employees.not_terminated', 'camp.err.employees.already_rehired',
      'audit.employee.terminate', 'audit.employee.rehire', 'row.code_terminated', 'enum.employee_status.TERMINATED',
    ]) {
      const m = (MESSAGES as Record<string, { mn: string; en: string; zh: string }>)[k];
      expect(m?.mn && m.en && m.zh, k).toBeTruthy();
    }
  });
});

describe('HrEmployeeLifecycleService', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeeLifecycleService;
  let userAdmin: { setBanned: ReturnType<typeof vi.fn> };
  let tenantCache: { invalidateMember: ReturnType<typeof vi.fn> };
  let site: { releaseOnTermination: ReturnType<typeof vi.fn>; roomHistory: ReturnType<typeof vi.fn> };
  let stays: { findForPlanner: ReturnType<typeof vi.fn> };

  const asAdmin = (perms: string[] = [P.EMPLOYEE_TERMINATE], userId = 'cu-admin') =>
    setActor(s.tx, { userId, roles: [{ campId: 'c1', perms }] }, () => null);

  beforeEach(() => {
    s = setup();
    userAdmin = { setBanned: vi.fn().mockResolvedValue(undefined) };
    tenantCache = { invalidateMember: vi.fn().mockResolvedValue(undefined) };
    site = { releaseOnTermination: vi.fn().mockResolvedValue({ closed: 1, removed: 0 }), roomHistory: vi.fn().mockResolvedValue([]) };
    stays = { findForPlanner: vi.fn().mockResolvedValue([]) };
    const hooks = new HrEmployeeHooks();
    hooks.registerSitePort(site as never);
    const employees = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    svc = new HrEmployeeLifecycleService(s.prisma as never, s.access, s.audit, employees, { stays } as never, hooks, userAdmin as never, tenantCache as never);
    asAdmin();
    s.tx.hrEmployee.findFirst.mockResolvedValue(emp());
    s.tx.hrEmployee.findFirstOrThrow = vi.fn().mockResolvedValue({ status: 'ACTIVE', terminatedAt: null, terminationReason: null, terminationNote: null });
  });

  const terminate = (over: Partial<{ date: string; reason: 'RESIGNED' | 'OTHER'; note: string }> = {}) =>
    svc.terminate('t1', 'a1', 'c1', 'e1', { date: TODAY, reason: 'RESIGNED', ...over });

  it('terminate: эрхгүй (зөвхөн employee.manage) → 403', async () => {
    asAdmin([P.EMPLOYEE_MANAGE]);
    await expect(terminate()).rejects.toThrow(ForbiddenException);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('terminate: ирээдүйн огноо → 400 (DB-д хандахгүй)', async () => {
    await expect(terminate({ date: '2999-01-01' })).rejects.toThrow(BadRequestException);
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('terminate: аль хэдийн гарсан → 409; огнооноос хойш ирц → 409, ban хийхгүй', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce(emp({ status: CampEmployeeStatus.TERMINATED }));
    await expect(terminate()).rejects.toThrow(ConflictException);
    s.tx.hrMovement.findFirst.mockResolvedValueOnce({ movementDate: new Date('2999-01-02T00:00:00Z') });
    await expect(terminate()).rejects.toThrow(/2999-01-02/);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('terminate: өөрийгөө → 400', async () => {
    asAdmin([P.EMPLOYEE_TERMINATE], USER.id);
    await expect(terminate()).rejects.toThrow(BadRequestException);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('terminate: амжилт — ban → TERMINATED, өрөө, хэрэглэгч идэвхгүй, урилга хүчингүй, аудит, cache', async () => {
    const res = await terminate({ reason: 'OTHER', note: 'гэрээ' });
    expectTenantTx(s.tx, 't1');
    expect(userAdmin.setBanned).toHaveBeenCalledWith(USER.authId, true);
    expect(site.releaseOnTermination).toHaveBeenCalledWith(expect.anything(), 't1', 'e1', TODAY);
    const upd = s.tx.hrEmployee.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: 'e1', tenantId: 't1', status: { not: 'TERMINATED' } });
    expect(upd.data).toMatchObject({ status: 'TERMINATED', terminationReason: 'OTHER', terminationNote: 'гэрээ' });
    expect(s.tx.coreUser.updateMany).toHaveBeenCalledWith({ where: { id: USER.id, tenantId: 't1' }, data: { isActive: false } });
    expect(s.tx.coreUserInvite.updateMany.mock.calls[0][0].where).toMatchObject({ userId: USER.id, usedAt: null, revokedAt: null });
    const audit = s.tx.campAuditLog.createMany.mock.calls[0][0].data;
    expect(audit.map((a: { action: string; entityType: string }) => `${a.entityType}:${a.action}`)).toEqual(['employee:TERMINATE', 'user_account:DEACTIVATE']);
    expect(audit[0].summaryKey).toBe('audit.employee.terminate');
    expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
    // №3 (Блок 6б): membership cache шууд цэвэрлэгдэнэ
    expect(tenantCache.invalidateMember).toHaveBeenCalledWith('t1', USER.authId);
    expect(res).toMatchObject({ status: 'TERMINATED', departureRecorded: false, roomsClosed: 1, userDeactivated: true });
  });

  it('SEC-009: Кемп админ системийн админы (ADMIN) ажилтныг ажлаас гаргахад нэвтрэх эрхийг хаахгүй → 403, ban хийхгүй', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValue(emp({ user: { ...USER, role: 'ADMIN' } }));
    await expect(terminate()).rejects.toThrow(/зөвхөн системийн админ/);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('terminate: нэвтрэх эрхгүй / идэвхгүй хэрэглэгч → ban хийхгүй', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValue(emp({ userId: null, user: null }));
    const res = await terminate();
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
    expect(s.tx.coreUser.updateMany).not.toHaveBeenCalled();
    expect(res.userDeactivated).toBe(false);
  });

  it('terminate: DB transaction унавал ban-ийг буцаана', async () => {
    site.releaseOnTermination.mockRejectedValueOnce(new Error('boom'));
    await expect(terminate()).rejects.toThrow('boom');
    expect(userAdmin.setBanned.mock.calls).toEqual([[USER.authId, true], [USER.authId, false]]);
    expect(s.cache.invalidateTenant).not.toHaveBeenCalled();
  });

  const old = (over: Record<string, unknown> = {}) => ({
    id: 'e1', employeeCode: 'SH1', fullName: 'Бат', status: CampEmployeeStatus.TERMINATED, organizationId: 'o1', departmentId: 'd1', crewId: null,
    positionId: null, position: null, mealLocationId: null, mealsIncluded: null, phone: '99112233', email: null, userId: USER.id,
    user: { ...USER, isActive: false }, rehiredAs: [], ...over,
  });

  it('rehire: идэвхтэй ажилтан → 409; аль хэдийн дахин авсан → 409', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce(old({ status: CampEmployeeStatus.ACTIVE }));
    await expect(svc.rehire('t1', 'a1', 'c1', 'e1', {})).rejects.toThrow(ConflictException);
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce(old({ rehiredAs: [{ employeeCode: 'SH1' }] }));
    await expect(svc.rehire('t1', 'a1', 'c1', 'e1', {})).rejects.toThrow(/SH1/);
    expect(s.tx.hrEmployee.create).not.toHaveBeenCalled();
  });

  it('rehire: ижил код (TERMINATED-ээс бусдыг шалгана), хэрэглэгч шилжинэ — эрх цэвэрлэнэ, идэвхжинэ, ban арилна', async () => {
    s.tx.hrEmployee.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      'employeeCode' in args.where ? null : old(),
    );
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrEmployee.create.mockResolvedValueOnce({ id: 'e2', employeeCode: 'SH1', fullName: 'Бат', status: 'ACTIVE', userId: USER.id, rehiredFromId: 'e1' });
    const res = await svc.rehire('t1', 'a1', 'c1', 'e1', {});
    const dupCheck = s.tx.hrEmployee.findFirst.mock.calls.find((c) => 'employeeCode' in c[0].where)![0].where;
    expect(dupCheck).toMatchObject({ employeeCode: 'SH1', status: { not: 'TERMINATED' } });
    expect(userAdmin.setBanned).toHaveBeenCalledWith(USER.authId, false);
    expect(s.tx.hrEmployee.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { userId: null } });
    expect(s.tx.campUserPermission.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', userId: USER.id } });
    expect(s.tx.campUserRole.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', userId: USER.id } });
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data).toMatchObject({ employeeCode: 'SH1', rehiredFromId: 'e1', userId: USER.id, phone: '99112233' });
    expect(s.tx.coreUser.updateMany).toHaveBeenCalledWith({ where: { id: USER.id, tenantId: 't1' }, data: { isActive: true } });
    const audit = s.tx.campAuditLog.createMany.mock.calls[0][0].data;
    expect(audit[0]).toMatchObject({ entityId: 'e2', action: CampAuditAction.REHIRE, summaryKey: 'audit.employee.rehire' });
    expect(res).toMatchObject({ id: 'e2', rehiredFromId: 'e1', userTransferred: true });
  });

  it('rehire: transferUser=false → хэрэглэгчид хүрэхгүй', async () => {
    s.tx.hrEmployee.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => ('employeeCode' in args.where ? null : old()));
    s.tx.coreOrganization.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrDepartment.findFirst.mockResolvedValue({ isActive: true });
    s.tx.hrEmployee.create.mockResolvedValueOnce({ id: 'e2', employeeCode: 'SH1', fullName: 'Бат', status: 'ACTIVE', userId: null, rehiredFromId: 'e1' });
    await svc.rehire('t1', 'a1', 'c1', 'e1', { transferUser: false });
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
    expect(s.tx.campUserRole.deleteMany).not.toHaveBeenCalled();
    expect(s.tx.hrEmployee.create.mock.calls[0][0].data.userId).toBeNull();
  });

  it('profile: PII лог (атом INSERT … WHERE NOT EXISTS, 15 мин), can-флаг', async () => {
    asAdmin([P.EMPLOYEE_MANAGE]);
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce({
      id: 'e1', employeeCode: 'SH1', fullName: 'Бат', phone: '99112233', terminatedAt: null, userId: null, user: null, rehiredFrom: null, rehiredAs: [],
    });
    const p = await svc.profile('t1', 'a1', 'c1', 'e1');
    const raw = s.tx.$executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));
    const log = raw.find((q) => q.includes('INSERT INTO camp_pii_access_log'));
    expect(log).toMatch(/WHERE NOT EXISTS/);
    expect(log).toMatch(/now\(\) - make_interval/);
    expect(p.can).toEqual({ terminate: false, viewPiiLog: false });
    expect(p.attendance.inCampSince).toBeNull();
  });

  it('piiViews (SEC-009): зөвхөн системийн админ — Кемп админ (roles.manage) ч 403', async () => {
    asAdmin([P.EMPLOYEE_MANAGE, P.EMPLOYEE_TERMINATE]);
    await expect(svc.piiViews('t1', 'a1', 'c1', 'e1', {})).rejects.toThrow(ForbiddenException);
    asAdmin([P.ROLES_MANAGE]);
    await expect(svc.piiViews('t1', 'a1', 'c1', 'e1', {})).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { userId: 'cu-admin', role: UserRole.ADMIN });
    s.tx.campPiiAccessLog.findMany.mockResolvedValueOnce([{ id: 'l1', viewerUserId: 'cu-admin', context: 'profile', viewedAt: new Date() }]);
    expect((await svc.piiViews('t1', 'a1', 'c1', 'e1', {})).data).toHaveLength(1);
  });
});

describe('HrEmployeesService — ажлаас гарсан бүртгэл (v0.2.2 Блок 5)', () => {
  let s: ReturnType<typeof setup>;
  let svc: HrEmployeesService;
  beforeEach(() => {
    s = setup();
    svc = new HrEmployeesService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.EMPLOYEE_MANAGE] }] });
    s.tx.camp.findFirst.mockResolvedValue({ id: 'c1' });
  });

  it('update: TERMINATED → 409 (засахгүй)', async () => {
    s.tx.hrEmployee.findFirst.mockResolvedValueOnce({ id: 'e1', status: 'TERMINATED' });
    await expect(svc.update('t1', 'a1', 'c1', 'e1', { fullName: 'X' })).rejects.toThrow(ConflictException);
    expect(s.tx.hrEmployee.update).not.toHaveBeenCalled();
  });

  it('bulkUpdate: TERMINATED орсон бол 409', async () => {
    s.tx.hrEmployee.findMany.mockResolvedValueOnce([{ id: 'e1', status: 'ACTIVE' }, { id: 'e2', status: 'TERMINATED' }]);
    await expect(svc.bulkUpdate('t1', 'a1', 'c1', { ids: ['e1', 'e2'], mealsIncluded: true })).rejects.toThrow(ConflictException);
    expect(s.tx.hrEmployee.updateMany).not.toHaveBeenCalled();
  });

  it('list: анхдагчаар TERMINATED-гүй; status=TERMINATED шүүлтээр л', async () => {
    await svc.list('t1', 'a1', 'c1', {});
    expect(s.tx.hrEmployee.findMany.mock.calls[0][0].where.status).toEqual({ not: 'TERMINATED' });
    await svc.list('t1', 'a1', 'c1', { status: CampEmployeeStatus.TERMINATED });
    expect(s.tx.hrEmployee.findMany.mock.calls[1][0].where.status).toBe('TERMINATED');
  });
});
