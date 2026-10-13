import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx } from '../common/camp-tx';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { UserAdminService } from '../../../auth/user-admin.service';
import { InviteService } from '../../../auth/invite.service';
import { CampEmployeeLoginService } from './camp-employee-login.service';

const P = CAMP_PERMISSIONS;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * v0.2.2 Блок 3 (ADR-003 §2.1, §2.3) — ажилтны картаас нэвтрэх эрх үүсгэх, урилга (линк / имэйл).
 * Бүгд `camp.roles.manage` (tenant түвшин). UI = Блок 4.
 */
@Injectable()
export class CampUserAccessService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly userAdmin: UserAdminService,
    private readonly invites: InviteService,
    private readonly login: CampEmployeeLoginService,
  ) {}

  /**
   * POST /camp/camps/:campId/employees/:id/create-user { email? }
   * Имэйл: өгсөн → эсвэл ажилтны картынх → эсвэл байхгүй (дотоод `.login.invalid`). Дараа нь холбоно (утас/username + албан тушаалын загвар).
   */
  async createUserForEmployee(tenantId: string, tenantSlug: string, authId: string, campId: string, employeeId: string, email: string | null | undefined) {
    const prep = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      const e = await tx.hrEmployee.findFirst({
        where: { id: employeeId, tenantId, campId },
        select: { id: true, fullName: true, email: true, status: true, userId: true },
      });
      if (!e) throw notFound('camp.err.login.1');
      if (e.status !== 'ACTIVE') throw badRequest('camp.err.login.2');
      if (e.userId) throw conflict('camp.err.login.3');
      const chosen = (email === undefined ? e.email : email)?.trim().toLowerCase() || null;
      if (chosen && !EMAIL_RE.test(chosen)) throw badRequest('auth.user_invalid', { reason: 'email' });
      if (chosen) {
        const dup = await tx.coreUser.findFirst({ where: { tenantId, email: chosen }, select: { id: true } });
        if (dup) throw conflict('auth.user_exists');
      }
      return { e, email: chosen };
    });
    const user = await this.userAdmin.createUser({
      tenantId, tenantSlug, email: prep.email, password: null, fullName: prep.e.fullName,
    });
    let linked: Awaited<ReturnType<CampEmployeeLoginService['link']>>;
    try {
      linked = await this.login.link(tenantId, authId, campId, employeeId, user.id);
    } catch (err) {
      // холбож чадаагүй (зэрэг өөр админ холбосон г.м.) → шинэ хэрэглэгчийг буцааж устгана
      await inTenantTx(this.prisma, tenantId, (tx) => tx.coreUser.delete({ where: { id: user.id } })).catch(() => undefined);
      await this.userAdmin.admin().auth.admin.deleteUser(user.authId).catch(() => undefined);
      throw err;
    }
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE);
      await this.audit.record(tx, {
        tenantId, campId, entityType: 'user_account', entityId: user.id, action: 'CREATE', actorUserId,
        fields: ['employeeId', 'hasEmail'], before: null, after: { employeeId, hasEmail: !!prep.email },
        summaryParams: { name: prep.e.fullName },
      });
    });
    return { userId: user.id, employeeId, hasEmail: !!prep.email, phone: linked.phone, username: linked.username };
  }

  /** POST /camp/users/:userId/invites { channel } — LINK: линк нэг удаа буцна; EMAIL: имэйлээр */
  async invite(tenantId: string, authId: string, userId: string, channel: 'LINK' | 'EMAIL') {
    const actorUserId = await inTenantTx(this.prisma, tenantId, (tx) => this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE));
    const res = await this.invites.createInvite({ tenantId, userId, purpose: 'INVITE', channel, createdBy: actorUserId });
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const u = await tx.coreUser.findFirst({ where: { id: userId, tenantId }, select: { fullName: true, email: true } });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'user_invite', entityId: res.inviteId, action: 'CREATE', actorUserId,
        fields: ['userId', 'channel', 'expiresAt'], before: null, after: { userId, channel, expiresAt: res.expiresAt },
        summaryParams: { name: u?.fullName ?? '', channel },
      });
    });
    return res;
  }

  /** GET /camp/invites/options — имэйл суваг идэвхтэй эсэх (UI товч) */
  async options(tenantId: string, authId: string) {
    await inTenantTx(this.prisma, tenantId, (tx) => this.access.require(tx, tenantId, authId, null, P.ROLES_MANAGE));
    return this.invites.options();
  }
}
