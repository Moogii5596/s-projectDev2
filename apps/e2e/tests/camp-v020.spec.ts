import { test, expect, type Page } from '@playwright/test';
import { api } from '../helpers/api';
import { loginAs } from '../helpers/auth.helper';
import { loginAsUser } from '../helpers/fixture';

/**
 * v0.2.0 — Кемп: хурдан UX (FB-03/05/06/11/12/14), бөөнөөр оруулах (FB-02/07/08), олон хэл (mn/en/zh) ба орчуулгын засвар.
 * УРЬДЧИЛСАН НӨХЦӨЛ: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ). Орчуулга: fixture devAdmin (ADMIN).
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `V2-${STAMP}`;
const CAMP_NAME = `E2E v0.2 ${STAMP}`;
const ec = (n: number) => `${STAMP}-W${n}`;
const DAY = 86_400_000;
const todayUb = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const TODAY = todayUb();
const WED = addDays(TODAY, -((new Date(`${TODAY}T00:00:00Z`).getUTCDay() - 3 + 7) % 7));

let campId = '';


const settings = async (page: Page, section: string) => {
  await page.goto(`/camp/${campId}/settings/${section}`);
};

test.describe.serial('Кемп v0.2.0', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('бэлтгэл (API): кемп, байршил, тохиргоо, хэлтэс, байгууллага, ростер', async ({ page }) => {
    campId = (await api(page, 'POST', '/camp/camps', { code: CODE, name: CAMP_NAME })).id;
    const loc = (await api(page, 'POST', `/camp/camps/${campId}/meal-locations`, { name: 'Гал тогоо' })).id;
    await api(page, 'PUT', `/camp/camps/${campId}/settings`, { vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: loc });
    await api(page, 'POST', `/hr/sites/${campId}/departments`, { code: 'ADM', name: 'Захиргаа', mealLocationId: loc });
    await api(page, 'POST', '/core/organizations', { name: `Уурхай ${STAMP}`, regNumber: `R${STAMP}`, orgType: 'MAIN' });
    await api(page, 'POST', `/hr/sites/${campId}/crews`, { code: 'A', rosterAnchorDate: WED });
  });

  test('FB-07: байр + 24 өрөө нэг дор → "+ Олон өрөө" (байгааг алгасна)', async ({ page }) => {
    await settings(page, 'facilities');
    await page.getByLabel('Байрны код').fill('B7');
    await page.getByLabel('Байрны нэр').fill('Блок 7');
    await page.getByText('Өрөөнүүдийг нэг дор үүсгэх').click();
    await page.getByLabel('Эхлэх №').fill('1');
    await page.getByLabel('Дуусах №').fill('24');
    await page.getByLabel('Угтвар').fill('7-');
    await expect(page.getByText('Урьдчилж харах: 7-01 … 7-24 · 24 шинэ, 0 алгасна')).toBeVisible();
    await page.getByRole('button', { name: 'Нэмэх', exact: true }).click();
    await expect(page.getByRole('button', { name: /B7\s*Блок 7.*24 өрөө · 48 ор/ })).toBeVisible();

    await page.getByRole('button', { name: '+ Олон өрөө' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Эхлэх №').fill('20');
    await dlg.getByLabel('Дуусах №').fill('30');
    await dlg.getByLabel('Угтвар').fill('7-');
    await expect(dlg.getByText(/6 шинэ, 5 алгасна/)).toBeVisible();
    await dlg.getByRole('button', { name: '6 өрөө үүсгэх' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: /B7\s*Блок 7.*30 өрөө · 60 ор/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '7-30', exact: true })).toBeVisible();
  });

  test('FB-08: ажилтан хүснэгтээр 3 мөр (1 алдаатай) → алдааг алгасаж 2 оруулна', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees`);
    await page.getByRole('button', { name: 'Excel / хүснэгтээр оруулах' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('tab', { name: 'Хүснэгтээр оруулах' }).click();
    const rows: [string, string, string, string, string][] = [
      [ec(1), 'Бат', 'Тогооч', 'ADM', 'A'],
      [ec(2), 'Дорж', 'Тогооч', 'ADM', 'A'],
      [ec(3), 'Сараа', 'Жолооч', 'NOPE', ''],
    ];
    for (const [i, [code, name, pos, dept, crew]] of rows.entries()) {
      await dlg.getByLabel(`Ажилтны код ${i + 1}`).fill(code);
      await dlg.getByLabel(`Нэр ${i + 1}`, { exact: true }).fill(name);
      await dlg.getByLabel(`Албан тушаал ${i + 1}`).fill(pos);
      await dlg.getByLabel(`Байгууллага (регистр эсвэл нэр) ${i + 1}`).fill(`R${STAMP}`);
      await dlg.getByLabel(`Хэлтсийн код ${i + 1}`).fill(dept);
      await dlg.getByLabel(`Ростерын код ${i + 1}`).fill(crew);
    }
    await dlg.getByRole('button', { name: 'Шалгах' }).click();
    await expect(dlg.getByText('2 шинэ')).toBeVisible();
    await expect(dlg.getByText('1 алдаатай')).toBeVisible();
    await expect(dlg.getByRole('alert')).toContainText('"NOPE" олдсонгүй');
    await dlg.getByRole('button', { name: 'Баталгаажуулах (2 мөр)' }).click();
    await expect(dlg.getByRole('status')).toContainText('2 шинэ, 0 шинэчилсэн, 1 алгассан');
    await dlg.getByRole('button', { name: 'Хаах' }).last().click();
    await expect(page.getByRole('cell', { name: ec(1), exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: ec(3), exact: true })).toHaveCount(0);
  });

  test('FB-02 + FB-03: хэлтэс хүснэгтээр; идэвхтэй ажилтан/албан тушаалын тоо, албан тушаалаар бүлэглэсэн жагсаалт', async ({ page }) => {
    await settings(page, 'departments');
    await page.getByRole('button', { name: 'Excel / хүснэгтээр оруулах' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('tab', { name: 'Хүснэгтээр оруулах' }).click();
    await dlg.getByLabel('Хэлтсийн код 1').fill('KITCHEN');
    await dlg.getByLabel('Нэр 1').fill('Гал тогоо');
    // v0.2.1 (Д-4): хэлтсийн хүснэгтэд хоолны байршлын багана байхгүй
    await expect(dlg.getByLabel('Хоол идэх байршил 1')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Шалгах' }).click();
    await dlg.getByRole('button', { name: 'Баталгаажуулах (1 мөр)' }).click();
    await dlg.getByRole('button', { name: 'Хаах' }).last().click();
    const adm = page.getByRole('row', { name: /ADM/ });
    await expect(adm.getByRole('cell').nth(2)).toHaveText('2'); // идэвхтэй ажилтан
    await expect(adm.getByRole('cell').nth(3)).toHaveText('1'); // албан тушаал (Тогооч)
    await expect(page.getByRole('row', { name: /KITCHEN/ })).toBeVisible();
    await adm.getByRole('button', { name: 'Захиргаа' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Тогооч\s*\(2\)/ })).toBeVisible();
  });

  test('FB-14: олон хүний ирц (ростер A, ирэлт) → урьдчилсан → батлах; шүүлт', async ({ page }) => {
    await page.goto(`/hr/${campId}/attendance`);
    await page.getByRole('button', { name: '+ Олон хүний ирц' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Огноо').fill(WED);
    await dlg.getByLabel('Ростероор шүүх').selectOption({ label: 'A' });
    await expect(dlg.getByRole('row')).toHaveCount(3); // толгой + 2
    await dlg.getByLabel('Бүгдийг сонгох').check();
    await dlg.getByRole('button', { name: 'Шалгах (2)' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText('Ирэх 2')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Батлах', exact: true }).click();
    await expect(page.getByText(/Баталгаажлаа: 2 бүртгэл/)).toBeVisible();
    await page.getByLabel('Эхлэх').fill(addDays(WED, -1));
    await page.getByLabel('Албан тушаал', { exact: true }).fill('тогооч');
    await expect(page.getByRole('row', { name: new RegExp(ec(1)) })).toBeVisible();
    await page.getByLabel('Ростероор шүүх').selectOption({ label: 'Ростергүй' });
    await expect(page.getByText('Энэ хугацаанд ирц бүртгэгдээгүй')).toBeVisible();
  });

  test('FB-12: өрөөний самбарын шүүлт; FB-05/11: хуучин хаяг redirect, сүүлийн кемп', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/camp/${campId}/rooms`);
    const accessibleCamps = await api<{ id: string; isActive: boolean }[]>(page, 'GET', '/camp/camps');
    expect(accessibleCamps).toContainEqual(expect.objectContaining({ id: campId, isActive: true }));
    await expect.poll(
      () => page.evaluate((id) => Object.entries(localStorage).some(([key, value]) => key.startsWith('s-project.camp.last.') && value === id), campId),
      { timeout: 15_000 },
    ).toBe(true);
    await page.getByRole('button', { name: /^Сул · \d+/ }).click();
    await expect(page.getByLabel('Өрөө 7-01')).toBeVisible();
    await page.getByRole('button', { name: /^Хэтэрсэн · 0/ }).click();
    await expect(page.getByText('Шүүлтэд тохирох өрөө алга')).toBeVisible();

    await page.goto(`/camp/${campId}/facilities`);
    await page.waitForURL(`**/camp/${campId}/settings/facilities`);
    // v0.2.2 H2: хуучин хэлтэс/ростер/ажилтан/ирц/ээлжийн хаяг → «Хүний нөөц»
    await page.goto(`/camp/${campId}/crews`);
    await page.waitForURL(`**/hr/${campId}/crews`);
    await expect(page.getByRole('button', { name: '+ Ростер бүртгэх' })).toBeVisible();
    await page.goto(`/camp/${campId}/settings/departments`);
    await page.waitForURL(`**/hr/${campId}/departments`);
    await page.goto(`/camp/${campId}/employees`);
    await page.waitForURL(`**/hr/${campId}/employees`);
    await page.goto(`/camp/${campId}/attendance?x=1`);
    await page.waitForURL(`**/hr/${campId}/attendance?x=1`);
    await page.goto(`/camp/${campId}/shifts`);
    await page.waitForURL(`**/hr/${campId}/shifts`);
    await page.goto('/camp/system/positions');
    await page.waitForURL('**/hr/*/positions');
    await page.goto('/camp/admin/organizations');
    await expect(page.getByText('S Project', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/settings\/organizations$/, { timeout: 20_000 }); // v0.2.3 Блок 3: Системийн тохиргоо
    await page.goto('/camp');
    await expect(page.getByText('S Project', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/camp/${campId}/rooms$`), { timeout: 20_000 });
  });

  test.afterAll(async ({ browser }) => {
    // Хэл тест унасан ч admin@test.mn-ийн профайлын хэлийг МН болгоно (бусад тест монгол шошгоор хайдаг)
    const p = await browser.newPage();
    await loginAs(p);
    await api(p, 'PATCH', '/api/v1/i18n/me/locale', { locale: 'mn' }).catch(() => undefined);
    await p.close();
  });

  // TEST-026/027: профайлын хэл өөрчилдөг тул ТУСДАА fixture devLangAdmin (ижил DEV tenant, ADMIN) — зэрэг ажиллаж буй
  // бусад тест (admin@test.mn, devAdmin — modules-lite, монгол шошго) EN / 中文 UI-тай нээгдэхгүй
  test('олон хэл: EN → 中文 (цэс, хуудас, backend алдаа), профайлд хадгалагдана; буцааж МН', async ({ browser }) => {
    const own = await browser.newContext();
    const page = await own.newPage();
    await loginAsUser(page, 'devLangAdmin');
    await page.goto(`/hr/${campId}/employees`);
    await page.getByRole('group', { name: 'Хэл' }).getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('button', { name: 'Camp', exact: true })).toBeVisible({ timeout: 15_000 });
    // v0.2.2 H2: ирц «Хүний нөөц»-д
    await expect(page.getByRole('navigation', { name: 'HR sections' }).getByRole('link', { name: 'Attendance' })).toBeVisible({ timeout: 15_000 });
    // backend алдаа хэрэглэгчийн хэлээр (Accept-Language)
    await page.getByRole('button', { name: 'Import (Excel / table)' }).click();
    await page.getByRole('dialog').getByRole('tab', { name: 'Enter as table' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('There are no data rows');
    await page.keyboard.press('Escape');

    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('button', { name: '营地', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: '员工', exact: true })).toBeVisible({ timeout: 15_000 });

    // Шинэ төхөөрөмж (цэвэр контекст) — профайлын хэл
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await loginAsUser(other, 'devLangAdmin');
    await other.goto('/camp?list=1');
    await expect(other.getByRole('button', { name: '营地', exact: true })).toBeVisible({ timeout: 15_000 });
    await ctx.close();

    await page.getByRole('group', { name: '语言' }).getByRole('button', { name: 'МН' }).click();
    await expect(page.getByRole('button', { name: 'Кемп', exact: true })).toBeVisible({ timeout: 15_000 });
    // профайл ч МН руу буцсан эсэх
    const me = await api<{ locale: string }>(page, 'GET', '/api/v1/auth/me', undefined);
    expect(me.locale).toBe('mn');
    await own.close();
  });
});

