import { test, expect } from '@playwright/test';
import { loginAsUser, switchUser } from '../helpers/fixture';

/**
 * v0.2.3 Блок F (FB-SYS-01a) — «Санал илгээх» товч → илгээх → өөр хэрэглэгч (админ) «+1», «Хийгдсэн» + хариу →
 * зохиогч хариуг харна; «Шинэчлэлийн түүх» нээгдэж «Шинэ» тэмдэг арилна.
 * Хэрэглэгч: devReq (REQUESTER), devUserAdmin (ADMIN) — e2e fixture.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const TITLE = `E2E санал ${STAMP}`;

test.describe('v0.2.3 — санал хүсэлт, шинэчлэлийн түүх', () => {
  test('илгээх → +1 → админ хариулах → зохиогч харах', async ({ page }) => {
    await loginAsUser(page, 'devReq');

    // Хуудас бүрийн товч → маягт (эх хуудас автоматаар)
    await page.getByRole('button', { name: 'Санал илгээх' }).last().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByText('Хөгжүүлэлтийн захиалга').click();
    await dlg.getByLabel('Гарчиг').fill(TITLE);
    await dlg.getByLabel('Тайлбар').fill('Хоолны сарын тайланг Excel-ээр');
    await expect(dlg.getByText('/feed')).toBeVisible(); // v0.2.3 M-0: нэвтэрсний дараа /feed (өмнө /requisitions)
    await dlg.getByRole('button', { name: 'Илгээх', exact: true }).click();
    await expect(dlg).toBeHidden();
    const mine = page.getByTestId('feedback-item').filter({ hasText: TITLE });
    await expect(mine).toContainText('Шинэ');
    await expect(mine.getByRole('button', { name: 'Засах' })).toBeVisible();

    // Админ: бусдын саналыг харж «+1», «Хийгдсэн» (хувилбаргүй бол хадгалахгүй)
    await switchUser(page, 'devUserAdmin');
    await page.goto('/feedback');
    const item = page.getByTestId('feedback-item').filter({ hasText: TITLE });
    await expect(item.getByRole('button', { name: 'Засах' })).toBeVisible(); // админ засна
    await item.getByRole('button', { name: /\+1 дэмжих \(0\)/ }).click();
    await expect(item.getByRole('button', { name: /\+1 дэмжих \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
    await item.getByRole('button', { name: 'Төлөв / хариу' }).click();
    const m = page.getByRole('dialog');
    await m.getByLabel('Төлөв', { exact: true }).selectOption('DONE');
    await expect(m.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    await m.getByLabel('Хэрэгжсэн хувилбар').fill('0.2.3');
    await m.getByLabel('Хариу').fill(`Хийгдсэн ${STAMP}`);
    await m.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(item).toContainText('v0.2.3-д хэрэгжсэн');

    // Зохиогч: хариу, төлөв; «Шинэ» биш болсон тул засахгүй
    await switchUser(page, 'devReq');
    await page.goto('/feedback');
    const done = page.getByTestId('feedback-item').filter({ hasText: TITLE });
    await expect(done).toContainText(`Хийгдсэн ${STAMP}`);
    await expect(done.getByRole('button', { name: 'Засах' })).toHaveCount(0);
    await expect(done.getByRole('button', { name: /\+1 дэмжих \(1\)/ })).toHaveAttribute('aria-pressed', 'false');

    // Шинэчлэлийн түүх — үзсэний дараа цэсний «Шинэ» тэмдэг арилна
    await page.evaluate(() => localStorage.removeItem('s-project.whats-new.seen'));
    await page.reload();
    const nav = page.locator('nav');
    await expect(nav.getByText('Шинэ', { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: /Шинэчлэлийн түүх/ }).click();
    await expect(page.getByRole('heading', { name: 'Шинэчлэлийн түүх' })).toBeVisible();
    await expect(page.getByText('Одоогийн')).toBeVisible();
    await expect(nav.getByText('Шинэ', { exact: true })).toHaveCount(0);
  });
});
