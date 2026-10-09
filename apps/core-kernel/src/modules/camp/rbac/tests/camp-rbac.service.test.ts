import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampRoleCode, UserRole } from '@prisma/client';
import { CampRbacService } from '../camp-rbac.service';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
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
  const asManager = () => setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] });

  beforeEach(() => {
    s = setup();
    svc = new CampRbacService(s.prisma as never, s.access);
  });

  it('roles.manage-гүй (кемпийн роль.manage ч хангалтгүй — tenant түвшин) → 403, юу ч бичихгүй', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROLES_MANAGE, P.MASTER_MANAGE] }] });
    await expect(svc.listRoles('t1', 'a1')).rejects.toThrow(ForbiddenException);
    await expect(svc.createRole('t1', 'a1', { name: 'X' })).rejects.toThrow(/camp\.roles\.manage эрх шаардлагатай/);
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

  it('setRolePermissions: бүхэлд нь солино (deleteMany → createMany), системийн рольд ч зөвшөөрнө, cache цэвэрлэнэ', async () => {
    asManager();
    s.tx.campRole.findFirst.mockResolvedValue(role({ isSystem: true, systemCode: CampRoleCode.CAMP_MANAGER }));
    await svc.setRolePermissions('t1', 'a1', 'r1', { permissionCodes: [P.MEAL_ORDER, P.HAUL_APPROVE] });
    expect(s.tx.campRolePermission.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 't1', roleId: 'r1' } });
    expect(s.tx.campRolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { tenantId: 't1', roleId: 'r1', permissionCode: P.MEAL_ORDER },
        { tenantId: 't1', roleId: 'r1', permissionCode: P.HAUL_APPROVE },
      ],
    });
    expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
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

  describe('assignUserRole', () => {
    const okUser = { id: 'u2', isActive: true };
    const others = (u: unknown) => (args: { where: Record<string, unknown> }) => (args.where.id === 'u2' ? u : null);

    it('өөр tenant / байхгүй хэрэглэгч → 400; идэвхгүй → 400', async () => {
      setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] }, others(null));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Хэрэглэгч олдсонгүй/);
      setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] }, others({ id: 'u2', isActive: false }));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Идэвхгүй хэрэглэгч/);
    });

    it('роль / кемп олдохгүй → 400', async () => {
      setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] }, others(okUser));
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/Роль олдсонгүй/);
      s.tx.campRole.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1', campId: 'c9' })).rejects.toThrow(/Кемп олдсонгүй/);
      expect(s.tx.camp.findFirst).toHaveBeenCalledWith({ where: { id: 'c9', tenantId: 't1' }, select: { id: true } });
    });

    it('давхардал (campId NULL-ийг ч тэнцүү гэж шалгана) → 409; амжилттай → campId null + cache', async () => {
      setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] }, others(okUser));
      s.tx.campRole.findFirst.mockResolvedValue({ id: 'r1' });
      s.tx.campUserRole.findFirst.mockResolvedValueOnce({ id: 'dup' });
      await expect(svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1' })).rejects.toThrow(/аль хэдийн өгөгдсөн/);
      expect(s.tx.campUserRole.findFirst).toHaveBeenCalledWith({ where: { tenantId: 't1', userId: 'u2', roleId: 'r1', campId: null }, select: { id: true } });
      expect(s.cache.invalidateTenant).not.toHaveBeenCalled();

      await svc.assignUserRole('t1', 'a1', { userId: 'u2', roleId: 'r1', campId: null });
      expect(s.tx.campUserRole.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tenantId: 't1', userId: 'u2', roleId: 'r1', campId: null } }));
      expect(s.cache.invalidateTenant).toHaveBeenCalledWith('t1');
    });
  });

  it('removeUserRole: байхгүй → 404; байвал устгаж cache цэвэрлэнэ', async () => {
    asManager();
    await expect(svc.removeUserRole('t1', 'a1', 'x')).rejects.toThrow(NotFoundException);
    s.tx.campUserRole.findFirst.mockResolvedValueOnce({ id: 'ur1' });
    await svc.removeUserRole('t1', 'a1', 'ur1');
    expect(s.tx.campUserRole.delete).toHaveBeenCalledWith({ where: { id: 'ur1' } });
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
    expect((await svc.myPermissions('t1', 'a1')).permissions).toHaveLength(17);
  });

  it('createRole BadRequest нь Forbidden-оос өмнө (validation) — эрхгүй ч үл мэдэгдэх код → 400', async () => {
    setActor(s.tx, {});
    await expect(svc.createRole('t1', 'a1', { name: 'X', permissionCodes: ['nope'] })).rejects.toThrow(BadRequestException);
  });
});
