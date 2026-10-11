import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

test.describe('Auth flow', () => {
  test('login → /requisitions руу чиглүүлнэ', async ({ page }) => {
    await loginAs(page);
    await expect(page).toHaveURL(/.*requisitions.*/);
  });

  test('login хийсний дараа /login давтан очвол redirect болно', async ({ page }) => {
    await loginAs(page);
    await page.goto('/login');
    // Нэвтэрсэн хэрэглэгчийг /requisitions руу чиглүүлнэ
    await expect(page).toHaveURL(/.*requisitions.*/);
  });

  test('буруу нууц үгтэй login амжилтгүй болно', async ({ page }) => {
    await page.goto('/login');
    // LoginPage label нь Монгол бөгөөд htmlFor холболтгүй тул type selector ашиглана
    await page.locator('#identifier').fill('admin@test.mn');
    await page.locator('input[type="password"]').fill('wrong_password');
    await page.getByRole('button', { name: /нэвтрэх|login/i }).click();
    // Алдааны мэдэгдэл харагдана, redirect болохгүй
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('health endpoint нэвтрэлт шаардахгүй', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/v1/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.2.0'); // Phase 6.4.2: APP_VERSION (= package.json)
  });
});
