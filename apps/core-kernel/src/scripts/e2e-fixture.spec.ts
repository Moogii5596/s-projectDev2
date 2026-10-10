/**
 * Phase 6.1.1 — E2E fixture логик (портоор, DB/Auth-гүй)
 */
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_USERS, FixtureAuth, FixtureDb, SIMPLE_STEPS, setupFixture, teardownFixture, tenantHost } from './e2e-fixture';

function fakes(opts: { failCreateUserAt?: number; devTenant?: string | null } = {}) {
  let n = 0;
  let users = 0;
  const auth = {
    createUser: vi.fn(async (email: string) => {
      users += 1;
      if (opts.failCreateUserAt === users) throw new Error('auth down');
      return `auth-${email}`;
    }),
    signIn: vi.fn(async (email: string) => `tok-${email}`),
    deleteUser: vi.fn(async (_id: string): Promise<void> => undefined),
  } satisfies FixtureAuth;
  const db = {
    findTenantId: vi.fn(async (_slug: string): Promise<string | null> => (opts.devTenant === undefined ? 'dev-id' : opts.devTenant)),
    createTenant: vi.fn(async (_name: string, slug: string) => `id-${slug}`),
    createDefinition: vi.fn(async (_t: string, _n: string, _s: unknown): Promise<void> => undefined),
    createCoreUser: vi.fn(async (_u: Parameters<FixtureDb['createCoreUser']>[0]) => `core-${(n += 1)}`),
    deleteTenant: vi.fn(async (_id: string): Promise<void> => undefined),
    cleanupDevTenant: vi.fn(async (_t: string, _ids: string[], _p: string): Promise<void> => undefined),
  } satisfies FixtureDb;
  return { auth, db };
}

describe('setupFixture', () => {
  it('a, b, wf tenant + бүх хэрэглэгч (role, tenant зөв) + token; a/b-д definition, wf-д үгүй', async () => {
    const { auth, db } = fakes();
    const f = await setupFixture({ auth, db }, { devSlug: 'test-tenant', stamp: 42, password: () => 'pw' });

    expect(f.prefix).toBe('E2E-42');
    expect(f.devTenant).toEqual({ id: 'dev-id', slug: 'test-tenant' });
    expect(f.tenants.a).toEqual({ id: 'id-e2e-a-42', slug: 'e2e-a-42', host: tenantHost('e2e-a-42') });
    expect(tenantHost('x')).toBe('x.e2e.test'); // localhost биш → guard subdomain-аар tenant олно
    expect(db.createDefinition.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['id-e2e-a-42', SIMPLE_STEPS],
      ['id-e2e-b-42', SIMPLE_STEPS],
    ]);

    expect(Object.keys(f.users)).toEqual(Object.keys(FIXTURE_USERS));
    expect(f.users.wfAppr2).toMatchObject({ role: 'APPROVER', tenant: 'wf', email: 'e2e-wfappr2-42@example.com', password: 'pw' });
    expect(f.users.devAdmin.token).toBe('tok-e2e-devadmin-42@example.com');
    const tenantOf = (key: string) => db.createCoreUser.mock.calls.find((c) => c[0].email === `e2e-${key.toLowerCase()}-42@example.com`)![0].tenantId;
    expect(tenantOf('devReq')).toBe('dev-id');
    expect(tenantOf('bAdmin')).toBe('id-e2e-b-42');
  });

  it('DEV tenant алга → алдаа, юу ч үүсгэхгүй', async () => {
    const { auth, db } = fakes({ devTenant: null });
    await expect(setupFixture({ auth, db }, { devSlug: 'nope' })).rejects.toThrow(/DEV tenant "nope" алга/);
    expect(db.createTenant).not.toHaveBeenCalled();
  });

  it('дундаас алдаа → үүсгэсэн tenant, Auth хэрэглэгчдийг буцааж устгана', async () => {
    const { auth, db } = fakes({ failCreateUserAt: 3 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(setupFixture({ auth, db }, { devSlug: 'test-tenant', stamp: 7 })).rejects.toThrow('auth down');
    expect(db.deleteTenant.mock.calls.map((c) => c[0])).toEqual(['id-e2e-a-7', 'id-e2e-b-7', 'id-e2e-wf-7']);
    expect(auth.deleteUser).toHaveBeenCalledTimes(2);
  });
});

describe('teardownFixture', () => {
  it('tenant-ууд, DEV tenant (зөвхөн dev хэрэглэгчийн core id + prefix), Auth; алдаа гарсан ч үргэлжилнэ', async () => {
    const { auth, db } = fakes();
    const f = await setupFixture({ auth, db }, { devSlug: 'test-tenant', stamp: 9, password: () => 'pw' });
    db.deleteTenant.mockRejectedValueOnce(new Error('locked'));
    auth.deleteUser.mockClear();

    const errors = await teardownFixture({ auth, db }, f);
    expect(errors).toEqual(['tenant a: locked']);
    expect(db.deleteTenant).toHaveBeenCalledTimes(3);
    const devIds = Object.values(f.users).filter((u) => u.tenant === 'dev').map((u) => u.coreId);
    expect(devIds).toHaveLength(4);
    expect(db.cleanupDevTenant).toHaveBeenCalledWith('dev-id', devIds, 'E2E-9');
    expect(auth.deleteUser).toHaveBeenCalledTimes(Object.keys(FIXTURE_USERS).length);
  });
});
