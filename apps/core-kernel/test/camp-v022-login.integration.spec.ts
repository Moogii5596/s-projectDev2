/**
 * v0.2.2 Блок 2 — нэвтрэх нэр (утас / username), ажилтан ↔ хэрэглэгч, албан тушаалын загвар (D-10, D-11, D-13).
 * Бодит PostgreSQL + app_user (RLS). GoTrue шаардахгүй (sign-in-ийн хэрэглэгч хайлт = findLoginUser).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CAMP_PERMISSIONS as P } from '../src/modules/camp/common/camp-permissions';
import { CampRbacService } from '../src/modules/camp/rbac/camp-rbac.service';
import { CampEmployeeLoginService } from '../src/modules/camp/rbac/camp-employee-login.service';
import { SignInService } from '../src/auth/sign-in.service';
import { DEFAULT_TENANT_SECURITY_POLICY } from '../src/auth/tenant-security-policy.service';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

const cache = { buildKey: (...p: string[]) => p.join(':'), get: async () => null, set: async () => undefined, del: async () => undefined, invalidateTenant: async () => undefined };
const tenantCache = { invalidateMember: async () => undefined, getTenantId: async () => null };

describe('v0.2.2 Блок 2 — нэвтрэх нэр, ажилтан ↔ хэрэглэгч (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(rls as never, access);
  const rbac = new CampRbacService(rls as never, access, audit);
  const login = new CampEmployeeLoginService(rls as never, access, audit, tenantCache as never);
  const securityPolicy = { get: async () => DEFAULT_TENANT_SECURITY_POLICY };
  const signIn = new SignInService({ get: () => undefined } as never, admin as never, tenantCache as never, securityPolicy as never, {} as never);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let t: string;
  let tB: string;
  let camp: string;
  let camp2: string;
  let posCook: string;
  let posMgr: string;
  const ownerAuth = randomUUID();
  const role: Record<string, string> = {};
  const u: Record<string, string> = {};
  const emp: Record<string, string> = {};

  const mkUser = async (tenantId: string, k: string, r: UserRole = UserRole.REQUESTER, authId = randomUUID()) => {
    u[k] = (await admin.coreUser.create({ data: { tenantId, authId, email: `${k}-${sfx}@it.test`, role: r } })).id;
  };
  const effective = async (k: string) =>
    [...new Set((await admin.coreUserPermission.findMany({ where: { userId: u[k] }, select: { permissionCode: true, campId: true } }))
      .map((r) => `${r.permissionCode}@${r.campId === camp ? 'C1' : r.campId === camp2 ? 'C2' : '*'}`))].sort();
  const roleRows = async (k: string) =>
    (await admin.coreUserRole.findMany({ where: { userId: u[k] }, select: { roleId: true, campId: true, sourcePositionId: true } }))
      .map((r) => `${Object.keys(role).find((c) => role[c] === r.roleId)}@${r.campId === camp ? 'C1' : r.campId === camp2 ? 'C2' : '*'}${r.sourcePositionId ? ' (auto)' : ''}`).sort();

  beforeAll(async () => {
    for (const s of ['v022la', 'v022lb']) tenantIds.push((await admin.tenant.create({ data: { slug: `${s}-${sfx}`, name: s } })).id);
    [t, tB] = tenantIds;
    camp = (await admin.camp.create({ data: { tenantId: t, code: 'C1', name: 'C1' } })).id;
    camp2 = (await admin.camp.create({ data: { tenantId: t, code: 'C2', name: 'C2' } })).id;
    await mkUser(t, 'owner', UserRole.OWNER, ownerAuth);
    for (const k of ['bat', 'wang', 'dup', 'num']) await mkUser(t, k);
    await mkUser(tB, 'other');
    for (const r of await admin.coreRole.findMany({ where: { tenantId: t }, select: { id: true, systemCode: true } })) if (r.systemCode) role[r.systemCode] = r.id;
    posCook = (await admin.hrPosition.create({ data: { tenantId: t, name: `Тогооч ${sfx}` } })).id;
    posMgr = (await admin.hrPosition.create({ data: { tenantId: t, name: `Менежер ${sfx}` } })).id;
    await rbac.setPositionTemplates(t, ownerAuth, posCook, { templates: [{ roleId: role.EMPLOYEE, scope: 'EMPLOYEE_CAMP' }] });
    await rbac.setPositionTemplates(t, ownerAuth, posMgr, { templates: [{ roleId: role.CAMP_MANAGER, scope: 'EMPLOYEE_CAMP' }, { roleId: role.EMPLOYEE, scope: 'ALL_CAMPS' }] });
    const org = await admin.coreOrganization.create({ data: { tenantId: t, name: `Org ${sfx}`, orgType: 'CONTRACTOR' } });
    const dept = await admin.hrDepartment.create({ data: { tenantId: t, campId: camp, code: 'D1', name: `Dept ${sfx}` } });
    const mk = async (k: string, code: string, phone: string | null, positionId: string | null) => {
      emp[k] = (await admin.hrEmployee.create({
        data: { tenantId: t, campId: camp, organizationId: org.id, departmentId: dept.id, employeeCode: code, fullName: k, phone, positionId },
      })).id;
    };
    await mk('bat', `B-${sfx}`, '+976 9911-2233', posCook);
    await mk('wang', `WANG${sfx}`, '+86 138 0013 8000', posCook);
    await mk('dup', `D-${sfx}`, '99112233', null); // bat-тай ижил утас
    await mk('num', `7${sfx.replace(/[^0-9]/g, '1').slice(0, 7).padEnd(7, '1')}`, null, null);
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  it('холбох: Монгол утас → phone; албан тушаалын загвар (trigger) → автомат олголт + эрх', async () => {
    const r = await login.link(t, ownerAuth, camp, emp.bat, u.bat);
    expect(r).toMatchObject({ userId: u.bat, phone: '99112233', username: null });
    expect(await roleRows('bat')).toEqual(['EMPLOYEE@C1 (auto)']);
    expect(await effective('bat')).toEqual([`${P.MAINTENANCE_CREATE}@C1`]);
    expect((await signIn.findLoginUser(t, { kind: 'phone', value: '99112233' }))?.email).toBe(`bat-${sfx}@it.test`);
  });

  it('гадаад утас → username (ажилтны кодоос, жижиг үсэг); давхардсан утас → username', async () => {
    const w = await login.link(t, ownerAuth, camp, emp.wang, u.wang);
    expect(w).toMatchObject({ phone: null, username: `wang${sfx}`.toLowerCase() });
    const d = await login.link(t, ownerAuth, camp, emp.dup, u.dup);
    expect(d.phone).toBeNull();
    expect(d.username).toBe(`d-${sfx}`.toLowerCase());
    expect((await signIn.findLoginUser(t, { kind: 'username', value: `wang${sfx}`.toLowerCase() }))?.email).toBe(`wang-${sfx}@it.test`);
  });

  it('тоон username утас шиг харагдвал: утсаар олдохгүй → username-аар', async () => {
    const n = await login.link(t, ownerAuth, camp, emp.num, u.num);
    expect(n.username).toMatch(/^7[0-9]{7}$/);
    const found = await signIn.findLoginUser(t, { kind: 'phone', value: n.username! });
    expect(found?.email).toBe(`num-${sfx}@it.test`);
  });

  it('албан тушаал солих: зөвхөн автомат олголт солигдоно, гараар олгосон роль + шууд эрх хадгалагдана; preview = бодит', async () => {
    await rbac.assignUserRole(t, ownerAuth, { userId: u.bat, roleId: role.CATERING_ADMIN, campId: camp2 });
    await rbac.grantDirectPermission(t, ownerAuth, u.bat, { permissionCode: P.REPORT_VIEW, campId: null });
    const preview = await login.positionPreview(t, ownerAuth, camp, emp.bat, posMgr);
    const before = await effective('bat');
    await admin.hrEmployee.update({ where: { id: emp.bat }, data: { positionId: posMgr } }); // ажилтан засах / импорт ч мөн trigger
    expect(await roleRows('bat')).toEqual(['CAMP_MANAGER@C1 (auto)', 'CATERING_ADMIN@C2', 'EMPLOYEE@* (auto)']);
    const after = await effective('bat');
    const fmt = (x: { permissionCode: string; campId: string | null }) => `${x.permissionCode}@${x.campId === camp ? 'C1' : x.campId === camp2 ? 'C2' : '*'}`;
    expect(after.filter((k) => !before.includes(k)).sort()).toEqual(preview.add.map(fmt).sort());
    expect(before.filter((k) => !after.includes(k)).sort()).toEqual(preview.remove.map(fmt).sort());
    expect(after).toContain(`${P.REPORT_VIEW}@*`);
    expect(after).toContain(`${P.MEAL_ACCEPT}@C2`);
    // албан тушаалгүй → автомат бүгд хасагдана
    await admin.hrEmployee.update({ where: { id: emp.bat }, data: { positionId: null } });
    expect(await roleRows('bat')).toEqual(['CATERING_ADMIN@C2']);
  });

  it('албан тушаалын загвар өөрчлөөд apply → тухайн албан тушаалтай бүх хэрэглэгчид', async () => {
    await rbac.setPositionTemplates(t, ownerAuth, posCook, { templates: [{ roleId: role.CAMP_MANAGER, scope: 'ALL_CAMPS' }] });
    expect(await roleRows('wang')).toEqual(['EMPLOYEE@C1 (auto)']); // автоматаар биш
    expect(await login.applyPositionTemplates(t, ownerAuth, posCook)).toEqual({ positionId: posCook, users: 1 });
    expect(await roleRows('wang')).toEqual(['CAMP_MANAGER@* (auto)']);
  });

  it('салгах → автомат олголт хасагдана; давхар холбох → 409; идэвхгүй хэрэглэгч → 400; өөр tenant → 400', async () => {
    await expect(login.link(t, ownerAuth, camp, emp.wang, u.dup)).rejects.toThrow(ConflictException);
    await login.link(t, ownerAuth, camp, emp.wang, null);
    expect(await roleRows('wang')).toEqual([]);
    await expect(login.link(t, ownerAuth, camp, emp.wang, u.dup)).rejects.toThrow(ConflictException); // dup өөр ажилтантай
    await expect(login.link(t, ownerAuth, camp, emp.wang, u.other)).rejects.toThrow(BadRequestException);
    await admin.coreUser.update({ where: { id: u.wang }, data: { isActive: false } });
    await expect(login.link(t, ownerAuth, camp, emp.wang, u.wang)).rejects.toThrow(BadRequestException);
  });

  it('нэвтрэх хайлт: идэвхгүй хэрэглэгч олдохгүй; өөр tenant-ийн утас олдохгүй; DB давтагдашгүй (идэвхтэй дунд)', async () => {
    expect(await signIn.findLoginUser(t, { kind: 'username', value: `wang${sfx}`.toLowerCase() })).toBeNull();
    expect(await signIn.findLoginUser(tB, { kind: 'phone', value: '99112233' })).toBeNull();
    await expect(admin.coreUser.update({ where: { id: u.dup }, data: { phone: '99112233' } })).rejects.toThrow();
    // идэвхгүй хэрэглэгчийн утсыг шинэ хүнд өгч болно
    await admin.coreUser.update({ where: { id: u.bat }, data: { isActive: false } });
    await admin.coreUser.update({ where: { id: u.dup }, data: { phone: '99112233' } });
    expect((await signIn.findLoginUser(t, { kind: 'phone', value: '99112233' }))?.email).toBe(`dup-${sfx}@it.test`);
  });
});
