import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fixture, headersFor, loginAsUser, url } from '../helpers/fixture';

/**
 * Inventory / Vendor / Report — Phase 6.1.4
 * API: A ↔ B тусгаарлалт, REQUESTER-т бичих эрх алга (403).
 * UI (DEV tenant, Phase 6.0 хуудсууд): ADMIN үүсгэх/тохируулах, REQUESTER-т товч алга, CSV.
 * Үүсгэсэн бараа/нийлүүлэгчийн нэр `prefix`-ээр эхэлнэ → globalTeardown DEV tenant-аас устгана.
 */
test.describe.serial('Хөнгөн модулиуд — API', () => {
  let itemId = '';
  const sku = () => `${fixture().prefix}-API-1`;

  test('Inventory: A ADMIN үүсгэнэ; REQUESTER → 403; B жагсаалтад алга, B тохируулах → 404', async ({ request }) => {
    const c = await request.post(url('/inventory/items'), {
      headers: headersFor('aAdmin'),
      data: { sku: sku(), name: 'Цемент', quantity: 5, minThreshold: 10 },
    });
    expect(c.status()).toBe(201);
    itemId = ((await c.json()) as { id: string }).id;

    const denied = await request.post(url('/inventory/items'), { headers: headersFor('aReq'), data: { sku: `${sku()}-x`, name: 'x' } });
    expect(denied.status()).toBe(403);

    const a = await request.get(url('/inventory/items?lowStock=true'), { headers: headersFor('aReq') });
    expect(((await a.json()) as { data: { sku: string }[] }).data.map((i) => i.sku)).toContain(sku());
    const b = await request.get(url('/inventory/items'), { headers: headersFor('bAdmin') });
    expect(((await b.json()) as { data: { sku: string }[] }).data.map((i) => i.sku)).not.toContain(sku());

    const adjB = await request.patch(url(`/inventory/items/${itemId}/adjust`), { headers: headersFor('bAdmin'), data: { delta: 1 } });
    expect(adjB.status()).toBe(404);
  });

  test('Inventory: сөрөг үлдэгдэл → 400; +10 → 15', async ({ request }) => {
    const neg = await request.patch(url(`/inventory/items/${itemId}/adjust`), { headers: headersFor('aAdmin'), data: { delta: -6 } });
    expect(neg.status()).toBe(400);
    const ok = await request.patch(url(`/inventory/items/${itemId}/adjust`), { headers: headersFor('aAdmin'), data: { delta: 10 } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()) as { quantity: string; lowStock: boolean }).toMatchObject({ quantity: '15', lowStock: false });
  });

  test('Vendor: A ADMIN үүсгэнэ / засна; REQUESTER → 403; B-д алга', async ({ request }) => {
    const name = `${fixture().prefix} Vendor A`;
    const c = await request.post(url('/vendors'), { headers: headersFor('aAdmin'), data: { name } });
    expect(c.status()).toBe(201);
    const id = ((await c.json()) as { id: string }).id;
    expect((await request.patch(url(`/vendors/${id}`), { headers: headersFor('aReq'), data: { isActive: false } })).status()).toBe(403);
    expect((await request.patch(url(`/vendors/${id}`), { headers: headersFor('bAdmin'), data: { isActive: false } })).status()).toBe(404);
    const u = await request.patch(url(`/vendors/${id}`), { headers: headersFor('aAdmin'), data: { regNumber: '1234567' } });
    expect(u.status()).toBe(200);
    const b = await request.get(url('/vendors'), { headers: headersFor('bReq') });
    expect(((await b.json()) as { name: string }[]).map((v) => v.name)).not.toContain(name);
  });

  test('Report: A-ийн тоо A-д л; B-д тусгагдахгүй', async ({ request }) => {
    const a = (await (await request.get(url('/reports/summary'), { headers: headersFor('aReq') })).json()) as {
      inventory: { items: number };
      vendors: { total: number };
    };
    expect(a.inventory.items).toBe(1);
    expect(a.vendors.total).toBe(1);
    const b = (await (await request.get(url('/reports/summary'), { headers: headersFor('bReq') })).json()) as {
      inventory: { items: number };
    };
    expect(b.inventory.items).toBe(0);
  });
});

