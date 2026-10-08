import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

// Supabase mock
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
      },
      signInWithPassword: vi.fn(),
    },
  })),
}));

import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const AUTH_USER_ID = 'supabase-auth-uuid-123';

function buildMockSupabase() {
  return (createClient as ReturnType<typeof vi.fn>).mock.results[0]?.value ?? {
    auth: {
      admin: { createUser: vi.fn(), deleteUser: vi.fn() },
      signInWithPassword: vi.fn(),
    },
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: {
    $executeRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
    coreUser: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let mockConfigService: { get: (key: string) => string | undefined };
  let supabaseMock: ReturnType<typeof buildMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      get: vi.fn((key: string) => {
        const m: Record<string, string> = {
          SUPABASE_URL: 'http://localhost:54321',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        };
        return m[key];
      }),
    };

    mockPrisma = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      // RULE-04: $transaction mock — callback-г тухайн mockPrisma-р дамжуулж ажиллуулна
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
      coreUser: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    // createClient-г дахин дуудаж supabase instance шинэчлэх
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
        },
        signInWithPassword: vi.fn(),
      },
    });

    service = new AuthService(
      mockConfigService as never,
      mockPrisma as never,
    );

    supabaseMock = (createClient as ReturnType<typeof vi.fn>).mock.results.at(-1)!.value;
  });

  // ── register ────────────────────────────────────────────────
  describe('register()', () => {
    it('амжилттай бүртгэлд токен + хэрэглэгч буцаана', async () => {
      supabaseMock.auth.admin.createUser.mockResolvedValueOnce({
        data: { user: { id: AUTH_USER_ID, email: 'test@example.com' } },
        error: null,
      });
      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: { session: { access_token: 'jwt-token-xyz' }, user: {} },
        error: null,
      });
      mockPrisma.coreUser.create.mockResolvedValueOnce({
        id: 'core-user-id',
        tenantId: TENANT_ID,
        email: 'test@example.com',
        fullName: 'Тест Хэрэглэгч',
        role: 'REQUESTER',
      });

      const result = await service.register(
        { email: 'test@example.com', password: 'Password1!', fullName: 'Тест Хэрэглэгч' },
        TENANT_ID,
      );

      expect(result.accessToken).toBe('jwt-token-xyz');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('REQUESTER');
      expect(mockPrisma.coreUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_ID, authId: AUTH_USER_ID }),
        }),
      );
    });

    it('давхар email → ConflictException', async () => {
      supabaseMock.auth.admin.createUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'User already registered' },
      });

      await expect(
        service.register({ email: 'dup@example.com', password: 'Password1!' }, TENANT_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('core_users үүсгэхэд алдаа → auth user rollback хийнэ', async () => {
      supabaseMock.auth.admin.createUser.mockResolvedValueOnce({
        data: { user: { id: AUTH_USER_ID, email: 'fail@example.com' } },
        error: null,
      });
      mockPrisma.coreUser.create.mockRejectedValueOnce(new Error('DB error'));
      supabaseMock.auth.admin.deleteUser.mockResolvedValueOnce({ data: {}, error: null });

      await expect(
        service.register({ email: 'fail@example.com', password: 'Password1!' }, TENANT_ID),
      ).rejects.toThrow();

      expect(supabaseMock.auth.admin.deleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
    });
  });

  // ── login ────────────────────────────────────────────────────
  describe('login()', () => {
    it('зөв нэвтрэлтэд токен буцаана', async () => {
      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: {
          session: { access_token: 'valid-jwt' },
          user: { id: AUTH_USER_ID },
        },
        error: null,
      });
      mockPrisma.coreUser.findUnique.mockResolvedValueOnce({
        id: 'core-user-id',
        tenantId: TENANT_ID,
        email: 'user@example.com',
        fullName: null,
        role: 'APPROVER',
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'correct-pass',
      });

      expect(result.accessToken).toBe('valid-jwt');
      expect(result.user.role).toBe('APPROVER');
    });

    it('буруу нууц үг → UnauthorizedException', async () => {
      supabaseMock.auth.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        service.login({ email: 'x@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getMe ────────────────────────────────────────────────────
  describe('getMe()', () => {
    it('хэрэглэгч олдвол буцаана', async () => {
      mockPrisma.coreUser.findFirst.mockResolvedValueOnce({
        id: 'core-user-id',
        email: 'me@example.com',
        fullName: 'Миний нэр',
        role: 'ADMIN',
        tenantId: TENANT_ID,
        isActive: true,
        createdAt: new Date(),
      });

      const result = await service.getMe(AUTH_USER_ID, TENANT_ID);
      expect(result.email).toBe('me@example.com');
      expect(result.role).toBe('ADMIN');
    });

    it('хэрэглэгч олдохгүй → UnauthorizedException', async () => {
      mockPrisma.coreUser.findFirst.mockResolvedValueOnce(null);

      await expect(service.getMe('unknown-auth-id', TENANT_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
