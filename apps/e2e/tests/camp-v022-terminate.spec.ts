import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { switchUser } from '../helpers/fixture';

/**
 * v0.2.2 Блок 5 — ажилтны профайл, ажлаас гаргах (кемпэд байгаа → явалт автоматаар), дахин ажилд авах.
 * Бэлтгэлийг `/hr`, `/core` API-аар. УРЬДЧИЛСАН НӨХЦӨЛ: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn — OWNER).
 * GoTrue ban — integration `camp-v022-terminate` (энд нэвтрэх эрхгүй ажилтан).
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `V22T-${STAMP}`;
const EMP_CODE = `T${STAMP}`;
const EMP = `Гарах ${STAMP}`;

let campId = '';
const ids: Record<string, string> = {};
const ubDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date(Date.now() + offsetDays * 86_400_000));

async function api<T = { id: string }>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ([m, p, b]) => {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const token = key ? (JSON.parse(localStorage.getItem(key) as string) as { access_token: string }).access_token : '';
      const res = await fetch(`/api/v1${p}`, {
        method: m,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${m} ${p} → ${res.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  ) as Promise<T>;
}

test.describe.serial('v0.2.2 Блок 5 — профайл, ажлаас гаргах, дахин ажилд авах', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('бэлтгэл (API): ажлын байр, хэлтэс, байгууллага, ажилтан, ирэлт (2 хоногийн өмнө)', async ({ page }) => {
    campId = (await api(page, 'POST', '/camp/camps', { code: CODE, name: `E2E v0.2.2 Б5 ${STAMP}` })).id;
    ids.dept = (await api(page, 'POST', `/hr/sites/${campId}/departments`, { code: 'ADM', name: 'Захиргаа' })).id;
    ids.org = (await api(page, 'POST', '/core/organizations', { name: `Байгууллага ${STAMP}`, regNumber: `T${STAMP}`, orgType: 'MAIN' })).id;
    ids.emp = (
      await api(page, 'POST', `/hr/sites/${campId}/employees`, { organizationId: ids.org, departmentId: ids.dept, employeeCode: EMP_CODE, fullName: EMP })
    ).id;
    await api(page, 'POST', `/hr/sites/${campId}/movements`, { employeeId: ids.emp, date: ubDate(-2), direction: 'ARRIVAL', meals: [] });
  });

  test('жагсаалт → профайл: ирц (кемпэд байна), «Хэн үзсэн»', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees`);
    await page.getByRole('link', { name: EMP }).click();
    await expect(page.getByRole('heading', { name: new RegExp(EMP_CODE) })).toBeVisible();
    await page.getByRole('tab', { name: 'Ирц' }).click();
    await expect(page.getByText(/Одоо кемпэд байна/)).toBeVisible();
    // SEC-009 (Блок 6б): «Хэн үзсэн» — зөвхөн системийн админ (Кемп админд харагдахгүй)
    await expect(page.getByRole('tab', { name: 'Хэн үзсэн' })).toHaveCount(0);
    await switchUser(page, 'devUserAdmin');
    await page.goto(`/hr/${campId}/employees/${ids.emp}`);
    await page.getByRole('tab', { name: 'Хэн үзсэн' }).click();
    await expect(page.getByRole('row').nth(1)).toBeVisible();
  });

  test('ажлаас гаргах: «Бусад» тайлбаргүй → алдаа; бөглөөд хадгалахад төлөв, явалт', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees/${ids.emp}`);
    await page.getByRole('button', { name: 'Ажлаас гаргах' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText(/явсан гэж ирцэд бүртгэнэ/)).toBeVisible();
    await dlg.getByLabel('Шалтгаан').selectOption('OTHER');
    await dlg.getByRole('button', { name: 'Ажлаас гаргах' }).click();
    await expect(dlg.getByText('«Бусад» шалтгаанд тайлбар бичнэ үү')).toBeVisible();
    await dlg.getByLabel('Тайлбар (заавал)').fill('E2E тест');
    await dlg.getByRole('button', { name: 'Ажлаас гаргах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText('Ажлаас гарсан', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Ирц' }).click();
    await expect(page.getByText('Одоо кемпэд байхгүй')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ажлаас гаргах' })).toBeHidden();
  });

  test('жагсаалт: анхдагчаар харагдахгүй, «Ажлаас гарсан» шүүлтээр харагдана', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees`);
    await expect(page.getByText('Ажилтан олдсонгүй')).toBeVisible();
    await page.getByLabel('Төлвөөр шүүх').selectOption('TERMINATED');
    const row = page.getByRole('row', { name: new RegExp(EMP) });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Засах' })).toHaveCount(0);
  });

  test('дахин ажилд авах: ижил код → шинэ профайл, өмнөх бүртгэлийн холбоос', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees/${ids.emp}`);
    await page.getByRole('button', { name: 'Дахин ажилд авах' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel('Ажилтны код')).toHaveValue(EMP_CODE);
    await dlg.getByRole('button', { name: 'Дахин ажилд авах' }).click();
    await expect(page).not.toHaveURL(new RegExp(`${ids.emp}$`));
    await expect(page.getByText('Идэвхтэй', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(`Өмнөх бүртгэл: ${EMP_CODE}`) })).toBeVisible();
  });
});
