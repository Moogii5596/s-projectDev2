/**
 * v0.2.2 Блок 4 — хэрэглэгчийн жагсаалт (B4-Q3), идэвхгүй болгох (B4-Q2)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CampRbacService } from '../camp-rbac.service';
import { CampUserAccessService } from '../camp-user-access.service';
import { buildUserRows, deactivateBlocker, inviteStatus } from '../user-list';
import { CAMP_PERMISSIONS } from '../../common/camp-permissions';
import { expectTenantTx, setActor, setup } from '../../common/tests/camp-test-utils';
import { MESSAGES } from '../../../../common/i18n/messages';

const P = CAMP_PERMISSIONS;
const NOW = new Date('2026-10-16T04:00:00Z');
const d = (iso: string) => new Date(iso);

describe('user-list (цэвэр)', () => {
  it('inviteStatus: хүчингүй > ашигласан > хугацаа > хүлээгдэж буй', () => {
    const base = { expiresAt: d('2026-10-17T00:00:00Z'), usedAt: null, revokedAt: null };
    expect(inviteStatus(base, NOW)).toBe('PENDING');
    expect(inviteStatus({ ...base, expiresAt: NOW }, NOW)).toBe('EXPIRED');
    expect(inviteStatus({ ...base, usedAt: NOW }, NOW)).toBe('USED');
    expect(inviteStatus({ ...base, usedAt: NOW, revokedAt: NOW }, NOW)).toBe('REVOKED');
  });

  it('buildUserRows: ажилтан, СҮҮЛИЙН урилга (эхнийх), дотоод имэйл', () => {
    const users = [
      { id: 'u1', email: 'u-1@sino.login.invalid', fullName: 'Бат', isActive: true, role: 'REQUESTER', phone: '99112233', username: null },
      { id: 'u2', email: 'a@b.mn', fullName: null, isActive: false, role: 'OWNER', phone: null, username: 'wang' },
    ];
    const rows = buildUserRows(
      users,
      [{ id: 'e1', userId: 'u1', employeeCode: 'E01', fullName: 'Бат', campId: 'c1', camp: { code: 'K1' } }],
      [
        { userId: 'u1', channel: 'LINK', expiresAt: d('2026-10-20T00:00:00Z'), usedAt: null, revokedAt: null, createdAt: d('2026-10-15T00:00:00Z') },
        { userId: 'u1', channel: 'EMAIL', expiresAt: d('2026-10-10T00:00:00Z'), usedAt: d('2026-10-09T00:00:00Z'), revokedAt: null, createdAt: d('2026-10-08T00:00:00Z') },
      ],
      NOW,
    );
    expect(rows[0]).toMatchObject({
      internalEmail: true,
      employee: { id: 'e1', employeeCode: 'E01', campId: 'c1', campCode: 'K1' },
      invite: { status: 'PENDING', channel: 'LINK', expiresAt: '2026-10-20T00:00:00.000Z' },
    });
    expect(rows[1]).toMatchObject({ internalEmail: false, employee: null, invite: null, username: 'wang' });
  });

  it('deactivateBlocker: өөрийгөө, сүүлийн идэвхтэй OWNER', () => {
    expect(deactivateBlocker({ id: 'me', role: 'ADMIN', isActive: true }, 'me', 0)).toBe('camp.err.user.1');
    expect(deactivateBlocker({ id: 'o', role: 'OWNER', isActive: true }, 'me', 1)).toBe('camp.err.user.2');
    expect(deactivateBlocker({ id: 'o', role: 'OWNER', isActive: true }, 'me', 2)).toBeNull();
    expect(deactivateBlocker({ id: 'x', role: 'REQUESTER', isActive: true }, 'me', 0)).toBeNull();
  });

  it('шинэ алдаа/аудитын мессеж mn/en/zh', () => {
    for (const k of ['camp.err.user.1', 'camp.err.user.2', 'audit.user_account.update', 'audit.user_account.deactivate']) {
      const m = (MESSAGES as Record<string, { mn: string; en: string; zh: string }>)[k];
      expect(m?.mn && m.en && m.zh, k).toBeTruthy();
    }
  });
});

describe('CampRbacService.listUsers (B4-Q3)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('tenant-ийн tx дотор; ажилтан + урилгыг tenantId-аар шүүнэ', async () => {
    setActor(s.tx, { roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] });
    s.tx.coreUser.findMany.mockResolvedValueOnce([{ id: 'u1', email: 'a@b.mn', fullName: 'A', isActive: true, role: 'REQUESTER', phone: null, username: null }]);
    const svc = new CampRbacService(s.prisma as never, s.access, s.audit);
    const rows = await svc.listUsers('t1', 'a1');
    expectTenantTx(s.tx, 't1');
    expect(s.tx.hrEmployee.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: { in: ['u1'] } });
    expect(s.tx.coreUserInvite.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: { in: ['u1'] }, purpose: 'INVITE' });
    expect(rows[0]).toMatchObject({ id: 'u1', employee: null, invite: null, internalEmail: false });
  });
});

describe('CampUserAccessService.setActive (B4-Q2)', () => {
  let s: ReturnType<typeof setup>;
  let userAdmin: { setBanned: ReturnType<typeof vi.fn> };
  let svc: CampUserAccessService;
  const target = { id: 'u2', authId: 'auth-2', role: UserRole.REQUESTER, isActive: true, fullName: 'Бат', email: 'b@b.mn' };

  beforeEach(() => {
    s = setup();
    userAdmin = { setBanned: vi.fn().mockResolvedValue(undefined) };
    svc = new CampUserAccessService(s.prisma as never, s.access, s.audit, userAdmin as never, {} as never, {} as never);
  });

  const asManager = (found: unknown = target) =>
    setActor(s.tx, { userId: 'cu-me', roles: [{ campId: null, perms: [P.ROLES_MANAGE] }] }, (a) => ('id' in a.where ? found : null));

  it('roles.manage-гүй → 403, ban хийхгүй', async () => {
    setActor(s.tx, { roles: [{ campId: 'c1', perms: [P.ROLES_MANAGE] }] });
    await expect(svc.setActive('t1', 'a1', 'u2', false)).rejects.toThrow(ForbiddenException);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('идэвхгүй болгох: ban → is_active=false (tenantId-тай) → урилга хүчингүй → аудит', async () => {
    asManager();
    const res = await svc.setActive('t1', 'a1', 'u2', false);
    expect(res).toEqual({ id: 'u2', isActive: false });
    expect(userAdmin.setBanned).toHaveBeenCalledWith('auth-2', true);
    expect(s.tx.coreUser.updateMany).toHaveBeenCalledWith({ where: { id: 'u2', tenantId: 't1' }, data: { isActive: false } });
    expect(s.tx.coreUserInvite.updateMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', userId: 'u2', usedAt: null, revokedAt: null });
    expect(s.tx.campAuditLog.create).toHaveBeenCalled();
  });

  it('сэргээх: unban, урилгад хүрэхгүй', async () => {
    asManager({ ...target, isActive: false });
    await svc.setActive('t1', 'a1', 'u2', true);
    expect(userAdmin.setBanned).toHaveBeenCalledWith('auth-2', false);
    expect(s.tx.coreUserInvite.updateMany).not.toHaveBeenCalled();
  });

  it('өөрчлөлтгүй бол юу ч хийхгүй', async () => {
    asManager();
    await svc.setActive('t1', 'a1', 'u2', true);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
    expect(s.tx.coreUser.updateMany).not.toHaveBeenCalled();
  });

  it('өөрийгөө / сүүлийн OWNER → 400, ban хийхгүй', async () => {
    asManager({ ...target, id: 'cu-me' });
    await expect(svc.setActive('t1', 'a1', 'cu-me', false)).rejects.toThrow(BadRequestException);
    asManager({ ...target, role: UserRole.OWNER });
    s.tx.coreUser.count.mockResolvedValueOnce(1);
    await expect(svc.setActive('t1', 'a1', 'u2', false)).rejects.toThrow(BadRequestException);
    expect(userAdmin.setBanned).not.toHaveBeenCalled();
  });

  it('DB бичилт унавал ban-ийг буцаана', async () => {
    asManager();
    s.tx.coreUser.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.setActive('t1', 'a1', 'u2', false)).rejects.toThrow('db down');
    expect(userAdmin.setBanned.mock.calls).toEqual([['auth-2', true], ['auth-2', false]]);
  });
});
