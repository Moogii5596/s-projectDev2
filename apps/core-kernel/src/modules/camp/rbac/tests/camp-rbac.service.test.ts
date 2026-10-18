import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampRoleCode, UserRole } from '@prisma/client';
import { CampRbacService } from '../camp-rbac.service';
import { CAMP_PERMISSIONS, CAMP_PERMISSION_AVAILABILITY, CAMP_PERMISSION_CODES, campPermissionAvailableIn } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';

const P = CAMP_PERMISSIONS;
const role = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Нягтлан',
  description: null,
  isSystem: false,
  systemCode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  permissions: [{ permissionCode: P.REPORT_VIEW }],
  _count: { userRoles: 2 },
  ...over,
});

describe('CampRbacService (Шат 2.2)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampRbacService;
  const asManager = () => setActor(s.tx, { role: UserRole.ADMIN });

  beforeEach(() => {
    s = setup();
    svc = new CampRbacService(s.prisma as never, s.access, s.audit);
  });

  it('SEC-009: системийн админ биш (Кемп админ — бүх кемпийн roles.manage ч) → 403, юу ч бичихгүй', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROLES_MANAGE, P.MASTER_MANAGE] }] });
    await expect(svc.listRoles('t1', 'a1')).rejects.toThrow(ForbiddenException);
    setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE, P.MASTER_MANAGE] }] });
    await expect(svc.listRoles('t1', 'a1')).rejects.toThrow(ForbiddenException);
    await expect(svc.createRole('t1', 'a1', { name: 'X' })).rejects.toThrow(/зөвхөн системийн админ/);
    expect(s.tx.campRole.create).not.toHaveBeenCalled();
    expect(s.cache.invalidateTenant).not.toHaveBeenCalled();
  });

  it('listRoles: set_config эхэлж, view хэлбэрт (permissionCodes, userCount)', async () => {
    asManager();
    s.tx.campRole.findMany.mockResolvedValueOnce([role()]);
    const res = await svc.listRoles('t1', 'a1');
    expectTenantTx(s.tx, 't1');
    expect(res[0]).toMatchObject({ id: 'r1', permissionCodes: [P.REPORT_VIEW], userCount: 2, isSystem: false });
  });

  it('createRole: үл мэдэгдэх эрх → 400 (DB-д хүрэхгүй)', async () => {
    asManager();
    await expect(svc.createRole('t1', 'a1', { name: 'X', permissionCodes: [P.REPORT_VIEW, 'camp.fake.perm'] })).rejects.toThrow(/Үл мэдэгдэх эрх: camp\.fake\.perm/);
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createRole: давхар нэр → 409; амжилттай → роль + эрх + cache цэвэрлэнэ', async () => {
    asManager();
    s.tx.campRole.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(svc.createRole('t1', 'a1', { name: 'Нягтлан' })).rejects.toThrow(/нэртэй роль аль хэдийн байна/);
    expect(s.cache.invalidateTenant).not.toHaveBeenCalled();

    s.tx.campRole.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(role({ id: 'new-id' }));
    const res = await svc.createRole('t1', 'a1', { name: 'Нягтлан', permissionCodes: [P.REPORT_VIEW] });
    expect(s.tx.campRole.create).toHaveBeenCalledWith({ data: { tenantId: 't1', name: 'Нягтлан', description: null } });
    expect(s.tx.campRolePermission.createMany).toHaveBeenCalledWith({ data: [{ tenantId: 't1', roleId: 'new-id', permissionCode: P.REPORT_VIEW }] });
    expect(res.id).toBe('new-id');
    expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
  });

  it('deleteRole: байхгүй → 404; системийн роль → 409; энгийн → устгана + cache', async () => {
    asManager();
    await expect(svc.deleteRole('t1', 'a1', 'x')).rejects.toThrow(NotFoundException);
    s.tx.campRole.findFirst.mockResolvedValueOnce(role({ isSystem: true, systemCode: CampRoleCode.CAMP_ADMIN, name: 'Кемп админ' }));
    await expect(svc.deleteRole('t1', 'a1', 'r1')).rejects.toThrow(/Системийн роль "Кемп админ"-ийг устгах боломжгүй/);
    expect(s.tx.campRole.delete).not.toHaveBeenCalled();
    s.tx.campRole.findFirst.mockResolvedValueOnce(role());
    await expect(svc.deleteRole('t1', 'a1', 'r1')).resolves.toEqual({ deleted: true });
    expect(s.tx.campRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(s.cache.invalidateTenant).toHaveBeenCalledTimes(1);
  });

  it('updateRole: өөр рольтой ижил нэр → 409 (өөрийгөө хасаж шалгана)', async () => {
    asManager();
    s.tx.campRole.findFirst.mockResolvedValueOnce(role()).mockResolvedValueOnce({ id: 'r2' });
    await expect(svc.updateRole('t1', 'a1', 'r1', { name: 'Бусад' })).rejects.toThrow(ConflictException);
    expect(s.tx.campRole.findFirst).toHaveBeenLastCalledWith({ where: { tenantId: 't1', name: 'Бусад', NOT: { id: 'r1' } }, select: { id: true } });
  });

  it('setRolePermissions: бүхэлд нь солино (deleteMany → createMany), системийн рольд ч зөвшөөрнө; v0.2.2: хэрэглэгчийн эрх автоматаар өөрчлөгдөхгүй (cache хэвээр, pendingUsers)', async () => {
    asManager();
    s.tx.campRole.findFirst.mockResolvedValue(role({ isSystem: true, systemCode: CampRoleCode.CAMP_MANAGER }));
    // өмнөх (findRole #1) ба дараах (#2) төлөв ялгаатай → audit мөр бичигдэнэ
    s.tx.campRole.findFirst
      .mockResolvedValueOnce(role({ isSystem: true, systemCode: CampRoleCode.CAMP_MANAGER, permissions: [] }))
      .mockResolvedValueOnce(role({ isSystem: true, systemCode: CampRoleCode.CAMP_MANAGER, permissions: [{ permissionCode: P.MEAL_ORDER }] }));
    await svc.setRolePermissions('t1', 'a1', 'r1', { permissionCodes: [P.MEAL_ORDER, P.HAUL_APPROVE] });
    expect(s.tx.campRolePermission.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', roleId: 'r1' } });
    expect(s.tx.campRolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 't1', roleId: 'r1', permissionCode: P.MEAL_ORDER },
        { tenantId: 't1', roleId: 'r1', permissionCode: P.HAUL_APPROVE },
      ],
    });
    // v0.2.2 ADR-003 §2.4: загвар өөрчлөгдсөн ч эцсийн эрх өөрчлөгдөхгүй → cache цэвэрлэх шаардлагагүй
    expect(s.cache.invalidateTenant).not.toHaveBeenCalled();
    expect(s.tx.campUserPermission.deleteMany).not.toHaveBeenCalled();
    expect(s.tx.campAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: 'role', summaryKey: 'audit.role.update' }) }));
    // хоосон багц → зөвхөн устгана
    s.tx.campRolePermission.createMany.mockClear();
    await svc.setRolePermissions('t1', 'a1', 'r1', { permissionCodes: [] });
    expect(s.tx.campRolePermission.createMany).not.toHaveBeenCalled();
  });

  it('setRolePermissions: үл мэдэгдэх код → 400, хуучин эрхийг устгахгүй', async () => {
    asManager();
    s.tx.campRole.findFirst.mockResolvedValue(role());
    await expect(svc.setRolePermissions('t1', 'a1', 'r1', { permissionCodes: [P.MEAL_ORDER, 'camp.meal.delete'] })).rejects.toThrow(/Үл мэдэгдэх эрх: camp\.meal\.delete/);
    expect(s.tx.campRolePermission.deleteMany).not.toHaveBeenCalled();
    expect(s.cache.invalidateTenant).not.toHaveBeenCalled();
  });

  it('№7 (Блок 6б): албан тушаалын автомат олголт байхад гараар олговол 409 биш — гарын олголт болгоно (source_position_id = NULL)', async () => {
    setActor(s.tx, { role: UserRole.ADMIN }, (a) => ('id' in a.where ? { id: 'u2', isActive: true, email: 'u@x', fullName: null } : null));
    s.tx.campRole.findFirst.mockResolvedValueOnce({ id: 'r1', name: 'Ажилтан' });
    s.tx.campUserRole.findFirst.mockResolvedValueOnce({ id: 'ur1', userId: 'u2', roleId: 'r1', campId: null, createdAt: new Date(), sourcePositionId: 'pos1' });
    const res = await svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' });
    expect(s.tx.campUserRole.update).toHaveBeenCalledWith({ where: { id: 'ur1' }, data: { sourcePositionId: null } });
    expect(s.tx.campUserRole.create).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 'ur1', roleId: 'r1' });
    expect(s.tx.campAuditLog.create.mock.calls[0][0].data.summaryKey).toBe('audit.user_role.update');
    // гараар олгосон давхардал → 409 хэвээр
    s.tx.campRole.findFirst.mockResolvedValueOnce({ id: 'r1', name: 'Ажилтан' });
    s.tx.campUserRole.findFirst.mockResolvedValueOnce({ id: 'ur2', userId: 'u2', roleId: 'r1', campId: null, createdAt: new Date(), sourcePositionId: null });
    await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(ConflictException);
  });

  describe('assignUserRole', () => {
    const okUser = { id: 'u2', isActive: true };
    const others = (u: unknown) => (args: { where: Record<string, unknown> }) => (args.where.id === 'u2' ? u : null);

    it('өөр tenant / байхгүй хэрэглэгч → 400; идэвхгүй → 400', async () => {
      setActor(s.tx, { role: UserRole.ADMIN }, others(null));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Хэрэглэгч олдсонгүй/);
      setActor(s.tx, { role: UserRole.ADMIN }, others({ id: 'u2', isActive: false }));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Идэвхгүй хэрэглэгч/);
    });

    it('роль / кемп олдохгүй → 400', async () => {
      setActor(s.tx, { role: UserRole.ADMIN }, others(okUser));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Роль олдсонгүй/);
      s.tx.campRole.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1', campId: 'c9' })).rejects.toThrow(/Кемп олдсонгүй/);
      expect(s.tx.camp.findFirst).toHaveBeenCalledWith({ where: { id: 'c9', tenantId: 't1' }, select: { id: true } });
    });

    it('давхардал (campId NULL-ийг ч тэнцүү гэж шалгана) → 409; амжилттай → campId null + cache', async () => {
      setActor(s.tx, { role: UserRole.ADMIN }, others(okUser));
      s.tx.campRole.findFirst.mockResolvedValue({ id: 'r1' });
      s.tx.campUserRole.findFirst.mockResolvedValueOnce({ id: 'dup' });
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/аль хэдийн өгөгдсөн/);
      expect(s.tx.campUserRole.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: 'u2', roleId: 'r1', campId: null });
      expect(s.cache.invalidateTenant).not.toHaveBeenCalled();

      await svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1', campId: null });
      expect(s.tx.campUserRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 't1', userId: 'u2', roleId: 'r1', campId: null } }));
      expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
    });
  });

  it('removeUserRole: байхгүй → 404; байвал устгаж cache цэвэрлэнэ', async () => {
    asManager();
    await expect(svc.removeUserRole('t1', 'a1', 'x')).rejects.toThrow(NotFoundException);
    s.tx.campUserRole.findFirst.mockResolvedValueOnce({
      id: 'ur1', userId: 'u1', roleId: 'r1', campId: null, role: { name: 'Кемп менежер' }, user: { email: 'm@x', fullName: null },
    });
    await svc.removeUserRole('t1', 'a1', 'ur1');
    expect(s.tx.campUserRole.delete).toHaveBeenCalledWith({ where: { id: 'ur1' } });
    // TEMPLATE эрх DB-ийн CASCADE-ээр (D-09) — app код шууд устгахгүй
    expect(s.tx.campUserPermission.deleteMany).not.toHaveBeenCalled();
    expect(s.tx.campAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'user_role', action: 'DEACTIVATE', summaryParams: { name: 'Кемп менежер', user: 'm@x' } }),
    }));
    expect(s.cache.invalidateTenant).toHaveBeenCalledTimes(1);
  });

  it('myPermissions: кемпийн бодит эрх (global + тухайн кемп), tenant admin бүгд', async () => {
    setActor(s.tx, { roles: [{ campId: null, perms: [P.REPORT_VIEW] }, { campId: 'c1', perms: [P.MEAL_ORDER] }] });
    const c1 = await svc.myPermissions('t1', 'a1', 'c1');
    expect(c1.permissions.sort()).toEqual([P.MEAL_ORDER, P.REPORT_VIEW].sort());
    const c2 = await svc.myPermissions('t1', 'a1', 'c2');
    expect(c2.permissions).toEqual([P.REPORT_VIEW]);
    setActor(s.tx, { role: UserRole.OWNER });
    s.cache.get.mockResolvedValue(null);
    expect((await svc.myPermissions('t1', 'a1')).permissions).toHaveLength(18);
  });

  it('createRole BadRequest нь Forbidden-оос өмнө (validation) — эрхгүй ч үл мэдэгдэх код → 400', async () => {
    setActor(s.tx, {});
    await expect(svc.createRole('t1', 'a1', { name: 'X', permissionCodes: ['nope'] })).rejects.toThrow(BadRequestException);
  });
});

