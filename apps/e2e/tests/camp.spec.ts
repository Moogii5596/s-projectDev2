import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

/**
 * Кемп модуль — Шат 8 багц 1 (тохиргоо, мастер өгөгдөл, роль/эрх). Бодит core-kernel + Supabase + web-shell.
 * УРЬДЧИЛСАН НӨХЦӨЛ: admin@test.mn-д "Кемп админ" (бүх кемп) роль — `supabase/dev/camp_e2e_grant.sql`.
 * Тест бүр шинэ кемп (код = цагийн тамга) үүсгэнэ → дахин ажиллуулахад давхцахгүй.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `E2E-${STAMP}`;
const CAMP_NAME = `E2E кемп ${STAMP}`;

/** Өнөөдрөөс хойших хамгийн ойрын Лхагва (кемпийн анхдагч солигдох гараг) — 'YYYY-MM-DD' */
function nextWednesday(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function openCamp(page: Page) {
  // v0.2.0 FB-11: /camp нь сүүлийн кемп рүү шууд ордог → жагсаалт = /camp?list=1
  await page.goto('/camp?list=1');
  await expect(page.getByRole('heading', { name: 'Кемп', exact: true })).toBeVisible();
  if (await page.getByText('Танд кемпийн эрх олгогдоогүй').isVisible().catch(() => false)) {
    throw new Error('admin@test.mn-д кемпийн эрх алга — supabase/dev/camp_e2e_grant.sql-ийг ажиллуулна уу (README тэмдэглэл)');
  }
  await page.getByRole('link', { name: new RegExp(CAMP_NAME) }).click();
  // кемп нээгдэхэд анхдагч хэсэг = Ирц (багц 2); тохиргоо руу шилжинэ
  await page.waitForURL('**/attendance');
  await page.getByRole('link', { name: 'Тохиргоо', exact: true }).click();
  // v0.2.0 FB-05: тохиргооны каталог (зүүн цэс) — анхдагч "Ерөнхий"
  await page.waitForURL('**/settings/general');
}

/** Тохиргооны зүүн цэсний хэсэг */
async function openSetting(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Тохиргоо' }).getByRole('link', { name, exact: true }).click();
}

test.describe.serial('Кемп — тохиргоо, мастер өгөгдөл, эрх', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('кемп үүсгэх (латин бус код → backend-ийн монгол алдаа)', async ({ page }) => {
    await page.goto('/camp?list=1');
    await page.getByRole('button', { name: '+ Кемп нэмэх' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Код').fill('Кемп');
    await dlg.getByLabel('Нэр').fill(CAMP_NAME);
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg.getByRole('alert')).toContainText('латин');
    await dlg.getByLabel('Код').fill(CODE);
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('link', { name: new RegExp(CAMP_NAME) })).toBeVisible();
  });

  test('тохиргоо: хоол идэх байршил + анхдагч байршил хадгалах', async ({ page }) => {
    await openCamp(page);
    await openSetting(page, 'Хоол идэх байршил');
    await page.getByLabel('Шинэ байршлын нэр').fill('Кемпийн гал тогоо');
    await page.getByRole('button', { name: 'Нэмэх' }).click();
    await expect(page.getByRole('cell', { name: 'Кемпийн гал тогоо' })).toBeVisible();
    await page.getByLabel('Шинэ байршлын нэр').fill('Уулын хэсэг');
    await page.getByRole('button', { name: 'Нэмэх' }).click();
    await expect(page.getByRole('cell', { name: 'Уулын хэсэг' })).toBeVisible();

    await openSetting(page, 'Ерөнхий');
    await page.getByLabel('Анхдагч хоол идэх байршил').selectOption({ label: 'Кемпийн гал тогоо' });
    await page.getByLabel('Амрах хоног').fill('1');
    await page.getByRole('button', { name: 'Тохиргоо хадгалах' }).click();
    await expect(page.getByText(/rosterOffDays ≥ 2/)).toBeVisible();
    await page.getByLabel('Амрах хоног').fill('14');
    await page.getByRole('button', { name: 'Тохиргоо хадгалах' }).click();
    await expect(page.getByText('Хадгалагдлаа')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Анхдагч хоол идэх байршил')).toHaveValue(/.+/);
  });

  test('байр, өрөө', async ({ page }) => {
    await openCamp(page);
    await openSetting(page, 'Байр, өрөө');
    await page.getByLabel('Байрны код').fill('B1');
    await page.getByLabel('Байрны нэр').fill('Байр 1');
    await page.getByRole('button', { name: 'Нэмэх' }).click();
    await expect(page.getByRole('button', { name: /B1\s*Байр 1/ })).toBeVisible();
    await page.getByRole('button', { name: '+ Өрөө' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Өрөөний дугаар').fill('101');
    await dlg.getByLabel('Багтаамж').fill('2');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('cell', { name: '101', exact: true })).toBeVisible();
  });

  test('хэлтэс + ээлжийн загвар (1–7 өдөр, 8–14 шөнө)', async ({ page }) => {
    await openCamp(page);
    await openSetting(page, 'Хэлтэс, ээлж');
    await page.getByRole('button', { name: '+ Хэлтэс' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Код').fill('MINE');
    await dlg.getByLabel('Нэр').fill('Уулын хэсэг');
    // v0.2.1 (Q1, Д-4): хэлтэст хоолны байршил байхгүй — ажилтан / албан тушаал дээр
    await expect(dlg.getByLabel('Хоол идэх байршил')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();

    await page.getByRole('row', { name: /MINE/ }).getByRole('button', { name: 'Ээлж' }).click();
    await page.getByRole('button', { name: '1-р өдөр: хоосон', exact: true }).click();
    await expect(page.getByText(/Дутуу өдөр: 2–14/)).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    await page.getByRole('button', { name: '1–7 өдөр, 8–14 шөнө' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Хадгалах' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByLabel('1–7 Өдөр, 8–14 Шөнө')).toBeVisible();
  });

  test('ростер (FB-06): солигдох гарагаас өөр өдөр → хадгалах боломжгүй', async ({ page }) => {
    await openCamp(page);
    await openSetting(page, 'Ростер');
    await page.getByRole('button', { name: '+ Ростер бүртгэх' }).click();
    const dlg = page.getByRole('dialog');
    const wed = nextWednesday();
    await dlg.getByLabel('Код').fill('A');
    await dlg.getByLabel('Ирэх өдөр').fill(addDaysIso(wed, 1));
    await expect(dlg.getByText(/кемпийн солигдох гараг Лхагва/)).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    await dlg.getByLabel('Ирэх өдөр').fill(wed);
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('cell', { name: new RegExp(wed) })).toBeVisible();
  });

  test('эрхийн матриц: V2 эрх (зардлын тайлан, хоолны захиалга) харагдахгүй; хэрэглэгчийн роль', async ({ page }) => {
    await page.goto('/camp/admin/roles');
    await expect(page.getByRole('heading', { name: 'Роль ба эрх' })).toBeVisible();
    await expect(page.getByText('Кемпийн тохиргоо (НӨАТ, ростер, хоол идэх байршил)')).toBeVisible();
    await expect(page.getByText('Зардлын тайлан харах')).toHaveCount(0);
    await expect(page.getByText('Хоолны захиалга өгөх')).toHaveCount(0);

    await page.goto('/camp/admin/user-roles');
    await page.getByLabel('Хэрэглэгч хайх').fill('admin@test.mn');
    await expect(page.getByText('Кемп админ · Бүх кемп')).toBeVisible();
  });
});
