import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteService, FORGOT_LIMITS } from './invite.service';
import { hashToken } from './invite-token';

const TOKEN = 'A'.repeat(43);

function setup(opts: { publicUrl?: string; mail?: boolean; user?: Record<string, unknown> | null } = {}) {
  const user = opts.user === undefined ? { id: 'u1', email: 'bat@sino.mn', fullName: 'Бат', locale: 'mn', phone: '99112233', username: null, isActive: true } : opts.user;
  const tx = {
    $executeRaw: vi.fn(),
    coreUser: { findFirst: vi.fn().mockResolvedValue(user) },
    coreUserInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn().mockResolvedValue({ id: 'inv1' }), update: vi.fn() },
  };
  const prisma = { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const system = { $queryRaw: vi.fn(), $executeRaw: vi.fn().mockResolvedValue(1) };
  const userAdmin = { setPassword: vi.fn().mockResolvedValue(undefined) };
  const mailer = { isEnabled: vi.fn(() => opts.mail ?? true), send: vi.fn().mockResolvedValue(undefined) };
  const tenantCache = { invalidateMember: vi.fn() };
  const signIn = { tenantIdFromHost: vi.fn().mockResolvedValue('t1'), findLoginUser: vi.fn() };
  const counters = new Map<string, number>();
  const redis = { incr: vi.fn(async (k: string) => { const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); return n; }), pexpire: vi.fn() };
  const config = { get: (k: string) => (k === 'PUBLIC_APP_URL' ? (opts.publicUrl ?? 'https://sino.gobiverse.website/') : undefined) };
  const sessions = { revokeOthers: vi.fn(), revokeAll: vi.fn().mockResolvedValue(undefined) };
  const svc = new InviteService(config as never, prisma as never, system as never, userAdmin as never, mailer as never, tenantCache as never, signIn as never, redis as never, sessions as never);
  return { svc, tx, system, userAdmin, mailer, tenantCache, signIn, sessions };
}