describe('Эрхийн V1/V2 хүрээ (D8, 2026-10-09)', () => {
  it('каталогийн код бүр тэмдэглэгээтэй; V2 = гэрээ, бохир ус/хог, хоолны захиалга, зардлын тайлан (яг 6)', () => {
    expect(Object.keys(CAMP_PERMISSION_AVAILABILITY).sort()).toEqual([...CAMP_PERMISSION_CODES].sort());
    const v2 = CAMP_PERMISSION_CODES.filter((c) => CAMP_PERMISSION_AVAILABILITY[c] === 'v2').sort();
    expect(v2).toEqual(
      [P.CONTRACT_MANAGE, P.HAUL_CREATE, P.HAUL_APPROVE, P.MEAL_ORDER, P.MEAL_ACCEPT, P.REPORT_VIEW].sort(),
    );
    // Шат 2–4-ийн эрхүүд V1 (засвар хаах = сэлбэгийн зардал — гэрээнээс хамааралгүй)
    for (const c of [P.SETTINGS_MANAGE, P.ROLES_MANAGE, P.MASTER_MANAGE, P.EMPLOYEE_MANAGE, P.MOVEMENT_IMPORT, P.SHIFT_ADJUST,
      P.ROOM_MANAGE, P.ASSET_MANAGE, P.MAINTENANCE_CREATE, P.MAINTENANCE_PARTS, P.MAINTENANCE_CLOSE]) {
      expect(campPermissionAvailableIn(c)).toBe('v1');
    }
    expect(campPermissionAvailableIn('camp.unknown.code')).toBe('v2');
  });

  it('listPermissions: DB-ийн мөр бүрт availableIn нэмнэ (DB-ээс юу ч хасахгүй)', async () => {
    const s = setup();
    const svc = new CampRbacService(s.prisma as never, s.access, s.audit);
    s.tx.campPermission.findMany.mockResolvedValueOnce([
      { code: P.SETTINGS_MANAGE, name: 'Тохиргоо', sortOrder: 10 },
      { code: P.REPORT_VIEW, name: 'Зардлын тайлан харах', sortOrder: 170 },
    ]);
    const res = await svc.listPermissions('t1');
    expectTenantTx(s.tx, 't1');
    expect(res).toEqual([
      { code: P.SETTINGS_MANAGE, name: 'Тохиргоо', sortOrder: 10, availableIn: 'v1' },
      { code: P.REPORT_VIEW, name: 'Зардлын тайлан харах', sortOrder: 170, availableIn: 'v2' },
    ]);
  });

  it('V2 эрх эрх шалгалтад хэвээр ажиллана (оноосон эрх хасагдахгүй)', async () => {
    const s = setup();
    setActor(s.tx, { userId: 'cu1', roles: [{ campId: 'c1', perms: [P.HAUL_APPROVE] }] });
    await expect(s.access.require(s.tx as never, 't1', 'a1', 'c1', P.HAUL_APPROVE)).resolves.toBe('cu1');
    await expect(s.access.requireAccess(s.tx as never, 't1', 'a1', 'c1')).resolves.toMatchObject({ userId: 'cu1' });
  });
});

