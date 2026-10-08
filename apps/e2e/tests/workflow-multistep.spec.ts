import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

/**
 * Multi-level approval workflow E2E тест.
 * Workflow Engine (Sprint 2) дууссан байхыг шаардана.
 */
test.describe('Multi-level Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('MR workflow state machine зөв ажиллана', async ({ page }) => {
    // 1. Шинэ MR үүсгэх
    await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
    await page.waitForURL(/.*requisitions.*new.*/);

    const title = `Workflow E2E ${Date.now()}`;
    await page.getByLabel(/title|гарчиг|нэр/i).fill(title);
    // MRCreatePage: item fields заавал бөглөх (frontend validation)
    await page.locator('input[placeholder="Материалын нэр"]').first().fill('Workflow тест бараа');
    await page.locator('input[type="number"]').first().fill('5');
    await page.getByRole('button', { name: /MR үүсгэх|хадгалах|save|create/i }).click();
    await page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/);

    // 2. DRAFT → PENDING_APPROVAL
    await expect(page.getByText(/ноорог/i)).toBeVisible();
    await page.getByRole('button', { name: /submit|илгээх/i }).click();
    await expect(page.getByText(/батлуулж байна/i)).toBeVisible({ timeout: 5_000 });

    // 3. PENDING_APPROVAL → APPROVED
    await page.getByRole('button', { name: /батлах/i }).click();
    await expect(page.getByText('Батлагдсан', { exact: true })).toBeVisible({ timeout: 5_000 });

    // 4. Approve хийсний дараа дахин approve/reject хийж болохгүй
    const approveBtn = page.getByRole('button', { name: /батлах/i });
    const rejectBtn = page.getByRole('button', { name: /reject|татгалзах/i });
    await expect(approveBtn).toBeHidden().catch(() => expect(approveBtn).toBeDisabled());
    await expect(rejectBtn).toBeHidden().catch(() => expect(rejectBtn).toBeDisabled());
  });

  test('Workflow Engine health check (API)', async ({ request }) => {
    // Workflow module ажиллаж байгаа эсэхийг health-ээр шалгана
    const res = await request.get('http://localhost:3000/api/v1/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});
