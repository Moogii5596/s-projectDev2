import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TenantAuthGuard, isAuthServiceError } from './tenant-auth.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { TenantCacheService } from './tenant-cache.service';

// Supabase mock
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

import { createClient } from '@supabase/supabase-js';

function createMockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers, user: undefined as unknown };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantAuthGuard', () => {
  let guard: TenantAuthGuard;
  let configService: ConfigService;
  let tenantCacheService: TenantCacheService;
  let mockReflector: Reflector;
  let mockSupabaseGetUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    configService = {
      get: vi.fn((key: string) => {
        const map: Record<string, string> = {
          SUPABASE_URL: 'http://localhost:54321',
          SUPABASE_ANON_KEY: 'test-anon-key',
        };
        return map[key] ?? null;
      }),
    } as unknown as ConfigService;

    tenantCacheService = {
      getTenantId: vi.fn(),
      isMember: vi.fn().mockResolvedValue(true), // SEC-001: default гишүүн
      mustChangePassword: vi.fn().mockResolvedValue(false), // v0.2.2 D-06: default шаардлагагүй
      getCachedAuthUser: vi.fn().mockResolvedValue(null), // PERF-003: default cache miss
      cacheAuthUser: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn(),
    } as unknown as TenantCacheService;

    mockSupabaseGetUser = vi.fn();
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockSupabaseGetUser },
    });

    mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;

    guard = new TenantAuthGuard(configService, tenantCacheService, mockReflector);
  });

  describe('Authorization header', () => {
    it('Authorization header байхгүй үед 401 буцаах ёстой', async () => {
      const ctx = createMockContext({ host: 'test.app.com' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('Bearer биш токен үед 401 буцаах ёстой', async () => {
      const ctx = createMockContext({
        authorization: 'Basic abc123',
        host: 'test.app.com',
      });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('JWT баталгаажуулалт', () => {
    it('Supabase алдаа гарвал 401 буцаах ёстой', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const ctx = createMockContext({
        authorization: 'Bearer invalid-token',
        host: 'test.app.com',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('Хүчинтэй токен + tenant олдсон → true буцаах ёстой', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'tenant-uuid-456',
      );

      const ctx = createMockContext({
        authorization: 'Bearer valid-token',
        host: 'localhost:3000',
      });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });
  });

  describe('Tenant шалгалт', () => {
    it('Tenant олдоогүй үед 403 буцаах ёстой', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const ctx = createMockContext({
        authorization: 'Bearer valid-token',
        host: 'unknown-tenant.app.com',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  // ADR-001: Enterprise VPC — DEPLOYMENT_MODE=dedicated
  describe('Dedicated deployment mode', () => {
    let dedicatedGuard: TenantAuthGuard;

    beforeEach(() => {
      const dedicatedConfig = {
        get: vi.fn((key: string) => {
          const map: Record<string, string> = {
            SUPABASE_URL: 'http://localhost:54321',
            SUPABASE_ANON_KEY: 'test-anon-key',
            DEPLOYMENT_MODE: 'dedicated',
            DEDICATED_TENANT_SLUG: 'acme',
          };
          return map[key] ?? null;
        }),
      } as unknown as ConfigService;
      dedicatedGuard = new TenantAuthGuard(dedicatedConfig, tenantCacheService, mockReflector);

      mockSupabaseGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
    });

    it.each([
      ['харилцагчийн өөрийн домэйн', 'erp.company.mn'],
      ['өөр tenant-ийн subdomain', 'other-tenant.app.com'],
      ['localhost (DEV_TENANT_SLUG үл тооно)', 'localhost:3000'],
      ['Host header байхгүй', ''],
    ])('%s → tenant = DEDICATED_TENANT_SLUG', async (_label, host) => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'acme-tenant-uuid',
      );
      const headers: Record<string, string> = { authorization: 'Bearer valid-token' };
      if (host) headers.host = host;
      const ctx = createMockContext(headers);

      await expect(dedicatedGuard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantCacheService.getTenantId).toHaveBeenLastCalledWith('acme');
      expect(ctx.switchToHttp().getRequest().user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'acme-tenant-uuid',
        tenantSlug: 'acme',
      });
    });

    it('dedicated tenant DB-д олдохгүй (seed хийгдээгүй) → 403', async () => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'erp.company.mn' });
      await expect(dedicatedGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('JWT шалгалт dedicated үед ч хэвээр (хүчингүй токен → 401)', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } });
      const ctx = createMockContext({ authorization: 'Bearer bad', host: 'erp.company.mn' });
      await expect(dedicatedGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      expect(tenantCacheService.getTenantId).not.toHaveBeenCalled();
    });

    it('dedicated + slug тохируулаагүй → guard үүсэхдээ алдаа (startup)', () => {
      const badConfig = {
        get: vi.fn((key: string) => (key === 'DEPLOYMENT_MODE' ? 'dedicated' : null)),
      } as unknown as ConfigService;
      const saved = process.env['DEDICATED_TENANT_SLUG'];
      delete process.env['DEDICATED_TENANT_SLUG'];
      try {
        expect(() => new TenantAuthGuard(badConfig, tenantCacheService, mockReflector)).toThrow(
          /DEDICATED_TENANT_SLUG/,
        );
      } finally {
        if (saved !== undefined) process.env['DEDICATED_TENANT_SLUG'] = saved;
      }
    });
  });

  // SEC-001: Tenant membership
  describe('Нууц үг солих шаардлага (v0.2.2 D-06)', () => {
    beforeEach(() => {
      mockSupabaseGetUser.mockResolvedValue({ data: { user: { id: 'user-A', email: 'a@a.mn' } }, error: null });
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValue('tenant-A');
      (tenantCacheService.mustChangePassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    });

    it('must_change_password → энгийн route 403 (code auth.password_change_required)', async () => {
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'a.app.mn' });
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 403, code: 'auth.password_change_required' });
      expect(tenantCacheService.mustChangePassword).toHaveBeenCalledWith('tenant-A', 'user-A');
    });

    it('@AllowPasswordChangeRequired route (me, change-password) → нээлттэй, шалгахгүй', async () => {
      // 1-р дуудлага = IS_PUBLIC (false), 2-р = ALLOW_PASSWORD_CHANGE_REQUIRED (true)
      (mockReflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValueOnce(false).mockReturnValueOnce(true);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'a.app.mn' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantCacheService.mustChangePassword).not.toHaveBeenCalled();
    });

    it('гишүүн биш → membership 403 эхэлж (нууц үгийн шалгалт хийгдэхгүй)', async () => {
      (tenantCacheService.isMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'a.app.mn' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(tenantCacheService.mustChangePassword).not.toHaveBeenCalled();
    });
  });

  describe('Tenant membership (SEC-001)', () => {
    beforeEach(() => {
      mockSupabaseGetUser.mockResolvedValue({
        data: { user: { id: 'user-A', email: 'a@a.mn' } },
        error: null,
      });
    });

    it('Гишүүн биш (өөр tenant-ийн Host) → 403, request.user тохируулахгүй', async () => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce('tenant-B');
      (tenantCacheService.isMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'b.app.mn' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(tenantCacheService.isMember).toHaveBeenCalledWith('tenant-B', 'user-A');
      expect(ctx.switchToHttp().getRequest().user).toBeUndefined();
    });

    it('Гишүүн → true, isMember(tenantId, authId) дуудагдана', async () => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce('tenant-A');
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'a.app.mn' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantCacheService.isMember).toHaveBeenCalledWith('tenant-A', 'user-A');
    });

    it('Tenant олдоогүй үед membership шалгахгүй (403 өмнө нь)', async () => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'x.app.mn' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(tenantCacheService.isMember).not.toHaveBeenCalled();
    });

    it('Dedicated горимд ч гишүүн биш → 403', async () => {
      const dedicatedConfig = {
        get: vi.fn((key: string) =>
          ({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'acme' } as Record<string, string>)[key] ?? null,
        ),
      } as unknown as ConfigService;
      const g = new TenantAuthGuard(dedicatedConfig, tenantCacheService, mockReflector);
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce('acme-id');
      (tenantCacheService.isMember as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'erp.acme.mn' });

      await expect(g.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Shared mode regression (ADR-001)', () => {
    it('subdomain → тухайн slug-аар tenant хайна', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValueOnce('t-1');
      const ctx = createMockContext({ authorization: 'Bearer valid-token', host: 'beta.app.com' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(tenantCacheService.getTenantId).toHaveBeenLastCalledWith('beta');
    });
  });

  // PERF-003: token cache + 401/503 ялгах
  describe('Token cache + Supabase Auth алдаа (PERF-003)', () => {
    const okUser = { data: { user: { id: 'user-123', email: 'test@example.com' } }, error: null };
    const ctxFor = () => createMockContext({ authorization: 'Bearer tok-1', host: 'localhost:3000' });

    beforeEach(() => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValue('tenant-uuid-456');
    });

    it('cache hit → Supabase дуудахгүй, request.user cache-ээс', async () => {
      (tenantCacheService.getCachedAuthUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'cached-u', email: 'c@c.mn' });
      const ctx = ctxFor();
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(mockSupabaseGetUser).not.toHaveBeenCalled();
      expect(ctx.switchToHttp().getRequest().user).toMatchObject({ id: 'cached-u', email: 'c@c.mn', tenantId: 'tenant-uuid-456' });
      expect(tenantCacheService.isMember).toHaveBeenCalledWith('tenant-uuid-456', 'cached-u');
    });

    it('cache miss → Supabase шалгаад cache-д хадгална', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce(okUser);
      await expect(guard.canActivate(ctxFor())).resolves.toBe(true);
      expect(mockSupabaseGetUser).toHaveBeenCalledWith('tok-1');
      expect(tenantCacheService.cacheAuthUser).toHaveBeenCalledWith('tok-1', { id: 'user-123', email: 'test@example.com' });
    });

    it('хүчингүй token (401) → 401, cache-д хадгалахгүй', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 401, message: 'invalid JWT' } });
      await expect(guard.canActivate(ctxFor())).rejects.toThrow(UnauthorizedException);
      expect(tenantCacheService.cacheAuthUser).not.toHaveBeenCalled();
    });

    it.each([
      ['сүлжээ (AuthRetryableFetchError, status 0)', { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }],
      ['504 gateway timeout', { name: 'AuthRetryableFetchError', status: 504, message: 'timeout' }],
      ['500 server error', { name: 'AuthApiError', status: 500, message: 'boom' }],
    ])('Supabase Auth ажиллахгүй: %s → 503 (401 биш)', async (_l, error) => {
      mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: null }, error });
      await expect(guard.canActivate(ctxFor())).rejects.toThrow(ServiceUnavailableException);
      expect(tenantCacheService.cacheAuthUser).not.toHaveBeenCalled();
    });

    it('getUser exception шидвэл → 503', async () => {
      mockSupabaseGetUser.mockRejectedValueOnce(new Error('socket hang up'));
      await expect(guard.canActivate(ctxFor())).rejects.toThrow(ServiceUnavailableException);
    });

    it('Supabase client-ийг нэг л удаа үүсгэнэ (persistSession/autoRefresh унтраалттай)', async () => {
      (createClient as ReturnType<typeof vi.fn>).mockClear();
      mockSupabaseGetUser.mockResolvedValue(okUser);
      for (let i = 0; i < 3; i++) await guard.canActivate(ctxFor());
      expect(createClient).toHaveBeenCalledTimes(1);
      expect((createClient as ReturnType<typeof vi.fn>).mock.calls[0][2]).toMatchObject({
        auth: { persistSession: false, autoRefreshToken: false },
      });
    });
  });

  describe('isAuthServiceError()', () => {
    it.each([
      [{ name: 'AuthRetryableFetchError', status: 503 }, true],
      [{ name: 'AuthApiError', status: 0 }, true],
      [{ name: 'AuthApiError', status: 502 }, true],
      [{ name: 'AuthApiError', status: 401 }, false],
      [{ name: 'AuthApiError', status: 403 }, false],
      [{ message: 'no status' }, false],
      [null, false],
    ])('%j → %s', (err, expected) => {
      expect(isAuthServiceError(err as never)).toBe(expected);
    });
  });

  describe('Single-flight (PERF-003)', () => {
    it('ижил token-ийн 50 зэрэгцээ хүсэлт → Supabase 1 дуудлага', async () => {
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValue('tenant-uuid-456');
      let resolveUser!: (v: unknown) => void;
      mockSupabaseGetUser.mockReturnValueOnce(new Promise((r) => (resolveUser = r)));
      const runs = Array.from({ length: 50 }, () =>
        guard.canActivate(createMockContext({ authorization: 'Bearer same-tok', host: 'localhost:3000' })),
      );
      await new Promise((r) => setTimeout(r, 0));
      resolveUser({ data: { user: { id: 'user-123', email: 'test@example.com' } }, error: null });
      await expect(Promise.all(runs)).resolves.toEqual(Array(50).fill(true));
      expect(mockSupabaseGetUser).toHaveBeenCalledTimes(1);
    });

    it('алдаа бүх хүлээгчид дамжина, дараагийн хүсэлт дахин оролдоно', async () => {
      mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: null }, error: { name: 'AuthApiError', status: 503, message: 'x' } });
      const a = guard.canActivate(createMockContext({ authorization: 'Bearer t2', host: 'localhost:3000' }));
      const b = guard.canActivate(createMockContext({ authorization: 'Bearer t2', host: 'localhost:3000' }));
      await expect(a).rejects.toThrow(ServiceUnavailableException);
      await expect(b).rejects.toThrow(ServiceUnavailableException);
      (tenantCacheService.getTenantId as ReturnType<typeof vi.fn>).mockResolvedValue('tenant-uuid-456');
      mockSupabaseGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123', email: 'e@e.mn' } }, error: null });
      await expect(guard.canActivate(createMockContext({ authorization: 'Bearer t2', host: 'localhost:3000' }))).resolves.toBe(true);
      expect(mockSupabaseGetUser).toHaveBeenCalledTimes(2);
    });
  });
});
