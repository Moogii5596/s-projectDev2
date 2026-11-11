/**
 * v0.2.5 H1 (#16) — бүртгэлийн нэвтрэлтийн түгжээ NestJS-д (integration, бодит PG + GoTrue).
 *   - 15 мин-д 5 буруу → 15 мин түгжинэ (зөв нууц үгтэй ч 429 `auth.account_locked`, mn/en/zh)
 *   - зөв нэвтрэлт тоолуурыг тэглэнэ
 *   - Debug: төлөв харах, тайлах (core.debug.manage + audit); өөр tenant-ийн хэрэглэгч 404; эрхгүй 404
 *   - Тоолуур = auth.users-ээр (tenant-аас хамааралгүй), `auth_guard` app_user-д хүрэхгүй
 */
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CampIt, createCampIt, IT_PASSWORD } from './helpers/camp-it-app';
import { LoginLockService } from '../src/auth/login-lock.service';

let it_: CampIt;
const prevDebug = process.env.DEBUG_MENU_ENABLED;
let otherTenantId: string | null = null;

const signIn = (identifier: string, password: string, lang = 'mn') =>
  it_.api().post('/api/v1/auth/sign-in').set('Host', it_.host).set('Accept-Language', lang).send({ identifier, password });

async function failures(authId: string) {
  return it_.prismaAdmin.$queryRaw<{ failed_count: number; locked_until: Date | null }[]>`
    SELECT failed_count, locked_until FROM auth_guard.password_failures WHERE user_id = ${authId}::uuid`;
}

async function user(who: 'manager' | 'nobody') {
  return it_.prismaAdmin.coreUser.findUniqueOrThrow({ where: { id: it_.coreIds[who] }, select: { id: true, email: true, authId: true } });
}

beforeAll(async () => {
  process.env.DEBUG_MENU_ENABLED = 'true'; // Debug API (D-1) — энэ файлын app-д л
  it_ = await createCampIt('h1lock');
  await it_.prismaAdmin.coreUser.update({ where: { id: it_.coreIds.admin }, data: { role: 'OWNER' } }); // Debug view + manage
}, 120_000);

afterAll(async () => {
  if (prevDebug === undefined) delete process.env.DEBUG_MENU_ENABLED;
  else process.env.DEBUG_MENU_ENABLED = prevDebug;
  if (otherTenantId) await it_?.prismaAdmin.tenant.delete({ where: { id: otherTenantId } }).catch(() => undefined);
  await it_?.close();
}, 30_000);

