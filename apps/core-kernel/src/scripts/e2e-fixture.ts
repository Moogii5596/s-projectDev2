/**
 * Phase 6.1.1 — E2E fixture (`pnpm --filter @s-project/core-kernel e2e:fixture setup|teardown`)
 *
 * Playwright-ийн globalSetup/globalTeardown дуудна. Гараар token/SQL бэлдэхгүй:
 *   setup    → тусдаа tenant-ууд (a, b — тусгаарлалт; wf — олон алхамт батлалт) + хэрэглэгчид,
 *              DEV tenant (`DEV_TENANT_SLUG`, UI тест localhost-оор тэнд ордог)-д UI хэрэглэгчид → JSON файл
 *   teardown → tenant-ууд (cascade), DEV tenant-ийн e2e хэрэглэгчид + тэдний MR, `prefix`-тэй бараа/нийлүүлэгч, Auth хэрэглэгчид
 * Логик нь портоор (Auth, Db) — unit тестлэгдэнэ; бодит холболт `e2e-fixture.cli.ts`-д. Зөвхөн local.
 */
import { randomBytes } from 'node:crypto';

export type FixtureRole = 'OWNER' | 'ADMIN' | 'APPROVER' | 'REQUESTER' | 'VIEWER';
export type FixtureTenantKey = 'a' | 'b' | 'wf';

/** Хэрэглэгчийн түлхүүр → (tenant, role). `dev` = DEV tenant (UI) */
export const FIXTURE_USERS = {
  aReq: { tenant: 'a', role: 'REQUESTER' },
  aAppr: { tenant: 'a', role: 'APPROVER' },
  aAdmin: { tenant: 'a', role: 'ADMIN' },
  bReq: { tenant: 'b', role: 'REQUESTER' },
  bAdmin: { tenant: 'b', role: 'ADMIN' },
  wfReq: { tenant: 'wf', role: 'REQUESTER' },
  wfAppr1: { tenant: 'wf', role: 'APPROVER' },
  wfAppr2: { tenant: 'wf', role: 'APPROVER' },
  wfAdmin: { tenant: 'wf', role: 'ADMIN' },
  devReq: { tenant: 'dev', role: 'REQUESTER' },
  devAppr1: { tenant: 'dev', role: 'APPROVER' },
  devAppr2: { tenant: 'dev', role: 'APPROVER' },
  devAdmin: { tenant: 'dev', role: 'ADMIN' },
  /** v0.2.2 Блок 6б (SEC-009): хэрэглэгч / роль удирдах e2e — системийн админ; профайлын хэл өөрчлөхгүй (TEST-026) */
  devUserAdmin: { tenant: 'dev', role: 'ADMIN' },
  /** TEST-027: профайлын хэлийг өөрчилдөг e2e (camp-v020) — devAdmin-ийг бусад spec зэрэг ашигладаг */
  devLangAdmin: { tenant: 'dev', role: 'ADMIN' },
} as const satisfies Record<string, { tenant: FixtureTenantKey | 'dev'; role: FixtureRole }>;
export type FixtureUserKey = keyof typeof FIXTURE_USERS;

/** a, b-д MR илгээх боломжтой байх энгийн definition (wf-д тест өөрөө API-аар үүсгэнэ) */
export const SIMPLE_STEPS = [{ order: 1, role: 'APPROVER', quorum: 1 }];

export interface FixtureTenant {
  id: string;
  slug: string;
  /** API хүсэлтийн Host header (subdomain → slug). DEV tenant-д localhost */
  host: string;
}

export interface FixtureUser {
  email: string;
  password: string;
  role: FixtureRole;
  tenant: FixtureTenantKey | 'dev';
  authId: string;
  coreId: string;
  /** Supabase access token (≈1 цаг) — API тестэд */
  token: string;
}

export interface FixtureFile {
  version: 1;
  stamp: number;
  /** Тестийн үүсгэсэн бараа/нийлүүлэгчийн нэрний угтвар — teardown DEV tenant-аас устгана */
  prefix: string;
  devTenant: { id: string; slug: string };
  tenants: Record<FixtureTenantKey, FixtureTenant>;
  users: Record<FixtureUserKey, FixtureUser>;
}

export interface FixtureAuth {
  createUser(email: string, password: string): Promise<string>;
  signIn(email: string, password: string): Promise<string>;
  deleteUser(authId: string): Promise<void>;
}

