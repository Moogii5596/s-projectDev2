import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

/**
 * Кемп модуль — Шат 8 багц 3 (хөрөнгө, засвар + сэлбэг, зардал). Бодит core-kernel + Supabase + web-shell.
 * УРЬДЧИЛСАН НӨХЦӨЛ: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ: asset.manage, maintenance.create).
 *   Кемп админд maintenance.parts / maintenance.close анхдагчаар БАЙХГҮЙ тул бэлтгэлд тусдаа роль үүсгэж ононо.
 * Кемп, өрөө, катеринг байгууллагыг API-аар бэлдэнэ — багц 1–2-оос хамааралгүй.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `AST-${STAMP}`;
const CAMP_NAME = `E2E хөрөнгө ${STAMP}`;
const CATEGORY = `Тавилга ${STAMP}`;
const INV = `INV-${STAMP}`;
const YEAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date()).slice(0, 4);

let campId = '';

/** Нэвтэрсэн хуудсын Supabase token-оор API дуудна (vite proxy → core-kernel) */
async function api<T = { id: string }>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ([m, p, b]) => {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const token = key ? (JSON.parse(localStorage.getItem(key) as string) as { access_token: string }).access_token : '';
      const res = await fetch(`/api/v1/camp${p}`, {
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

async function openSection(page: Page, section: string) {
  await page.goto(`/camp/${campId}`);
  await page.waitForURL('**/attendance');
  await page.getByRole('navigation', { name: 'Кемпийн хэсгүүд' }).getByRole('link', { name: section, exact: true }).click();
}

async function openAsset(page: Page) {
  await openSection(page, 'Хөрөнгө');
  await page.getByLabel('Хөрөнгө хайх').fill(INV);
  await page.getByRole('row', { name: new RegExp(INV) }).getByRole('button', { name: 'Дэлгэрэнгүй' }).click();
  return page.getByRole('dialog');
}

test.describe.serial('Кемп — хөрөнгө ба засвар', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('бэлтгэл (API): кемп, өрөө, катеринг байгууллага, засварын эрх', async ({ page }) => {
    campId = (await api(page, 'POST', '/camps', { code: CODE, name: CAMP_NAME })).id;
    const b = (await api(page, 'POST', `/camps/${campId}/buildings`, { code: 'B1', name: 'Байр 1' })).id;
    await api(page, 'POST', `/camps/${campId}/rooms`, { buildingId: b, roomNo: '101', capacity: 2 });
    await api(page, 'POST', `/camps/${campId}/rooms`, { buildingId: b, roomNo: '102', capacity: 1 });
    const catering = (await api(page, 'POST', '/organizations', { name: `Катеринг ${STAMP}`, orgType: 'CONTRACTOR', serviceTypes: ['CATERING'] })).id;
    await api(page, 'PUT', `/camps/${campId}/settings`, {
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: null, cateringOrganizationId: catering,
    });
    // admin@test.mn-д энэ кемпэд сэлбэг/хаах эрх (Кемп админ ролийнд байхгүй)
    const me = await api<{ userId: string }>(page, 'GET', '/me/permissions');
    const role = (await api(page, 'POST', '/roles', { name: `E2E засвар ${STAMP}`, permissionCodes: ['camp.maintenance.parts', 'camp.maintenance.close'] })).id;
    await api(page, 'POST', '/user-roles', { userId: me.userId, roleId: role, campId });
  });

  test('хөрөнгийн ангилал нэмэх (давхар нэр → алдаа)', async ({ page }) => {
    await page.goto('/camp/admin/asset-categories');
    await page.getByLabel('Шинэ ангиллын нэр').fill(CATEGORY);
    await page.getByRole('button', { name: 'Нэмэх' }).click();
    await expect(page.getByRole('cell', { name: CATEGORY, exact: true })).toBeVisible();
    await page.getByLabel('Шинэ ангиллын нэр').fill(CATEGORY.toLowerCase());
    await page.getByRole('button', { name: 'Нэмэх' }).click();
    await expect(page.getByRole('alert')).toContainText('аль хэдийн');
  });

  test('хөрөнгө бүртгэх (өрөө 101) → шилжүүлэх (102) → түүх', async ({ page }) => {
    await openSection(page, 'Хөрөнгө');
    await page.getByRole('button', { name: '+ Хөрөнгө' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Инвентарийн дугаар').fill(INV);
    await dlg.getByLabel('Нэр', { exact: true }).fill('Хөргөгч');
    await dlg.getByLabel('Ангилал').selectOption({ label: CATEGORY });
    await dlg.getByLabel('Байршил').selectOption({ label: 'B1-101' });
    await dlg.getByLabel('Үнэ (₮)').fill('450000.5');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    const row = page.getByRole('row', { name: new RegExp(INV) });
    await expect(row).toContainText('B1-101');
    await expect(row).toContainText('450 000.50 ₮');

    await row.getByRole('button', { name: 'Дэлгэрэнгүй' }).click();
    const det = page.getByRole('dialog');
    await det.getByRole('button', { name: 'Шилжүүлэх' }).click();
    await det.getByLabel('Шинэ байршил').selectOption({ label: 'B1-102' });
    await det.getByLabel('Шалтгаан').fill('Солив');
    await det.getByRole('button', { name: 'Шилжүүлэх' }).click();
    await expect(det.getByRole('row', { name: /101 102 Солив/ })).toBeVisible();
    await expect(det.getByRole('row', { name: /Агуулах 101/ })).toBeVisible();
  });

  test('хөрөнгөөс засварын хүсэлт (өрөө түгжинэ) → дугаар ZAS-{код}-{он}-0001; өрөө "Засварт"', async ({ page }) => {
    const det = await openAsset(page);
    await det.getByRole('button', { name: 'Засварын хүсэлт' }).click();
    await page.waitForURL('**/maintenance**');
    const dlg = page.getByRole('dialog', { name: 'Засварын хүсэлт' });
    await expect(dlg).toContainText(INV);
    await dlg.getByLabel('Гарчиг').fill('Хөргөгч ажиллахгүй');
    await dlg.getByLabel('Зэрэглэл').selectOption('HIGH');
    await dlg.getByLabel(/Өрөөг засварт оруулах/).check();
    await dlg.getByRole('button', { name: 'Үүсгэх' }).click();
    await page.waitForURL(/\/maintenance\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: new RegExp(`ZAS-${CODE}-${YEAR}-0001`) })).toBeVisible();
    await expect(page.getByText(/Өрөөг түгжинэ \(засварт\)/)).toBeVisible();

    // v0.2.0 FB-05: "Байр, өрөө" → Тохиргоо › Байр, өрөө
    await openSection(page, 'Тохиргоо');
    await page.getByRole('navigation', { name: 'Тохиргоо' }).getByRole('link', { name: 'Байр, өрөө' }).click();
    await expect(page.getByRole('row', { name: /102/ }).getByRole('link', { name: /Засварт/ })).toBeVisible();
  });

  test('засвар: эхлүүлэх → сэлбэг (катерингийн үнэ заавал) → дуусгах (өрөө суллагдана) → хаах (зардал)', async ({ page }) => {
    await openSection(page, 'Засвар');
    await page.getByRole('link', { name: `ZAS-${CODE}-${YEAR}-0001` }).click();
    await page.getByRole('button', { name: 'Эхлүүлэх' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Эхлүүлэх' }).click();
    await expect(page.getByRole('list', { name: 'Төлвийн дараалал' }).locator('[aria-current="step"]')).toHaveText('Хийгдэж буй');

    await page.getByRole('button', { name: '+ Сэлбэг' }).click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Сэлбэгийн нэр').fill('Компрессор');
    await dlg.getByLabel('Тоо хэмжээ').fill('2');
    await expect(dlg.getByRole('button', { name: 'Хадгалах' })).toBeDisabled(); // катерингийн, үнэгүй
    await dlg.getByLabel('Нэгж үнэ (₮)').fill('11000');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();

    await page.getByRole('button', { name: '+ Сэлбэг' }).click();
    dlg = page.getByRole('dialog');
    await dlg.getByLabel('Сэлбэгийн нэр').fill('Хоолой');
    await dlg.getByLabel('Эх сурвалж').selectOption('MINE_SUPPLIED');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText('22 000.00 ₮').first()).toBeVisible(); // нийт (НӨАТ орсон)

    await page.getByRole('button', { name: 'Дуусгах' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Дуусгах' }).click();
    await expect(page.getByRole('status')).toContainText('Өрөө засвараас гарч идэвхжлээ');

    // цонхны "×" товч ч "Хаах" нэртэй (TEST-008) → бүтэн нэрээр
    await page.getByRole('button', { name: 'Хаах (зардал бүртгэх)' }).click();
    dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('Катерингийн 1 сэлбэгийн зардал (нийт 22 000.00 ₮)');
    await dlg.getByRole('button', { name: 'Хаах (зардал бүртгэх)' }).click();
    await expect(page.getByRole('status')).toContainText('Хаагдлаа: 1 сэлбэгийн зардал бүртгэгдлээ');
    await expect(page.getByRole('button', { name: '+ Сэлбэг' })).toHaveCount(0);
    await expect(page.getByText('Бүртгэгдсэн зардал (катерингийн сэлбэг)')).toBeVisible();
  });

  test('засвар цуцлах (шалтгаан заавал)', async ({ page }) => {
    await openSection(page, 'Засвар');
    await page.getByRole('button', { name: '+ Засварын хүсэлт' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Өрөө', { exact: true }).selectOption({ label: 'B1-101' });
    await dlg.getByLabel('Гарчиг').fill('Цонх');
    await dlg.getByRole('button', { name: 'Үүсгэх' }).click();
    await page.waitForURL(/\/maintenance\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Цуцлах' }).click();
    const c = page.getByRole('dialog');
    await expect(c.getByRole('button', { name: 'Цуцлах' })).toBeDisabled();
    await c.getByLabel('Цуцлах шалтгаан').fill('Давхар бүртгэл');
    await c.getByRole('button', { name: 'Цуцлах' }).click();
    await expect(page.getByText('Давхар бүртгэл')).toBeVisible();
    await expect(page.getByText('Цуцлагдсан').first()).toBeVisible();
  });

  test('актлах → түгжигдэнэ', async ({ page }) => {
    const det = await openAsset(page);
    await det.getByRole('button', { name: 'Актлах' }).click();
    await expect(det.getByRole('button', { name: 'Актлах' })).toBeDisabled();
    await det.getByLabel('Актлах шалтгаан').fill('Засварлах боломжгүй');
    await det.getByRole('button', { name: 'Актлах' }).click();
    await expect(det.getByText('Актлагдсан хөрөнгө — өөрчлөх')).toBeVisible();
    await expect(det.getByRole('button', { name: 'Шилжүүлэх' })).toHaveCount(0);
    await expect(det.getByRole('row', { name: /102 Агуулах Актлав: Засварлах боломжгүй/ })).toBeVisible();
  });
});
