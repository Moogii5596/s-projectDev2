import { test, expect, type Page } from '@playwright/test';
import { api } from '../helpers/api';
import { loginAs } from '../helpers/auth.helper';
import { loginAsUser } from '../helpers/fixture';

/**
 * v0.2.2 Блок 4 — «Хүний нөөц»: ажилтны «Нэвтрэх эрх» (имэйлгүй) → урилгын линк; «Хэрэглэгч» жагсаалт, эрхийн цонх;
 * албан тушаалын эрхийн загвар. Бэлтгэлийг шинэ `/hr`, `/core` API-аар (QA-11).
 * v0.2.2 Блок 6б (SEC-009): хэрэглэгч / роль удирдах = зөвхөн системийн админ → fixture `devUserAdmin` (ADMIN);
 * admin@test.mn (APPROVER + Кемп админ) «Хэрэглэгч» хэсэгт хандахгүй (сүүлийн тест).
 * Идэвхгүй болгох (GoTrue ban) — integration `camp-v022-users` (энд бодит хэрэглэгчийг хаахгүй).
 */
const STAMP = Date.now().toString(36).toUpperCase();
const CODE = `V22U-${STAMP}`;
const PHONE = `9${String(Date.now()).slice(-7)}`;
const EMP = `Урилга ${STAMP}`;
const POS = `Нярав ${STAMP}`;

let campId = '';
const ids: Record<string, string> = {};


test.describe.serial('v0.2.2 Блок 4 — хэрэглэгч удирдах', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin');
  });

  test('бэлтгэл (API): ажлын байр, хэлтэс, байгууллага, албан тушаал, ажилтан', async ({ page }) => {
    campId = (await api(page, 'POST', '/camp/camps', { code: CODE, name: `E2E v0.2.2 ${STAMP}` })).id;
    ids.dept = (await api(page, 'POST', `/hr/sites/${campId}/departments`, { code: 'ADM', name: 'Захиргаа' })).id;
    ids.org = (await api(page, 'POST', '/core/organizations', { name: `Байгууллага ${STAMP}`, regNumber: `U${STAMP}`, orgType: 'MAIN' })).id;
    ids.pos = (await api(page, 'POST', '/hr/positions', { name: POS })).id;
    ids.emp = (
      await api(page, 'POST', `/hr/sites/${campId}/employees`, {
        organizationId: ids.org, departmentId: ids.dept, employeeCode: `U${STAMP}`, fullName: EMP, phone: PHONE, positionId: ids.pos,
      })
    ).id;
  });

  test('ажилтан → нэвтрэх эрх (имэйлгүй) → урилгын линк', async ({ page }) => {
    await page.goto(`/hr/${campId}/employees`);
    await page.getByRole('row', { name: new RegExp(EMP) }).getByRole('button', { name: 'Засах' }).click();
    const sec = page.getByRole('dialog').getByRole('region', { name: 'Нэвтрэх эрх' });
    await expect(sec.getByLabel('Имэйлгүй (утас / нэвтрэх нэрээр)')).toBeChecked();
    await sec.getByRole('button', { name: 'Нэвтрэх эрх үүсгэх' }).click();
    await expect(sec.getByText(PHONE)).toBeVisible();
    await sec.getByRole('button', { name: 'Урилгын линк үүсгэх' }).click();
    await expect(sec.getByLabel('Урилгын линк')).toHaveValue(/\/invite\/[A-Za-z0-9_-]+$/);
  });

  test('Хэрэглэгч: жагсаалт, төлөв, эрхийн цонх', async ({ page }) => {
    await page.goto(`/hr/${campId}/users`);
    await page.getByLabel('Хайх').fill(PHONE);
    const row = page.getByRole('row', { name: new RegExp(EMP) });
    await expect(row.getByText('Урилга хүлээгдэж байна')).toBeVisible();
    await row.getByRole('button', { name: 'Эрх' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: new RegExp(`Эрх — ${EMP}`) })).toBeVisible();
  });

  test('албан тушаал → эрхийн загвар: роль нэмж хадгалах, хэрэгжүүлэх', async ({ page }) => {
    await page.goto(`/hr/${campId}/positions`);
    await page.getByRole('row', { name: new RegExp(POS) }).getByRole('button', { name: 'Эрхийн загвар' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('— Роль нэмэх —').selectOption({ index: 1 });
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg.getByText('Хадгалаагүй өөрчлөлттэй')).toBeHidden();
    await dlg.getByRole('button', { name: 'Ажилтнуудад хэрэгжүүлэх' }).click();
    await expect(dlg.getByText(/хэрэглэгчид хэрэгжүүллээ/)).toBeVisible();
  });

  test('SEC-009: Кемп админ (системийн админ биш) «Хэрэглэгч» хэсэгт хандахгүй', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page);
    await page.goto(`/hr/${campId}/users`);
    await expect(page.getByText('энэ хэсэгт хандах эрх алга')).toBeVisible();
    await page.close();
  });
});
