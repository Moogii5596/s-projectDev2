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
});