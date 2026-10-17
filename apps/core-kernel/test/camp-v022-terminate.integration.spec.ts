/**
 * v0.2.2 Блок 5 — ажлаас гаргах (D-07), дахин ажилд авах (Q-C, Q-C2), профайл + PII лог (D-08, B5-Q6).
 * Бодит PostgreSQL + app_user (RLS). GoTrue шаардахгүй: service-ийг шууд дуудна, ban (`UserAdminService.setBanned`) = mock.
 * Шалгах: нэг transaction (явалт + өрөө + төлөв + хэрэглэгч + аудит), алдаа гарвал бүгд буцна, tenant тусгаарлалт,
 * partial unique код, триггерээр эрх дахин олгогдох, PII лог (15 мин, зөвхөн нэмэх).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampEmployeeStatus, PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CAMP_PERMISSIONS as P } from '../src/modules/camp/common/camp-permissions';
import { addDays, todayUb } from '../src/modules/camp/common/camp-date';
import { fromDbDate, inTenantTx, toDbDate } from '../src/modules/camp/common/camp-tx';
import { CampStayStore } from '../src/modules/camp/attendance/camp-stays.service';
import { CampEmployeeSite } from '../src/modules/camp/attendance/camp-employee-site';
import { HrAttendanceHooks } from '../src/modules/hr/attendance/stay-store';
import { loadPlannerState } from '../src/modules/hr/attendance/attendance-state';
import { HrEmployeeHooks } from '../src/modules/hr/employees/employee-hooks';
import { HrEmployeesService } from '../src/modules/hr/employees/hr-employees.service';
import { HrEmployeeLifecycleService } from '../src/modules/hr/employees/hr-employee-lifecycle.service';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

const cache = {
  buildKey: (...p: string[]) => p.join(':'),
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
  invalidateTenant: async () => undefined,
};

describe('v0.2.2 Блок 5 — ажлаас гаргах, дахин ажилд авах, PII лог (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(rls as never, access);
  const attendanceHooks = new HrAttendanceHooks();
  attendanceHooks.registerStayStore(new CampStayStore());
  const employeeHooks = new HrEmployeeHooks();
  const site = new CampEmployeeSite();
  employeeHooks.registerSitePort(site);
  const userAdmin = { setBanned: vi.fn().mockResolvedValue(undefined) };
  const employees = new HrEmployeesService(rls as never, access, audit);
  const svc = new HrEmployeeLifecycleService(rls as never, access, audit, employees, attendanceHooks, employeeHooks, userAdmin as never);

  const sfx = randomUUID().slice(0, 8);
  const TODAY = todayUb();
  const D = addDays(TODAY, -1);
  const tenantIds: string[] = [];
  let tA: string;
  let tB: string;
  let c1: string;
  let room: string;
  let base: { organizationId: string; departmentId: string };
  let positionId: string;
  const auth = { owner: randomUUID(), campAdmin: randomUUID(), hrOnly: randomUUID(), ownerB: randomUUID(), emp: randomUUID() };
  const user: Record<string, string> = {};

  const mkTenant = async (slug: string) => {
    const t = await admin.tenant.create({ data: { slug: `${slug}-${sfx}`, name: slug } });
    tenantIds.push(t.id);
    return t.id;
  };
  const mkUser = async (tenantId: string, key: string, r: UserRole, authId: string) => {
    user[key] = (await admin.coreUser.create({ data: { tenantId, authId, email: `${key}-${sfx}@it.test`, role: r, fullName: key } })).id;
  };
  const grantRole = async (key: string, systemCode: 'CAMP_ADMIN' | 'CATERING_ADMIN') => {
    const r = await admin.campRole.findFirstOrThrow({ where: { tenantId: tA, systemCode } });
    await admin.campUserRole.create({ data: { tenantId: tA, userId: user[key], roleId: r.id, campId: c1 } });
  };
  const mkEmployee = async (code: string, over: Record<string, unknown> = {}) =>
    (await admin.hrEmployee.create({ data: { tenantId: tA, campId: c1, ...base, employeeCode: code, fullName: `Ажилтан ${code}`, ...over } })).id;
  /** Ирэлт + нээлттэй stay (trigger: ARRIVAL, огноо таарна) */
  const arrive = async (employeeId: string, date: string) => {
    const m = await admin.hrMovement.create({ data: { tenantId: tA, campId: c1, employeeId, movementDate: toDbDate(date), direction: 'ARRIVAL', kind: 'OFF_ROSTER', meals: [] } });
    await admin.campStay.create({ data: { tenantId: tA, campId: c1, employeeId, arrivalMovementId: m.id, startDate: toDbDate(date) } });
  };
  const perms = async (userId: string) =>
    (await admin.campUserPermission.findMany({ where: { tenantId: tA, userId }, select: { permissionCode: true, source: true } }))
      .map((p) => `${p.source}:${p.permissionCode}`).sort();

  beforeAll(async () => {
    tA = await mkTenant('v022t');
    tB = await mkTenant('v022tb');
    c1 = (await admin.camp.create({ data: { tenantId: tA, code: 'C1', name: 'Camp 1' } })).id;
    const org = await admin.coreOrganization.create({ data: { tenantId: tA, name: `Org ${sfx}`, orgType: 'MAIN' } });
    const dept = await admin.hrDepartment.create({ data: { tenantId: tA, campId: c1, code: 'D1', name: 'D1' } });
    base = { organizationId: org.id, departmentId: dept.id };
    const b = await admin.campBuilding.create({ data: { tenantId: tA, campId: c1, code: 'B1', name: 'Байр 1' } });
    room = (await admin.campRoom.create({ data: { tenantId: tA, campId: c1, buildingId: b.id, roomNo: '101', capacity: 4 } })).id;
    await mkUser(tA, 'owner', UserRole.OWNER, auth.owner);
    await mkUser(tA, 'campAdmin', UserRole.REQUESTER, auth.campAdmin);
    await mkUser(tA, 'hrOnly', UserRole.REQUESTER, auth.hrOnly);
    await mkUser(tA, 'emp', UserRole.REQUESTER, auth.emp);
    await mkUser(tB, 'ownerB', UserRole.OWNER, auth.ownerB);
    await grantRole('campAdmin', 'CAMP_ADMIN');
    await grantRole('hrOnly', 'CATERING_ADMIN');
    const employeeRole = await admin.campRole.findFirstOrThrow({ where: { tenantId: tA, systemCode: 'EMPLOYEE' } });
    positionId = (await admin.hrPosition.create({ data: { tenantId: tA, name: `Жолооч ${sfx}` } })).id;
    await admin.campPositionRoleTemplate.create({ data: { tenantId: tA, positionId, roleId: employeeRole.id, scope: 'EMPLOYEE_CAMP' } });
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  it('seed: каталогт camp.employee.terminate; Кемп админ загвар + олголтод (TEMPLATE), катеринг админд үгүй', async () => {
    expect(await admin.campPermission.findUnique({ where: { code: P.EMPLOYEE_TERMINATE } })).not.toBeNull();
    expect(await perms(user.campAdmin)).toContain(`TEMPLATE:${P.EMPLOYEE_TERMINATE}`);
    expect(await perms(user.hrOnly)).not.toContain(`TEMPLATE:${P.EMPLOYEE_TERMINATE}`);
  });

  it('terminate: кемпэд байсан ажилтан — явалт, өрөө, төлөв, хэрэглэгч, урилга, аудит НЭГ transaction-д', async () => {
    const e1 = await mkEmployee('SH1', { positionId, userId: user.emp });
    await admin.campUserPermission.create({ data: { tenantId: tA, userId: user.emp, permissionCode: P.REPORT_VIEW, campId: c1, source: 'DIRECT' } });
    expect(await perms(user.emp)).toEqual([`DIRECT:${P.REPORT_VIEW}`, `TEMPLATE:${P.MAINTENANCE_CREATE}`]);
    await arrive(e1, addDays(D, -4));
    await admin.campRoomAllocation.create({ data: { tenantId: tA, campId: c1, roomId: room, employeeId: e1, startDate: toDbDate(addDays(D, -10)) } });
    await admin.coreUserInvite.create({ data: { tenantId: tA, userId: user.emp, tokenHash: 'a'.repeat(64), purpose: 'INVITE', channel: 'LINK', expiresAt: new Date(Date.now() + 3600_000) } });

    await expect(svc.terminate(tA, auth.hrOnly, c1, e1, { date: D, reason: 'RESIGNED' })).rejects.toThrow(ForbiddenException);
    const res = await svc.terminate(tA, auth.campAdmin, c1, e1, { date: D, reason: 'OTHER', note: 'Гэрээ дууссан' });
    expect(res).toMatchObject({ status: 'TERMINATED', terminatedAt: D, departureRecorded: true, roomsClosed: 1, roomsRemoved: 0, userDeactivated: true });
    expect(userAdmin.setBanned).toHaveBeenCalledWith(auth.emp, true);

    const e = await admin.hrEmployee.findUniqueOrThrow({ where: { id: e1 } });
    expect(e).toMatchObject({ status: 'TERMINATED', terminationReason: 'OTHER', terminationNote: 'Гэрээ дууссан', userId: user.emp });
    expect(fromDbDate(e.terminatedAt!)).toBe(D);
    const stay = await admin.campStay.findFirstOrThrow({ where: { employeeId: e1 } });
    expect(stay.endDate && fromDbDate(stay.endDate)).toBe(D);
    expect(await admin.hrMovement.count({ where: { employeeId: e1, direction: 'DEPARTURE', movementDate: toDbDate(D) } })).toBe(1);
    const alloc = await admin.campRoomAllocation.findFirstOrThrow({ where: { employeeId: e1 } });
    expect(alloc.endDate && fromDbDate(alloc.endDate)).toBe(addDays(D, -1));
    expect((await admin.coreUser.findUniqueOrThrow({ where: { id: user.emp } })).isActive).toBe(false);
    expect((await admin.coreUserInvite.findFirstOrThrow({ where: { userId: user.emp } })).revokedAt).not.toBeNull();
    const trail = await admin.campAuditLog.findMany({ where: { tenantId: tA, entityId: { in: [e1, user.emp] } }, orderBy: { createdAt: 'asc' } });
    expect(trail.map((t) => `${t.entityType}:${t.action}`)).toEqual(['employee:TERMINATE', 'user_account:DEACTIVATE']);

    await expect(svc.terminate(tA, auth.campAdmin, c1, e1, { date: D, reason: 'RESIGNED' })).rejects.toThrow(ConflictException);
    await expect(employees.update(tA, auth.campAdmin, c1, e1, { fullName: 'X' })).rejects.toThrow(ConflictException);
    const list = await employees.list(tA, auth.campAdmin, c1, {});
    expect(list.data.map((r) => r.id)).not.toContain(e1);
    expect((await employees.list(tA, auth.campAdmin, c1, { status: CampEmployeeStatus.TERMINATED })).data.map((r) => r.id)).toEqual([e1]);
  });

  it('terminate: огнооноос хойш ирц → 409, юу ч өөрчлөгдөхгүй, ban хийхгүй', async () => {
    const e2 = await mkEmployee('SH2');
    await arrive(e2, TODAY);
    userAdmin.setBanned.mockClear();
    await expect(svc.terminate(tA, auth.campAdmin, c1, e2, { date: D, reason: 'RESIGNED' })).rejects.toThrow(ConflictException);
    expect((await admin.hrEmployee.findUniqueOrThrow({ where: { id: e2 } })).status).toBe('ACTIVE');
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('terminate: transaction дунд алдаа → явалт, төлөв, хэрэглэгч бүгд буцна (атом), ban буцаагдана', async () => {
    await mkUser(tA, 'emp3', UserRole.REQUESTER, randomUUID());
    const e3 = await mkEmployee('SH3', { userId: user.emp3 });
    await arrive(e3, addDays(D, -2));
    const spy = vi.spyOn(site, 'releaseOnTermination').mockRejectedValueOnce(new Error('өрөөний алдаа'));
    userAdmin.setBanned.mockClear();
    await expect(svc.terminate(tA, auth.campAdmin, c1, e3, { date: D, reason: 'DISMISSED' })).rejects.toThrow('өрөөний алдаа');
    spy.mockRestore();
    expect((await admin.hrEmployee.findUniqueOrThrow({ where: { id: e3 } })).status).toBe('ACTIVE');
    expect(await admin.hrMovement.count({ where: { employeeId: e3, direction: 'DEPARTURE' } })).toBe(0);
    expect((await admin.campStay.findFirstOrThrow({ where: { employeeId: e3 } })).endDate).toBeNull();
    expect((await admin.coreUser.findUniqueOrThrow({ where: { id: user.emp3 } })).isActive).toBe(true);
    expect(userAdmin.setBanned.mock.calls.map((c) => c[1])).toEqual([true, false]);
  });

  it('RLS: өөр tenant-ийн actor → ажилтан олдохгүй; app_user tenant B-д A-ийн мөр харагдахгүй', async () => {
    const e4 = await mkEmployee('SH4');
    await expect(svc.terminate(tB, auth.ownerB, c1, e4, { date: D, reason: 'RESIGNED' })).rejects.toThrow(NotFoundException);
    await expect(svc.profile(tB, auth.ownerB, c1, e4)).rejects.toThrow(NotFoundException);
    const seen = await inTenantTx(rls as never, tB, (tx) => tx.hrEmployee.count({ where: { id: e4 } }));
    expect(seen).toBe(0);
  });

  it('Q-C2 + rehire: ижил кодоор шинэ бүртгэл, хэрэглэгч шилжинэ (шууд эрх цэвэрлэгдэж, загвараас дахин), давхар → 409', async () => {
    const old = await admin.hrEmployee.findFirstOrThrow({ where: { tenantId: tA, employeeCode: 'SH1' } });
    userAdmin.setBanned.mockClear();
    await expect(svc.rehire(tA, auth.hrOnly, c1, old.id, {})).rejects.toThrow(ForbiddenException);
    const res = await svc.rehire(tA, auth.campAdmin, c1, old.id, {});
    expect(res).toMatchObject({ employeeCode: 'SH1', rehiredFromId: old.id, userId: user.emp, userTransferred: true });
    expect(userAdmin.setBanned).toHaveBeenCalledWith(auth.emp, false);
    const fresh = await admin.hrEmployee.findUniqueOrThrow({ where: { id: res.id } });
    expect(fresh).toMatchObject({ status: 'ACTIVE', positionId, userId: user.emp, rehiredFromId: old.id, terminatedAt: null });
    expect((await admin.hrEmployee.findUniqueOrThrow({ where: { id: old.id } })).userId).toBeNull();
    expect((await admin.coreUser.findUniqueOrThrow({ where: { id: user.emp } })).isActive).toBe(true);
    expect(await perms(user.emp)).toEqual([`TEMPLATE:${P.MAINTENANCE_CREATE}`]);

    await expect(svc.rehire(tA, auth.campAdmin, c1, old.id, {})).rejects.toThrow(ConflictException);
    await expect(employees.create(tA, auth.campAdmin, c1, { ...base, employeeCode: 'SH1', fullName: 'Давхар' })).rejects.toThrow(ConflictException);
    // DB түвшинд: идэвхтэй хоёр ижил код → partial unique зөрчил; TERMINATED + идэвхтэй → болно (дээр)
    await expect(mkEmployee('SH1')).rejects.toThrow(/uq_camp_employees_code|Unique constraint/);

    // ирцийн planner кодоор TERMINATED биш бүртгэлийг сонгоно
    const state = await inTenantTx(rls as never, tA, (tx) => loadPlannerState(tx, tA, c1, ['SH1'], [TODAY], attendanceHooks.stays));
    expect(state.employees.get('SH1')).toMatchObject({ id: res.id, status: 'ACTIVE' });
  });

  it('profile + PII лог: 15 мин-д 1 мөр; «Хэн үзсэн» зөвхөн camp.roles.manage; app_user засах/устгах эрхгүй', async () => {
    const e = await admin.hrEmployee.findFirstOrThrow({ where: { tenantId: tA, employeeCode: 'SH1', status: 'TERMINATED' } });
    const p1 = await svc.profile(tA, auth.hrOnly, c1, e.id);
    await svc.profile(tA, auth.hrOnly, c1, e.id);
    expect(p1).toMatchObject({ status: 'TERMINATED', terminatedAt: D, terminationReason: 'OTHER', rehiredAs: { employeeCode: 'SH1', status: 'ACTIVE' } });
    expect(p1.rooms[0]).toMatchObject({ roomNo: '101', buildingName: 'Байр 1', endDate: addDays(D, -1) });
    expect(p1.attendance.movements[0]).toMatchObject({ direction: 'DEPARTURE', movementDate: D });
    expect(p1.history.map((h) => h.action)).toContain('TERMINATE');
    expect(p1.can).toEqual({ terminate: false, viewPiiLog: false });
    expect(await admin.campPiiAccessLog.count({ where: { employeeId: e.id } })).toBe(1);
    await admin.campPiiAccessLog.updateMany({ where: { employeeId: e.id }, data: { viewedAt: new Date(Date.now() - 16 * 60_000) } });
    await svc.profile(tA, auth.hrOnly, c1, e.id);
    expect(await admin.campPiiAccessLog.count({ where: { employeeId: e.id } })).toBe(2);

    await expect(svc.piiViews(tA, auth.hrOnly, c1, e.id, {})).rejects.toThrow(ForbiddenException);
    expect((await svc.profile(tA, auth.campAdmin, c1, e.id)).can).toEqual({ terminate: true, viewPiiLog: true });
    expect((await svc.piiViews(tA, auth.owner, c1, e.id, {})).data).toHaveLength(3);
    const views = await svc.piiViews(tA, auth.campAdmin, c1, e.id, {});
    expect(views.data.map((v) => v.viewerName)).toEqual(['campAdmin', 'hrOnly', 'hrOnly']);
    expect(views.data[1]).toMatchObject({ viewerUserId: user.hrOnly, context: 'profile' });

    await expect(inTenantTx(rls as never, tA, (tx) => tx.campPiiAccessLog.deleteMany({ where: { employeeId: e.id } }))).rejects.toThrow(/permission denied/i);
    expect(await inTenantTx(rls as never, tB, (tx) => tx.campPiiAccessLog.count())).toBe(0);
  });
});
