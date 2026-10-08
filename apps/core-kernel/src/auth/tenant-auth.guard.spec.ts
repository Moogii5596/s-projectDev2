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
});
