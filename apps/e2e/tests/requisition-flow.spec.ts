import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

test.describe('Material Requisition бүрэн урсгал', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('MR үүсгэх → Submit → Approve', async ({ page }) => {
    // 1. Шинэ MR үүсгэх
    await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
    await page.waitForURL(/.*requisitions.*new.*/);

    // Form бөглөх
    const title = `E2E Test MR ${Date.now()}`;
    await page.getByLabel(/title|гарчиг|нэр/i).fill(title);
    // MRCreatePage: item fields заавал бөглөх (frontend validation)
    await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E тест бараа');
    await page.locator('input[type="number"]').first().fill('1');
    await page.getByRole('button', { name: /MR үүсгэх|хадгалах|save|create/i }).click();

    // MR үүссэн хуудас руу чиглүүлнэ (DRAFT статус)
    await page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/);
    await expect(page.getByText(/ноорог/i)).toBeVisible();

    // 2. Submit хийх
    await page.getByRole('button', { name: /submit|илгээх/i }).click();
    await expect(page.getByText(/батлуулж байна/i)).toBeVisible({ timeout: 5_000 });

    // 3. Approve хийх
    await page.getByRole('button', { name: /батлах/i }).click();
    await expect(page.getByText('Батлагдсан', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('MR үүсгэх → Submit → Reject', async ({ page }) => {
    // 1. Шинэ MR үүсгэх
    await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
    await page.waitForURL(/.*requisitions.*new.*/);

    const title = `E2E Reject Test ${Date.now()}`;
    await page.getByLabel(/title|гарчиг|нэр/i).fill(title);
    // MRCreatePage: item fields заавал бөглөх (frontend validation)
    await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E reject бараа');
    await page.locator('input[type="number"]').first().fill('2');
    await page.getByRole('button', { name: /MR үүсгэх|хадгалах|save|create/i }).click();
    await page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/);

    // 2. Submit
    await page.getByRole('button', { name: /submit|илгээх/i }).click();
    await expect(page.getByText(/батлуулж байна/i)).toBeVisible({ timeout: 5_000 });

    // 3. Reject
    await page.getByRole('button', { name: /татгалзах/i }).click();
    // RejectModal нээгдэнэ - modal container-оос олно
    await page.locator('.fixed.inset-0').waitFor({ state: 'visible' });
    await page.locator('textarea').first().fill('E2E test rejection');
    await page.locator('.fixed.inset-0').getByRole('button', { name: /татгалзах/i }).click();
    await expect(page.getByText('Татгалзсан', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('MR жагсаалт харагдана (pagination)', async ({ page }) => {
    await expect(page).toHaveURL(/.*requisitions.*/);
    // Хүснэгт эсвэл жагсаалт харагдана
    const list = page.getByRole('table').or(page.getByTestId('mr-list'));
    await expect(list).toBeVisible();
  });
});
