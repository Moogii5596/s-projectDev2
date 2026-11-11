/**
 * SEC-005 (v0.1.6) — POST /auth/register: зөвхөн OWNER/ADMIN, tenant = нэвтэрсэн хэрэглэгчийнх (Host биш)
 */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

const T = '00000000-0000-0000-0000-0000000000aa';
const dto = { email: 'new@a.mn', password: 'Password123!', fullName: 'Шинэ' };

function make(role: string, isActive = true) {
  const authService = {
    getMe: vi.fn(async () => ({ id: 'c1', role, isActive, tenantId: T })),
    register: vi.fn(async () => ({ accessToken: 'x', user: {} })),
  };
  // 2-р аргумент: хуучин (SEC-005-аас өмнөх) controller Host → tenant хайдаг байсан — тест хуучин кодыг ч бодитоор шалгана
  const tenantCache = { getTenantId: vi.fn(async () => T) };
  const ctrl = new (AuthController as unknown as new (...a: unknown[]) => AuthController)(authService, tenantCache);
  const req = { user: { id: 'auth-1', email: 'me@a.mn', tenantId: T, tenantSlug: 'a' }, headers: { host: 'localhost' } };
  return { authService, run: () => ctrl.register(dto as never, req as never) };
}

describe('AuthController.register [SEC-005]', () => {
  it.each(['VIEWER', 'REQUESTER', 'APPROVER'])('%s → 403, бүртгэл үүсгэхгүй', async (role) => {
    const m = make(role);
    await expect(m.run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.authService.register).not.toHaveBeenCalled();
  });

  it('идэвхгүй ADMIN → 403', async () => {
    const m = make('ADMIN', false);
    await expect(m.run()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['OWNER', 'ADMIN'])('%s → нэвтэрсэн хэрэглэгчийн tenant-д үүсгэнэ (Host-оос үл хамаарна)', async (role) => {
    const m = make(role);
    await m.run();
    expect(m.authService.getMe).toHaveBeenCalledWith('auth-1', T);
    expect(m.authService.register).toHaveBeenCalledWith(dto, T);
  });
});

describe('AuthController — төхөөрөмжүүд, нууц үг солих (PIL-15)', () => {
  const SID = '223e4567-e89b-42d3-a456-426614174001';
  const jwt = `x.${Buffer.from(JSON.stringify({ session_id: SID })).toString('base64url')}.y`;
  const req = { user: { id: 'auth-1', tenantId: T }, headers: { authorization: `Bearer ${jwt}` } };
  function build() {
    const signIn = { changePassword: vi.fn(async () => ({ changed: true })) };
    const sessionRevoke = {
      list: vi.fn(async () => [{ id: SID, current: true }]),
      revokeOthers: vi.fn(async () => 2),
      revokeOne: vi.fn(async () => undefined),
    };
    const ctrl = new (AuthController as unknown as new (...a: unknown[]) => AuthController)({}, signIn, {}, sessionRevoke);
    return { ctrl, signIn, sessionRevoke };
  }

  it('change-password: хэрэглэгчийн ӨӨРИЙН access token-ыг дамжуулна (одоогийн session үлдэнэ)', async () => {
    const { ctrl, signIn } = build();
    await ctrl.changePassword({ currentPassword: 'a', newPassword: 'b' } as never, req as never);
    expect(signIn.changePassword).toHaveBeenCalledWith(T, 'auth-1', 'a', 'b', jwt, undefined);
  });

  it('sessions: өөрийн authId + одоогийн session_id-аар жагсаана', async () => {
    const { ctrl, sessionRevoke } = build();
    expect(await ctrl.sessions(req as never)).toEqual([{ id: SID, current: true }]);
    expect(sessionRevoke.list).toHaveBeenCalledWith('auth-1', SID);
  });

  it('sessions/others, sessions/:id: өөрийн authId-ээр, одоогийн session хамгаалагдана', async () => {
    const { ctrl, sessionRevoke } = build();
    expect(await ctrl.revokeOtherSessions(req as never)).toEqual({ revoked: 2 });
    expect(sessionRevoke.revokeOthers).toHaveBeenCalledWith('auth-1', SID);
    expect(await ctrl.revokeSession('s2', req as never)).toEqual({ revoked: true });
    expect(sessionRevoke.revokeOne).toHaveBeenCalledWith('auth-1', 's2', SID);
  });
});