describe('H1 — бүртгэлийн түгжээ', () => {
  it('5 буруу → түгжинэ (5 дахь нь 429); зөв нууц үгтэй ч 429; мессеж 3 хэлээр; Debug-ээр тайлсны дараа нэвтэрнэ (audit)', async () => {
    const u = await user('nobody');
    for (let i = 0; i < 4; i++) expect((await signIn(u.email, 'wrong-password')).status).toBe(401);
    const fifth = await signIn(u.email, 'wrong-password');
    expect(fifth.status).toBe(429);
    expect(fifth.body).toMatchObject({ code: 'auth.account_locked', params: { minutes: 15 } });
    expect(fifth.body.message).toContain('15 минутын дараа');

    const right = await signIn(u.email, IT_PASSWORD, 'en');
    expect(right.status).toBe(429);
    expect(right.body.message).toMatch(/Try again in 1[45] min/);
    expect((await signIn(u.email, IT_PASSWORD, 'zh')).body.message).toMatch(/请 1[45] 分钟后再试/);

    const [row] = await failures(u.authId);
    expect(row.failed_count).toBe(5);
    const mins = (row.locked_until!.getTime() - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(14);
    expect(mins).toBeLessThanOrEqual(15);

    // Debug: төлөв
    const st = await it_.api().get(`/api/v1/core/debug/users/${u.id}/login-lock`).set(it_.as('admin')).expect(200);
    expect(st.body).toMatchObject({ locked: true, failedCount: 5 });
    // Debug эрхгүй → 404 (байгааг нь ил гаргахгүй)
    await it_.api().post(`/api/v1/core/debug/actions/users/${u.id}/unlock`).set(it_.as('manager')).expect(404);
    // Тайлах (OWNER) → audit
    const un = await it_.api().post(`/api/v1/core/debug/actions/users/${u.id}/unlock`).set(it_.as('admin')).expect(201);
    expect(un.body).toEqual({ ok: true, wasLocked: true });
    expect(await failures(u.authId)).toEqual([]);
    const audit = await it_.prismaAdmin.campAuditLog.findFirst({ where: { tenantId: it_.tenantId, entityType: 'debug_action', entityId: u.id } });
    expect(audit).toMatchObject({ actorUserId: it_.coreIds.admin, summaryParams: { action: 'login_unlock' } });

    expect((await signIn(u.email, IT_PASSWORD)).status).toBe(200);
  });

  it('зөв нэвтрэлт тоолуурыг тэглэнэ (3 буруу → зөв → мөр устна)', async () => {
    const u = await user('manager');
    for (let i = 0; i < 3; i++) expect((await signIn(u.email, 'wrong-password')).status).toBe(401);
    expect((await failures(u.authId))[0]?.failed_count).toBe(3);
    expect((await signIn(u.email, IT_PASSWORD)).status).toBe(200);
    expect(await failures(u.authId)).toEqual([]);
    const st = await it_.api().get(`/api/v1/core/debug/users/${u.id}/login-lock`).set(it_.as('admin')).expect(200);
    expect(st.body).toEqual({ locked: false, lockedUntil: null, failedCount: 0 });
  });

  it('tenant тусгаарлалт: өөр tenant-ийн хэрэглэгчийн түгжээг харах/тайлах → 404', async () => {
    otherTenantId = (await it_.prismaAdmin.tenant.create({ data: { slug: `h1other-${randomUUID().slice(0, 8)}`, name: 'H1 other' } })).id;
    const other = await it_.prismaAdmin.coreUser.create({ data: { tenantId: otherTenantId, authId: randomUUID(), email: `h1-${randomUUID().slice(0, 8)}@it.test` } });
    await it_.api().get(`/api/v1/core/debug/users/${other.id}/login-lock`).set(it_.as('admin')).expect(404);
    await it_.api().post(`/api/v1/core/debug/actions/users/${other.id}/unlock`).set(it_.as('admin')).expect(404);
  });

  it('SQL дүрэм: цонх дууссан → 1-ээс; идэвхтэй түгжээг зэрэг оролдлого өөрчлөхгүй; дууссан түгжээ → 1-ээс', async () => {
    const lock = it_.app.get(LoginLockService);
    const { authId } = await user('manager');
    const set = (count: number, windowAgoMin: number, lockedInMin: number | null) => it_.prismaAdmin.$executeRaw`
      UPDATE auth_guard.password_failures SET failed_count = ${count}, window_start = now() - make_interval(mins => ${windowAgoMin}::int),
        locked_until = ${lockedInMin === null ? null : new Date(Date.now() + lockedInMin * 60_000)}::timestamptz
      WHERE user_id = ${authId}::uuid`;
    await lock.unlock(authId);
    expect(await lock.recordFailure(authId)).toBeNull();
    await set(4, 16, null); // 4 буруу, гэхдээ 16 мин өмнөх цонх → шинэ цонх
    expect(await lock.recordFailure(authId)).toBeNull();
    expect((await failures(authId))[0].failed_count).toBe(1);
    await set(4, 5, null); // цонх дотор 4 → 5 дахь нь түгжинэ
    const until = await lock.recordFailure(authId);
    expect(until).not.toBeNull();
    expect(await lock.recordFailure(authId)).toEqual(until); // идэвхтэй түгжээ хэвээр (тэглэхгүй, сунгахгүй)
    expect((await failures(authId))[0].failed_count).toBe(5);
    await set(5, 20, -1); // түгжээ дууссан
    expect(await lock.lockedUntil(authId)).toBeNull();
    expect(await lock.recordFailure(authId)).toBeNull();
    expect((await failures(authId))[0]).toMatchObject({ failed_count: 1, locked_until: null });
    await lock.unlock(authId);
  });

  it('auth_guard нь app_user (RLS холболт)-д хаалттай', async () => {
    await expect(it_.prismaRls.$queryRaw`SELECT 1 FROM auth_guard.password_failures LIMIT 1`).rejects.toThrow(/permission denied/);
  });
});
