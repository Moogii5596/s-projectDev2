import { describe, expect, it, vi } from 'vitest';
import { NotificationMailScheduler } from './notification-mail.scheduler';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n1', tenant_id: 't1', title_key: 'notify.invite.accepted.title', body_key: null, params: { name: 'Bat' },
  link: '/settings/user-roles', email_attempts: 0, email: 'a@b.mn', locale: 'en', is_active: true, ...over,
});

function setup(rows: unknown[], mailer: { isEnabled: () => boolean; send: ReturnType<typeof vi.fn> }) {
  const prisma = { $queryRaw: vi.fn().mockResolvedValue(rows), $executeRaw: vi.fn().mockResolvedValue(1) };
  const overrides = { load: vi.fn().mockResolvedValue(new Map()) };
  const config = { get: vi.fn((k: string) => (k === 'PUBLIC_APP_URL' ? 'https://app.example/' : undefined)) };
  return {
    prisma,
    s: new NotificationMailScheduler(prisma as never, mailer as never, overrides as never, {
      register: vi.fn(),
      run: vi.fn((_id: string, task: () => Promise<unknown>) => task()),
    } as never, config as never),
  };
}

describe('NotificationMailScheduler (NTF-01)', () => {
  it('илгээж SENT болгоно; линкийг PUBLIC_APP_URL-тэй нийлүүлнэ', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { s, prisma } = setup([row()], { isEnabled: () => true, send });
    expect(await s.sendPending()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledWith('a@b.mn', expect.objectContaining({ subject: 'Bat accepted the invitation' }));
    expect(send.mock.calls[0][1].text).toContain('https://app.example/settings/user-roles');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('SMTP-гүй, дотоод хаяг, идэвхгүй хэрэглэгч → SKIPPED (илгээхгүй)', async () => {
    const send = vi.fn();
    const { s } = setup([row({ email: 'u-1@t.login.invalid' }), row({ id: 'n2', is_active: false })], { isEnabled: () => true, send });
    expect(await s.sendPending()).toEqual({ sent: 0, skipped: 2, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    const off = setup([row()], { isEnabled: () => false, send });
    expect(await off.s.sendPending()).toMatchObject({ skipped: 1 });
  });

  it('алдаа → дахин оролдлого; 5 дахь удаад FAILED', async () => {
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    const retry = setup([row()], { isEnabled: () => true, send });
    expect(await retry.s.sendPending()).toEqual({ sent: 0, skipped: 0, failed: 0 });
    const last = setup([row({ email_attempts: 4 })], { isEnabled: () => true, send });
    expect(await last.s.sendPending()).toEqual({ sent: 0, skipped: 0, failed: 1 });
  });
});