test.describe.serial('Орчуулгын засвар (OWNER/ADMIN)', () => {
  test('CSV оруулах → урьдчилсан (хуучин → шинэ) → баталгаажуулах → UI шинэчлэгдэнэ → анхдагч руу буцаах', async ({ page }) => {
    await loginAsUser(page, 'devAdmin');
    await page.goto('/settings/translations');
    await expect(page.getByRole('heading', { name: 'Орчуулга' })).toBeVisible({ timeout: 15_000 });
    const csv = `\uFEFFkey;mn;en\r\nnav.camp;Кемп ${STAMP};\r\n`;
    await page.getByLabel('Excel/CSV оруулах').setInputFiles({ name: 'tr.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await expect(page.getByText('Өөрчлөлт 1 · алдаа 0')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`nav\\.camp.*Кемп.*Кемп ${STAMP}`) })).toBeVisible();
    await page.getByRole('button', { name: 'Баталгаажуулах (1)' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: `Кемп ${STAMP}` })).toBeVisible();
    await expect(page.getByRole('row', { name: /IMPORT|nav\.camp/ }).first()).toBeVisible();
    await page.getByRole('row', { name: new RegExp(`nav\\.camp.*Кемп ${STAMP}`) }).getByRole('button', { name: 'Анхдагч руу буцаах' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Кемп', exact: true })).toBeVisible();
  });
});