export interface FixtureDb {
  findTenantId(slug: string): Promise<string | null>;
  createTenant(name: string, slug: string): Promise<string>;
  createDefinition(tenantId: string, name: string, steps: unknown): Promise<void>;
  createCoreUser(u: { tenantId: string; authId: string; email: string; fullName: string; role: FixtureRole }): Promise<string>;
  deleteTenant(tenantId: string): Promise<void>;
  /** DEV tenant: e2e хэрэглэгчдийн MR (+workflow), батлалтын бичлэг, `prefix`-тэй бараа/нийлүүлэгч, core_users */
  cleanupDevTenant(tenantId: string, coreIds: string[], prefix: string): Promise<void>;
}

export const tenantHost = (slug: string): string => `${slug}.e2e.test`;

/** Supabase-ийн шаардлагыг хангах санамсаргүй нууц үг */
export const randomPassword = (): string => `${randomBytes(12).toString('base64url')}Aa1!`;

export async function setupFixture(
  deps: { auth: FixtureAuth; db: FixtureDb },
  opts: { devSlug: string; stamp?: number; password?: () => string },
): Promise<FixtureFile> {
  const stamp = opts.stamp ?? Date.now();
  const password = opts.password ?? randomPassword;
  const devId = await deps.db.findTenantId(opts.devSlug);
  if (!devId) {
    throw new Error(`DEV tenant "${opts.devSlug}" алга — supabase/seed.sql (supabase db reset) ажилласан эсэхийг шалгана уу`);
  }

  // Алдаа гарвал үүсгэснээ буцааж устгана (хагас fixture үлдээхгүй)
  const partial: FixtureFile = {
    version: 1,
    stamp,
    prefix: `E2E-${stamp}`,
    devTenant: { id: devId, slug: opts.devSlug },
    tenants: {} as FixtureFile['tenants'],
    users: {} as FixtureFile['users'],
  };
  const createdAuth: string[] = [];
  try {
    for (const key of ['a', 'b', 'wf'] as const) {
      const slug = `e2e-${key}-${stamp}`;
      const id = await deps.db.createTenant(`E2E ${key.toUpperCase()} ${stamp}`, slug);
      partial.tenants[key] = { id, slug, host: tenantHost(slug) };
      if (key !== 'wf') await deps.db.createDefinition(id, `e2e-${key}`, SIMPLE_STEPS);
    }
    for (const key of Object.keys(FIXTURE_USERS) as FixtureUserKey[]) {
      const def = FIXTURE_USERS[key];
      const email = `e2e-${key.toLowerCase()}-${stamp}@example.com`;
      const pw = password();
      const authId = await deps.auth.createUser(email, pw);
      createdAuth.push(authId);
      const tenantId = def.tenant === 'dev' ? devId : partial.tenants[def.tenant].id;
      const coreId = await deps.db.createCoreUser({ tenantId, authId, email, fullName: `E2E ${key}`, role: def.role });
      partial.users[key] = { email, password: pw, role: def.role, tenant: def.tenant, authId, coreId, token: '' };
    }
    for (const u of Object.values(partial.users)) {
      u.token = await deps.auth.signIn(u.email, u.password);
    }
    return partial;
  } catch (err) {
    const errors = await teardownFixture(deps, partial, createdAuth);
    if (errors.length) console.error(`[e2e-fixture] rollback алдаа: ${errors.join('; ')}`);
    throw err;
  }
}

/** Алдаа гарсан ч бусдыг үргэлжлүүлнэ; алдааны жагсаалт буцаана */
export async function teardownFixture(
  deps: { auth: FixtureAuth; db: FixtureDb },
  file: Pick<FixtureFile, 'prefix' | 'devTenant' | 'tenants' | 'users'>,
  extraAuthIds: string[] = [],
): Promise<string[]> {
  const errors: string[] = [];
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  for (const [key, t] of Object.entries(file.tenants ?? {})) {
    if (t?.id) await attempt(`tenant ${key}`, () => deps.db.deleteTenant(t.id));
  }
  const users = Object.values(file.users ?? {}) as FixtureUser[];
  const devCoreIds = users.filter((u) => u.tenant === 'dev' && u.coreId).map((u) => u.coreId);
  if (file.devTenant?.id) {
    await attempt('DEV tenant', () => deps.db.cleanupDevTenant(file.devTenant.id, devCoreIds, file.prefix));
  }
  const authIds = new Set([...users.map((u) => u.authId).filter(Boolean), ...extraAuthIds]);
  for (const id of authIds) await attempt(`auth ${id}`, () => deps.auth.deleteUser(id));
  return errors;
}
