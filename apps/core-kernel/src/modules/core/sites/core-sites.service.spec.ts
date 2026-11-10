import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreSitesService } from './core-sites.service';

function setup() {
  let site: Record<string, unknown> | null = null;
  const tx = {
    $executeRaw: vi.fn(),
    coreSite: {
      findMany: vi.fn(async () => site ? [site] : []),
      findFirst: vi.fn(async () => site),
      findFirstOrThrow: vi.fn(async () => {
        if (!site) throw new Error('site missing');
        return site;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        site = { id: 'site-id', ...data, isActive: data.isActive ?? true, createdAt: new Date(), updatedAt: new Date() };
        return site;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        site = { ...site, ...data, updatedAt: new Date() };
        return site;
      }),
    },
    camp: {
      findFirst: vi.fn(async () => null),
      create: vi.fn().mockResolvedValue({ id: 'camp-id' }),
      update: vi.fn().mockResolvedValue({ id: 'camp-id' }),
    },
    campSetting: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  const access = { requireTenantAdmin: vi.fn().mockResolvedValue('actor-id') };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new CoreSitesService(prisma as never, access as never, audit as never);
  return { service, tx, access, audit };
}

describe('CoreSitesService', () => {
  let s: ReturnType<typeof setup>;

  beforeEach(() => {
    s = setup();
  });

  it('requires tenant admin for reads and returns only the current tenant rows', async () => {
    await s.service.list('tenant-id', 'auth-id', {});
    expect(s.access.requireTenantAdmin).toHaveBeenCalledWith(expect.anything(), 'tenant-id', 'auth-id');
    expect(s.tx.coreSite.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-id' },
    }));
  });

  it('creates a camp site with its camp record, defaults, and audit in one transaction', async () => {
    const result = await s.service.create('tenant-id', 'auth-id', { type: 'CAMP', code: 'C1', name: 'Camp 1' });
    expect(result).toMatchObject({ id: 'site-id', type: 'CAMP', code: 'C1' });
    expect(s.tx.camp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tenantId: 'tenant-id', siteId: 'site-id', code: 'C1', name: 'Camp 1', isActive: true },
    }));
    expect(s.tx.campSetting.create).toHaveBeenCalledWith({ data: { tenantId: 'tenant-id', campId: 'camp-id' } });
    expect(s.audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: 'site', entityId: 'site-id', actorUserId: 'actor-id', action: 'CREATE',
    }));
  });

  it('rejects users who are not tenant admins before reading or writing site data', async () => {
    s.access.requireTenantAdmin.mockRejectedValueOnce(new Error('forbidden'));
    await expect(s.service.list('tenant-id', 'auth-id', {})).rejects.toThrow('forbidden');
    expect(s.tx.coreSite.findMany).not.toHaveBeenCalled();
  });
});
