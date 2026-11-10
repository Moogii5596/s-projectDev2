import { test, expect, type Page } from '@playwright/test';
import { api } from '../helpers/api';
import { loginAs } from '../helpers/auth.helper';
import { fixture, loginAsUser } from '../helpers/fixture';

/**
 * v0.2.1 — хоолны тооцооны загвар: албан тушаал (каталог) → кемпийн анхдагч байршил → ажилтан → хоолны тоо;
 * хоолгүй ажилтан ирцэд бий ч хоолонд үгүй (олноор); өдрийн ирц ээлжээр (C-14); байрны төрөл, байранд хөрөнгө (C-12); хэл.
 * УРЬДЧИЛСАН НӨХЦӨЛ: `supabase/dev/camp_e2e_grant.sql` (admin@test.mn → Кемп админ, бүх кемп).
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `V21-${STAMP}`;
const POS = `Харуул ${STAMP}`;
const BTYPE = `Амьдрах ${STAMP}`;
const DAY = 86_400_000;
const todayUb = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const TODAY = todayUb();
// Ростерын ирэлт = өнгөрсөн Лхагва; тооцоо = дараагийн өдөр (бүтэн өдөр, өдрийн ээлж)
const WED = addDays(TODAY, -((new Date(`${TODAY}T00:00:00Z`).getUTCDay() - 3 + 7) % 7) - 7);
const D2 = addDays(WED, 1);

let campId = '';
const ids: Record<string, string> = {};


test.describe.serial('Кемп v0.2.1', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test.afterAll(async ({ browser }) => {
    const p = await browser.newPage();
    await loginAs(p);
    await api(p, 'PATCH', '/api/v1/i18n/me/locale', { locale: 'mn' }).catch(() => undefined);
    await p.close();
  });

  test('бэлтгэл (API): кемп, 2 байршил, тохиргоо, хэлтэс (өдөр), байгууллага, ростер', async ({ page }) => {
    campId = (await api(page, 'POST', '/camp/camps', { code: CODE, name: `E2E v0.2.1 ${STAMP}` })).id;
    ids.locCamp = (await api(page, 'POST', `/camp/camps/${campId}/meal-locations`, { name: 'Кемп гал тогоо' })).id;
    ids.locPost = (await api(page, 'POST', `/camp/camps/${campId}/meal-locations`, { name: 'Уулын пост' })).id;
    await api(page, 'PUT', `/camp/camps/${campId}/settings`, { vatRate: 10, changeoverWeekday: 3, rosterOnDays: 14, rosterOffDays: 14, mealOrderCutoffTime: null, defaultMealLocationId: ids.locCamp });
    ids.dept = (await api(page, 'POST', `/hr/sites/${campId}/departments`, { code: 'OPS', name: 'Үйл ажиллагаа', shiftPattern: [{ dayFrom: 1, dayTo: 14, shift: 'DAY' }] })).id;
    ids.org = (await api(page, 'POST', '/core/organizations', { name: `Уурхай ${STAMP}`, regNumber: `R${STAMP}`, orgType: 'MAIN' })).id;
    ids.crew = (await api(page, 'POST', `/hr/sites/${campId}/crews`, { code: 'A', rosterAnchorDate: WED })).id;
  });

  test('Хүний нөөц › Албан тушаал: нэмэх; давхардсан нэр (зай/үсэг) → алдаа', async ({ page }) => {
    await page.goto(`/hr/${campId}/positions`);
    const nameMn = page.locator('form').getByRole('textbox').first();
    await nameMn.fill(POS);
    await page.getByRole('button', { name: 'Нэмэх', exact: true }).click();
    await expect(page.getByRole('cell', { name: POS, exact: true })).toBeVisible();
    await nameMn.fill(`  ${POS.toLowerCase()} `);
    await page.getByRole('button', { name: 'Нэмэх', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(POS);
    const list = await api<{ id: string; name: string }[]>(page, 'GET', '/hr/positions');
    ids.pos = list.find((p) => p.name === POS)!.id;
  });

  test('Кемпийн тохиргоо › Албан тушаал: анхдагч байршил = Уулын пост', async ({ page }) => {
    await page.goto(`/camp/${campId}/settings/positions`);
    const sel = page.getByLabel(`${POS}: ажлын хоолны байршил`);
    await expect(sel).toHaveValue('');
    await sel.selectOption({ label: 'Уулын пост' });
    await expect(sel).toHaveValue(ids.locPost);
    await page.reload();
    await expect(page.getByLabel(`${POS}: ажлын хоолны байршил`)).toHaveValue(ids.locPost);
  });

  test('ажилтан: албан тушаалаас байршил авна; олноор "Хоолгүй" → хоолны тоонд үгүй, ирцэд бий', async ({ page }) => {
    for (const [code, positionId] of [[`${STAMP}-G1`, ids.pos], [`${STAMP}-D1`, null]] as const) {
      ids[code] = (await api(page, 'POST', `/hr/sites/${campId}/employees`, { organizationId: ids.org, departmentId: ids.dept, crewId: ids.crew, employeeCode: code, fullName: `Н ${code}`, positionId })).id;
      await api(page, 'POST', `/hr/sites/${campId}/movements`, { employeeId: ids[code], date: WED, direction: 'ARRIVAL' });
    }
    await page.goto(`/hr/${campId}/employees`);
    const g1 = page.getByRole('row', { name: new RegExp(`${STAMP}-G1`) });
    const d1 = page.getByRole('row', { name: new RegExp(`${STAMP}-D1`) });
    await expect(g1).toContainText(/Уулын пост\s*\(албан тушаалаас\)/);
    await expect(d1).toContainText(/Кемп гал тогоо\s*\(кемпийн анхдагч\)/);

    // Хоолны тоо (D2: хоёулаа өдрийн ээлж — Өдөр: пост 1, кемп 1)
    await page.goto(`/camp/${campId}/meals`);
    await page.getByLabel('Огноо').fill(D2);
    await expect(page.getByText('Кемпэд 2 хүн')).toBeVisible();

    await page.goto(`/hr/${campId}/employees`);
    await page.getByLabel(`${STAMP}-D1-г сонгох`).check();
    const bar = page.getByRole('region', { name: 'Олноор өөрчлөх' });
    await expect(bar).toContainText('1 ажилтан сонгосон');
    await bar.getByLabel('Үйлдэл').selectOption({ label: 'Хоол авах' });
    await bar.getByLabel('Шинэ утга').selectOption({ label: 'Хоолгүй' });
    await bar.getByRole('button', { name: 'Хэрэглэх' }).click();
    await expect(bar).toBeHidden();
    await expect(d1).toContainText('Хоолгүй');

    await page.goto(`/camp/${campId}/meals`);
    await page.getByLabel('Огноо').fill(D2);
    await expect(page.getByText('Кемпэд 2 хүн')).toBeVisible();
    await expect(page.getByText('Хоолгүй: 1')).toBeVisible();
  });

  test('C-14 өдрийн ирц: тооцоолсон ээлжээр шүүнэ (Өдөр 2, Шөнө 0, Ирэх/явах — ирсэн өдөр)', async ({ page }) => {
    await page.goto(`/hr/${campId}/attendance`);
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Өдрийн ирц' }) });
    await card.getByLabel('Огноо').fill(D2);
    const chips = card.getByRole('group', { name: 'Ээлжээр шүүх' });
    await expect(chips.getByRole('button', { name: 'Өдөр (2)' })).toBeVisible();
    await expect(chips.getByRole('button', { name: 'Шөнө (0)' })).toBeVisible();
    await chips.getByRole('button', { name: 'Өдөр (2)' }).click();
    await expect(card.getByRole('row', { name: new RegExp(`${STAMP}-G1.*${POS}`) })).toBeVisible();
    await card.getByLabel('Огноо').fill(WED);
    await expect(chips.getByRole('button', { name: 'Ирэх / явах (2)' })).toBeVisible();
  });

  test('C-12: байрны төрөл (каталог) → байранд оноох; хөрөнгө байранд → өрөөний самбар / засварын хүсэлт', async ({ page }) => {
    await page.goto('/camp/system/building-types');
    await page.locator('form').getByRole('textbox').first().fill(BTYPE);
    await page.getByRole('button', { name: 'Нэмэх', exact: true }).click();
    await expect(page.getByRole('cell', { name: BTYPE, exact: true })).toBeVisible();

    const b = await api(page, 'POST', `/camp/camps/${campId}/buildings`, { code: 'B1', name: 'Байр 1', rooms: { from: 1, to: 2, padTo: 0, capacity: 2 } });
    await page.goto(`/camp/${campId}/settings/facilities`);
    await page.getByLabel('B1 байрны төрөл').selectOption({ label: BTYPE });
    await expect(page.getByLabel('B1 байрны төрөл')).not.toHaveValue('');

    const cat = await api(page, 'POST', '/camp/asset-categories', { name: `Гал хамгаалал ${STAMP}` });
    await page.goto(`/camp/${campId}/assets`);
    await page.getByRole('button', { name: '+ Хөрөнгө' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Инвентарийн дугаар').fill(`FX-${STAMP}`);
    await dlg.getByLabel('Нэр').fill('Гал унтраагуур');
    await dlg.getByLabel('Ангилал').selectOption(cat.id);
    await dlg.getByLabel('Байршил').selectOption(`b:${b.id}`);
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('row', { name: new RegExp(`FX-${STAMP}.*B1 \\(байранд\\)`) })).toBeVisible();

    await page.goto(`/camp/${campId}/rooms`);
    await expect(page.getByRole('link', { name: '+ Засварын хүсэлт' }).first()).toBeVisible();
  });

  // TEST-026: профайлын хэл өөрчилдөг → тусдаа хэрэглэгч: fixture devAppr1 + энэ кемпийн «Кемп админ» роль
  // (admin@test.mn — бусад тест, devAdmin — camp-v020-ийн хэлний тест; зэрэг ажиллахад хэл холилдохгүй)
  test('олон хэл: EN — Албан тушаал → Positions; ажилтны багана', async ({ browser }) => {
    // SEC-009 (v0.2.2 Блок 6б): роль олгох = зөвхөн системийн админ → fixture devUserAdmin
    const admCtx = await browser.newContext();
    const admin = await admCtx.newPage();
    await loginAsUser(admin, 'devUserAdmin');
    const roles = await api<{ id: string; systemCode: string | null }[]>(admin, 'GET', '/core/rbac/roles');
    const roleId = roles.find((r) => r.systemCode === 'CAMP_ADMIN')?.id as string;
    await api(admin, 'POST', '/core/rbac/user-roles', { userId: fixture().users.devAppr1.coreId, roleId, campId });
    await admCtx.close();
    const own = await browser.newContext();
    const page = await own.newPage();
    await loginAsUser(page, 'devAppr1');
    await page.goto(`/camp/${campId}/settings/positions`);
    await page.getByRole('group', { name: 'Хэл' }).getByRole('button', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible();
    await page.goto(`/hr/${campId}/employees`);
    await expect(page.getByRole('columnheader', { name: 'Work meal location' })).toBeVisible();
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'МН' }).click();
    await expect(page.getByRole('button', { name: 'Кемп', exact: true })).toBeVisible();
    await own.close();
  });
});
