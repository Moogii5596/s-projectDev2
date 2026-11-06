import { test, expect } from '@playwright/test';
import { loginAsUser, switchUser } from '../helpers/fixture';

/**
 * v0.2.3 Блок 5 (FEED-01) — нэвтрэхэд эхлээд Feed (M-0) → текст + зурагтай пост → өөр хэрэглэгч лайк, сэтгэгдэл →
 * зохиогч засна («засагдсан» → өмнөх текст) → админ (модератор) устгана.
 * Зураг: гарын үсэгтэй URL (Bearer-гүй <img>) Vite proxy-оор ачаалагдаж буйг шалгана.
 * Хэрэглэгч: devReq (REQUESTER), devAppr1, devUserAdmin (ADMIN) — e2e fixture.
 */
const STAMP = Date.now().toString(36).toUpperCase();
const BODY = `E2E пост ${STAMP}`;
// 2×2 улаан PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('v0.2.3 — Feed v0', () => {
  test('пост (зурагтай) → лайк, сэтгэгдэл → засах түүх → модератор устгах', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await loginAsUser(page, 'devReq'); // M-0: /feed
    await expect(page.getByRole('heading', { name: 'Мэдээ' })).toBeVisible();

    // Пост бичих
    await page.getByRole('button', { name: 'Юу болж байна?' }).click();
    await page.getByPlaceholder('Юу болж байна?').fill(BODY);
    await page.locator('input[type="file"]').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Нийтлэх' }).click();
    const post = page.getByTestId('feed-post').filter({ hasText: BODY });
    await expect(post).toBeVisible();
    const img = post.locator('img').first();
    await expect(img).toHaveAttribute('src', /\/api\/v1\/core\/feed\/media\/[0-9a-f-]{36}\/\d+\?t=.+&s=/);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // Өөр хэрэглэгч: лайк + сэтгэгдэл
    await switchUser(page, 'devAppr1');
    await page.goto('/feed');
    const other = page.getByTestId('feed-post').filter({ hasText: BODY });
    await other.getByRole('button', { name: /Таалагдлаа/ }).click();
    await expect(other.getByRole('button', { name: /Таалагдлаа · 1/ })).toHaveAttribute('aria-pressed', 'true');
    await other.getByRole('button', { name: /^Сэтгэгдэл/ }).click();
    await other.getByPlaceholder('Сэтгэгдэл бичих…').fill(`Сайхан байна ${STAMP}`);
    await other.getByRole('button', { name: 'Илгээх' }).click();
    await expect(other.getByTestId('feed-comment')).toContainText(`Сайхан байна ${STAMP}`);
    await expect(other.getByRole('button', { name: 'Үйлдэл' })).toBeVisible();

    // Зохиогч засна → «засагдсан» → өмнөх текст
    await switchUser(page, 'devReq');
    await page.goto('/feed');
    const mine = page.getByTestId('feed-post').filter({ hasText: BODY });
    await expect(mine.getByRole('button', { name: /Сэтгэгдэл · 1/ })).toBeVisible();
    await mine.getByRole('button', { name: 'Үйлдэл' }).click();
    await mine.getByRole('button', { name: 'Засах' }).click();
    await mine.locator('textarea').fill(`${BODY} (засвар)`);
    await mine.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(mine).toContainText(`${BODY} (засвар)`);
    await mine.getByRole('button', { name: /засагдсан/ }).click();
    await expect(page.getByRole('dialog')).toContainText(BODY);
    await page.keyboard.press('Escape');

    // Модератор (ADMIN) устгана
    await switchUser(page, 'devUserAdmin');
    await page.goto('/feed');
    const mod = page.getByTestId('feed-post').filter({ hasText: BODY });
    await mod.getByRole('button', { name: 'Үйлдэл' }).click();
    await mod.getByRole('button', { name: 'Устгах' }).click();
    await expect(page.getByTestId('feed-post').filter({ hasText: BODY })).toHaveCount(0);
  });
});
