import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantCacheService, hashToken, authCacheTtlSeconds, AUTH_CACHE_MAX_TTL_SECONDS } from './tenant-cache.service';
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

// SEC-001: membership шалгалт
describe('TenantCacheService.isMember()', () => {
  const T = 'aaaaaaaa-0000-0000-0000-00000000000a';
  const U = '11111111-1111-1111-1111-111111111111';
  let service: TenantCacheService;
  let redis: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let tx: { $executeRaw: ReturnType<typeof vi.fn>; $queryRaw: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    redis = { get: vi.fn().mockResolvedValue(null), setex: vi.fn().mockResolvedValue('OK'), del: vi.fn() };
    tx = { $executeRaw: vi.fn().mockResolvedValue(1), $queryRaw: vi.fn() };
    prisma = { $transaction: vi.fn().mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    service = new TenantCacheService(
      redis as unknown as import('ioredis').default,
      prisma as unknown as import('../db/prisma-tenant-client.service').PrismaTenantClientService,
    );
  });

  it("cache '1' → true, DB рүү хандахгүй", async () => {
    redis.get.mockResolvedValueOnce('1');
    await expect(service.isMember(T, U)).resolves.toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith(`tenant:member:${T}:${U}`);
  });

  it("cache '0' → false, DB рүү хандахгүй", async () => {
    redis.get.mockResolvedValueOnce('0');
    await expect(service.isMember(T, U)).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cache miss + гишүүн → true, 300 сек cache', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    await expect(service.isMember(T, U)).resolves.toBe(true);
    expect(redis.setex).toHaveBeenCalledWith(`tenant:member:${T}:${U}`, 300, '1');
  });

  it('cache miss + гишүүн биш → false, 30 сек cache', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.isMember(T, U)).resolves.toBe(false);
    expect(redis.setex).toHaveBeenCalledWith(`tenant:member:${T}:${U}`, 30, '0');
  });

  it('RULE-04: set_config нь query-ээс ӨМНӨ, нэг transaction дотор', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    await service.isMember(T, U);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const setOrder = tx.$executeRaw.mock.invocationCallOrder[0];
    const queryOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(queryOrder);
    // tagged template: эхний strings-д set_config, утга нь tenantId
    const [strings, value] = tx.$executeRaw.mock.calls[0];
    expect((strings as string[]).join('?')).toContain("set_config('app.tenant_id'");
    expect(value).toBe(T);
  });

  it('DB алдаа → false (fail closed), cache хийхгүй', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.isMember(T, U)).resolves.toBe(false);
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('invalidateMember() → membership key устгана', async () => {
    await service.invalidateMember(T, U);
    expect(redis.del).toHaveBeenCalledWith(`tenant:member:${T}:${U}`);
  });
});

// PERF-003: Supabase token шалгалтын cache
describe('Auth token cache (PERF-003)', () => {
  // exp-тэй JWT хэлбэрийн token (гарын үсэг хамаагүй — TTL тооцоход л payload уншина)
  const jwt = (exp?: number) =>
    ['h', Buffer.from(JSON.stringify(exp === undefined ? {} : { exp })).toString('base64url'), 's'].join('.');
  const NOW = 1_800_000_000_000; // ms
  let service: TenantCacheService;
  let redis: { get: ReturnType<typeof vi.fn>; setex: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    redis = { get: vi.fn().mockResolvedValue(null), setex: vi.fn().mockResolvedValue('OK'), del: vi.fn() };
    service = new TenantCacheService(
      redis as unknown as import('ioredis').default,
      {} as unknown as import('../db/prisma-tenant-client.service').PrismaTenantClientService,
    );
  });

  it('hashToken: тогтвортой SHA-256, token-ийг өөрийг нь агуулахгүй', () => {
    const t = jwt(1);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it.each([
    ['30с үлдсэн', NOW / 1000 + 30, 30],
    ['1 цаг үлдсэн → 60-аар хязгаарлана', NOW / 1000 + 3600, AUTH_CACHE_MAX_TTL_SECONDS],
    ['дууссан → 0', NOW / 1000 - 5, 0],
  ])('authCacheTtlSeconds: %s', (_l, exp, expected) => {
    expect(authCacheTtlSeconds(jwt(exp), NOW)).toBe(expected);
  });

  it('authCacheTtlSeconds: exp байхгүй / буруу хэлбэр → 60', () => {
    expect(authCacheTtlSeconds(jwt(), NOW)).toBe(60);
    expect(authCacheTtlSeconds('not-a-jwt', NOW)).toBe(60);
  });

  it('cacheAuthUser: hash түлхүүрээр, TTL-тэй хадгална (token Redis-д орохгүй)', async () => {
    const t = jwt(Math.floor(Date.now() / 1000) + 3600);
    await service.cacheAuthUser(t, { id: 'u1', email: 'a@a.mn' });
    expect(redis.setex).toHaveBeenCalledWith(`auth:token:${hashToken(t)}`, 60, JSON.stringify({ id: 'u1', email: 'a@a.mn' }));
    expect(JSON.stringify(redis.setex.mock.calls)).not.toContain(t);
  });

  it('cacheAuthUser: дууссан token → cache хийхгүй', async () => {
    await service.cacheAuthUser(jwt(Math.floor(Date.now() / 1000) - 10), { id: 'u1' });
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('getCachedAuthUser: hit → хэрэглэгч, miss → null', async () => {
    const t = jwt(1);
    redis.get.mockResolvedValueOnce(JSON.stringify({ id: 'u1', email: 'a@a.mn' }));
    await expect(service.getCachedAuthUser(t)).resolves.toEqual({ id: 'u1', email: 'a@a.mn' });
    expect(redis.get).toHaveBeenCalledWith(`auth:token:${hashToken(t)}`);
    await expect(service.getCachedAuthUser(t)).resolves.toBeNull();
  });

  it('Redis алдаа → get null (Supabase-аар шалгана), set алдааг залгина', async () => {
    redis.get.mockRejectedValueOnce(new Error('down'));
    redis.setex.mockRejectedValueOnce(new Error('down'));
    await expect(service.getCachedAuthUser(jwt(1))).resolves.toBeNull();
    await expect(service.cacheAuthUser(jwt(Math.floor(Date.now() / 1000) + 100), { id: 'u1' })).resolves.toBeUndefined();
  });
});
