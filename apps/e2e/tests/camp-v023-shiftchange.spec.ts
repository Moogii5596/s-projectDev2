import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { loginAs } from '../helpers/auth.helper';

/**
 * v0.2.3 Блок R4 — HR ShiftChange файл: PREVIEW (загвар, алгассан хуудас, ростерын зөрүү) → алдаатай мөрийг хүснэгтээр
 * засах (ажилтан сонгох) → батлах; «Алдаатай бүх мөрийг устгах».
 * УРЬДЧИЛСАН НӨХЦӨЛ: camp-ops-тэй ижил (`supabase/dev/camp_e2e_grant.sql`). Мастер өгөгдлийг API-аар бэлдэнэ (шинэ кемп).
 */
const STAMP = Date.now().toString(36).toUpperCase();
const ec = (n: number) => `${STAMP}-S${n}`;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
const addDays = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
/** Өнөөдөр эсвэл түүнээс өмнөх хамгийн ойрын Лхагва — А багийн ирэх өдөр (ростерын 0-р өдөр) */
const WED = (() => {
  const dow = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
  return addDays(TODAY, -((dow - 3 + 7) % 7));
})();
const SHEET = `${WED.replace(/-/g, '.')} A ирэх`;

let campId = '';

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

/** ShiftChange: хуудасны нэрэнд огноо + төрөл, 1-р мөр гарчиг, 2-р мөр толгой */
async function shiftChange(sheets: { name: string; rows: (string | number)[][] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(['Ирэх ажилчдын жагсаалт']);
    ws.addRow(['Д/д', 'Shift', 'ID', 'Ажилтны овог', 'Ажилтны нэр', 'Албан тушаал', 'Хэлтэс']);
    s.rows.forEach((r) => ws.addRow(r));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function openAttendance(page: Page) {
  await page.goto(`/hr/${campId}`);
  await page.waitForURL('**/employees');
  await page.getByRole('navigation', { name: 'Хүний нөөцийн хэсгүүд' }).getByRole('link', { name: 'Ирц', exact: true }).click();
}

const upload = (page: Page, buffer: Buffer) =>
  page.getByLabel('Ирцийн xlsx файл').setInputFiles({ name: 'ShiftChange.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });

test.describe.serial('v0.2.3 R4 — HR ShiftChange импорт', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('бэлтгэл (API): кемп, хэлтэс, А баг, 3 ажилтан (овог / нэртэй)', async ({ page }) => {
    campId = (await api(page, 'POST', '/camps', { code: `SC-${STAMP}`, name: `E2E ShiftChange ${STAMP}` })).id;
    const kitchen = (await api(page, 'POST', `/camps/${campId}/meal-locations`, { name: 'Гал тогоо' })).id;
    await api(page, 'PUT', `/camps/${campId}/settings`, {
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: kitchen,
    });
    const dept = (await api(page, 'POST', `/camps/${campId}/departments`, { code: 'MINE', name: 'Уул', shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] })).id;
    const crewA = (await api(page, 'POST', `/camps/${campId}/crews`, { code: 'A', rosterAnchorDate: WED })).id;
    const org = (await api(page, 'POST', '/organizations', { name: `Уурхай SC ${STAMP}`, orgType: 'MAIN' })).id;
    for (const [n, lastName, firstName] of [[1, 'Бат', 'Дорж'], [2, 'Болд', 'Сүх'], [3, 'Сараа', 'Ням']] as const) {
      await api(page, 'POST', `/camps/${campId}/employees`, { organizationId: org, departmentId: dept, crewId: crewA, employeeCode: ec(n), lastName, firstName });
    }
  });

  test('PREVIEW → алдаатай мөрийг хүснэгтээр засах (ажилтан сонгох) → батлах', async ({ page }) => {
    await openAttendance(page);
    await upload(
      page,
      await shiftChange([
        { name: SHEET, rows: [[1, 'A', 'NEW', 'Бат', 'Дорж', 'Уурхайчин', 'Уул'], [2, 'A', 'NEW', 'Үл', 'Мэдэгдэх', 'Уурхайчин', 'Уул']] },
        { name: `ЗОХИЦУУЛАЛТ ${WED.replace(/-/g, '.')}`, rows: [[1, 'A', 'NEW', 'Бат', 'Дорж', '', '']] },
      ]),
    );
    await expect(page.getByText('HR ShiftChange')).toBeVisible();
    await expect(page.getByText('Алдаатай 1')).toBeVisible();
    await expect(page.getByText('Алгассан хуудас: 1')).toBeVisible();
    // Болд Сүх, Сараа Ням — ростероор ирэх ёстой боловч файлд алга (импортыг зогсоохгүй)
    await expect(page.getByText(/файлд алга: ирэх 2, явах 0/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Батлах' })).toBeDisabled();
    await expect(page.getByRole('cell', { name: `${SHEET} · 4` })).toBeVisible();

    await page.getByRole('button', { name: 'Алдаатай мөрийг засах' }).click();
    const edit = page.getByTestId('import-edit-rows');
    const search = edit.getByLabel(`${SHEET} · 4 мөрийн ажилтан`);
    await expect(search).toHaveValue('Мэдэгдэх');
    await search.fill('Ням');
    await edit.getByRole('radio', { name: new RegExp(ec(3)) }).check();
    await edit.getByRole('button', { name: 'Хадгалах (1)' }).click();

    await expect(page.getByText('Алдаагүй')).toBeVisible();
    await expect(page.getByText(/файлд алга: ирэх 1, явах 0/)).toBeVisible(); // Сараа одоо жагсаалтад
    await page.getByRole('radio', { name: /Бүгд/ }).click();
    await expect(page.getByText(`Файлд: —`)).toBeVisible(); // гараар сольсон мөр
    await page.getByRole('button', { name: 'Батлах' }).click();
    await expect(page.getByText(/Баталгаажлаа: 2 бүртгэл/)).toBeVisible();
  });

  test('«Алдаатай бүх мөрийг устгах» → устгасан мөр, сэргээх; цуцлах', async ({ page }) => {
    await openAttendance(page);
    await upload(page, await shiftChange([{ name: SHEET, rows: [[1, 'A', 'NEW', 'Бат', 'Дорж', '', ''], [2, 'A', 'NEW', 'Хэн', 'Ч', '', ''], [3, 'A', 'NEW', 'Болд', 'Сүх', '', '']] }]));
    // Бат Дорж аль хэдийн ирсэн, «Хэн Ч» бүртгэлгүй → 2 алдаа; Болд Сүх зөв
    await expect(page.getByText('Алдаатай 2')).toBeVisible();
    await page.getByRole('button', { name: 'Алдаатай бүх мөрийг устгах' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Тийм, устгах' }).click();
    await expect(page.getByText('Устгасан 2')).toBeVisible();
    await expect(page.getByText('Алдаагүй')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Батлах' })).toBeEnabled();

    await page.getByRole('radio', { name: /Бүгд/ }).click();
    await page.getByRole('button', { name: 'Сэргээх' }).first().click();
    await expect(page.getByText('Устгасан 1')).toBeVisible();
    await expect(page.getByText('Алдаатай 1')).toBeVisible();
    await page.getByRole('button', { name: 'Цуцлах' }).first().click();
    await expect(page.getByText('Устгасан 1')).toBeHidden();
  });
});
