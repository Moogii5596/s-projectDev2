/**
 * v0.2.2 Блок 1 — эрхийн ганц эх сурвалж (camp_user_permissions → v0.2.3 core_user_permissions, ADR-007), загвар хэрэгжүүлэх, шууд эрх, Q9 (ADR-003 §2.4, D-01, D-09).
 * Бодит PostgreSQL + app_user (RLS). GoTrue шаардахгүй: service-ийг шууд дуудна (authId = санамсаргүй UUID).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CAMP_PERMISSIONS as P } from '../src/modules/camp/common/camp-permissions';
import { CampRbacService } from '../src/modules/camp/rbac/camp-rbac.service';
import { buildSnapshot, comparePerms } from '../src/scripts/camp-snapshot';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

/** Cache: үргэлж miss (эрхийг DB-ээс уншина) */
const cache = {
  buildKey: (...p: string[]) => p.join(':'),
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
  invalidateTenant: async () => undefined,
};

describe('v0.2.2 Блок 1 — camp_user_permissions (integration)', () => {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  const rls = new PrismaClient({ datasources: { db: { url: APP_USER_DB_URL } } });
  const access = new CampAccessService(cache as never);
  const audit = new CampAuditService(rls as never, access);
  const svc = new CampRbacService(rls as never, access, audit);

  const sfx = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  let tA: string;
  let tB: string;
  let c1: string;
  let c2: string;
  const auth = { owner: randomUUID(), plain: randomUUID(), ownerB: randomUUID() };
  const user: Record<string, string> = {};
  const role: Record<string, string> = {};

  const mkTenant = async (slug: string) => {
    const t = await admin.tenant.create({ data: { slug: `${slug}-${sfx}`, name: slug } });
    tenantIds.push(t.id);
    return t.id;
  };
  const mkUser = async (tenantId: string, key: string, r: UserRole, authId = randomUUID()) => {
    user[key] = (await admin.coreUser.create({ data: { tenantId, authId, email: `${key}-${sfx}@it.test`, role: r } })).id;
  };
  const effective = async (tenantId: string, userKey: string) => {
    const rows = await admin.coreUserPermission.findMany({ where: { tenantId, userId: user[userKey] }, select: { permissionCode: true, campId: true } });
    return [...new Set(rows.map((r) => `${r.permissionCode}@${r.campId ?? '*'}`))].sort();
  };

  beforeAll(async () => {
    tA = await mkTenant('v022a');
    tB = await mkTenant('v022b');
    c1 = (await admin.camp.create({ data: { tenantId: tA, code: 'C1', name: 'Camp 1' } })).id;
    c2 = (await admin.camp.create({ data: { tenantId: tA, code: 'C2', name: 'Camp 2' } })).id;
    await mkUser(tA, 'owner', UserRole.OWNER, auth.owner);
    await mkUser(tA, 'plain', UserRole.REQUESTER, auth.plain);
    await mkUser(tA, 'u1', UserRole.REQUESTER);
    await mkUser(tA, 'u2', UserRole.REQUESTER);
    await mkUser(tB, 'ownerB', UserRole.OWNER, auth.ownerB);
    const roles = await admin.coreRole.findMany({ where: { tenantId: tA }, select: { id: true, systemCode: true } });
    for (const r of roles) if (r.systemCode) role[r.systemCode] = r.id;
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  it('seed (20261013003): 4 системийн роль; Кемп админд parts + close (Q9); Ажилтан = maintenance.create', async () => {
    expect(Object.keys(role).sort()).toEqual(['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE']);
    const perms = async (code: string) =>
      (await admin.coreRolePermission.findMany({ where: { tenantId: tA, roleId: role[code] }, select: { permissionCode: true } })).map((r) => r.permissionCode);
    expect(await perms('CAMP_ADMIN')).toEqual(expect.arrayContaining([P.MAINTENANCE_PARTS, P.MAINTENANCE_CLOSE]));
    expect(await perms('EMPLOYEE')).toEqual([P.MAINTENANCE_CREATE]);
  });

  it('роль олгох → trigger загварыг хуулна; guard = загвар; 2 роль ижил эрх → нэгийг хасахад нөгөөгийнх үлдэнэ', async () => {
    const a = await svc.assignUserRole(tA, auth.owner, { userId: user.u1, roleId: role.CAMP_MANAGER, campId: c1 });
    await svc.assignUserRole(tA, auth.owner, { userId: user.u1, roleId: role.EMPLOYEE, campId: c1 });
    const tpl = (await admin.coreRolePermission.findMany({ where: { roleId: role.CAMP_MANAGER }, select: { permissionCode: true } })).map((r) => r.permissionCode);
    const actor = await rls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tA}, true)`;
      return access.resolve(tx as never, tA, (await admin.coreUser.findUniqueOrThrow({ where: { id: user.u1 } })).authId);
    });
    expect(actor.perms.global).toEqual([]);
    expect(actor.perms.byCamp[c1]).toEqual([...tpl].sort());
    // maintenance.create хоёр ролиос → 2 мөр; менежерийг хасахад EMPLOYEE-ийнх үлдэнэ
    expect(await admin.coreUserPermission.count({ where: { userId: user.u1, permissionCode: P.MAINTENANCE_CREATE } })).toBe(2);
    await svc.removeUserRole(tA, auth.owner, a.id);
    expect(await effective(tA, 'u1')).toEqual([`${P.MAINTENANCE_CREATE}@${c1}`]);
  });

  it('загвар өөрчлөх → эрх автоматаар өөрчлөгдөхгүй (pendingUsers); preview → apply; DIRECT хадгалагдана', async () => {
    const custom = await svc.createRole(tA, auth.owner, { name: `Туршилт ${sfx}`, permissionCodes: [P.REPORT_VIEW] });
    await svc.assignUserRole(tA, auth.owner, { userId: user.u2, roleId: custom.id, campId: null });
    const direct = await svc.grantDirectPermission(tA, auth.owner, user.u2, { permissionCode: P.MEAL_ORDER, campId: c2 });
    expect(await effective(tA, 'u2')).toEqual([`${P.MEAL_ORDER}@${c2}`, `${P.REPORT_VIEW}@*`]);

    const updated = await svc.setRolePermissions(tA, auth.owner, custom.id, { permissionCodes: [P.HAUL_APPROVE] });
    expect(updated.pendingUsers).toBe(1);
    expect((await svc.listRoles(tA, auth.owner)).find((r) => r.id === custom.id)?.pendingUsers).toBe(1);
    expect(await effective(tA, 'u2')).toEqual([`${P.MEAL_ORDER}@${c2}`, `${P.REPORT_VIEW}@*`]); // өөрчлөгдөөгүй

    const preview = await svc.previewRoleApply(tA, auth.owner, custom.id);
    expect(preview.items).toEqual([expect.objectContaining({ userId: user.u2, add: [P.HAUL_APPROVE], remove: [P.REPORT_VIEW] })]);
    const listed = await svc.listUserPermissions(tA, auth.owner, user.u2);
    expect(listed.assignments).toEqual([expect.objectContaining({ outdated: true, add: [P.HAUL_APPROVE], remove: [P.REPORT_VIEW] })]);

    expect(await svc.applyRoleTemplate(tA, auth.owner, custom.id)).toEqual({ roleId: custom.id, affectedUsers: 1, added: 1, removed: 1 });
    expect(await effective(tA, 'u2')).toEqual([`${P.HAUL_APPROVE}@*`, `${P.MEAL_ORDER}@${c2}`]);
    expect((await svc.applyRoleTemplate(tA, auth.owner, custom.id)).affectedUsers).toBe(0); // idempotent

    // TEMPLATE мөрийг шууд хасахгүй; DIRECT-ийг хасна
    const tplRow = await admin.coreUserPermission.findFirstOrThrow({ where: { userId: user.u2, source: 'TEMPLATE' } });
    await expect(svc.revokeDirectPermission(tA, auth.owner, tplRow.id)).rejects.toThrow(BadRequestException);
    await svc.revokeDirectPermission(tA, auth.owner, direct.id);
    // custom роль устгах → TEMPLATE эрх CASCADE
    await svc.deleteRole(tA, auth.owner, custom.id);
    expect(await effective(tA, 'u2')).toEqual([]);

    const trail = await admin.campAuditLog.findMany({ where: { tenantId: tA, entityType: { in: ['role', 'role_apply', 'user_permission', 'user_role'] } }, select: { summaryKey: true } });
    expect(new Set(trail.map((t) => t.summaryKey))).toEqual(new Set([
      'audit.user_role.create', 'audit.user_role.deactivate', 'audit.user_permission.create', 'audit.user_permission.deactivate',
      'audit.role.update', 'audit.role_apply.update',
    ]));
  });

  it('эрхгүй хэрэглэгч → 403; өөр байгууллага → хэрэглэгч/өгөгдөл харагдахгүй (RLS)', async () => {
    await expect(svc.grantDirectPermission(tA, auth.plain, user.u1, { permissionCode: P.REPORT_VIEW })).rejects.toThrow(ForbiddenException);
    await expect(svc.listUserPermissions(tB, auth.ownerB, user.u1)).rejects.toThrow(NotFoundException);
    // app_user: tenant B-ийн context-оор A-ийн мөр харагдахгүй, бичих боломжгүй
    const seen = await rls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tB}, true)`;
      return tx.coreUserPermission.count({ where: { tenantId: tA } });
    });
    expect(seen).toBe(0);
    await expect(
      rls.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tB}, true)`;
        await tx.coreUserPermission.create({ data: { tenantId: tA, userId: user.u1, permissionCode: P.REPORT_VIEW, source: 'DIRECT' } });
      }),
    ).rejects.toThrow();
  });

  it('pilot.ps1 user (raw SQL insert) → trigger эрхийг хуулна', async () => {
    await admin.$executeRaw`INSERT INTO core_user_roles (tenant_id, user_id, role_id, site_id) VALUES (${tA}::uuid, ${user.plain}::uuid, ${role.CAMP_ADMIN}::uuid, NULL)`;
    const tpl = await admin.coreRolePermission.count({ where: { roleId: role.CAMP_ADMIN } });
    expect(await admin.coreUserPermission.count({ where: { userId: user.plain, source: 'TEMPLATE' } })).toBe(tpl);
  });

  it('албан тушаалын загвар: тавих/унших, өөр байгууллагын роль → 400', async () => {
    const pos = await admin.hrPosition.create({ data: { tenantId: tA, name: `Тогооч ${sfx}` } });
    const res = await svc.setPositionTemplates(tA, auth.owner, pos.id, { templates: [{ roleId: role.EMPLOYEE, scope: 'EMPLOYEE_CAMP' }] });
    expect(res.templates).toEqual([expect.objectContaining({ roleId: role.EMPLOYEE, scope: 'EMPLOYEE_CAMP' })]);
    expect((await svc.getPositionTemplates(tA, auth.owner, pos.id)).templates).toHaveLength(1);
    const roleB = await admin.coreRole.findFirstOrThrow({ where: { tenantId: tB, systemCode: 'EMPLOYEE' } });
    await expect(svc.setPositionTemplates(tA, auth.owner, pos.id, { templates: [{ roleId: roleB.id, scope: 'ALL_CAMPS' }] })).rejects.toThrow(BadRequestException);
  });

  it('snapshot (§5.1): legacy = effective; A = B (эрх өөрчлөгдөөгүй бол)', async () => {
    const opts = { today: '2026-10-12', pastDays: 0, futureDays: 0, tenantSlug: `v022a-${sfx}`, db: 'it' };
    const a = await buildSnapshot(admin, opts);
    const p = a.perms![`v022a-${sfx}`];
    expect(p.effective).toEqual(p.legacy);
    expect(p.campAdmins).toEqual([`${user.plain}|*`]);
    const b = await buildSnapshot(admin, opts);
    expect(comparePerms(a, b)).toEqual([]);
  });
});
