import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TENANT_SECURITY_POLICY, TenantSecurityPolicyService } from './tenant-security-policy.service';

function setup(rows: unknown[] = []) {
  const system = { $queryRaw: vi.fn().mockResolvedValue(rows) };
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  return { service: new TenantSecurityPolicyService(system as never, redis as never), system, redis };
}

beforeEach(() => {
  vi.stubEnv('AUTH_L1_CACHE_TTL_SECONDS', '0');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TenantSecurityPolicyService', () => {
  it('tenant мөр байхгүй үед анхдагч бодлого хэрэглэж cache-д хадгална', async () => {
    const s = setup();
    await expect(s.service.get('tenant-id')).resolves.toEqual(DEFAULT_TENANT_SECURITY_POLICY);
    expect(s.redis.setex).toHaveBeenCalled();
  });

  it('DB-ээс tenant-ийн бодлогыг авна', async () => {
    const s = setup([{
      password_min_length: 16,
      login_failure_limit: 5,
      login_lockout_minutes: 30,
      session_duration_minutes: 480,
    }]);
    await expect(s.service.get('tenant-id')).resolves.toEqual({
      passwordMinLength: 16,
      loginFailureLimit: 5,
      loginLockoutMinutes: 30,
      sessionDurationMinutes: 480,
    });
  });

  it('DB алдааг service-unavailable болгон ил тод буцаана', async () => {
    const s = setup();
    s.system.$queryRaw.mockRejectedValueOnce(new Error('database offline'));
    await expect(s.service.get('tenant-id')).rejects.toMatchObject({ status: 503, code: 'auth.service_unavailable' });
  });
});
