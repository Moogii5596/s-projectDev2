import { isAdminBypassExcluded } from '../../core/permissions/permission-registry';
import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSION_CODES, campPermissionAvailableIn, isCampPermission } from '../common/camp-permissions';
import { permissionModule } from '../../core/permissions/permission-registry';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import {
  AssignUserRoleDto,
  CreateCampRoleDto,
  GrantDirectPermissionDto,
  QueryUserRolesDto,
  SetPositionTemplatesDto,
  SetRolePermissionsDto,
  UpdateCampRoleDto,
} from './camp-rbac.dto';
import { CampAuditService } from '../common/camp-audit.service';
import { buildApplyPreview, diffTemplate } from './template-diff';
import { buildUserRows } from './user-list';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

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
    private readonly audit: CampAuditService,
  ) {}

  /** Аудитын мөрөнд харагдах хэрэглэгчийн нэр (бүтэн нэр, эсвэл имэйл) */
  private static userLabel(u: { email: string; fullName: string | null } | null | undefined): string {
    return u?.fullName?.trim() || u?.email || '';
  }

  /** Ролийн олголт бүр + түүний одоогийн TEMPLATE эрх, ролийн загвар (D-09) */
  private async loadRoleAssignments(tx: Tx, tenantId: string, roleId: string) {
    const [assignments, tpl] = await Promise.all([
      tx.coreUserRole.findMany({
        where: { tenantId, roleId },
        select: { id: true, userId: true, campId: true, permissions: { where: { source: 'TEMPLATE' }, select: { permissionCode: true } } },
      }),
      tx.coreRolePermission.findMany({ where: { tenantId, roleId }, select: { permissionCode: true } }),
    ]);
    const template = tpl.map((r) => r.permissionCode);
    const rows = assignments.map((a) => ({ userRoleId: a.id, userId: a.userId, campId: a.campId, current: a.permissions.map((p) => p.permissionCode) }));
    return { template, rows };
  }

  /** Каталогт байхгүй эсвэл устгасан permission кодыг хүлээн авахгүй. */
  private normalizeCodes(codes: string[]): string[] {
    const normalized = [...new Set(codes)];
    const unknown = normalized.filter((c) => !isCampPermission(c));
    if (unknown.length > 0) throw badRequest('camp.err.rbac.1', { codes: unknown.join(', ') });
    return normalized;
  }

  private async findRole(tx: Tx, tenantId: string, id: string) {
    const role = await tx.coreRole.findFirst({ where: { id, tenantId }, select: ROLE_SELECT });
    if (!role) throw notFound('camp.err.rbac.2');
    return role;
  }

  /** Каталог + `availableIn` ('v1' | 'v2') — V1 UI нь V2 эрхийг нууна (D8) */
  async listPermissions(tenantId: string) {
    const rows = await inTenantTx(this.prisma, tenantId, (tx) =>
      tx.corePermission.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true, sortOrder: true, module: true } }),
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
      const byCamp = Object.fromEntries(Object.entries(actor.perms.byCamp).map(([k, v]) => [k, [...new Set(v)].sort()]));
      // v0.2.3 Блок 3 (PIL-19, B3-3): аль модульд (кодын угтвар) аль нэг ажлын байранд эрхтэй — дээд цэс нуухад
      const anyCodes = actor.perms.isTenantAdmin
        ? [...CAMP_PERMISSION_CODES.filter((c) => !isAdminBypassExcluded(c)), ...actor.perms.global, ...Object.values(actor.perms.byCamp).flat()]
        : [...actor.perms.global, ...Object.values(actor.perms.byCamp).flat()];
      const modules = [...new Set(anyCodes.map(permissionModule))].sort();
      return { userId: actor.userId, isTenantAdmin: actor.perms.isTenantAdmin, campId: campId ?? null, permissions: [...new Set(effective)].sort(), byCamp, modules };
    });
  }

  async listUsers(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const users = await tx.coreUser.findMany({
        where: { tenantId },
        select: { id: true, email: true, fullName: true, isActive: true, role: true, phone: true, username: true, lastSignInAt: true },
        orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
      });
      const ids = users.map((x) => x.id);
      // v0.2.2 Блок 4 (B4-Q3): холбогдсон ажилтан + сүүлийн урилга (INVITE)
      const [employees, invites] = await Promise.all([
        tx.hrEmployee.findMany({
          where: { tenantId, userId: { in: ids } },
          select: { id: true, userId: true, employeeCode: true, fullName: true, campId: true, camp: { select: { code: true } } },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        }),
        tx.coreUserInvite.findMany({
          where: { tenantId, userId: { in: ids }, purpose: 'INVITE' },
          select: { userId: true, channel: true, expiresAt: true, usedAt: true, revokedAt: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);
      return buildUserRows(users, employees, invites, new Date());
    });
  }

  async listRoles(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const [rows, assignments] = await Promise.all([
        tx.coreRole.findMany({ where: { tenantId }, select: ROLE_SELECT, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }),
        tx.coreUserRole.findMany({
          where: { tenantId },
          select: { id: true, roleId: true, userId: true, campId: true, permissions: { where: { source: 'TEMPLATE' }, select: { permissionCode: true } } },
        }),
      ]);
      // v0.2.2: загвар өөрчлөгдөөд хэрэгжүүлээгүй олголттой хэрэглэгчийн тоо (UI: "хэрэгжүүлэх" товч)
      return rows.map((r) => {
        const mine = assignments
          .filter((a) => a.roleId === r.id)
          .map((a) => ({ userRoleId: a.id, userId: a.userId, campId: a.campId, current: a.permissions.map((x) => x.permissionCode) }));
        return { ...toRoleView(r), pendingUsers: buildApplyPreview(mine, r.permissions.map((x) => x.permissionCode)).affectedUsers };
      });
    });
  }

  async createRole(tenantId: string, authId: string, dto: CreateCampRoleDto) {
    const codes = this.normalizeCodes(dto.permissionCodes ?? []);
    const role = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireTenantAdmin(tx, tenantId, authId);
        const dup = await tx.coreRole.findFirst({ where: { tenantId, name: dto.name }, select: { id: true } });
        if (dup) throw conflict('camp.err.rbac.3', { name: dto.name });
        const created = await tx.coreRole.create({ data: { tenantId, name: dto.name, description: dto.description ?? null } });
        if (codes.length > 0) {
          await tx.coreRolePermission.createMany({ data: codes.map((permissionCode) => ({ tenantId, roleId: created.id, permissionCode })) });
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
        await this.access.requireTenantAdmin(tx, tenantId, authId);
        await this.findRole(tx, tenantId, id);
        if (dto.name !== undefined) {
          const dup = await tx.coreRole.findFirst({ where: { tenantId, name: dto.name, NOT: { id } }, select: { id: true } });
          if (dup) throw conflict('camp.err.rbac.3', { name: dto.name });
        }
        await tx.coreRole.update({
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
        await this.access.requireTenantAdmin(tx, tenantId, authId);
        const role = await this.findRole(tx, tenantId, id);
        if (role.isSystem) throw conflict('camp.err.rbac.4', { name: role.name });
        await tx.coreRole.delete({ where: { id } });   // camp_role_permissions, camp_user_roles → CASCADE
      }),
    );
    await this.access.invalidate(tenantId);
    return { deleted: true };
  }

  /** Ролийн эрхийн багцыг бүхэлд нь солино (системийн рольд ч зөвшөөрнө — ERD v4: админ засна) */
  async setRolePermissions(tenantId: string, authId: string, id: string, dto: SetRolePermissionsDto) {
    const codes = this.normalizeCodes(dto.permissionCodes);
    const role = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const before = await this.findRole(tx, tenantId, id);
        await tx.coreRolePermission.deleteMany({ where: { tenantId, roleId: id } });
        if (codes.length > 0) {
          await tx.coreRolePermission.createMany({ data: codes.map((permissionCode) => ({ tenantId, roleId: id, permissionCode })) });
        }
        const after = await this.findRole(tx, tenantId, id);
        await this.audit.record(tx, {
          tenantId, campId: null, entityType: 'role', entityId: id, action: 'UPDATE', actorUserId,
          fields: ['permissionCodes'],
          before: { permissionCodes: toRoleView(before).permissionCodes.join(', ') },
          after: { permissionCodes: toRoleView(after).permissionCodes.join(', ') },
          summaryParams: { name: after.name },
        });
        // v0.2.2 (ADR-003 §2.4): загвар өөрчлөгдсөн ч хэрэглэгчийн эрх АВТОМАТААР өөрчлөгдөхгүй → "хэрэгжүүлэх" алхам
        const { template, rows } = await this.loadRoleAssignments(tx, tenantId, id);
        return { ...toRoleView(after), pendingUsers: buildApplyPreview(rows, template).affectedUsers };
      }),
    );
    return role;
  }

  /** Загварыг олголтуудад хэрэгжүүлбэл юу өөрчлөгдөх вэ (хэрэглэгч бүрээр + / −) */
  async previewRoleApply(tenantId: string, authId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const role = await this.findRole(tx, tenantId, id);
      const { template, rows } = await this.loadRoleAssignments(tx, tenantId, id);
      const preview = buildApplyPreview(rows, template);
      const users = await tx.coreUser.findMany({
        where: { tenantId, id: { in: [...new Set(preview.items.map((i) => i.userId))] } },
        select: { id: true, email: true, fullName: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        roleId: id,
        roleName: role.name,
        affectedUsers: preview.affectedUsers,
        items: preview.items.map((i) => ({ ...i, user: byId.get(i.userId) ?? null })),
      };
    });
  }

  /** Загварыг тухайн ролийн БҮХ олголтод хэрэгжүүлнэ (TEMPLATE мөрийг загвартай тэнцүүлнэ; DIRECT хөндөхгүй) */
  async applyRoleTemplate(tenantId: string, authId: string, id: string) {
    const res = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const role = await this.findRole(tx, tenantId, id);
        const { template, rows } = await this.loadRoleAssignments(tx, tenantId, id);
        const preview = buildApplyPreview(rows, template);
        let added = 0;
        let removed = 0;
        for (const it of preview.items) {
          if (it.remove.length > 0) {
            const d = await tx.coreUserPermission.deleteMany({
              where: { tenantId, userRoleId: it.userRoleId, source: 'TEMPLATE', permissionCode: { in: it.remove } },
            });
            removed += d.count;
          }
          if (it.add.length > 0) {
            const c = await tx.coreUserPermission.createMany({
              data: it.add.map((permissionCode) => ({
                tenantId, userId: it.userId, permissionCode, campId: it.campId, source: 'TEMPLATE' as const, userRoleId: it.userRoleId,
              })),
            });
            added += c.count;
          }
        }
        if (preview.items.length > 0) {
          await this.audit.record(tx, {
            tenantId, campId: null, entityType: 'role_apply', entityId: id, action: 'UPDATE', actorUserId,
            fields: ['appliedUsers', 'added', 'removed'],
            before: { appliedUsers: 0, added: 0, removed: 0 },
            after: { appliedUsers: preview.affectedUsers, added, removed },
            summaryParams: { name: role.name, users: preview.affectedUsers },
          });
        }
        return { roleId: id, affectedUsers: preview.affectedUsers, added, removed };
      }),
    );
    await this.access.invalidate(tenantId);
    return res;
  }

  async listUserRoles(tenantId: string, authId: string, query: QueryUserRolesDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      return tx.coreUserRole.findMany({
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
          // v0.2.3 Блок 3 (PIL-18): гарын олголтыг «олгогдсон» гэж ялгах (албан тушаалын автоматыг гараар давхар олгож болно — №7)
          sourcePositionId: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  async assignUserRole(tenantId: string, authId: string, dto: AssignUserRoleDto) {
    const campId = dto.campId ?? null;
    const row = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const user = await tx.coreUser.findFirst({ where: { id: dto.userId, tenantId }, select: { id: true, isActive: true, email: true, fullName: true } });
        if (!user) throw badRequest('camp.err.rbac.5');
        if (!user.isActive) throw badRequest('camp.err.rbac.6');
        const role = await tx.coreRole.findFirst({ where: { id: dto.roleId, tenantId }, select: { id: true, name: true } });
        if (!role) throw badRequest('camp.err.rbac.2');
        if (campId !== null) {
          const camp = await tx.camp.findFirst({ where: { id: campId, tenantId }, select: { id: true } });
          if (!camp) throw badRequest('camp.err.lookup.1');
        }
        const dup = await tx.coreUserRole.findFirst({
          where: { tenantId, userId: dto.userId, roleId: dto.roleId, campId },
          select: { id: true, userId: true, roleId: true, campId: true, createdAt: true, sourcePositionId: true },
        });
        if (dup && !dup.sourcePositionId) throw conflict('camp.err.rbac.7');
        if (dup) {
          // №7 (Блок 6б): албан тушаалын загвараас АВТОМАТААР олгогдсон → гарын олголт болгоно (албан тушаал солигдоход хасагдахгүй).
          // Эрхийн мөрүүд (TEMPLATE, user_role_id) хэвээр — trigger роль/кемп/хэрэглэгч өөрчлөгдөөгүй тул юу ч хийхгүй.
          await tx.coreUserRole.update({ where: { id: dup.id }, data: { sourcePositionId: null } });
          const { sourcePositionId: _src, ...pinned } = dup;
          await this.audit.record(tx, {
            tenantId, campId, entityType: 'user_role', entityId: dup.id, action: 'UPDATE', actorUserId,
            fields: ['sourcePositionId'], before: { sourcePositionId: _src }, after: { sourcePositionId: null },
            summaryParams: { name: role.name, user: CampRbacService.userLabel(user) },
          });
          return pinned;
        }
        // D-09: AFTER INSERT trigger загварын эрхийг camp_user_permissions-д хуулна (ижил transaction)
        const created = await tx.coreUserRole.create({
          data: { tenantId, userId: dto.userId, roleId: dto.roleId, campId },
          select: { id: true, userId: true, roleId: true, campId: true, createdAt: true },
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'user_role', entityId: created.id, action: 'CREATE', actorUserId,
          fields: ['userId', 'roleId', 'campId'], before: null, after: created,
          summaryParams: { name: role.name, user: CampRbacService.userLabel(user) },
        });
        return created;
      }),
    );
    await this.access.invalidate(tenantId);
    return row;
  }

  async removeUserRole(tenantId: string, authId: string, id: string) {
    await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const row = await tx.coreUserRole.findFirst({
          where: { id, tenantId },
          select: { id: true, userId: true, roleId: true, campId: true, role: { select: { name: true } }, user: { select: { email: true, fullName: true } } },
        });
        if (!row) throw notFound('camp.err.rbac.8');
        await tx.coreUserRole.delete({ where: { id } });   // TEMPLATE эрх → CASCADE (D-09)
        await this.audit.record(tx, {
          tenantId, campId: row.campId, entityType: 'user_role', entityId: id, action: 'DEACTIVATE', actorUserId,
          fields: ['userId', 'roleId', 'campId'], before: { userId: row.userId, roleId: row.roleId, campId: row.campId }, after: null,
          summaryParams: { name: row.role.name, user: CampRbacService.userLabel(row.user) },
        });
      }),
    );
    await this.access.invalidate(tenantId);
    return { deleted: true };
  }

  // ── v0.2.2 Блок 1: хэрэглэгчийн эцсийн эрх (ADR-003 §2.4) ────

  /** Хэрэглэгчийн эцсийн эрх + эх сурвалж; олголт бүрт загвараас зөрүүтэй эсэх */
  async listUserPermissions(tenantId: string, authId: string, userId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const user = await tx.coreUser.findFirst({ where: { id: userId, tenantId }, select: { id: true, email: true, fullName: true, isActive: true } });
      if (!user) throw notFound('camp.err.rbac.5');
      const [perms, assignments] = await Promise.all([
        tx.coreUserPermission.findMany({
          where: { tenantId, userId },
          select: {
            id: true, permissionCode: true, campId: true, source: true, userRoleId: true, createdAt: true,
            userRole: { select: { role: { select: { id: true, name: true } } } },
          },
          orderBy: [{ permissionCode: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.coreUserRole.findMany({
          where: { tenantId, userId },
          select: {
            id: true, campId: true,
            role: { select: { id: true, name: true, permissions: { select: { permissionCode: true } } } },
            permissions: { where: { source: 'TEMPLATE' }, select: { permissionCode: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      return {
        user,
        permissions: perms.map((p) => ({
          id: p.id, permissionCode: p.permissionCode, campId: p.campId, source: p.source, userRoleId: p.userRoleId,
          role: p.userRole?.role ?? null, createdAt: p.createdAt,
        })),
        assignments: assignments.map((a) => {
          const d = diffTemplate(a.permissions.map((x) => x.permissionCode), a.role.permissions.map((x) => x.permissionCode));
          return { userRoleId: a.id, campId: a.campId, role: { id: a.role.id, name: a.role.name }, outdated: d.add.length + d.remove.length > 0, ...d };
        }),
      };
    });
  }

  /** Шууд (DIRECT) эрх — албан тушаал/роль солиход хадгалагдана */
  async grantDirectPermission(tenantId: string, authId: string, userId: string, dto: GrantDirectPermissionDto) {
    const [permissionCode] = this.normalizeCodes([dto.permissionCode]);
    const campId = dto.campId ?? null;
    const row = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const user = await tx.coreUser.findFirst({ where: { id: userId, tenantId }, select: { id: true, isActive: true, email: true, fullName: true } });
        if (!user) throw badRequest('camp.err.rbac.5');
        if (!user.isActive) throw badRequest('camp.err.rbac.6');
        if (campId !== null) {
          const camp = await tx.camp.findFirst({ where: { id: campId, tenantId }, select: { id: true } });
          if (!camp) throw badRequest('camp.err.lookup.1');
        }
        const dup = await tx.coreUserPermission.findFirst({
          where: { tenantId, userId, permissionCode, campId, source: 'DIRECT' }, select: { id: true },
        });
        if (dup) throw conflict('camp.err.rbac.10');
        const created = await tx.coreUserPermission.create({
          data: { tenantId, userId, permissionCode, campId, source: 'DIRECT', createdBy: actorUserId },
          select: { id: true, userId: true, permissionCode: true, campId: true, source: true, createdAt: true },
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'user_permission', entityId: created.id, action: 'CREATE', actorUserId,
          fields: ['userId', 'permissionCode', 'campId'], before: null, after: created,
          summaryParams: { code: permissionCode, user: CampRbacService.userLabel(user) },
        });
        return created;
      }),
    );
    await this.access.invalidate(tenantId);
    return row;
  }

  /** Зөвхөн DIRECT мөрийг хасна; TEMPLATE мөр → ролийг хасах (400) */
  async revokeDirectPermission(tenantId: string, authId: string, id: string) {
    await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const row = await tx.coreUserPermission.findFirst({
          where: { id, tenantId },
          select: { id: true, userId: true, permissionCode: true, campId: true, source: true, user: { select: { email: true, fullName: true } } },
        });
        if (!row) throw notFound('camp.err.rbac.11');
        if (row.source !== 'DIRECT') throw badRequest('camp.err.rbac.9');
        await tx.coreUserPermission.delete({ where: { id } });
        await this.audit.record(tx, {
          tenantId, campId: row.campId, entityType: 'user_permission', entityId: id, action: 'DEACTIVATE', actorUserId,
          fields: ['userId', 'permissionCode', 'campId'], before: { userId: row.userId, permissionCode: row.permissionCode, campId: row.campId }, after: null,
          summaryParams: { code: row.permissionCode, user: CampRbacService.userLabel(row.user) },
        });
      }),
    );
    await this.access.invalidate(tenantId);
    return { deleted: true };
  }

  // ── v0.2.2 Блок 1: албан тушаал → роль-загвар (D-02) ────────
  // Ажилтанд албан тушаал олгоход хуулах нь Блок 2-т (ажилтан ↔ хэрэглэгчийн холбоос).

  async getPositionTemplates(tenantId: string, authId: string, positionId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const pos = await tx.hrPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true, name: true } });
      if (!pos) throw notFound('camp.err.rbac.12');
      const rows = await tx.corePositionRoleTemplate.findMany({
        where: { tenantId, positionId },
        select: { roleId: true, scope: true, role: { select: { name: true, isSystem: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return { position: pos, templates: rows.map((r) => ({ roleId: r.roleId, roleName: r.role.name, isSystem: r.role.isSystem, scope: r.scope })) };
    });
  }

  async setPositionTemplates(tenantId: string, authId: string, positionId: string, dto: SetPositionTemplatesDto) {
    const roleIds = dto.templates.map((t) => t.roleId);
    if (new Set(roleIds).size !== roleIds.length) throw badRequest('camp.err.rbac.13');
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        const pos = await tx.hrPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true, name: true } });
        if (!pos) throw notFound('camp.err.rbac.12');
        if (roleIds.length > 0) {
          const found = await tx.coreRole.count({ where: { tenantId, id: { in: roleIds } } });
          if (found !== roleIds.length) throw badRequest('camp.err.rbac.2');
        }
        const label = (rows: { roleId: string; scope: string }[]) => rows.map((r) => `${r.roleId}:${r.scope}`).sort().join(', ');
        const before = await tx.corePositionRoleTemplate.findMany({ where: { tenantId, positionId }, select: { roleId: true, scope: true } });
        await tx.corePositionRoleTemplate.deleteMany({ where: { tenantId, positionId } });
        if (dto.templates.length > 0) {
          await tx.corePositionRoleTemplate.createMany({ data: dto.templates.map((t) => ({ tenantId, positionId, roleId: t.roleId, scope: t.scope })) });
        }
        await this.audit.record(tx, {
          tenantId, campId: null, entityType: 'position_template', entityId: positionId, action: 'UPDATE', actorUserId,
          fields: ['templates'], before: { templates: label(before) }, after: { templates: label(dto.templates) },
          summaryParams: { name: pos.name },
        });
        const rows = await tx.corePositionRoleTemplate.findMany({
          where: { tenantId, positionId },
          select: { roleId: true, scope: true, role: { select: { name: true, isSystem: true } } },
          orderBy: { createdAt: 'asc' },
        });
        return { position: pos, templates: rows.map((r) => ({ roleId: r.roleId, roleName: r.role.name, isSystem: r.role.isSystem, scope: r.scope })) };
      }),
    );
  }
}
