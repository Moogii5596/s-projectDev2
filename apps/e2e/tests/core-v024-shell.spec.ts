import { test, expect } from '@playwright/test';
import { loginAsUser } from '../helpers/fixture';

/**
 * v0.2.4 — апп-ын хүрээ (UX-01), мэдэгдэл (NTF-01), Feed → санал хүсэлт (FEED-05), профайл, батлах жагсаалт (WF-06).
 * Хэрэглэгч: devReq (REQUESTER), devUserAdmin (ADMIN) — e2e fixture.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const BODY = `E2E v024 ${STAMP} — халуун ус алга`;

test.describe('v0.2.4 — апп-ын хүрээ, мэдэгдэл, Feed холбоос', () => {
  test('пост → санал хүсэлт → төлөв постод, дахин үүсгэх боломжгүй', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await loginAsUser(page, 'devReq');
    await page.getByRole('button', { name: 'Юу болж байна?' }).click();
    await page.getByPlaceholder('Юу болж байна?').fill(BODY);
    await page.getByRole('button', { name: 'Нийтлэх' }).click();
    const post = page.getByTestId('feed-post').filter({ hasText: BODY });
    await expect(post).toBeVisible();

    await post.getByRole('button', { name: 'Үйлдэл' }).click();
    await post.getByRole('button', { name: 'Санал хүсэлт болгох' }).click();
    await page.getByRole('button', { name: 'Үүсгэх' }).click();
    await expect(post.getByText('Санал хүсэлт:')).toBeVisible();
    await expect(post.getByText('Шинэ')).toBeVisible();

    // Давхар үүсгэх цэс нуугдана (нэг постод нэг санал хүсэлт); төлөв өөрчлөгдөхөд мэдэгдэл — integration (v024-core-services)
    await post.getByRole('button', { name: 'Үйлдэл' }).click();
    await expect(post.getByRole('button', { name: 'Санал хүсэлт болгох' })).toHaveCount(0);
  });

  test('утас (390px): доод таб — Модулиуд, Мэдэгдэл, Профайл; профайлд мэдэгдлийн тохиргоо', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsUser(page, 'devReq');
    const tabs = page.getByRole('navigation', { name: 'Үндсэн цэс' });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('button', { name: 'Модулиуд' }).click();
    await expect(page.getByRole('button', { name: 'Батлах' })).toBeVisible();
    await tabs.getByRole('button', { name: 'Профайл' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText('Мэдэгдлийн тохиргоо')).toBeVisible();
    await expect(page.getByText('Батлах хүсэлт')).toBeVisible();
    // Хэвтээ гүйлгэлт гарахгүй
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await tabs.getByRole('button', { name: 'Мэдэгдэл' }).click();
    await expect(page).toHaveURL(/\/notifications$/);
  });

  test('«Миний батлах» нээгдэнэ; DEBUG_MENU_ENABLED=false үед Debug цэс алга', async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin');
    await page.goto('/approvals');
    await expect(page.getByRole('button', { name: 'Миний батлах' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Миний илгээсэн' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Debug' })).toHaveCount(0);
  });
});
