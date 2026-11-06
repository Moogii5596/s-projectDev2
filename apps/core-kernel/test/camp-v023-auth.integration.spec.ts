/**
 * v0.2.3 Блок 4 — PIL-15 (session цуцлах), PIL-16 (last_sign_in_at) (integration, бодит PG + GoTrue).
 *   - POST /auth/sign-in амжилттай → core_users.last_sign_in_at
 *   - GET/DELETE /auth/sessions → нэвтэрсэн төхөөрөмжүүд харах, гаргах (D-3)
 *   - POST /auth/change-password → хэрэглэгчийн өөрийн токеноор: одоогийн session үлдэнэ (D-1; GoTrue бусдыг устгана — OPS-013)
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

describe('PIL-15 — нэвтэрсэн төхөөрөмжүүд (D-3)', () => {
  it('GET /auth/sessions → өөрийн session-ууд, одоогийнх current; DELETE /:id → бусдыг гаргана; одоогийнх 400; өөр хүний 404', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager } });
    const tokenA = (as('manager')['Authorization'] as string).replace('Bearer ', '');
    const sessionA = jwtClaims(tokenA).session_id!;
    const signInB = await anon().auth.signInWithPassword({ email: u.email, password: IT_PASSWORD });
    const tokenB = signInB.data.session!.access_token;
    const sessionB = jwtClaims(tokenB).session_id!;

    const list = await api().get('/api/v1/auth/sessions').set(as('manager'));
    expect(list.status).toBe(200);
    const ids = (list.body as { id: string; current: boolean }[]).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([sessionA, sessionB]));
    expect((list.body as { id: string; current: boolean }[]).find((d) => d.id === sessionA)!.current).toBe(true);
    expect((list.body as { id: string; current: boolean }[]).find((d) => d.id === sessionB)!.current).toBe(false);

    // өөр хэрэглэгчийн session-ыг устгах оролдлого → 404 (admin-ий session id)
    const adminSid = jwtClaims((as('admin')['Authorization'] as string).replace('Bearer ', '')).session_id!;
    expect((await api().delete(`/api/v1/auth/sessions/${adminSid}`).set(as('manager'))).status).toBe(404);
    expect(await sessionIds((await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.admin } })).authId)).toContain(adminSid);

    // одоогийн төхөөрөмж → 400
    const self = await api().delete(`/api/v1/auth/sessions/${sessionA}`).set(as('manager'));
    expect(self.status).toBe(400);

    // B-г гаргана → B-ийн токен хүчингүй, A хэвээр
    expect((await api().delete(`/api/v1/auth/sessions/${sessionB}`).set(as('manager'))).status).toBe(200);
    expect(await sessionIds(u.authId)).not.toContain(sessionB);
    expect((await anon().auth.getUser(tokenB)).error).toBeTruthy();
    expect((await api().get('/api/v1/auth/me').set(as('manager'))).status).toBe(200);
  });

  it('DELETE /auth/sessions/others → одоогийнхоос бусад бүгд', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager } });
    const sessionA = jwtClaims((as('manager')['Authorization'] as string).replace('Bearer ', '')).session_id!;
    await anon().auth.signInWithPassword({ email: u.email, password: IT_PASSWORD });
    await anon().auth.signInWithPassword({ email: u.email, password: IT_PASSWORD });
    expect((await sessionIds(u.authId)).length).toBeGreaterThanOrEqual(3);

    const r = await api().delete('/api/v1/auth/sessions/others').set(as('manager'));
    expect(r.status).toBe(200);
    expect(r.body.revoked).toBeGreaterThanOrEqual(2);
    expect(await sessionIds(u.authId)).toEqual([sessionA]);
  });
});

describe('PIL-15 — нууц үг солих: одоогийн төхөөрөмж үлдэнэ (D-1, OPS-013)', () => {
  it('change-password → одоогийн session + токен хэвээр, шалгалтын «сүнс» session үлдэхгүй; бусад төхөөрөмж GoTrue-ээр логоут', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.manager } });
    const sessionA = jwtClaims((as('manager')['Authorization'] as string).replace('Bearer ', '')).session_id!;
    const signIn2 = await anon().auth.signInWithPassword({ email: u.email, password: IT_PASSWORD });
    const tokenB = signIn2.data.session!.access_token;

    const r = await api().post('/api/v1/auth/change-password').set(as('manager'))
      .send({ currentPassword: IT_PASSWORD, newPassword: 'NewPassw0rd!2026' });
    expect(r.status).toBe(200);

    // Хэрэглэгчийн өөрийн токеноор солисон → зөвхөн одоогийн session үлдэнэ (шалгалтын sign-in session-ыг ч оруулан)
    expect(await sessionIds(u.authId)).toEqual([sessionA]);
    expect((await api().get('/api/v1/auth/me').set(as('manager'))).status).toBe(200);
    // GoTrue-ийн зан үйл: бусад төхөөрөмж логоут
    expect((await anon().auth.getUser(tokenB)).error).toBeTruthy();
    // Шинэ нууц үг хадгалагдсан
    expect((await anon().auth.signInWithPassword({ email: u.email, password: 'NewPassw0rd!2026' })).error).toBeNull();
  });

  it('буруу одоогийн нууц үг → 400, session-ууд хөндөгдөхгүй', async () => {
    const { api, as, prismaAdmin, coreIds } = it_;
    const u = await prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: coreIds.admin } });
    const before = await sessionIds(u.authId);
    const r = await api().post('/api/v1/auth/change-password').set(as('admin'))
      .send({ currentPassword: 'definitely-wrong-1', newPassword: 'NewPassw0rd!2026' });
    expect(r.status).toBe(400);
    expect(await sessionIds(u.authId)).toEqual(expect.arrayContaining(before));
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
