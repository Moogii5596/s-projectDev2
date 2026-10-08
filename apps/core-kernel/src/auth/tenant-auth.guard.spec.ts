import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TenantAuthGuard } from './tenant-auth.guard';
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
});
