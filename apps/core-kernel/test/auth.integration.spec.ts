import { AuthService } from '../src/auth/auth.service';
import { DEFAULT_TENANT_SECURITY_POLICY } from '../src/auth/tenant-security-policy.service';
import { PrismaTenantClientService } from '../src/db/prisma-tenant-client.service';
import { SystemPrismaService } from '../src/db/system-prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Integration tests — requires running Supabase (supabase start)
// NestJS Testing Module ашиглахгүй — шууд instantiate хийнэ (DI асуудлаас зайлсхийх)
describe('AuthService Integration', () => {
  let authService: AuthService;
  let prisma: PrismaTenantClientService;
  let system: SystemPrismaService; // Phase 4.8.5: шалгалт/цэвэрлэгээ (RLS bypass) + AuthService.login
  let supabaseAdmin: SupabaseClient;

  const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000003';
  const TEST_EMAIL = `integration-${Date.now()}@example.com`;
  const TEST_PASSWORD = 'Test1234!567';

  beforeAll(async () => {
    // ConfigService mock — process.env-ээс унших
    const configServiceMock = {
      get: <T = string>(key: string): T => process.env[key] as T,
    } as any;

    prisma = new PrismaTenantClientService(configServiceMock);
    system = new SystemPrismaService(configServiceMock);
    authService = new AuthService(configServiceMock, prisma, { get: async () => DEFAULT_TENANT_SECURITY_POLICY } as never, system);

    supabaseAdmin = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    );

    await prisma.$connect();
    await system.$connect();
  });

  afterAll(async () => {
    // Cleanup Supabase Auth user
    try {
      const { data } = await supabaseAdmin.auth.admin.listUsers();
      const testUser = (data?.users ?? []).find((u: { id: string; email?: string }) => u.email === TEST_EMAIL);
      if (testUser) {
        await supabaseAdmin.auth.admin.deleteUser(testUser.id);
      }
    } catch (_) { /* ignore */ }

    // Cleanup core_users
    try {
      // Phase 4.8.5: системийн холболт (өмнө нь буруу GUC + тусдаа statement — app_user-д юу ч устгахгүй)
      await system.coreUser.deleteMany({
        where: { email: TEST_EMAIL, tenantId: TEST_TENANT_ID },
      });
    } catch (_) { /* ignore */ }

    await prisma?.$disconnect();
    await system?.$disconnect();
  });

  describe('register()', () => {
    it('Supabase Auth үүссэний дараа core_users-д sync болно', async () => {
      const result = await authService.register(
        { email: TEST_EMAIL, password: TEST_PASSWORD, fullName: 'Integration Test' },
        TEST_TENANT_ID,
      );

      expect(result.accessToken).toBeTruthy();
      expect(result.user.email).toBe(TEST_EMAIL);
      expect(result.user.tenantId).toBe(TEST_TENANT_ID);

      // core_users мөр үүссэн эсэхийг шалгах
      // Phase 4.8.5: шалгалтыг системийн холболтоор (withTenantContext нь DB-д set_config хийдэггүй)
      const dbUser = await system.coreUser.findFirst({
        where: { email: TEST_EMAIL, tenantId: TEST_TENANT_ID },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.fullName).toBe('Integration Test');
    });

    it('давхар email → ConflictException', async () => {
      await expect(
        authService.register(
          { email: TEST_EMAIL, password: TEST_PASSWORD },
          TEST_TENANT_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login()', () => {
    it('зөв нууц үг → accessToken буцаана', async () => {
      const result = await authService.login({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      expect(result.accessToken).toBeTruthy();
      expect(result.user.email).toBe(TEST_EMAIL);
    });

    it('буруу нууц үг → UnauthorizedException', async () => {
      await expect(
        authService.login({ email: TEST_EMAIL, password: 'WrongPass999!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe()', () => {
    it('authId + tenantId-р хэрэглэгч олдоно', async () => {
      const login = await authService.login({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      const me = await authService.getMe(login.user.authId, TEST_TENANT_ID);
      expect(me.email).toBe(TEST_EMAIL);
      expect(me.tenantId).toBe(TEST_TENANT_ID);
    });

    it('олдохгүй authId → UnauthorizedException', async () => {
      await expect(
        authService.getMe('00000000-0000-0000-0000-000000000000', TEST_TENANT_ID),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
