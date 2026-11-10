import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreTenantSettingsService } from './core-tenant-settings.service';

const initial = {
  organizationName: 'Tenant',
  logoPath: null,
  timeZone: 'Asia/Ulaanbaatar',
  defaultLanguage: 'mn',
  activeLanguages: ['mn', 'en', 'zh'],
  baseCurrency: 'MNT',
  dateFormat: 'YYYY-MM-DD',
  passwordMinLength: 12,
  loginFailureLimit: 10,
  loginLockoutMinutes: 15,
  sessionDurationMinutes: 0,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function setup() {
  let current = { ...initial };
  const tx = {
    $executeRaw: vi.fn(),
    coreTenantSettings: {
      upsert: vi.fn(async () => current),
      update: vi.fn(async ({ data }: { data: Partial<typeof current> }) => {
        current = { ...current, ...data, updatedAt: new Date('2026-01-02T00:00:00.000Z') };
        return current;
      }),
    },
  };
  const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  const system = { $queryRaw: vi.fn().mockResolvedValue([{ name: 'Tenant' }]) };
  const access = { requireTenantAdmin: vi.fn().mockResolvedValue('actor-id') };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const securityPolicy = { invalidate: vi.fn().mockResolvedValue(undefined) };
  const service = new CoreTenantSettingsService(prisma as never, system as never, access as never, audit as never, securityPolicy as never);
  return { service, tx, system, access, audit, securityPolicy };
}

describe('CoreTenantSettingsService (SYS-01)', () => {
  let s: ReturnType<typeof setup>;

  beforeEach(() => {
    s = setup();
  });

  it('уншихад tenant admin шаарддаг бөгөөд профайл/аюулгүй байдлын бодлогыг буцаана', async () => {
    const result = await s.service.get('tenant-id', 'auth-id');
    expect(s.access.requireTenantAdmin).toHaveBeenCalledWith(expect.anything(), 'tenant-id', 'auth-id');
    expect(result.profile).toMatchObject({ name: 'Tenant', defaultLanguage: 'mn', baseCurrency: 'MNT' });
    expect(result.security).toMatchObject({ passwordMinLength: 12, loginFailureLimit: 10 });
  });

  it('профайлыг tenant-ийн хэлний invariant-тай хадгалж, audit хөтөлнө', async () => {
    const result = await s.service.updateProfile('tenant-id', 'auth-id', {
      name: 'New name',
      defaultLanguage: 'en',
      activeLanguages: ['en', 'mn'],
    });
    expect(result.profile).toMatchObject({ name: 'New name', defaultLanguage: 'en', activeLanguages: ['en', 'mn'] });
    expect(s.audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId: 'tenant-id',
      entityType: 'tenant_settings',
      entityId: 'tenant-id',
      actorUserId: 'actor-id',
      action: 'UPDATE',
    }));
    expect(s.securityPolicy.invalidate).toHaveBeenCalledWith('tenant-id');
  });

  it('анхдагч хэл идэвхтэй жагсаалтад байхгүй бол хадгалалтыг татгалзана', async () => {
    await expect(s.service.updateProfile('tenant-id', 'auth-id', {
      defaultLanguage: 'zh',
      activeLanguages: ['mn', 'en'],
    })).rejects.toMatchObject({ code: 'core.settings.default_language_not_active' });
    expect(s.tx.coreTenantSettings.update).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('буруу цагийн бүсийг хадгалахгүй', async () => {
    await expect(s.service.updateProfile('tenant-id', 'auth-id', { timeZone: 'Not/A_Timezone' }))
      .rejects.toMatchObject({ code: 'core.settings.invalid_time_zone' });
    expect(s.tx.coreTenantSettings.update).not.toHaveBeenCalled();
  });

  it('security бодлогын өөрчлөлтийг audit хийж, cache-ийг цэвэрлэнэ', async () => {
    const result = await s.service.updateSecurity('tenant-id', 'auth-id', {
      passwordMinLength: 16,
      loginFailureLimit: 5,
      loginLockoutMinutes: 30,
      sessionDurationMinutes: 480,
    });
    expect(result.security).toMatchObject({
      passwordMinLength: 16,
      loginFailureLimit: 5,
      loginLockoutMinutes: 30,
      sessionDurationMinutes: 480,
    });
    expect(s.audit.record).toHaveBeenCalled();
    expect(s.securityPolicy.invalidate).toHaveBeenCalledWith('tenant-id');
  });
});
