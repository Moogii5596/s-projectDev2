import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { normalizeMnPhone, usernameFromCode } from '../../../auth/login-identifier';
import { TenantCacheService } from '../../../auth/tenant-cache.service';

const P = CAMP_PERMISSIONS;
const key = (code: string, campId: string | null) => `${code}@${campId ?? '*'}`;
const unkey = (k: string) => {
  const i = k.lastIndexOf('@');
  const camp = k.slice(i + 1);
  return { permissionCode: k.slice(0, i), campId: camp === '*' ? null : camp };
};

/**
 * v0.2.2 Блок 2 (ADR-003 §2.1, D-11, D-13) — ажилтан ↔ хэрэглэгч (нэвтрэх эрх) холбох.
 * Холбоход: утас (Монгол 8 орон, давтагдашгүй) → core_users.phone; үгүй бол username (ажилтны кодоос).
 * Албан тушаалын загвар → camp_user_roles (source_position_id) — DB trigger (20261013004) бүх замд.
 */
@Injectable()
export class CampEmployeeLoginService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly tenantCache: TenantCacheService,
  ) {}

  private async findEmployee(tx: Tx, tenantId: string, campId: string, id: string) {
    const e = await tx.campEmployee.findFirst({
      where: { id, tenantId, campId },
      select: { id: true, campId: true, employeeCode: true, fullName: true, phone: true, status: true, positionId: true, userId: true },
    });
    if (!e) throw notFound('camp.err.login.1');
    return e;
  }

  /** Нэвтрэх нэр олгох (D-13): утас давтагдашгүй бол утас, үгүй бол username. Аль хэдийн байгааг дарж бичихгүй. */
  private async assignIdentifiers(tx: Tx, tenantId: string, user: { id: string; phone: string | null; username: string | null }, e: { id: string; employeeCode: string; phone: string | null }) {
    const phone = normalizeMnPhone(e.phone);
    if (phone && !user.phone) {
      const taken = await tx.coreUser.findFirst({ where: { tenantId, phone, isActive: true, NOT: { id: user.id } }, select: { id: true } });
      if (!taken) {
        await tx.coreUser.update({ where: { id: user.id }, data: { phone } });
        return { phone, username: user.username };
      }
    }
    if (user.phone) return { phone: user.phone, username: user.username };
    if (user.username) return { phone: null, username: user.username };
    const base = usernameFromCode(e.employeeCode, new Set(), e.id);
    const rows = await tx.coreUser.findMany({
      where: { tenantId, isActive: true, username: { startsWith: base } },
      select: { username: true },
    });
    const username = usernameFromCode(e.employeeCode, new Set(rows.map((r) => r.username!).filter(Boolean)), e.id);
    await tx.coreUser.update({ where: { id: user.id }, data: { username } });
    return { phone: null, username };
  }

  /** PUT /camp/camps/:campId/employees/:id/user — userId = null → салгах (автомат роль trigger-ээр хасагдана) */
  async link(tenantId: string, authId: string, campId: string, employeeId: string, userId: string | null) {
    const res = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const e = await this.findEmployee(tx, tenantId, campId, employeeId);
        if (userId === null) {
          if (!e.userId) return { employeeId, userId: null, phone: null, username: null };
          await tx.campEmployee.update({ where: { id: e.id }, data: { userId: null } });
          await this.audit.record(tx, {
            tenantId, campId, entityType: 'employee', entityId: e.id, action: 'UPDATE', actorUserId,
            fields: ['userId'], before: { userId: e.userId }, after: { userId: null }, summaryParams: { code: e.employeeCode, name: e.fullName },
          });
          return { employeeId, userId: null, phone: null, username: null, previousUserId: e.userId };
        }
        if (e.status !== 'ACTIVE') throw badRequest('camp.err.login.2');
        if (e.userId && e.userId !== userId) throw conflict('camp.err.login.3');
        const user = await tx.coreUser.findFirst({
          where: { id: userId, tenantId },
          select: { id: true, isActive: true, phone: true, username: true, authId: true },
        });
        if (!user) throw badRequest('camp.err.rbac.5');
        if (!user.isActive) throw badRequest('camp.err.rbac.6');
        const other = await tx.campEmployee.findFirst({ where: { tenantId, userId, NOT: { id: e.id } }, select: { id: true } });
        if (other) throw conflict('camp.err.login.4');

        const ids = await this.assignIdentifiers(tx, tenantId, user, e);
        if (e.userId !== userId) {
          await tx.campEmployee.update({ where: { id: e.id }, data: { userId } }); // trigger → албан тушаалын загвар
          await this.audit.record(tx, {
            tenantId, campId, entityType: 'employee', entityId: e.id, action: 'UPDATE', actorUserId,
            fields: ['userId'], before: { userId: e.userId }, after: { userId }, summaryParams: { code: e.employeeCode, name: e.fullName },
          });
        }
        return { employeeId, userId, phone: ids.phone, username: ids.username, authId: user.authId };
      }),
    );
    await this.access.invalidate(tenantId);
    if ('authId' in res && res.authId) await this.tenantCache.invalidateMember(tenantId, res.authId);
    const { authId: _a, ...out } = res as typeof res & { authId?: string };
    return out;
  }

  /**
   * GET …/employees/:id/position-preview?positionId= — албан тушаал солиход хэрэглэгчийн эцсийн эрх + / −.
   * positionId = null → албан тушаалгүй болгох. Нэвтрэх эрхгүй ажилтан → хоосон.
   */
  async positionPreview(tenantId: string, authId: string, campId: string, employeeId: string, positionId: string | null) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      const e = await this.findEmployee(tx, tenantId, campId, employeeId);
      if (!e.userId) return { employeeId, userId: null, add: [], remove: [] };
      const rows = await tx.campUserPermission.findMany({
        where: { tenantId, userId: e.userId },
        select: { permissionCode: true, campId: true, userRole: { select: { sourcePositionId: true } } },
      });
      const all = new Set(rows.map((r) => key(r.permissionCode, r.campId)));
      // автомат (албан тушаалын) олголтоос бусад эх сурвалж — солиход үлдэнэ
      const kept = new Set(rows.filter((r) => !r.userRole?.sourcePositionId).map((r) => key(r.permissionCode, r.campId)));
      const projected = new Set(kept);
      if (positionId) {
        const tpl = await tx.campPositionRoleTemplate.findMany({
          where: { tenantId, positionId },
          select: { scope: true, role: { select: { permissions: { select: { permissionCode: true } } } } },
        });
        for (const t of tpl) {
          const camp = t.scope === 'ALL_CAMPS' ? null : e.campId;
          for (const p of t.role.permissions) projected.add(key(p.permissionCode, camp));
        }
      }
      return {
        employeeId,
        userId: e.userId,
        add: [...projected].filter((k) => !all.has(k)).sort().map(unkey),
        remove: [...all].filter((k) => !projected.has(k)).sort().map(unkey),
      };
    });
  }

  /**
   * POST /camp/positions/:positionId/role-templates/apply — загвар өөрчилсний дараа тухайн албан тушаалтай
   * (нэвтрэх эрхтэй) бүх ажилтанд дахин хуулах. Гараар олгосон олголт хөндөгдөхгүй.
   */
  async applyPositionTemplates(tenantId: string, authId: string, positionId: string) {
    const res = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
        const pos = await tx.campPosition.findFirst({ where: { id: positionId, tenantId }, select: { id: true } });
        if (!pos) throw notFound('camp.err.rbac.12');
        const emps = await tx.campEmployee.findMany({
          where: { tenantId, positionId, userId: { not: null } },
          select: { userId: true, campId: true },
        });
        const userIds = emps.map((x) => x.userId!);
        if (userIds.length === 0) return { positionId, users: 0 };
        await tx.campUserRole.deleteMany({ where: { tenantId, userId: { in: userIds }, sourcePositionId: positionId } });
        const tpl = await tx.campPositionRoleTemplate.findMany({ where: { tenantId, positionId }, select: { roleId: true, scope: true } });
        // createMany + skipDuplicates: гараар олгосон ижил роль × кемп → хэвээр (trigger-тэй ижил дүрэм)
        await tx.campUserRole.createMany({
          data: emps.flatMap((x) =>
            tpl.map((t) => ({ tenantId, userId: x.userId!, roleId: t.roleId, campId: t.scope === 'ALL_CAMPS' ? null : x.campId, sourcePositionId: positionId })),
          ),
          skipDuplicates: true,
        });
        return { positionId, users: new Set(userIds).size };
      }),
    );
    await this.access.invalidate(tenantId);
    return res;
  }
}
