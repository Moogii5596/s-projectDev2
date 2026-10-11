import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS, CAMP_PERMISSION_CODES, campPermissionAvailableIn, isCampPermission } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { AssignUserRoleDto, CreateCampRoleDto, QueryUserRolesDto, SetRolePermissionsDto, UpdateCampRoleDto } from './camp-rbac.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

const P = CAMP_PERMISSIONS;
const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  systemCode: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permissionCode: true }, orderBy: { permissionCode: 'asc' as const } },
  _count: { select: { userRoles: true } },
} as const;

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  systemCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permissionCode: string }[];
  _count: { userRoles: number };
};

const toRoleView = (r: RoleRow) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  systemCode: r.systemCode,
  permissionCodes: r.permissions.map((p) => p.permissionCode),
  userCount: r._count.userRoles,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/**
 * Кемпийн роль, эрх (Шат 2.2). Бүх бичих үйлдэл `camp.roles.manage` (бүх кемпийн) эрх шаардана.
 * Роль/эрх өөрчлөгдсөний дараа эрхийн cache-г цэвэрлэнэ (commit-ийн дараа).
 */
@Injectable()
export class CampRbacService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  private validateCodes(codes: string[]): void {
    const unknown = codes.filter((c) => !isCampPermission(c));
    if (unknown.length > 0) throw badRequest('camp.err.rbac.1', { codes: unknown.join(', ') });
  }

  private async findRole(tx: Tx, tenantId: string, id: string) {
    const role = await tx.campRole.findFirst({ where: { id, tenantId }, select: ROLE_SELECT });
    if (!role) throw notFound('camp.err.rbac.2');
    return role;
  }

  /** Каталог + `availableIn` ('v1' | 'v2') — V1 UI нь V2 эрхийг нууна (D8) */
  async listPermissions(tenantId: string) {
    const rows = await inTenantTx(this.prisma, tenantId, (tx) =>
      tx.campPermission.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true, sortOrder: true } }),
    );
    return rows.map((r) => ({ ...r, availableIn: campPermissionAvailableIn(r.code) }));
  }

  /** Нэвтэрсэн хэрэглэгчийн эрх (frontend цэс/товч нуух). campId өгвөл тухайн кемпийн бодит эрх */
  async myPermissions(tenantId: string, authId: string, campId?: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.access.resolve(tx, tenantId, authId);
      const effective = campId
        ? CAMP_PERMISSION_CODES.filter((c) => CampAccessService.has(actor.perms, campId, c))
        : CAMP_PERMISSION_CODES.filter((c) => CampAccessService.has(actor.perms, null, c));
      return { userId: actor.userId, isTenantAdmin: actor.perms.isTenantAdmin, campId: campId ?? null, permissions: effective, byCamp: actor.perms.byCamp };
    });
  }

  async listUsers(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      return tx.coreUser.findMany({
        where: { tenantId },
        select: { id: true, email: true, fullName: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
      });
    });
  }

  async listRoles(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      const rows = await tx.campRole.findMany({ where: { tenantId }, select: ROLE_SELECT, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
      return rows.map(toRoleView);
    });
  }

  async createRole(tenantId: string, authId: string, dto: CreateCampRoleDto) {
    const codes = dto.permissionCodes ?? [];
    this.validateCodes(codes);
    const role = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const dup = await tx.campRole.findFirst({ where: { tenantId, name: dto.name }, select: { id: true } });
        if (dup) throw conflict('camp.err.rbac.3', { name: dto.name });
        const created = await tx.campRole.create({ data: { tenantId, name: dto.name, description: dto.description ?? null } });
        if (codes.length > 0) {
          await tx.campRolePermission.createMany({ data: codes.map((permissionCode) => ({ tenantId, roleId: created.id, permissionCode })) });
        }
        return toRoleView(await this.findRole(tx, tenantId, created.id));
      }),
    );
    await this.access.invalidate(tenantId);
    return role;
  }

  async updateRole(tenantId: string, authId: string, id: string, dto: UpdateCampRoleDto) {
    const role = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        await this.findRole(tx, tenantId, id);
        if (dto.name !== undefined) {
          const dup = await tx.campRole.findFirst({ where: { tenantId, name: dto.name, NOT: { id } }, select: { id: true } });
          if (dup) throw conflict('camp.err.rbac.3', { name: dto.name });
        }
        await tx.campRole.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
          },
        });
        return toRoleView(await this.findRole(tx, tenantId, id));
      }),
    );
    return role;
  }

  async deleteRole(tenantId: string, authId: string, id: string) {
    await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const role = await this.findRole(tx, tenantId, id);
        if (role.isSystem) throw conflict('camp.err.rbac.4', { name: role.name });
        await tx.campRole.delete({ where: { id } });   // camp_role_permissions, camp_user_roles → CASCADE
      }),
    );
    await this.access.invalidate(tenantId);
    return { deleted: true };
  }

  /** Ролийн эрхийн багцыг бүхэлд нь солино (системийн рольд ч зөвшөөрнө — ERD v4: админ засна) */
  async setRolePermissions(tenantId: string, authId: string, id: string, dto: SetRolePermissionsDto) {
    this.validateCodes(dto.permissionCodes);
    const role = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        await this.findRole(tx, tenantId, id);
        await tx.campRolePermission.deleteMany({ where: { tenantId, roleId: id } });
        if (dto.permissionCodes.length > 0) {
          await tx.campRolePermission.createMany({ data: dto.permissionCodes.map((permissionCode) => ({ tenantId, roleId: id, permissionCode })) });
        }
        return toRoleView(await this.findRole(tx, tenantId, id));
      }),
    );
    await this.access.invalidate(tenantId);
    return role;
  }

  async listUserRoles(tenantId: string, authId: string, query: QueryUserRolesDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      return tx.campUserRole.findMany({
        where: {
          tenantId,
          ...(query.userId ? { userId: query.userId } : {}),
          ...(query.roleId ? { roleId: query.roleId } : {}),
          ...(query.campId ? { campId: query.campId } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          user: { select: { id: true, email: true, fullName: true, isActive: true } },
          role: { select: { id: true, name: true, isSystem: true } },
          camp: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async assignUserRole(tenantId: string, authId: string, dto: AssignUserRoleDto) {
    const campId = dto.campId ?? null;
    const row = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const user = await tx.coreUser.findFirst({ where: { id: dto.userId, tenantId }, select: { id: true, isActive: true } });
        if (!user) throw badRequest('camp.err.rbac.5');
        if (!user.isActive) throw badRequest('camp.err.rbac.6');
        const role = await tx.campRole.findFirst({ where: { id: dto.roleId, tenantId }, select: { id: true } });
        if (!role) throw badRequest('camp.err.rbac.2');
        if (campId !== null) {
          const camp = await tx.camp.findFirst({ where: { id: campId, tenantId }, select: { id: true } });
          if (!camp) throw badRequest('camp.err.lookup.1');
        }
        const dup = await tx.campUserRole.findFirst({ where: { tenantId, userId: dto.userId, roleId: dto.roleId, campId }, select: { id: true } });
        if (dup) throw conflict('camp.err.rbac.7');
        return tx.campUserRole.create({
          data: { tenantId, userId: dto.userId, roleId: dto.roleId, campId },
          select: { id: true, userId: true, roleId: true, campId: true, createdAt: true },
        });
      }),
    );
    await this.access.invalidate(tenantId);
    return row;
  }

  async removeUserRole(tenantId: string, authId: string, id: string) {
    await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const row = await tx.campUserRole.findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!row) throw notFound('camp.err.rbac.8');
        await tx.campUserRole.delete({ where: { id } });
      }),
    );
    await this.access.invalidate(tenantId);
    return { deleted: true };
  }
}
