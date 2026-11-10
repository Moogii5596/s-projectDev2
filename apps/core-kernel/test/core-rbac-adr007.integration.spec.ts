/**
 * v0.2.3 Блок 2 — ADR-007: роль, эрх системийн түвшинд (camp_* → core_*, migration 20261106005).
 * Бодит PostgreSQL + app_user (RLS, dual client R16). GoTrue шаардахгүй: service-ийг шууд дуудна.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { CampAccessService } from '../src/modules/camp/common/camp-access.service';
import { CampAuditService } from '../src/modules/camp/common/camp-audit.service';
import { CampRbacService } from '../src/modules/camp/rbac/camp-rbac.service';
import { PERMISSIONS as P, PERMISSION_CODES } from '../src/modules/core/permissions/permission-registry';
import { buildSnapshot, comparePerms } from '../src/scripts/camp-snapshot';
import { ADMIN_DB_URL, APP_USER_DB_URL } from './helpers/db-urls';

const cache = {
  buildKey: (...p: string[]) => p.join(':'),
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
  invalidateTenant: async () => undefined,
};

describe('v0.2.3 Блок 2 — ADR-007 core RBAC (integration)', () => {
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
  const auth = { owner: randomUUID(), u1: randomUUID() };
  const user: Record<string, string> = {};
  const role: Record<string, string> = {};

  const mkTenant = async (slug: string) => {
    const t = await admin.tenant.create({ data: { slug: `${slug}-${sfx}`, name: slug } });
    tenantIds.push(t.id);
    return t.id;
  };
  const asTenant = <T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>) =>
    rls.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });

  beforeAll(async () => {
    tA = await mkTenant('adr7a');
    tB = await mkTenant('adr7b');
    c1 = (await admin.camp.create({ data: { tenantId: tA, code: 'C1', name: 'Camp 1' } })).id;
    user.owner = (await admin.coreUser.create({ data: { tenantId: tA, authId: auth.owner, email: `o-${sfx}@it.test`, role: UserRole.OWNER } })).id;
    user.u1 = (await admin.coreUser.create({ data: { tenantId: tA, authId: auth.u1, email: `u1-${sfx}@it.test`, role: UserRole.REQUESTER } })).id;
    user.b1 = (await admin.coreUser.create({ data: { tenantId: tB, authId: randomUUID(), email: `b1-${sfx}@it.test`, role: UserRole.REQUESTER } })).id;
    for (const r of await admin.coreRole.findMany({ where: { tenantId: tA }, select: { id: true, systemCode: true } })) if (r.systemCode) role[r.systemCode] = r.id;
  });

  afterAll(async () => {
    for (const id of tenantIds) await admin.tenant.delete({ where: { id } }).catch(() => {});
    await admin.$disconnect();
    await rls.$disconnect();
  });

  it('ARC-05 cleanup migration: alias, legacy tables, enum болон хуучин permission код байхгүй', async () => {
    const tables = await admin.$queryRaw<{ name: string; present: boolean }[]>`
      SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
      FROM unnest(ARRAY[
        'legacy_camp_permissions', 'legacy_camp_roles', 'legacy_camp_role_permissions',
        'legacy_camp_user_roles', 'legacy_camp_user_permissions',
        'legacy_camp_position_role_templates', 'core_permission_aliases'
      ]) AS t(name)`;
    expect(tables.filter((table) => table.present).map((table) => table.name)).toEqual([]);
    const roleType = await admin.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampRoleCode') AS present`;
    expect(roleType[0]?.present).toBe(false);
    const stale = await admin.coreUserPermission.count({ where: { permissionCode: { in: ['camp.roles.manage', 'camp.employee.manage', 'camp.employee.terminate', 'camp.movement.import', 'camp.shift.adjust'] } } });
    expect(stale).toBe(0);
    expect(await admin.coreRolePermission.count({ where: { permissionCode: 'camp.roles.manage' } })).toBe(0);
  });

  it('шинэ tenant → 4 системийн роль шинэ кодоор (core_seed_default_roles); Кемп админ 13 эрх, hr.* багтсан', async () => {
    expect(Object.keys(role).sort()).toEqual(['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE']);
    const perms = async (code: string) =>
      (await admin.coreRolePermission.findMany({ where: { tenantId: tA, roleId: role[code] }, select: { permissionCode: true } })).map((r) => r.permissionCode).sort();
    const campAdmin = await perms('CAMP_ADMIN');
    expect(campAdmin).toHaveLength(13);
    expect(campAdmin).toEqual(expect.arrayContaining([P.EMPLOYEE_MANAGE, P.EMPLOYEE_TERMINATE, P.MOVEMENT_IMPORT, P.SHIFT_ADJUST]));
    for (const code of ['CAMP_ADMIN', 'CAMP_MANAGER', 'CATERING_ADMIN', 'EMPLOYEE']) {
      for (const c of await perms(code)) expect(PERMISSION_CODES).toContain(c);
    }
  });

  it('олголт → scope_type (generated): кемптэй = SITE, кемпгүй = TENANT; загварын эрх site_id-тай хуулагдана', async () => {
    await svc.assignUserRole(tA, auth.owner, { userId: user.u1, roleId: role.CAMP_MANAGER, campId: c1 });
    await svc.assignUserRole(tA, auth.owner, { userId: user.u1, roleId: role.EMPLOYEE });
    const rows = await admin.$queryRaw<{ scope_type: string; site_id: string | null }[]>`
      SELECT scope_type, site_id::text FROM core_user_roles WHERE user_id = ${user.u1}::uuid ORDER BY scope_type`;
    expect(rows).toEqual([{ scope_type: 'SITE', site_id: c1 }, { scope_type: 'TENANT', site_id: null }]);
    const perms = await admin.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM core_user_permissions WHERE user_id = ${user.u1}::uuid AND scope_type = 'SITE' AND site_id = ${c1}::uuid`;
    expect(Number(perms[0]?.n)).toBe(await admin.coreRolePermission.count({ where: { roleId: role.CAMP_MANAGER } }));
  });

  it('me/permissions: зөвхөн шинэ permission код буцаана', async () => {
    const me = await svc.myPermissions(tA, auth.u1, c1);
    expect(me.permissions).toEqual(expect.arrayContaining([P.SHIFT_ADJUST, P.MOVEMENT_IMPORT]));
    expect(me.permissions).not.toContain('camp.shift.adjust');
    expect(me.byCamp[c1]).toEqual(expect.arrayContaining([P.SHIFT_ADJUST]));
    const owner = await svc.myPermissions(tA, auth.owner);
    expect(owner.permissions).not.toContain('camp.roles.manage');
    expect(owner.permissions).toHaveLength(PERMISSION_CODES.length);
  });

  it('API хуучин/устгасан permission кодоос татгалзана', async () => {
    const r = await svc.createRole(tA, auth.owner, { name: `ADR7 ${sfx}`, permissionCodes: [P.EMPLOYEE_MANAGE] });
    expect((await admin.coreRolePermission.findMany({ where: { roleId: r.id }, select: { permissionCode: true } })).map((x) => x.permissionCode)).toEqual([P.EMPLOYEE_MANAGE]);
    await svc.grantDirectPermission(tA, auth.owner, user.u1, { permissionCode: P.EMPLOYEE_TERMINATE });
    expect(await admin.coreUserPermission.count({ where: { userId: user.u1, source: 'DIRECT', permissionCode: P.EMPLOYEE_TERMINATE } })).toBe(1);
    for (const code of ['camp.employee.manage', 'camp.roles.manage']) {
      await expect(svc.grantDirectPermission(tA, auth.owner, user.u1, { permissionCode: code })).rejects.toThrow(BadRequestException);
      await expect(svc.setRolePermissions(tA, auth.owner, r.id, { permissionCodes: [code] })).rejects.toThrow(BadRequestException);
    }
  });

  it('RLS: app_user зөвхөн өөрийн tenant-ийн core_*; каталог уншигдаж, бичигдэхгүй', async () => {
    await admin.coreUserRole.create({ data: { tenantId: tB, userId: user.b1, roleId: (await admin.coreRole.findFirstOrThrow({ where: { tenantId: tB, systemCode: 'EMPLOYEE' } })).id } });
    const seen = await asTenant(tA, (tx) => tx.coreUserPermission.findMany({ select: { tenantId: true } }));
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map((s) => s.tenantId))).toEqual(new Set([tA]));
    expect(await asTenant(tA, (tx) => tx.coreUserRole.count({ where: { tenantId: tB } }))).toBe(0);
    expect(await asTenant(tA, (tx) => tx.corePermission.count())).toBe(PERMISSION_CODES.length);
    await expect(asTenant(tA, (tx) => tx.$executeRaw`INSERT INTO core_permissions (code, name, module) VALUES ('core.x.y', 'x', 'core')`)).rejects.toThrow(/permission denied/);
  });

  it('camp:snapshot — core schema: эрх шинэ кодоор, legacy = effective, A = A зөрүүгүй', async () => {
    const slug = (await admin.tenant.findUniqueOrThrow({ where: { id: tA } })).slug;
    const snap = await buildSnapshot(admin, { today: '2026-11-06', pastDays: 0, futureDays: 0, tenantSlug: slug, db: 'it' });
    const p = snap.perms?.[slug];
    expect(p?.effective).toEqual(expect.arrayContaining([`${user.u1}|${P.SHIFT_ADJUST}|C1`]));
    expect(p?.effective?.some((k) => k.includes('|camp.shift.adjust|'))).toBe(false);
    // DIRECT эрх (legacy ≠ effective мөр) — энэ шалгалтад хамаарахгүй; + / − зөрүү байх ёсгүй
    expect(comparePerms(snap, snap).filter((l) => !l.includes('legacy ≠ effective'))).toEqual([]);
  });
});
