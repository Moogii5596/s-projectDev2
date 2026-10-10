import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { loginAs } from '../helpers/auth.helper';

/**
 * Кемп модуль — Шат 8 багц 2 (ажилтан, ирцийн xlsx импорт, ээлж, өрөөний самбар, хоолны суурь тоо).
 * Бодит core-kernel + Supabase + web-shell. УРЬДЧИЛСАН НӨХЦӨЛ: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ).
 * Мастер өгөгдлийг (кемп, байршил, хэлтэс + загвар, баг, ажилтан, өрөө) API-аар бэлдэнэ — багц 1-ээс хамааралгүй.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `OPS-${STAMP}`;
const CAMP_NAME = `E2E ажиллагаа ${STAMP}`;
const ec = (n: number) => `${STAMP}-E${n}`; // ажилтны код tenant дотор давхардахгүй

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const todayUb = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
const TODAY = todayUb();
const addDays = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
/** Өнөөдөр эсвэл түүнээс өмнөх хамгийн ойрын Лхагва — А багийн ирсэн өдөр (ростерын 0-р өдөр) */
const WED = (() => {
  const dow = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
  return addDays(TODAY, -((dow - 3 + 7) % 7));
})();

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

async function xlsx(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ирц');
  ws.addRow(['employee_code', 'date', 'direction', 'meals', 'shift']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Өрөөний select-ээс "B1-101 (0/2)" хэлбэрийн сонголтыг дугаараар нь сонгоно (тоо өөрчлөгддөг) */
async function selectRoom(dialog: ReturnType<Page['getByRole']>, roomNo: string) {
  const select = dialog.getByLabel('Өрөө', { exact: true });
  const value = await select.locator('option', { hasText: `B1-${roomNo} ` }).getAttribute('value');
  await select.selectOption(value as string);
}

async function openSection(page: Page, section: string) {
  await page.goto(`/camp/${campId}`);
  await page.waitForURL('**/attendance');
  await page.getByRole('navigation', { name: 'Кемпийн хэсгүүд' }).getByRole('link', { name: section, exact: true }).click();
}

test.describe.serial('Кемп — өдөр тутмын ажиллагаа', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('бэлтгэл (API): кемп, байршил, хэлтэс + загвар, баг, ажилтан, өрөө', async ({ page }) => {
    campId = (await api(page, 'POST', '/camps', { code: CODE, name: CAMP_NAME })).id;
    const kitchen = (await api(page, 'POST', `/camps/${campId}/meal-locations`, { name: 'Кемпийн гал тогоо' })).id;
    const pit = (await api(page, 'POST', `/camps/${campId}/meal-locations`, { name: 'Уулын хэсэг' })).id;
    await api(page, 'PUT', `/camps/${campId}/settings`, {
      vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: kitchen,
    });
    const mine = (await api(page, 'POST', `/camps/${campId}/departments`, {
      code: 'MINE', name: 'Уул', mealLocationId: pit,
      shiftPattern: [{ dayFrom: 1, dayTo: 7, shift: 'DAY' }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' }],
    })).id;
    const adm = (await api(page, 'POST', `/camps/${campId}/departments`, {
      code: 'ADM', name: 'Захиргаа', mealLocationId: kitchen, shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }],
    })).id;
    const crewA = (await api(page, 'POST', `/camps/${campId}/crews`, { code: 'A', rosterAnchorDate: WED })).id;
    const org = (await api(page, 'POST', '/organizations', { name: `Уурхай ${STAMP}`, orgType: 'MAIN' })).id;
    for (const [n, name, dept, crew] of [[1, 'Бат', mine, crewA], [2, 'Дорж', mine, crewA], [3, 'Сараа', adm, null]] as const) {
      await api(page, 'POST', `/camps/${campId}/employees`, { organizationId: org, departmentId: dept, crewId: crew, employeeCode: ec(n), fullName: name });
    }
    const b = (await api(page, 'POST', `/camps/${campId}/buildings`, { code: 'B1', name: 'Байр 1' })).id;
    await api(page, 'POST', `/camps/${campId}/rooms`, { buildingId: b, roomNo: '101', capacity: 2 });
    await api(page, 'POST', `/camps/${campId}/rooms`, { buildingId: b, roomNo: '102', capacity: 1 });
  });

  test('ирцийн xlsx: алдаатай → батлах хаалттай, цуцлах → засварласан файл → батлах', async ({ page }) => {
    await openSection(page, 'Ирц');
    // Сараа баггүй → ээлжийн бус ирэлт: meals заавал
    await page.getByLabel('Ирцийн xlsx файл').setInputFiles({
      name: 'bad.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsx([[ec(1), WED, 'ARRIVAL'], [ec(2), WED, 'ARRIVAL'], [ec(3), TODAY, 'ARRIVAL']]),
    });
    await expect(page.getByText('Алдаатай 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Батлах' })).toBeDisabled();
    await expect(page.getByText(/хоол заавал|meals заавал/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Цуцлах' }).first().click();

    await page.getByLabel('Ирцийн xlsx файл').setInputFiles({
      name: 'good.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await xlsx([[ec(1), WED, 'ARRIVAL'], [ec(2), WED, 'ARRIVAL'], [ec(3), TODAY, 'ARRIVAL', 'LUNCH,DINNER']]),
    });
    await expect(page.getByText('Алдаагүй')).toBeVisible();
    await page.getByRole('button', { name: 'Батлах' }).click();
    await expect(page.getByText(/Баталгаажлаа: 3 бүртгэл/)).toBeVisible();
    await expect(page.getByRole('cell', { name: new RegExp(`${ec(1)} Бат`) })).toBeVisible();
  });

  test('гараар ирц: ээлжийн бус явалт хоолгүй → алдаа; "Идэхгүй" → бүртгэгдэнэ; сүүлийнхийг устгана', async ({ page }) => {
    await openSection(page, 'Ирц');
    await page.getByRole('button', { name: '+ Ирц бүртгэх' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Ажилтан — код эсвэл нэрээр хайх').fill(ec(3));
    await dlg.getByRole('option', { name: /Сараа/ }).click();
    await dlg.getByLabel('Огноо', { exact: true }).fill(addDays(TODAY, 1));
    await dlg.getByLabel('Чиглэл', { exact: true }).selectOption('DEPARTURE');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg.getByRole('alert')).toBeVisible();
    await dlg.getByLabel('Идэхгүй').check();
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    const row = page.getByRole('row', { name: new RegExp(`${addDays(TODAY, 1)}.*Сараа`) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Устгах' }).click();
    await expect(row).toBeHidden();
  });

  test('ээлж: календарь (ростер/загвар), олон ажилтанд зохицуулалт', async ({ page }) => {
    await openSection(page, 'Ээлж');
    await expect(page.getByRole('cell', { name: new RegExp(`${ec(1)} Бат`) }).first()).toBeVisible();
    // Захиргаа: баггүй, загвар бүх өдөр Өдөр → өдрийн ээлж
    await expect(page.getByLabel(new RegExp(`${ec(3)} · ${TODAY} · Өдрийн ээлж`))).toBeVisible();

    await page.getByRole('button', { name: '+ Зохицуулалт' }).click();
    const dlg = page.getByRole('dialog');
    for (const n of [1, 2]) {
      await dlg.getByLabel('Ажилтнууд — код эсвэл нэрээр хайх').fill(ec(n));
      await dlg.getByRole('option', { name: new RegExp(ec(n)) }).click();
    }
    await dlg.getByLabel('Эхлэх', { exact: true }).fill(TODAY);
    await dlg.getByLabel('Дуусах', { exact: true }).fill(addDays(TODAY, 2));
    await dlg.getByLabel('Ээлж', { exact: true }).selectOption('NIGHT');
    await dlg.getByRole('button', { name: 'Хадгалах (2)' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByLabel(new RegExp(`${ec(1)} · ${TODAY} · Шөнийн ээлж.*зохицуулалтаар`))).toBeVisible();
    await expect(page.getByRole('cell', { name: new RegExp(`${ec(2)} Дорж`) }).last()).toBeVisible();
  });

  test('өрөөний самбар: өрөөгүй → хуваарилах, багтаамж хэтрэх → алдаа', async ({ page }) => {
    await openSection(page, 'Өрөөний самбар');
    await expect(page.getByText('Өрөөгүй 3')).toBeVisible();
    for (const [code, room] of [[ec(1), '101'], [ec(2), '101'], [ec(3), '102']] as const) {
      await page.getByRole('group', { name: `Өрөөгүй ${code}` }).getByRole('button', { name: 'Өрөө өгөх' }).click();
      const dlg = page.getByRole('dialog');
      await selectRoom(dlg, room);
      await dlg.getByRole('button', { name: 'Хадгалах' }).click();
      await expect(dlg).toBeHidden();
    }
    await expect(page.getByText(/Өрөөгүй \d/)).toHaveCount(0);
    await expect(page.getByLabel('Өрөө 101')).toContainText('2 / 2');

    // Сараа-г маргаашаас 101 руу шилжүүлэх → 101 дүүрэн (А баг 2 хүн) → 409
    await page.getByRole('listitem').filter({ hasText: 'Сараа' }).getByRole('button', { name: 'Шилжүүлэх' }).click();
    const dlg = page.getByRole('dialog');
    await selectRoom(dlg, '101');
    await dlg.getByLabel('Эхлэх огноо', { exact: true }).fill(addDays(TODAY, 1));
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg.getByRole('alert')).toContainText('багтаамж 2');
  });

  test('хоолны суурь тоо: 3 хүн, хоол × байршил', async ({ page }) => {
    await openSection(page, 'Хоол');
    await expect(page.getByText('Кемпэд 3 хүн')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Кемпийн гал тогоо' })).toBeVisible();
    await expect(page.getByRole('row', { name: /^Нийт/ })).toBeVisible();
  });

  test('ажилтан: жагсаалт, нэмэх', async ({ page }) => {
    await openSection(page, 'Ажилтан');
    await expect(page.getByRole('cell', { name: ec(1), exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Ажилтан' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Ажилтны код').fill(ec(4));
    await dlg.getByLabel('Овог нэр').fill('Шинэ ажилтан');
    await dlg.getByLabel('Байгууллага').selectOption({ label: `Уурхай ${STAMP}` });
    await dlg.getByLabel('Хэлтэс').selectOption({ index: 1 });
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('cell', { name: ec(4), exact: true })).toBeVisible();
  });
});