describe('InviteService (v0.2.2 Блок 3)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('LINK: өмнөх идэвхтэйг цуцлаад hash хадгална (токен өөрөө DB-д үгүй), url = PUBLIC_APP_URL + /invite/<токен>, 72 цаг', async () => {
    const r = await s.svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'LINK', createdBy: 'admin' });
    expect(s.tx.coreUserInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', purpose: 'INVITE', usedAt: null, revokedAt: null }) }));
    const data = s.tx.coreUserInvite.create.mock.calls[0][0].data;
    const token = r.path!.split('/').pop()!;
    expect(data.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(r.url).toBe(`https://sino.gobiverse.website/invite/${token}`);
    expect(r.expiresAt.getTime() - Date.now()).toBeGreaterThan(71.9 * 3600_000);
    expect(s.mailer.send).not.toHaveBeenCalled();
  });

  it('EMAIL: имэйл илгээж токеныг буцаахгүй; илгээлт амжилтгүй → цуцлаад 503', async () => {
    const r = await s.svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'EMAIL', createdBy: 'admin' });
    expect(r.path).toBeNull();
    expect(r.url).toBeNull();
    expect(s.mailer.send).toHaveBeenCalledWith('bat@sino.mn', expect.objectContaining({ text: expect.stringContaining('https://sino.gobiverse.website/invite/') }));
    s.mailer.send.mockRejectedValueOnce(new Error('smtp'));
    await expect(s.svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'EMAIL', createdBy: 'a' })).rejects.toMatchObject({ status: 503, code: 'auth.mail_failed' });
    expect(s.tx.coreUserInvite.update).toHaveBeenCalledWith({ where: { id: 'inv1' }, data: { revokedAt: expect.any(Date) } });
  });

  it('EMAIL татгалзах: дотоод имэйл, SMTP алга, PUBLIC_APP_URL алга; идэвхгүй хэрэглэгч', async () => {
    const internal = setup({ user: { id: 'u1', email: 'u-1@sino.login.invalid', fullName: null, locale: 'mn', phone: null, username: 'x', isActive: true } });
    await expect(internal.svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'EMAIL', createdBy: 'a' })).rejects.toMatchObject({ code: 'auth.invite_no_email' });
    await expect(setup({ mail: false }).svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'EMAIL', createdBy: 'a' })).rejects.toMatchObject({ code: 'auth.mail_disabled' });
    await expect(setup({ publicUrl: 'not a url' }).svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'EMAIL', createdBy: 'a' })).rejects.toMatchObject({ code: 'auth.public_url_missing' });
    const inactive = setup({ user: { id: 'u1', email: 'a@b', isActive: false } });
    await expect(inactive.svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'LINK', createdBy: 'a' })).rejects.toMatchObject({ code: 'camp.err.rbac.6' });
  });

  it('PUBLIC_APP_URL алга → LINK-д path л (url null)', async () => {
    const r = await setup({ publicUrl: '' }).svc.createInvite({ tenantId: 't1', userId: 'u1', purpose: 'INVITE', channel: 'LINK', createdBy: 'a' });
    expect(r.url).toBeNull();
    expect(r.path).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
  });

  it('inspect: буруу хэлбэр / олдохгүй / ашигласан → valid:false; ok → нэр + нэвтрэх нэр', async () => {
    expect(await s.svc.inspect('short')).toEqual({ valid: false, reason: 'invalid' });
    expect(s.system.$queryRaw).not.toHaveBeenCalled();
    s.system.$queryRaw.mockResolvedValueOnce([]);
    expect(await s.svc.inspect(TOKEN)).toEqual({ valid: false, reason: 'invalid' });
    const row = { id: 'i', tenant_id: 't1', user_id: 'u1', purpose: 'INVITE', expires_at: new Date(Date.now() + 1e6), expired: false, used: true, revoked: false, auth_id: 'a', email: 'e@x', full_name: 'Бат', phone: '99112233', username: null, is_active: true };
    s.system.$queryRaw.mockResolvedValueOnce([row]);
    expect(await s.svc.inspect(TOKEN)).toEqual({ valid: false, reason: 'used' });
    s.system.$queryRaw.mockResolvedValueOnce([{ ...row, used: false }]);
    expect(await s.svc.inspect(TOKEN)).toMatchObject({ valid: true });
    s.system.$queryRaw.mockResolvedValueOnce([{ ...row, used: false, expired: true }]);
    expect(await s.svc.inspect(TOKEN)).toEqual({ valid: false, reason: 'expired' });
    s.system.$queryRaw.mockResolvedValueOnce([{ ...row, used: false }]);
    expect(await s.svc.inspect(TOKEN)).toMatchObject({ valid: true, purpose: 'INVITE', name: 'Бат', login: '99112233' });
  });

  it('accept: атом claim → нууц үг → must_change=false → бусад токен цуцлах → cache; claim амжилтгүй → 400', async () => {
    s.system.$queryRaw
      .mockResolvedValueOnce([{ id: 'i1', tenant_id: 't1', user_id: 'u1' }])
      .mockResolvedValueOnce([{ auth_id: 'auth1', email: 'e@x', phone: null, username: 'sh1', is_active: true }]);
    expect(await s.svc.accept(TOKEN, 'new-password-123')).toEqual({ done: true, login: 'sh1' });
    expect((s.system.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('used_at IS NULL AND revoked_at IS NULL AND expires_at > now()');
    expect(s.userAdmin.setPassword).toHaveBeenCalledWith('auth1', 'new-password-123');
    const sqls = s.system.$executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));
    expect(sqls.some((q) => q.includes('must_change_password = false'))).toBe(true);
    expect(sqls.some((q) => q.includes('revoked_at = now()'))).toBe(true);
    expect(s.tenantCache.invalidateMember).toHaveBeenCalledWith('t1', 'auth1');
    // PIL-15: амжилттай accept → бүх session цуцлагдана
    expect(s.sessions.revokeAll).toHaveBeenCalledWith('auth1');
    s.system.$queryRaw.mockResolvedValueOnce([]);
    await expect(s.svc.accept(TOKEN, 'new-password-123')).rejects.toMatchObject({ code: 'auth.invite_invalid' });
  });

  it('accept: нууц үг тавих амжилтгүй → "ашигласан"-ыг буцаана (дахин оролдох боломжтой)', async () => {
    s.system.$queryRaw
      .mockResolvedValueOnce([{ id: 'i1', tenant_id: 't1', user_id: 'u1' }])
      .mockResolvedValueOnce([{ auth_id: 'auth1', email: 'e@x', phone: null, username: null, is_active: true }]);
    s.userAdmin.setPassword.mockRejectedValueOnce(Object.assign(new Error('weak'), { status: 400 }));
    await expect(s.svc.accept(TOKEN, 'new-password-123')).rejects.toThrow('weak');
    expect((s.system.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('used_at = NULL');
    expect(s.sessions.revokeAll).not.toHaveBeenCalled();
  });

  it('forgot: хариу үргэлж ижил; хэрэглэгч алга / дотоод имэйл → илгээхгүй; хязгаар → 429', async () => {
    s.signIn.findLoginUser.mockResolvedValueOnce(null);
    expect(await s.svc.forgot('h', '1.1.1.1', '99999999')).toEqual({ ok: true });
    s.signIn.findLoginUser.mockResolvedValueOnce({ authId: 'a', email: 'u-1@x.login.invalid', mustChangePassword: false });
    expect(await s.svc.forgot('h', '1.1.1.1', 'sh1023')).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(s.mailer.send).not.toHaveBeenCalled();
    for (let i = 0; i < FORGOT_LIMITS.identifier.limit; i++) await s.svc.forgot('h', undefined, '99112233');
    await expect(s.svc.forgot('h', undefined, '+976 9911 2233')).rejects.toMatchObject({ status: 429 });
  });

  it('forgot: жинхэнэ имэйлтэй → RESET (1 цаг) имэйлээр', async () => {
    s.signIn.findLoginUser.mockResolvedValueOnce({ authId: 'auth1', email: 'bat@sino.mn', mustChangePassword: false });
    s.system.$queryRaw.mockResolvedValueOnce([{ id: 'u1' }]);
    await s.svc.forgot('h', '1.1.1.1', 'bat@sino.mn');
    await vi.waitFor(() => expect(s.mailer.send).toHaveBeenCalled());
    const data = s.tx.coreUserInvite.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ purpose: 'RESET', channel: 'EMAIL', createdBy: null });
    expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3600_000);
    expect(s.mailer.send.mock.calls[0][1].text).toContain('/reset/');
  });
});
