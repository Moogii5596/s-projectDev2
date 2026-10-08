import type { Page } from '@playwright/test';

export const TEST_CREDENTIALS = {
  email: 'admin@test.mn',
  password: 'test1234',
} as const;

/**
 * Login хийж /requisitions хуудас руу чиглүүлнэ.
 * Storage state ашиглан дахин login хийхээс зайлсхийнэ.
 *
 * NOTE: getByLabel ашиглахгүй — LoginPage дахь label нь Монгол текстийн
 * "И-мэйл"/"Нууц үг" бөгөөд htmlFor/id холболтгүй.
 * input[type] селектор нь хамгийн найдвартай.
 */
export async function loginAs(page: Page, email = TEST_CREDENTIALS.email, password = TEST_CREDENTIALS.password): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /нэвтрэх|login/i }).click();
  await page.waitForURL('**/requisitions**', { timeout: 10_000 });
}

/**
 * Health endpoint шалгах
 */
export async function checkHealth(): Promise<void> {
  const res = await fetch('http://localhost:3000/api/v1/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
}
