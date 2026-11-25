/**
 * #28 (H-13) — нэвтрэлтийн түгжээ хэрэглэгчийн удирдлагад: жагсаалтад төлөв, тайлах (эрх, tenant шүүлт, audit)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserLoginLockService } from '../user-login-lock.service';
import { PERMISSIONS } from '../../../core/permissions/permission-registry';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { MESSAGES } from '../../../../common/i18n/messages';

const LOCKED = { locked: true, lockedUntil: '2026-11-25T10:00:00.000Z', failedCount: 5 };
const NONE = { locked: false, lockedUntil: null, failedCount: 0 };

describe('UserLoginLockService (#28)', () => {
  let s: ReturnType<typeof setup>;
  let locks: { statuses: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };
  let svc: UserLoginLockService;
  const target = { authId: 'auth-2', fullName: 'Бат', email: 'b@b.mn' };

  beforeEach(() => {
    s = setup();
    locks = {
      statuses: vi.fn().mockResolvedValue(new Map([['auth-2', LOCKED]])),
      status: vi.fn().mockResolvedValue(LOCKED),
      unlock: vi.fn().mockResolvedValue({ wasLocked: true }),
    };
    svc = new UserLoginLockService(s.prisma as never, s.access, s.audit, locks as never);
  });

  it('attach: tenant-ийн tx-ээр id → authId; мөр бүрт төлөв, authId хариунд орохгүй; мөргүй = түгжээгүй', async () => {
    s.tx.coreUser.findMany.mockResolvedValueOnce([{ id: 'u1', authId: 'auth-1' }, { id: 'u2', authId: 'auth-2' }]);
    const rows = await svc.attach('t1', [{ id: 'u1', email: 'a@b.mn' }, { id: 'u2', email: 'b@b.mn' }, { id: 'gone', email: 'x@b.mn' }]);
    expectTenantTx(s.tx, 't1');
    expect(s.tx.coreUser.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: { in: ['u1', 'u2', 'gone'] } });
    expect(locks.statuses).toHaveBeenCalledWith(['auth-1', 'auth-2']);
    expect(rows).toEqual([
      { id: 'u1', email: 'a@b.mn', loginLock: NONE },
      { id: 'u2', email: 'b@b.mn', loginLock: LOCKED },
      { id: 'gone', email: 'x@b.mn', loginLock: NONE },
    ]);
  });

  it('attach: хоосон жагсаалт → query хийхгүй', async () => {
    expect(await svc.attach('t1', [])).toEqual([]);
    expect(locks.statuses).not.toHaveBeenCalled();
  });

  it('unlock: системийн админ биш → 403, тоолуурт хүрэхгүй', async () => {
    setActor(s.tx, { roles: [{ campId: null, perms: [PERMISSIONS.SETTINGS_MANAGE] }] });
    await expect(svc.unlock('t1', 'a1', 'u2')).rejects.toThrow(ForbiddenException);
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it('unlock: өөр tenant-ийн / байхгүй хэрэглэгч → 404, тоолуурт хүрэхгүй', async () => {
    setActor(s.tx, { role: UserRole.ADMIN });
    await expect(svc.unlock('t1', 'a1', 'other-tenant-user')).rejects.toThrow(NotFoundException);
    expect(s.tx.coreUser.findFirst.mock.calls.at(-1)?.[0].where).toEqual({ tenantId: 't1', id: 'other-tenant-user' });
    expect(locks.unlock).not.toHaveBeenCalled();
  });

  it('unlock: ADMIN → зорилтот authId-аар тайлна, audit (user_login_lock, нэртэй)', async () => {
    setActor(s.tx, { userId: 'cu-me', role: UserRole.ADMIN }, (a) => ('id' in a.where ? target : null));
    expect(await svc.unlock('t1', 'a1', 'u2')).toEqual({ ok: true, wasLocked: true });
    expect(locks.unlock).toHaveBeenCalledWith('auth-2');
    const row = s.tx.campAuditLog.create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      tenantId: 't1', entityType: 'user_login_lock', entityId: 'u2', actorUserId: 'cu-me',
      summaryKey: 'audit.user_login_lock.update', summaryParams: { name: 'Бат' },
    });
    const m = MESSAGES['audit.user_login_lock.update'];
    expect(m?.mn && m.en && m.zh).toBeTruthy();
  });

  it('unlock: түгжээ, тоолуургүй → идемпотент, audit бичихгүй', async () => {
    setActor(s.tx, { userId: 'cu-me', role: UserRole.OWNER }, (a) => ('id' in a.where ? target : null));
    locks.status.mockResolvedValueOnce(NONE);
    locks.unlock.mockResolvedValueOnce({ wasLocked: false });
    expect(await svc.unlock('t1', 'a1', 'u2')).toEqual({ ok: true, wasLocked: false });
    expect(s.tx.campAuditLog.create).not.toHaveBeenCalled();
  });
});
