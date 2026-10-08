import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { TenantRateLimitGuard } from './tenant-rate-limit.guard';

describe('TenantRateLimitGuard', () => {
  it('returns 429 and Retry-After when a tenant exceeds a window', async () => {
    const redis = { incr: vi.fn().mockResolvedValue(11), pexpire: vi.fn() };
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

  it('limit дотор → true, шинэ bucket-д pexpire тавина', async () => {
    const redis = { incr: vi.fn().mockResolvedValue(1), pexpire: vi.fn().mockResolvedValue(1) };
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }))).resolves.toBe(true);
    expect(redis.incr).toHaveBeenCalledTimes(3); // short / medium / long
    expect(redis.pexpire).toHaveBeenCalledTimes(3);
  });

  it('Redis incr алдаа → fail-open (true), 429/500 шидэхгүй', async () => {
    const redis = { incr: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')), pexpire: vi.fn() };
    const header = vi.fn();
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }, header))).resolves.toBe(true);
    expect(header).not.toHaveBeenCalled();
  });

  it('Redis pexpire алдаа → fail-open (true)', async () => {
    const redis = { incr: vi.fn().mockResolvedValue(1), pexpire: vi.fn().mockRejectedValue(new Error('down')) };
    const guard = new TenantRateLimitGuard(redis as never);
    await expect(guard.canActivate(ctx({ user: { tenantId: 't-1' } }))).resolves.toBe(true);
  });

  it('fail-open log 60 сек дотор нэг л удаа', async () => {
    const redis = { incr: vi.fn().mockRejectedValue(new Error('down')), pexpire: vi.fn() };
    const guard = new TenantRateLimitGuard(redis as never);
    const warn = vi.spyOn((guard as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    await guard.canActivate(ctx({ ip: '1.1.1.1' }));
    await guard.canActivate(ctx({ ip: '1.1.1.1' }));
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
