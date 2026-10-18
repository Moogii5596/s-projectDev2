import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { inTenantTx } from '../common/camp-tx';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { UserAdminService } from '../../../auth/user-admin.service';
import { InviteService } from '../../../auth/invite.service';
import { CampEmployeeLoginService } from './camp-employee-login.service';
import { deactivateBlocker } from './user-list';
import { CampAuditAction } from '@prisma/client';
import { TenantCacheService } from '../../../auth/tenant-cache.service';

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
    private readonly tenantCache: TenantCacheService,
  ) {}

  /**
   * POST /camp/camps/:campId/employees/:id/create-user { email? }
   * Имэйл: өгсөн → эсвэл ажилтны картынх → эсвэл байхгүй (дотоод `.login.invalid`). Дараа нь холбоно (утас/username + албан тушаалын загвар).
   */
  async createUserForEmployee(tenantId: string, tenantSlug: string, authId: string, campId: string, employeeId: string, email: string | null | undefined) {
    const prep = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
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
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
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
    const actorUserId = await inTenantTx(this.prisma, tenantId, (tx) => this.access.requireTenantAdmin(tx, tenantId, authId));
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

  /**
   * v0.2.2 Блок 4 (B4-Q2): PATCH /camp/users/:userId { isActive } — идэвхгүй болгох / сэргээх.
   * GoTrue-д ban (нэвтрэлт, refresh хаагдана) → `core_users.is_active` (Кемпийн бүх API шууд 403) + хүлээгдэж буй урилгыг хүчингүй.
   * DB амжилтгүй бол ban-ийг буцаана. Өөрийгөө / сүүлийн идэвхтэй OWNER-ийг идэвхгүй болгохгүй.
   */
  async setActive(tenantId: string, authId: string, userId: string, isActive: boolean) {
    const prep = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const user = await tx.coreUser.findFirst({ where: { id: userId, tenantId }, select: { id: true, authId: true, role: true, isActive: true, fullName: true, email: true } });
      if (!user) throw notFound('camp.err.rbac.5');
      if (isActive && !user.isActive) {
        // №5 (Блок 6б): ажлаас гарсан ажилтны хэрэглэгчийг энд сэргээхгүй — «Дахин ажилд авах» (шинэ бүртгэл, загвараас эрх)
        const terminated = await tx.hrEmployee.findFirst({ where: { tenantId, userId, status: 'TERMINATED' }, select: { id: true } });
        if (terminated) throw badRequest('camp.err.user.terminated');
      }
      if (!isActive) {
        const owners = user.role === 'OWNER' ? await tx.coreUser.count({ where: { tenantId, role: 'OWNER', isActive: true } }) : 0;
        const blocked = deactivateBlocker(user, actorUserId, owners);
        if (blocked) throw badRequest(blocked);
      }
      return user;
    });
    if (prep.isActive === isActive) return { id: prep.id, isActive };
    await this.userAdmin.setBanned(prep.authId, !isActive);
    try {
      await inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
        await tx.coreUser.updateMany({ where: { id: userId, tenantId }, data: { isActive } });
        if (!isActive) {
          await tx.coreUserInvite.updateMany({ where: { tenantId, userId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        await this.audit.record(tx, {
          tenantId, campId: null, entityType: 'user_account', entityId: userId, action: CampAuditAction.UPDATE, actorUserId,
          fields: ['isActive'], before: { isActive: prep.isActive }, after: { isActive },
          summaryParams: { name: prep.fullName ?? prep.email },
        });
      });
    } catch (err) {
      await this.userAdmin.setBanned(prep.authId, isActive).catch(() => undefined);
      throw err;
    }
    // №3 (Блок 6б): membership (5 мин) + эрхийн cache — идэвхгүй болсон хэрэглэгч шууд гарна (guard 403 auth.not_member)
    await this.tenantCache.invalidateMember(tenantId, prep.authId);
    await this.access.invalidate(tenantId);
    return { id: userId, isActive };
  }

  /** GET /camp/invites/options — имэйл суваг идэвхтэй эсэх (UI товч) */
  async options(tenantId: string, authId: string) {
    await inTenantTx(this.prisma, tenantId, (tx) => this.access.requireTenantAdmin(tx, tenantId, authId));
    return this.invites.options();
  }
}
