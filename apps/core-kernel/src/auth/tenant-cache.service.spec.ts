import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantCacheService } from './tenant-cache.service';
import { REDIS_CLIENT } from '../db/redis.module';

describe('TenantCacheService', () => {
  let service: TenantCacheService;
  let mockRedis: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let mockPrisma: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
    };

    mockPrisma = {
      $queryRaw: vi.fn(),
    };

    service = new TenantCacheService(
      mockRedis as unknown as import('ioredis').default,
      mockPrisma as unknown as import('../db/prisma-tenant-client.service').PrismaTenantClientService,
    );
  });

  it('Redis cache байвал DB рүү хандахгүй', async () => {
    mockRedis.get.mockResolvedValueOnce('cached-tenant-id');

    const result = await service.getTenantId('acme');
    expect(result).toBe('cached-tenant-id');
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('Cache байхгүй үед DB-ээс авч cache хийнэ', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'db-tenant-id' }]);
    mockRedis.setex.mockResolvedValueOnce('OK');

    const result = await service.getTenantId('acme');
    expect(result).toBe('db-tenant-id');
    expect(mockRedis.setex).toHaveBeenCalledWith('tenant:slug:acme', 300, 'db-tenant-id');
  });

  it('Tenant олдоогүй үед null буцаана', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.getTenantId('nonexistent');
    expect(result).toBeNull();
  });

  it('invalidate → Redis key устгана', async () => {
    mockRedis.del.mockResolvedValueOnce(1);
    await service.invalidate('acme');
    expect(mockRedis.del).toHaveBeenCalledWith('tenant:slug:acme');
  });
});