test.describe.serial('Хөнгөн модулиуд — UI (DEV tenant)', () => {
  const SKU = () => `${fixture().prefix}-UI-1`;
  const VENDOR = () => `${fixture().prefix} Нийлүүлэгч`;

  async function openAs(page: Page, key: 'devAdmin' | 'devReq', path: string) {
    await loginAsUser(page, key);
    await page.goto(path);
  }

  test('ADMIN: бараа үүсгэх → ⚠ бага → тохируулах (сөрөг хориглоно)', async ({ page }) => {
    await openAs(page, 'devAdmin', '/inventory');
    await page.getByRole('button', { name: '+ Шинэ бараа' }).click();
    const dlg = page.getByRole('dialog', { name: 'Шинэ бараа' });
    await dlg.getByLabel('SKU').fill(SKU());
    await dlg.getByLabel('Нэр').fill('Цемент');
    await dlg.getByLabel('Эхний үлдэгдэл').fill('5');
    await dlg.getByLabel('Доод хэмжээ').fill('10');
    await dlg.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(dlg).toBeHidden();

    const row = page.getByTestId(`inv-row-${SKU()}`);
    await expect(row.getByText('⚠ Бага')).toBeVisible();
    await row.getByRole('button', { name: 'Тохируулах' }).click();
    const adj = page.getByRole('dialog');
    await adj.getByLabel(/Өөрчлөлт/).fill('-6');
    await expect(adj.getByText('Үлдэгдэл хүрэлцэхгүй')).toBeVisible();
    await expect(adj.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    await adj.getByLabel(/Өөрчлөлт/).fill('10.5');
    await adj.getByRole('button', { name: 'Хадгалах' }).click();
    await expect(adj).toBeHidden();
    await expect(row).toContainText('15.5');
    await expect(row.getByText('⚠ Бага')).toBeHidden();
  });

  test('ADMIN: нийлүүлэгч үүсгэх → идэвхгүй болгох → "Зөвхөн идэвхтэй" шүүлт', async ({ page }) => {
    await openAs(page, 'devAdmin', '/vendors');
    await page.getByRole('button', { name: '+ Шинэ нийлүүлэгч' }).click();
    await page.getByRole('dialog').getByLabel('Нэр').fill(VENDOR());
    await page.getByRole('dialog').getByRole('button', { name: 'Хадгалах' }).click();
    const row = page.getByTestId(`vendor-row-${VENDOR()}`);
    await expect(row).toContainText('Идэвхтэй');
    await row.getByRole('button', { name: 'Идэвхгүй болгох' }).click();
    await expect(row).toContainText('Идэвхгүй');
    await page.getByLabel('Зөвхөн идэвхтэй').check();
    await expect(row).toBeHidden();
  });

  test('ADMIN: тайлан — CSV (UTF-8 BOM)', async ({ page }) => {
    await openAs(page, 'devAdmin', '/reports');
    await expect(page.getByTestId('stat-inventory')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV татах' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^s-project-summary-\d{4}-\d{2}-\d{2}\.csv$/);
    const body = readFileSync((await dl.path())!, 'utf8');
    expect(body.charCodeAt(0)).toBe(0xfeff);
  });

  test('REQUESTER: харна, үүсгэх/засах товч алга', async ({ page }) => {
    await openAs(page, 'devReq', '/inventory');
    await expect(page.getByTestId(`inv-row-${SKU()}`)).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Шинэ бараа' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Тохируулах' })).toHaveCount(0);
    await page.goto('/vendors');
    await expect(page.getByRole('button', { name: '+ Шинэ нийлүүлэгч' })).toHaveCount(0);
  });
});