describe('CampRbacService — v0.2.2 Блок 1 (загвар хэрэгжүүлэх, шууд эрх)', () => {
  let s: ReturnType<typeof setup>;
  let svc: CampRbacService;
  beforeEach(() => {
    s = setup();
    svc = new CampRbacService(s.prisma as never, s.access, s.audit);
    setActor(s.tx, { role: UserRole.ADMIN });
    s.tx.campRole.findFirst.mockResolvedValue({
      id: 'r1', name: 'Кемп админ', description: null, isSystem: true, systemCode: CampRoleCode.CAMP_ADMIN,
      createdAt: new Date(), updatedAt: new Date(), permissions: [], _count: { userRoles: 2 },
    });
  });

  const assignments = () => {
    s.tx.campUserRole.findMany.mockResolvedValue([
      { id: 'ur1', userId: 'u1', campId: null, permissions: [{ permissionCode: P.REPORT_VIEW }, { permissionCode: P.MEAL_ORDER }] },
      { id: 'ur2', userId: 'u2', campId: 'c1', permissions: [{ permissionCode: P.REPORT_VIEW }, { permissionCode: P.MAINTENANCE_CLOSE }] },
    ]);
    s.tx.campRolePermission.findMany.mockResolvedValue([{ permissionCode: P.REPORT_VIEW }, { permissionCode: P.MAINTENANCE_CLOSE }]);
  };

  it('applyRoleTemplate: зөвхөн зөрүүтэй олголтод TEMPLATE мөр нэмэх/хасах, DIRECT хөндөхгүй, audit + cache', async () => {
    assignments();
    s.tx.campUserPermission.deleteMany.mockResolvedValue({ count: 1 });
    s.tx.campUserPermission.createMany.mockResolvedValue({ count: 1 });
    const res = await svc.applyRoleTemplate('t1', 'a1', 'r1');
    expect(res).toEqual({ roleId: 'r1', affectedUsers: 1, added: 1, removed: 1 });
    expect(s.tx.campUserPermission.deleteMany).toHaveBeenCalledTimes(1);
    expect(s.tx.campUserPermission.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', userRoleId: 'ur1', source: 'TEMPLATE', permissionCode: { in: [P.MEAL_ORDER] } },
    });
    expect(s.tx.campUserPermission.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: 't1', userId: 'u1', permissionCode: P.MAINTENANCE_CLOSE, campId: null, source: 'TEMPLATE', userRoleId: 'ur1' }],
    });
    expect(s.tx.campAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ summaryKey: 'audit.role_apply.update' }) }));
    expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
  });

  it('previewRoleApply: юу ч бичихгүй; хэрэглэгч бүрийн + / −', async () => {
    assignments();
    s.tx.coreUser.findMany.mockResolvedValue([{ id: 'u1', email: 'a@x', fullName: 'A' }]);
    const p = await svc.previewRoleApply('t1', 'a1', 'r1');
    expect(p.affectedUsers).toBe(1);
    expect(p.items).toEqual([{ userRoleId: 'ur1', userId: 'u1', campId: null, add: [P.MAINTENANCE_CLOSE], remove: [P.MEAL_ORDER], user: { id: 'u1', email: 'a@x', fullName: 'A' } }]);
    expect(s.tx.campUserPermission.createMany).not.toHaveBeenCalled();
    expect(s.tx.campUserPermission.deleteMany).not.toHaveBeenCalled();
  });

  it('эрхгүй хэрэглэгч → 403 (бүх шинэ endpoint)', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROLES_MANAGE] }] }); // зөвхөн нэг кемпийн — tenant түвшинд хүрэлцэхгүй
    await expect(svc.applyRoleTemplate('t1', 'a1', 'r1')).rejects.toThrow(ForbiddenException);
    await expect(svc.grantDirectPermission('t1', 'a1', 'u1', { permissionCode: P.REPORT_VIEW })).rejects.toThrow(ForbiddenException);
    await expect(svc.revokeDirectPermission('t1', 'a1', 'x')).rejects.toThrow(ForbiddenException);
    await expect(svc.setPositionTemplates('t1', 'a1', 'pos1', { templates: [] })).rejects.toThrow(ForbiddenException);
  });

  it('grantDirectPermission: үл мэдэгдэх код → 400, давхардал → 409, амжилттай → DIRECT + createdBy', async () => {
    await expect(svc.grantDirectPermission('t1', 'a1', 'u1', { permissionCode: 'camp.fake.perm' })).rejects.toThrow(BadRequestException);
    s.tx.coreUser.findFirst.mockImplementation(async (a: { where: Record<string, unknown> }) =>
      'authId' in a.where ? { id: 'cu-actor', role: UserRole.ADMIN } : { id: 'u1', isActive: true, email: 'u@x', fullName: null });
    s.tx.campUserPermission.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(svc.grantDirectPermission('t1', 'a1', 'u1', { permissionCode: P.REPORT_VIEW })).rejects.toThrow(ConflictException);
    s.tx.campUserPermission.create.mockResolvedValueOnce({ id: 'p1', userId: 'u1', permissionCode: P.REPORT_VIEW, campId: null, source: 'DIRECT', createdAt: new Date() });
    await svc.grantDirectPermission('t1', 'a1', 'u1', { permissionCode: P.REPORT_VIEW });
    expect(s.tx.campUserPermission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tenantId: 't1', userId: 'u1', permissionCode: P.REPORT_VIEW, campId: null, source: 'DIRECT', createdBy: 'cu-actor' },
    }));
  });

  it('revokeDirectPermission: TEMPLATE мөрийг хасахгүй (400), DIRECT-ийг хасна', async () => {
    s.tx.campUserPermission.findFirst.mockResolvedValueOnce({ id: 'p1', userId: 'u1', permissionCode: P.REPORT_VIEW, campId: null, source: 'TEMPLATE', user: { email: 'u@x', fullName: null } });
    await expect(svc.revokeDirectPermission('t1', 'a1', 'p1')).rejects.toThrow(BadRequestException);
    expect(s.tx.campUserPermission.delete).not.toHaveBeenCalled();
    s.tx.campUserPermission.findFirst.mockResolvedValueOnce({ id: 'p2', userId: 'u1', permissionCode: P.REPORT_VIEW, campId: null, source: 'DIRECT', user: { email: 'u@x', fullName: null } });
    await svc.revokeDirectPermission('t1', 'a1', 'p2');
    expect(s.tx.campUserPermission.delete).toHaveBeenCalledWith({ where: { id: 'p2' } });
  });

  it('setPositionTemplates: давхардсан роль → 400, өөр tenant-ийн роль → 400', async () => {
    s.tx.hrPosition.findFirst.mockResolvedValue({ id: 'pos1', name: 'Тогооч' });
    await expect(svc.setPositionTemplates('t1', 'a1', 'pos1', { templates: [
      { roleId: 'r1', scope: 'ALL_CAMPS' }, { roleId: 'r1', scope: 'EMPLOYEE_CAMP' },
    ] })).rejects.toThrow(BadRequestException);
    s.tx.campRole.count.mockResolvedValueOnce(0);
    await expect(svc.setPositionTemplates('t1', 'a1', 'pos1', { templates: [{ roleId: 'r-other', scope: 'ALL_CAMPS' }] })).rejects.toThrow(BadRequestException);
  });
});

