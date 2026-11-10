import { test, expect, type Browser, type Page } from '@playwright/test';
import { fixture, loginAsUser, type FixtureUserKey } from '../helpers/fixture';
import { api } from '../helpers/api';

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
  await page.goto('/debug/modules/mr');
  await page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i }).first().click();
  await page.waitForURL(/.*debug\/modules\/mr\/new.*/);
  await page.getByLabel(/title|гарчиг|нэр/i).fill(title);
  // MRCreatePage: item fields заавал бөглөх (frontend validation)
  await page.locator('input[placeholder="Материалын нэр"]').first().fill('E2E тест бараа');
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByRole('button', { name: /MR үүсгэх|хадгалах|save|create/i }).click();
  await page.waitForURL(/.*debug\/modules\/mr\/[a-f0-9-]{36}.*/);
  await expect(page.getByText(/ноорог/i)).toBeVisible();

  await page.getByRole('button', { name: /батлуулахаар илгээх|submit/i }).click();
  await expect(page.getByText(/батлуулж байна/i)).toBeVisible({ timeout: 5_000 });
  // Үүсгэгчид батлах/татгалзах товч алга
  await expect(page.getByText('Таны үүсгэсэн MR — батлагчийг хүлээж байна')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /батлах/i })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: /татгалзах/i })).toHaveCount(0);
  return /debug\/modules\/mr\/([a-f0-9-]{36})/.exec(page.url())![1];
}

test.describe('Material Requisition бүрэн урсгал', () => {
  test('core.debug.view эрхгүй хэрэглэгч Debug-only MR модульд нэвтрэхгүй', async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin');
    await page.goto('/debug/modules/mr');
    await expect(page.getByText('Танд энэ хэсэгт хандах эрх алга')).toBeVisible();
    await expect(page.getByRole('button', { name: /шинэ.*MR|new|үүсгэх|create/i })).toHaveCount(0);
  });

  test.describe('DEBUG_MENU_ENABLED=true үед MR-ийн UI урсгал', () => {
    test.skip(process.env['DEBUG_MENU_ENABLED'] !== 'true', 'Debug-only MR UI шалгалтыг DEBUG_MENU_ENABLED=true үед тусад нь ажиллуулна');

    let wasMrActive = false;
    let debugRoleId: string | undefined;
    const userRoleIds: string[] = [];

    test.beforeAll(async ({ browser }) => {
      const admin = await pageAs(browser, 'devUserAdmin');
      try {
        const modules = await api<{ id: string; active: boolean }[]>(admin, 'GET', '/core/modules');
        wasMrActive = modules.find((module) => module.id === 'mr')?.active ?? false;
        if (!wasMrActive) await api(admin, 'PATCH', '/core/modules/mr', { active: true });

        const role = await api<{ id: string }>(admin, 'POST', '/core/rbac/roles', {
          name: `E2E MR Debug ${fixture().stamp}`,
          permissionCodes: ['core.debug.view'],
        });
        debugRoleId = role.id;
        for (const key of ['devReq', 'devAppr1'] as const) {
          const assigned = await api<{ id: string }>(admin, 'POST', '/core/rbac/user-roles', {
            userId: fixture().users[key].coreId,
            roleId: role.id,
            campId: null,
          });
          userRoleIds.push(assigned.id);
        }
      } finally {
        await admin.context().close();
      }
    });

    test.afterAll(async ({ browser }) => {
      const admin = await pageAs(browser, 'devUserAdmin');
      try {
        for (const id of userRoleIds) await api(admin, 'DELETE', `/core/rbac/user-roles/${id}`);
        if (debugRoleId) await api(admin, 'DELETE', `/core/rbac/roles/${debugRoleId}`);
        if (!wasMrActive) await api(admin, 'PATCH', '/core/modules/mr', { active: false });
      } finally {
        await admin.context().close();
      }
    });

    test('REQUESTER үүсгэж илгээнэ → APPROVER батална', async ({ browser }) => {
      const req = await pageAs(browser, 'devReq');
      const id = await createAndSubmit(req, `${fixture().prefix} MR approve`);

      const appr = await pageAs(browser, 'devAppr1');
      await appr.goto(`/debug/modules/mr/${id}`);
      await appr.getByRole('main').getByRole('button', { name: /батлах/i }).click();
      await expect(appr.getByText('Батлагдсан', { exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(appr.getByRole('main').getByRole('button', { name: /батлах/i })).toHaveCount(0);
    });

    test('REQUESTER үүсгэж илгээнэ → APPROVER татгалзана', async ({ browser }) => {
      const req = await pageAs(browser, 'devReq');
      const id = await createAndSubmit(req, `${fixture().prefix} MR reject`);

      const appr = await pageAs(browser, 'devAppr1');
      await appr.goto(`/debug/modules/mr/${id}`);
      await appr.getByRole('main').getByRole('button', { name: /татгалзах/i }).click();
      await appr.locator('.fixed.inset-0').waitFor({ state: 'visible' });
      await appr.locator('textarea').first().fill('E2E test rejection');
      await appr.locator('.fixed.inset-0').getByRole('button', { name: /татгалзах/i }).click();
      await expect(appr.getByText('Татгалзсан', { exact: true })).toBeVisible({ timeout: 5_000 });
    });

    test('MR жагсаалт харагдана (pagination)', async ({ page }) => {
      await loginAsUser(page, 'devReq');
      await page.goto('/debug/modules/mr');
      const list = page.getByRole('table').or(page.getByTestId('mr-list'));
      await expect(list).toBeVisible();
    });
  });
});
