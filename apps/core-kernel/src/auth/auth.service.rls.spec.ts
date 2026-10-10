/**
 * Phase 4.8.3–4.8.4 — AuthService: register нь tenant transaction, login нь системийн холболт
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: { createUser: vi.fn(), deleteUser: vi.fn() },
      signInWithPassword: vi.fn(),
    },
  })),
}));
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const config = { get: () => undefined };
const supa = () => (createClient as ReturnType<typeof vi.fn>).mock.results.at(-1)!.value;

describe('AuthService — RLS холболтууд', () => {
  let tx: { $executeRaw: ReturnType<typeof vi.fn>; coreUser: { create: ReturnType<typeof vi.fn> } };
  let app: { $transaction: ReturnType<typeof vi.fn>; coreUser: { findUnique: ReturnType<typeof vi.fn> } };
  let system: { coreUser: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      coreUser: { create: vi.fn().mockResolvedValue({ id: 'cu', authId: 'a', email: 'e@x.mn', fullName: null, role: 'REQUESTER', tenantId: TENANT_ID }) },
    };
    app = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))) as ReturnType<typeof vi.fn>, coreUser: { findUnique: vi.fn() } };
    system = { coreUser: { findUnique: vi.fn() } };
  });

  it('register: set_config(tenant) → core_users.create НЭГ transaction-д (өмнө нь тусдаа statement) [RLS-007]', async () => {
    const svc = new AuthService(config as never, app as never, system as never);
    supa().auth.admin.createUser.mockResolvedValueOnce({ data: { user: { id: 'auth-1' } }, error: null });
    supa().auth.signInWithPassword.mockResolvedValueOnce({ data: { session: { access_token: 't' } }, error: null });
    await svc.register({ email: 'e@x.mn', password: 'secret1' } as never, TENANT_ID);
    expect(app.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(TENANT_ID);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.coreUser.create.mock.invocationCallOrder[0]);
  });

  it('login: authId → core_users хайлт СИСТЕМИЙН холболтоор (tenant тодорхойгүй) [4.8.4]', async () => {
    const svc = new AuthService(config as never, app as never, system as never);
    supa().auth.signInWithPassword.mockResolvedValueOnce({ data: { session: { access_token: 't' }, user: { id: 'auth-1' } }, error: null });
    system.coreUser.findUnique.mockResolvedValueOnce({ id: 'cu', authId: 'auth-1', email: 'e', fullName: null, role: 'OWNER', tenantId: TENANT_ID });
    const r = await svc.login({ email: 'e@x.mn', password: 'secret1' } as never);
    expect(r.user.tenantId).toBe(TENANT_ID);
    expect(system.coreUser.findUnique).toHaveBeenCalledWith({ where: { authId: 'auth-1' } });
    expect(app.coreUser.findUnique).not.toHaveBeenCalled();
  });
});
