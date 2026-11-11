import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOGIN_LOCK_RULES, LoginLockService, minutesUntil, parseLoginLockRules } from './login-lock.service';

describe('LoginLockService (v0.2.5 H1 #16)', () => {
  it('дүрэм env-ээс; буруу/хэт их утга → анхдагч (5 / 15 / 15)', () => {
    expect(parseLoginLockRules(() => undefined)).toEqual(DEFAULT_LOGIN_LOCK_RULES);
    expect(DEFAULT_LOGIN_LOCK_RULES).toMatchObject({ maxFailures: 5, windowMinutes: 15, lockMinutes: 15, gotrueHook: false });
    const env: Record<string, string> = { AUTH_LOCK_MAX_FAILURES: '3', AUTH_LOCK_WINDOW_MINUTES: '10', AUTH_LOCK_DURATION_MINUTES: '30', AUTH_LOCK_GOTRUE_HOOK: 'true' };
    expect(parseLoginLockRules((k) => env[k])).toEqual({ maxFailures: 3, windowMinutes: 10, lockMinutes: 30, gotrueHook: true });
    const bad: Record<string, string> = { AUTH_LOCK_MAX_FAILURES: '0', AUTH_LOCK_WINDOW_MINUTES: 'abc', AUTH_LOCK_DURATION_MINUTES: '1.5' };
    expect(parseLoginLockRules((k) => bad[k])).toEqual(DEFAULT_LOGIN_LOCK_RULES);
  });

  it('minutesUntil: дээш тоймлоно, хамгийн багадаа 1', () => {
    const now = Date.UTC(2026, 10, 12, 0, 0, 0);
    expect(minutesUntil(new Date(now + 15 * 60_000), now)).toBe(15);
    expect(minutesUntil(new Date(now + 14 * 60_000 + 1), now)).toBe(15);
    expect(minutesUntil(new Date(now + 1_000), now)).toBe(1);
    expect(minutesUntil(new Date(now - 1_000), now)).toBe(1);
  });

  it('status: түгжээ дууссан / цонх хаагдсан бол тоолуур 0; reset алдааг залгина', async () => {
    const queryRaw = vi.fn();
    const system = { $queryRaw: queryRaw, $executeRaw: vi.fn().mockRejectedValue(new Error('db down')) };
    const svc = new LoginLockService(system as never, { get: () => undefined } as never);
    queryRaw.mockResolvedValueOnce([]);
    expect(await svc.status('a')).toEqual({ locked: false, lockedUntil: null, failedCount: 0 });
    const until = new Date(Date.now() + 60_000);
    queryRaw.mockResolvedValueOnce([{ failed_count: 5, window_start: new Date(), locked_until: until }]);
    expect(await svc.status('a')).toEqual({ locked: true, lockedUntil: until.toISOString(), failedCount: 5 });
    queryRaw.mockResolvedValueOnce([{ failed_count: 5, window_start: new Date(Date.now() - 20 * 60_000), locked_until: new Date(Date.now() - 1) }]);
    expect(await svc.status('a')).toEqual({ locked: false, lockedUntil: null, failedCount: 0 });
    queryRaw.mockResolvedValueOnce([{ failed_count: 2, window_start: new Date(), locked_until: null }]);
    expect(await svc.status('a')).toEqual({ locked: false, lockedUntil: null, failedCount: 2 });
    await expect(svc.reset('a')).resolves.toBeUndefined();
  });
});
