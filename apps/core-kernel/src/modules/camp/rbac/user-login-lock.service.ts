import { Injectable } from '@nestjs/common';
import { CampAuditAction } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { LoginLockService, NO_LOGIN_LOCK, type LoginLockStatus } from '../../../auth/login-lock.service';
import { notFound } from '../../../common/i18n/app-error';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { inTenantTx } from '../../core/platform/tenant-tx';

/**
 * #28 (H-13) — нэвтрэлтийн түгжээ хэрэглэгчийн удирдлагад: жагсаалтын мөрөнд төлөв, «Түгжээ тайлах» (audit).
 * Эрх = системийн админ (OWNER / ADMIN, SEC-009) — хэрэглэгчийн удирдлагын бусад үйлдэлтэй ижил.
 * Тоолуур өөрөө `LoginLockService` (auth, SYSTEM холболт); энд зөвхөн tenant шүүлт (core_users.id → authId), эрх, audit.
 */
@Injectable()
export class UserLoginLockService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly loginLocks: LoginLockService,
  ) {}

  /** Жагсаалтын мөр бүрт `loginLock` нэмнэ. Дуудагч (listUsers) эрхийг аль хэдийн шалгасан; authId хариунд орохгүй */
  async attach<T extends { id: string }>(tenantId: string, rows: T[]): Promise<(T & { loginLock: LoginLockStatus })[]> {
    if (rows.length === 0) return [];
    const users = await inTenantTx(this.prisma, tenantId, (tx) =>
      tx.coreUser.findMany({ where: { tenantId, id: { in: rows.map((r) => r.id) } }, select: { id: true, authId: true } }),
    );
    const authBy = new Map(users.map((u) => [u.id, u.authId]));
    const locks = await this.loginLocks.statuses(users.map((u) => u.authId));
    return rows.map((r) => ({ ...r, loginLock: locks.get(authBy.get(r.id) ?? '') ?? NO_LOGIN_LOCK }));
  }

  /** POST /core/rbac/users/:userId/login-unlock — өөр tenant-ийн хэрэглэгч → 404; идемпотент (түгжээгүй бол audit бичихгүй) */
  async unlock(tenantId: string, authId: string, userId: string) {
    const target = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const u = await tx.coreUser.findFirst({ where: { tenantId, id: userId }, select: { authId: true, fullName: true, email: true } });
      if (!u) throw notFound('camp.err.rbac.5');
      return u;
    });
    const before = await this.loginLocks.status(target.authId);
    const { wasLocked } = await this.loginLocks.unlock(target.authId);
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'user_login_lock', entityId: userId, action: CampAuditAction.UPDATE, actorUserId,
        fields: ['locked', 'failedCount'],
        before: { locked: before.locked, failedCount: before.failedCount },
        after: { locked: false, failedCount: 0 },
        summaryParams: { name: target.fullName?.trim() || target.email },
      });
    });
    return { ok: true as const, wasLocked };
  }
}
