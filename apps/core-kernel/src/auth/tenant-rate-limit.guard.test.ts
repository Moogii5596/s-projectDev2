import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { RATE_LIMIT_LUA, TenantRateLimitGuard } from './tenant-rate-limit.guard';
import { RATE_LIMIT_DEFAULTS } from '../config/rate-limit';

/** #32: бүх цонх нэг EVAL — цонх бүрт ижил тоолуур буцаана */
const evalRedis = (n: number) => ({ eval: vi.fn().mockResolvedValue([n, n, n]) });

describe('TenantRateLimitGuard', () => {
  it('returns 429 and Retry-After when a tenant exceeds a window', async () => {
    const redis = evalRedis(RATE_LIMIT_DEFAULTS.short + 1);
    const headers = vi.fn();
    const request = { user: { tenantId: 'tenant-1' }, ip: '127.0.0.1' };
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header: headers }) }),
    } as unknown as ExecutionContext;
    const guard = new TenantRateLimitGuard(redis as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    expect(headers).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  // Phase 2.9.2 (A): Redis алдаа → fail-open
  function ctx(request: Record<string, unknown>, header = vi.fn()) {
    return {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ header }) }),
    } as unknown as ExecutionContext;
  }

  it('limit дотор → true; 3 цонх НЭГ EVAL-аар (түлхүүр + TTL)', async () => {
    const redis = evalRedis(1);
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }))).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, ...args] = redis.eval.mock.calls[0] as [string, number, ...string[]];
    expect(script).toBe(RATE_LIMIT_LUA);
    expect(numKeys).toBe(3);
    expect(args.slice(0, 3).every((k) => k.startsWith('rate-limit:') && k.includes(':t-1:'))).toBe(true);
    expect(args.slice(3).map(Number).every((ms) => ms > 0)).toBe(true);
  });

  it('аль нэг цонх хэтэрвэл 429 (long цонх)', async () => {
    const redis = { eval: vi.fn().mockResolvedValue([1, 1, 1_000_000]) };
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }))).rejects.toBeInstanceOf(HttpException);
  });

  it('Redis алдаа → fail-open (true), 429/500 шидэхгүй', async () => {
    const redis = { eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const header = vi.fn();
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }, header))).resolves.toBe(true);
    expect(header).not.toHaveBeenCalled();
  });

  it('fail-open log 60 сек дотор нэг л удаа', async () => {
    const redis = { eval: vi.fn().mockRejectedValue(new Error('down')) };
    const guard = new TenantRateLimitGuard(redis as never);
    const warn = vi.spyOn((guard as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    await guard.canActivate(ctx({ ip: '1.1.1.1' }));
    await guard.canActivate(ctx({ ip: '1.1.1.1' }));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  // Phase 3.1: env-ээр limit тохируулах
  it('RATE_LIMIT_SHORT=5 → 6 дахь хүсэлт 429, 5 дахь нь зөвшөөрөгдөнө', async () => {
    vi.stubEnv('RATE_LIMIT_SHORT', '5');
    try {
      const guard = new TenantRateLimitGuard(evalRedis(5) as never);
      await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }))).resolves.toBe(true);
      const over = new TenantRateLimitGuard(evalRedis(6) as never);
      await expect(over.canActivate(ctx({ user: { tenantId: 't-1' } }))).rejects.toBeInstanceOf(HttpException);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('default (B): 100 хүртэл зөвшөөрнө, 101 → 429', async () => {
    const ok = new TenantRateLimitGuard(evalRedis(100) as never);
    await expect(ok.canActivate(ctx({ user: { tenantId: 't-1' } }))).resolves.toBe(true);
    const over = new TenantRateLimitGuard(evalRedis(101) as never);
    await expect(over.canActivate(ctx({ user: { tenantId: 't-1' } }))).rejects.toBeInstanceOf(HttpException);
  });
});
