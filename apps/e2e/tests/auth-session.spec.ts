import { existsSync } from 'node:fs';
import { api } from '../helpers/api';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { REPO_ROOT } from '../helpers/fixture-paths';
import { loginAsUser } from '../helpers/fixture';

/**
 * v0.2.2 Блок 6 — QA-02: «серверт session хүчингүй, клиентэд хүчинтэй» (FE-007) + бодит GoTrue.
 *
 * FE-007: API 401 → локал session устгахгүй redirect хийвэл /login ↔ нүүр хуудас төгсгөлгүй давтагддаг байсан
 * (пилот, 6 сек-д 295 шилжилт). Энд хоёр замаар хуулбарлана:
 *   1. Хүчингүй токен (DB сэргээсэн / JWT нууц солигдсон) — localStorage-д session хэвээр, backend 401.
 *   2. Бодит GoTrue: урилгаар үүссэн хэрэглэгч утсаар нэвтэрнэ → GoTrue-д `logout?scope=global` (өөр төхөөрөмжөөс
 *      «бүгдийг гаргах») → backend-ийн auth cache (≤ 60с, tenant-cache) дууссаны дараа 401 / refresh амжилтгүй → /login.
 * Хоёулаа: /login дээр тогтвортой (давталтгүй), localStorage-д `sb-*-auth-token` үлдэхгүй, дахин нэвтэрч болно.
 *
 * 2-р тест тусдаа хэрэглэгч ашиглана — `admin@test.mn`-ийг global logout хийвэл зэрэг ажиллаж буй spec-үүд унана.
 * GoTrue тохиргоо (пилотын config.toml) → unit `core-kernel/src/auth/pilot-auth-config.spec.ts`.
 */

