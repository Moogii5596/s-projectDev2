/**
 * v0.2.3 Блок 4 — PIL-15 (session цуцлах), PIL-16 (last_sign_in_at) (integration, бодит PG + GoTrue).
 *   - POST /auth/sign-in амжилттай → core_users.last_sign_in_at
 *   - POST /auth/change-password → одоогийн session үлдэнэ, бусад session-ууд auth.sessions-ээс устгана
 *   - POST /auth/invites/:token/accept → хэрэглэгчийн бүх session цуцлагдана
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CampIt, createCampIt, IT_PASSWORD } from './helpers/camp-it-app';

let it_: CampIt;
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** JWT payload-ээс session_id / sub */
function jwtClaims(token: string): { session_id?: string; sub?: string } {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function sessionCount(authId: string): Promise<number> {
  const rows = await it_.prismaAdmin.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM auth.sessions WHERE user_id = ${authId}::uuid`;
  return Number(rows[0].n);
}

async function sessionIds(authId: string): Promise<string[]> {
  const rows = await it_.prismaAdmin.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM auth.sessions WHERE user_id = ${authId}::uuid`;
  return rows.map((r) => r.id);
}

beforeAll(async () => {
  it_ = await createCampIt('v023auth');
}, 120_000);

afterAll(async () => {
  await it_?.close();
}, 30_000);

describe('PIL-16 — сүүлийн нэвтрэлт', () => {
  it('POST /auth/sign-in амжилттай → core_users.last_sign_in_at бичигдэнэ', async () => {
    const { api, prismaAdmin, coreIds, host } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager } });
    const r = await api().post('/api/v1/auth/sign-in').set('Host', host)
      .send({ identifier: u.email, password: IT_PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();

    const after = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager }, select: { lastSignInAt: true } });
    expect(after.lastSignInAt).not.toBeNull();
  });
});

describe('PIL-15 — нууц үг солих: бүх session цуцлагдана', () => {
  it('change-password → auth.sessions бүгд устгагдана; хуучин access token 401; refresh алдаа', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager } });

    // Session A = camp-it beforeAll-ын token (as('manager')); Session B = шинэ sign-in
    const tokenA = (as('manager')['Authorization'] as string).replace('Bearer ', '');
    const sessionA = jwtClaims(tokenA).session_id!;
    const signIn2 = await anon().auth.signInWithPassword({ email: u.email, password: IT_PASSWORD });
    expect(signIn2.data.session).toBeTruthy();
    const sessionB = jwtClaims(signIn2.data.session!.access_token).session_id!;
    const refreshB = signIn2.data.session!.refresh_token;

    expect(await sessionIds(u.authId)).toEqual(expect.arrayContaining([sessionA, sessionB]));

    const r = await api().post('/api/v1/auth/change-password').set(as('manager'))
      .send({ currentPassword: IT_PASSWORD, newPassword: 'NewPassw0rd!2026' });
    expect(r.status).toBe(200);

    // GoTrue admin password update бүх session-ыг устгадаг → auth.sessions хоосон
    expect(await sessionIds(u.authId)).toEqual([]);
    // getUser session'ı da doğruladığı için eski access token da ölür → yeniden login gerekir
    const me = await api().get('/api/v1/auth/me').set(as('manager'));
    expect(me.status).toBe(401);
    // Цуцлагдсан session-ы refresh token → алдаа
    const re = await anon().auth.refreshSession({ refresh_token: refreshB });
    expect(re.error).toBeTruthy();
    // Шинэ нууц үг GoTrue-д хадгалагдсан
    const ok = await anon().auth.signInWithPassword({ email: u.email, password: 'NewPassw0rd!2026' });
    expect(ok.error).toBeNull();
  });
});

describe('PIL-15 — урилга accept: бүх session цуцлагдана', () => {
  it('accept → хэрэглэгчийн бүх session-ууд auth.sessions-ээс устгагдана', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.nobody } });
    expect(await sessionCount(u.authId)).toBeGreaterThanOrEqual(1); // beforeAll session

    // LINK урилга admin-аар
    const inv = await api().post(`/api/v1/core/rbac/users/${coreIds.nobody}/invites`).set(as('admin')).send({ channel: 'LINK' });
    expect(inv.status).toBe(201);
    const token = (inv.body.url ?? inv.body.path).split('/').pop()!;

    const acc = await api().post(`/api/v1/auth/invites/${token}/accept`).send({ password: 'InvitePassw0rd!1' });
    expect(acc.status).toBe(200);

    expect(await sessionCount(u.authId)).toBe(0);
  });
});
