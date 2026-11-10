import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreTenantModulesService } from './core-tenant-modules.service';
import { TENANT_MODULES } from './module-registry';

function setup(rows: { moduleId: string; status: string }[] = [], debugMenuEnabled = false) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    coreUser: { findFirst: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    installedModule: {
      findMany: vi.fn().mockResolvedValue(rows),
      upsert: vi.fn().mockResolvedValue({ id: 'module-row' }),
    },
  };
  const prisma = { $transaction: vi.fn((fn: (value: typeof tx) => unknown) => fn(tx)) };
  const system = { installedModule: { findMany: vi.fn().mockResolvedValue(rows) } };
  const access = {
    requireTenantAdmin: vi.fn().mockResolvedValue('actor-id'),
    resolve: vi.fn().mockResolvedValue({ userId: 'actor-id', perms: { global: [], byCamp: {} } }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
  const service = new CoreTenantModulesService(
    system as never,
    prisma as never,
    access as never,
    audit as never,
    redis as never,
    { DEBUG_MENU_ENABLED: debugMenuEnabled } as never,
  );
  return { service, tx, system, access, audit, redis };
}

describe('CoreTenantModulesService (SYS-02)', () => {
  let s: ReturnType<typeof setup>;

  beforeEach(() => {
    s = setup();
  });

  it('шинэ tenant-д үндсэн модуль асаалттай, debug-only модуль унтраалттай гэж үзнэ', async () => {
    const result = await s.service.list('tenant-id', 'auth-id');
    expect(s.access.requireTenantAdmin).toHaveBeenCalledWith(expect.anything(), 'tenant-id', 'auth-id');
    expect(result.find((module) => module.id === 'core')?.active).toBe(true);
    expect(result.find((module) => module.id === 'camp')?.active).toBe(true);
    expect(result.find((module) => module.id === 'hr')?.active).toBe(true);
    expect(result.find((module) => module.id === 'feed')?.active).toBe(true);
    expect(result.find((module) => module.id === 'inventory')?.active).toBe(false);
  });

  it('модулийг өгөгдөл устгахгүйгээр идэвхжүүлж, аудит ба кэшийг шинэчилнэ', async () => {
    const current = TENANT_MODULES.filter((module) => module.defaultActive)
      .map((module) => ({ moduleId: module.id, status: 'ACTIVE' }));
    s = setup(current);
    const result = await s.service.update('tenant-id', 'auth-id', 'inventory', true);
    expect(s.tx.installedModule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ moduleId: 'inventory', status: 'ACTIVE' }),
      update: expect.objectContaining({ status: 'ACTIVE' }),
    }));
    expect(result.find((module) => module.id === 'inventory')?.active).toBe(true);
    expect(s.audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: 'installed_module',
      action: 'UPDATE',
      after: { status: 'ACTIVE' },
    }));
    expect(s.redis.del).toHaveBeenCalledWith('tenant:modules:tenant-id');
  });

  it('идэвхтэй dependent байхад dependency-г унтраахгүй', async () => {
    s = setup([{ moduleId: 'camp', status: 'ACTIVE' }, { moduleId: 'hr', status: 'ACTIVE' }]);
    await expect(s.service.update('tenant-id', 'auth-id', 'hr', false))
      .rejects.toMatchObject({ status: 409, code: 'core.modules.dependency_active' });
    expect(s.tx.installedModule.upsert).not.toHaveBeenCalled();
  });

  it('dependency унтраалттай үед хамаарах модулийг идэвхжүүлэхгүй', async () => {
    s = setup([{ moduleId: 'camp', status: 'SUSPENDED' }, { moduleId: 'hr', status: 'SUSPENDED' }]);
    await expect(s.service.update('tenant-id', 'auth-id', 'camp', true))
      .rejects.toMatchObject({ status: 400, code: 'core.modules.dependency_missing' });
    expect(s.tx.installedModule.upsert).not.toHaveBeenCalled();
  });

  it('шаардлагатай core модулийг унтраахгүй', async () => {
    await expect(s.service.update('tenant-id', 'auth-id', 'core', false))
      .rejects.toMatchObject({ status: 400, code: 'core.modules.required' });
    expect(s.access.requireTenantAdmin).not.toHaveBeenCalled();
  });

  it('идэвхтэй модулийг cache-аас уншина, cache miss дээр DB-д fallback хийнэ', async () => {
    s.system.installedModule.findMany.mockResolvedValue([{ moduleId: 'inventory', status: 'ACTIVE' }]);
    const hiddenModules = await s.service.getMyModules('tenant-id', 'auth-id');
    expect(hiddenModules.modules).toContain('camp');
    expect(hiddenModules.modules).not.toContain('inventory');
    expect(s.system.installedModule.findMany).toHaveBeenCalled();
    s.redis.get.mockResolvedValue(JSON.stringify(['core', 'inventory']));
    expect(await s.service.getMyModules('tenant-id', 'auth-id')).toEqual({ modules: ['core'] });
    expect(s.system.installedModule.findMany).toHaveBeenCalledTimes(1);
  });

  it('DEBUG_MENU_ENABLED болон OWNER role хоёулаа зөвшөөрсөн үед debug-only модулийг буцаана', async () => {
    s = setup([{ moduleId: 'inventory', status: 'ACTIVE' }], true);
    expect((await s.service.getMyModules('tenant-id', 'auth-id')).modules).toContain('inventory');
  });

  it('OWNER биш хэрэглэгч зөвхөн tenant-wide core.debug.view эрхтэй үед нэвтэрнэ', async () => {
    s = setup([], true);
    s.access.resolve.mockResolvedValue({
      userId: 'actor-id',
      perms: { global: ['core.debug.view'], byCamp: {} },
    } as never);
    expect(await s.service.canViewDebugModules('tenant-id', 'auth-id')).toBe(true);
    s.access.resolve.mockResolvedValue({
      userId: 'actor-id',
      perms: { global: [], byCamp: {} },
    } as never);
    s.tx.coreUser.findFirst.mockResolvedValue({ role: 'ADMIN' });
    expect(await s.service.canViewDebugModules('tenant-id', 'auth-id')).toBe(false);
  });
});
