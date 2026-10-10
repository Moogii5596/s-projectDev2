/**
 * v0.1.6 (B1) — пилотын хэрэглэгч удирдах логик (портоор, DB/Auth-гүй)
 */
import { describe, expect, it, vi } from 'vitest';
import { PilotAuth, PilotCoreUser, PilotDb, ensureUser, generatePassword, onboard, validateCampRole, validateRole, validateSlug } from './pilot-admin';

function fakes(init: { authUsers?: Record<string, string>; core?: PilotCoreUser[]; tenant?: { id: string; name: string } | null } = {}) {
  const authUsers = new Map(Object.entries(init.authUsers ?? {})); // email → authId
  const core = [...(init.core ?? [])];
  let n = 0;
  const auth = {
    findUserIdByEmail: vi.fn(async (email: string) => authUsers.get(email) ?? null),
    createUser: vi.fn(async (email: string, _pw: string) => {
      const id = `auth-${(n += 1)}`;
      authUsers.set(email, id);
      return id;
    }),
    setPassword: vi.fn(async (_id: string, _pw: string): Promise<void> => undefined),
  } satisfies PilotAuth;
  const db = {
    findTenant: vi.fn(async (_slug: string) => init.tenant ?? null),
    createTenant: vi.fn(async (_name: string, slug: string) => `t-${slug}`),
    findCoreUserByEmail: vi.fn(async (tenantId: string, email: string) => core.find((c) => c.tenantId === tenantId && (c as PilotCoreUser & { email?: string }).email === email) ?? null),
    findCoreUserByAuthId: vi.fn(async (authId: string) => core.find((c) => c.authId === authId) ?? null),
    createCoreUser: vi.fn(async (u: { tenantId: string; authId: string; email: string; fullName: string; role: PilotCoreUser['role'] }) => {
      const id = `core-${(n += 1)}`;
      core.push({ id, tenantId: u.tenantId, authId: u.authId, role: u.role, isActive: true, ...{ email: u.email } } as PilotCoreUser);
      return id;
    }),
    updateCoreUser: vi.fn(async (_id: string, _d: { role?: PilotCoreUser['role']; isActive?: boolean; fullName?: string }): Promise<void> => undefined),
    grantCampRole: vi.fn(async (_t: string, _u: string, _c: string): Promise<void> => undefined),
  } satisfies PilotDb;
  return { auth, db };
}

describe('validate*', () => {
  it('slug / role / camp-role', () => {
    expect(validateSlug(' SinoHydro ')).toBe('sinohydro');
    expect(() => validateSlug('sino hydro')).toThrow(/slug/);
    expect(validateRole('approver')).toBe('APPROVER');
    expect(() => validateRole('boss')).toThrow(/role буруу/);
    expect(validateCampRole('camp_manager')).toBe('CAMP_MANAGER');
    expect(() => validateCampRole('x')).toThrow(/camp-role/);
  });

  it('generatePassword: 16 тэмдэгт, андуурагдах тэмдэгтгүй (0 O 1 l I)', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('onboard', () => {
  it('шинэ байгууллага + OWNER + Кемп админ; нууц үг буцаана', async () => {
    const { auth, db } = fakes();
    const r = await onboard({ auth, db }, { slug: 'sinohydro', name: 'Sino Hydro', ownerEmail: 'Admin@SinoHydro.mn' });
    expect(db.createTenant).toHaveBeenCalledWith('Sino Hydro', 'sinohydro');
    expect(r).toMatchObject({ tenantId: 't-sinohydro', createdTenant: true });
    expect(r.owner).toMatchObject({ email: 'admin@sinohydro.mn', role: 'OWNER', campRole: 'CAMP_ADMIN', createdAuth: true, createdCore: true });
    expect(r.owner.password).toHaveLength(16);
    expect(db.grantCampRole).toHaveBeenCalledWith('t-sinohydro', r.owner.coreUserId, 'CAMP_ADMIN');
  });

  it('давтан ажиллуулахад байгууллага, хэрэглэгчийг дахин үүсгэхгүй, нууц үг солихгүй', async () => {
    const { auth, db } = fakes({
      tenant: { id: 't1', name: 'Sino Hydro' },
      authUsers: { 'admin@sinohydro.mn': 'a1' },
      core: [{ id: 'c1', tenantId: 't1', authId: 'a1', role: 'OWNER', isActive: true, email: 'admin@sinohydro.mn' } as PilotCoreUser],
    });
    const r = await onboard({ auth, db }, { slug: 'sinohydro', name: 'Sino Hydro', ownerEmail: 'admin@sinohydro.mn' });
    expect(db.createTenant).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(r.owner).toMatchObject({ createdAuth: false, createdCore: false, password: null });
  });
});

describe('ensureUser', () => {
  it('өөр байгууллагад холбогдсон Auth email → алдаа, юу ч өөрчлөхгүй', async () => {
    const { auth, db } = fakes({
      authUsers: { 'x@a.mn': 'a9' },
      core: [{ id: 'c9', tenantId: 'other', authId: 'a9', role: 'ADMIN', isActive: true }],
    });
    await expect(ensureUser({ auth, db }, { tenantId: 't1', email: 'x@a.mn', role: 'REQUESTER' })).rejects.toThrow(/өөр байгууллагад/);
    expect(db.createCoreUser).not.toHaveBeenCalled();
  });

  it('--reset-password → шинэ нууц үг; --deactivate → идэвхгүй, кемпийн роль олгохгүй', async () => {
    const base = { tenantId: 't1', authId: 'a1', role: 'VIEWER' as const, isActive: true };
    const { auth, db } = fakes({ authUsers: { 'u@a.mn': 'a1' }, core: [{ id: 'c1', ...base, email: 'u@a.mn' } as PilotCoreUser] });
    const r = await ensureUser({ auth, db }, { tenantId: 't1', email: 'u@a.mn', role: 'VIEWER', resetPassword: true });
    expect(auth.setPassword).toHaveBeenCalledWith('a1', r.password);
    expect(r.password).toHaveLength(16);

    const cache = { invalidateMember: vi.fn(async (_t: string, _a: string): Promise<void> => undefined) };
    expect(cache.invalidateMember).not.toHaveBeenCalled();
    const d = await ensureUser({ auth, db, cache }, { tenantId: 't1', email: 'u@a.mn', role: 'VIEWER', campRole: 'CAMP_MANAGER', deactivate: true });
    expect(cache.invalidateMember).toHaveBeenCalledWith('t1', 'a1'); // 5 мин cache хүлээхгүй
    expect(db.updateCoreUser).toHaveBeenLastCalledWith('c1', { role: 'VIEWER', isActive: false });
    expect(db.grantCampRole).not.toHaveBeenCalled();
    expect(d.isActive).toBe(false);
  });

  it('богино нууц үг → алдаа (12+)', async () => {
    const { auth, db } = fakes();
    await expect(ensureUser({ auth, db }, { tenantId: 't1', email: 'n@a.mn', role: 'VIEWER', password: 'short' })).rejects.toThrow(/12/);
  });
});
