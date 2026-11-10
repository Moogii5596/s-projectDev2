import type { Page } from '@playwright/test';

const TEST_CREDENTIALS = {
  email: 'admin@test.mn',
  password: 'test1234',
} as const;

/**
 * Login хийж Feed (/feed — v0.2.3 M-0) руу чиглүүлнэ.
 * Storage state ашиглан дахин login хийхээс зайлсхийнэ.
 *
 * NOTE: getByLabel ашиглахгүй — LoginPage дахь label нь Монгол текстийн
 * "И-мэйл"/"Нууц үг" бөгөөд htmlFor/id холболтгүй.
 * v0.2.2: нэвтрэх талбар = `#identifier` (утас / нэвтрэх нэр / имэйл, type="text").
 */
export async function loginAs(page: Page, email = TEST_CREDENTIALS.email, password = TEST_CREDENTIALS.password): Promise<void> {
  await page.goto('/login');
  await page.locator('#identifier').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /нэвтрэх|login/i }).click();
  await page.waitForURL('**/feed**', { timeout: 10_000 }); // v0.2.3 Блок 5 (M-0)
}

/**
 * Health endpoint шалгах
 */
async function checkHealth(): Promise<void> {
  const res = await fetch('http://localhost:3000/api/v1/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
}
