import { describe, expect, it, vi } from 'vitest';
import { CacheService } from '../cache.service';

describe('CacheService', () => {
  it('serializes values and applies a TTL', async () => {
    const redis = { set: vi.fn(), get: vi.fn(), del: vi.fn(), scanStream: vi.fn() };
    const service = new CacheService(redis as never);

    await service.set('cache:mr:tenant:list', { data: [] }, 60);

    expect(redis.set).toHaveBeenCalledWith('cache:mr:tenant:list', '{"data":[]}', 'EX', 60);
  });

  it('deserializes a cache hit and returns null on a miss', async () => {
    const redis = { set: vi.fn(), get: vi.fn().mockResolvedValueOnce('{"value":42}').mockResolvedValueOnce(null), del: vi.fn(), scanStream: vi.fn() };
    const service = new CacheService(redis as never);

    await expect(service.get<{ value: number }>('key')).resolves.toEqual({ value: 42 });
    await expect(service.get('missing')).resolves.toBeNull();
  });
});