const rootEnv = resolve(REPO_ROOT, '.env');
const loadEnvFile = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
if (existsSync(rootEnv) && loadEnvFile) loadEnvFile(rootEnv);
const SUPABASE_URL = (process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321').replace(/\/$/, '');
const ANON_KEY = process.env['SUPABASE_ANON_KEY'] ?? '';

const STAMP = Date.now().toString(36).toUpperCase();
const PHONE = `8${String(Date.now()).slice(-7)}`;
const PASSWORD = `Qa02-${STAMP}-session`;

const SESSION_KEY = /^sb-.*-auth-token$/;

async function sessionKeys(page: Page): Promise<string[]> {
  return page.evaluate((src) => Object.keys(localStorage).filter((k) => new RegExp(src).test(k)), SESSION_KEY.source);
}

async function accessToken(page: Page): Promise<string> {
  return page.evaluate((src) => {
    const key = Object.keys(localStorage).find((k) => new RegExp(src).test(k));
    return key ? (JSON.parse(localStorage.getItem(key) as string) as { access_token: string }).access_token : '';
  }, SESSION_KEY.source);
}


/**
 * `action` (goto / reload)-ийн дараа /login дээр тогтворжиж байгааг шалгана (FE-007 давталт).
 * Зэрэг явсан хэд хэдэн 401 тус бүр /login руу шилжүүлж болно (хуулбарлахад ~6) — хязгаартай байх нь чухал;
 * сүлжээ тайвширсны дараа нэмэлт шилжилт 0.
 */
async function expectLoginWithoutLoop(page: Page, action: () => Promise<unknown>): Promise<void> {
  let navigations = 0;
  const onNav = (frame: { parentFrame(): unknown }) => {
    if (!frame.parentFrame()) navigations++;
  };
  page.on('framenavigated', onNav);
  await action();
  await page.waitForURL('**/login', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  const settled = navigations;
  await page.waitForTimeout(3_000);
  page.off('framenavigated', onNav);
  expect(settled, 'FE-007: /login хүртэлх шилжилт хязгаартай (хуучин код: 6 сек-д 295)').toBeLessThanOrEqual(10);
  expect(navigations - settled, 'FE-007: /login ↔ нүүр хуудас давталт').toBe(0);
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(await sessionKeys(page), 'хүчингүй session localStorage-д үлдсэн').toEqual([]);
  await expect(page.locator('#identifier')).toBeVisible();
}

test.describe('QA-02 — серверт хүчингүй session (FE-007)', () => {
  test('хүчингүй токен (клиентэд хүчинтэй) → нэг удаа /login, давталтгүй, session цэвэр → дахин нэвтэрнэ', async ({ page }) => {
    await loginAs(page);

    // DB сэргээсэн / JWT нууц солигдсон: хугацаа нь хүчинтэй ч гарын үсэг буруу токен
    await page.evaluate((src) => {
      const key = Object.keys(localStorage).find((k) => new RegExp(src).test(k)) as string;
      const s = JSON.parse(localStorage.getItem(key) as string) as { access_token: string; expires_at: number };
      const [h, p] = s.access_token.split('.');
      s.access_token = `${h}.${p}.invalid-signature`;
      s.expires_at = Math.floor(Date.now() / 1000) + 3600; // supabase-js refresh хийхгүй — клиентэд «хүчинтэй»
      localStorage.setItem(key, JSON.stringify(s));
    }, SESSION_KEY.source);

    await expectLoginWithoutLoop(page, () => page.goto('/'));

    await loginAs(page);
    expect(await sessionKeys(page)).toHaveLength(1);
  });
});

test.describe.serial('QA-02 — бодит GoTrue: урилгын хэрэглэгч, global logout', () => {
  let userId = '';
  let invitePath = '';

  test('бэлтгэл (API): ажилтан → нэвтрэх эрх (имэйлгүй) → урилгын линк → нууц үг', async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin'); // SEC-009: хэрэглэгч үүсгэх, урилга — системийн админ
    const campId = (await api(page, 'POST', '/camp/camps', { code: `QA02-${STAMP}`, name: `E2E QA-02 ${STAMP}` })).id;
    const deptId = (await api(page, 'POST', `/hr/sites/${campId}/departments`, { code: 'QA', name: 'QA-02' })).id;
    const orgId = (await api(page, 'POST', '/core/organizations', { name: `QA-02 ${STAMP}`, regNumber: `Q${STAMP}`, orgType: 'MAIN' })).id;
    const empId = (
      await api(page, 'POST', `/hr/sites/${campId}/employees`, {
        organizationId: orgId, departmentId: deptId, employeeCode: `Q${STAMP}`, fullName: `Session ${STAMP}`, phone: PHONE,
      })
    ).id;
    // GoTrue admin API: имэйлгүй хэрэглэгч (`u-…@<slug>.login.invalid`) — staging-ийн «хамгийн чухал» шалгалтын CI хувилбар
    userId = (await api<{ userId: string }>(page, 'POST', `/camp/camps/${campId}/employees/${empId}/create-user`, {})).userId;
    const invite = await api<{ path: string | null }>(page, 'POST', `/core/rbac/users/${userId}/invites`, { channel: 'LINK' });
    expect(invite.path).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);
    invitePath = invite.path as string;
  });

  test('урилга → нууц үг (UI) → утсаар нэвтрэх → global logout → /login, давталтгүй', async ({ page, request }) => {
    test.slow(); // backend-ийн auth cache ≤ 60с
    expect(invitePath, 'бэлтгэл тест амжилтгүй').not.toBe('');

    await page.goto(invitePath);
    await page.locator('#new-password').fill(PASSWORD);
    await page.locator('#confirm-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(page.getByText('Нууц үг хадгалагдлаа. Одоо нэвтэрч болно.')).toBeVisible();
    await expect(page.getByText(PHONE)).toBeVisible(); // «Таны нэвтрэх нэр» = утас
    await page.getByRole('link', { name: 'Нэвтрэх' }).click();
    await page.waitForURL('**/login**', { timeout: 15_000 });

    await page.locator('#identifier').fill(PHONE);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /нэвтрэх|login/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
    const token = await accessToken(page);
    expect(token).not.toBe('');
    expect((await request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);

    // Өөр төхөөрөмжөөс «бүгдийг гаргах» — GoTrue бүх session / refresh token-ийг цуцална
    const out = await request.post(`${SUPABASE_URL}/auth/v1/logout?scope=global`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    expect(out.status(), await out.text()).toBe(204);

    // Backend: GoTrue getUser → 401 (auth cache дууссаны дараа)
    await expect
      .poll(async () => (await request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status(), {
        timeout: 90_000,
        intervals: [5_000],
      })
      .toBe(401);

    await expectLoginWithoutLoop(page, () => page.reload());
  });
});
