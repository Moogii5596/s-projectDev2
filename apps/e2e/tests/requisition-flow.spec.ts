import { test, expect, type Browser, type Page } from '@playwright/test';
import { fixture, loginAsUser, type FixtureUserKey } from '../helpers/fixture';

/**
 * Material Requisition бүрэн урсгал (UI, DEV tenant) — Phase 6.1.5
 * [SEC-004]-ийн дараа MR үүсгэгч өөрөө батлах/татгалзахгүй → REQUESTER үүсгэж илгээнэ, APPROVER шийднэ.
 * (UI-д нэгж үнийн талбар алга → 0₮ → DEV tenant-ийн definition-оор 1 алхам APPROVER)
 */
async function pageAs(browser: Browser, key: FixtureUserKey): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAsUser(page, key);
  return page;
}

/** REQUESTER: UI-аар MR үүсгэж илгээнэ → MR id */
async function createAndSubmit(page: Page, title: string): Promise<string> {
  await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
  await page.waitForURL(/.*requisitions.*new.*/);
  await page.getByLabel(/title|гарчиг|нэр/i).fill(title);
  // MRCreatePage: item fields заавал бөглөх (frontend validation)
  await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E тест бараа');
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByRole('button', { name: /MR үүсгэх|хадгалах|save|create/i }).click();
  await page.waitForURL(/.*requisitions\/[a-f0-9-]{36}.*/);
  await expect(page.getByText(/ноорог/i)).toBeVisible();

  await page.getByRole('button', { name: /submit|илгээх/i }).click();
  await expect(page.getByText(/батлуулж байна/i)).toBeVisible({ timeout: 5_000 });
  // Үүсгэгчид батлах/татгалзах товч алга
  await expect(page.getByText('Таны үүсгэсэн MR — батлагчийг хүлээж байна')).toBeVisible();
  await expect(page.getByRole('button', { name: /батлах/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /татгалзах/i })).toHaveCount(0);
  return /requisitions\/([a-f0-9-]{36})/.exec(page.url())![1];
}

test.describe('Material Requisition бүрэн урсгал', () => {
  test('REQUESTER үүсгэж илгээнэ → APPROVER батална', async ({ browser }) => {
    const req = await pageAs(browser, 'devReq');
    const id = await createAndSubmit(req, `${fixture().prefix} MR approve`);

    const appr = await pageAs(browser, 'devAppr1');
    await appr.goto(`/requisitions/${id}`);
    await appr.getByRole('button', { name: /батлах/i }).click();
    await expect(appr.getByText('Батлагдсан', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(appr.getByRole('button', { name: /батлах/i })).toHaveCount(0);
  });

  test('REQUESTER үүсгэж илгээнэ → APPROVER татгалзана', async ({ browser }) => {
    const req = await pageAs(browser, 'devReq');
    const id = await createAndSubmit(req, `${fixture().prefix} MR reject`);

    const appr = await pageAs(browser, 'devAppr1');
    await appr.goto(`/requisitions/${id}`);
    await appr.getByRole('button', { name: /татгалзах/i }).click();
    // RejectModal нээгдэнэ - modal container-оос олно
    await appr.locator('.fixed.inset-0').waitFor({ state: 'visible' });
    await appr.locator('textarea').first().fill('E2E test rejection');
    await appr.locator('.fixed.inset-0').getByRole('button', { name: /татгалзах/i }).click();
    await expect(appr.getByText('Татгалзсан', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('MR жагсаалт харагдана (pagination)', async ({ page }) => {
    await loginAsUser(page, 'devReq');
    await expect(page).toHaveURL(/.*requisitions.*/);
    // Хүснэгт эсвэл жагсаалт харагдана
    const list = page.getByRole('table').or(page.getByTestId('mr-list'));
    await expect(list).toBeVisible();
  });
});
