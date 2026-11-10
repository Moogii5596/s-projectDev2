import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../helpers/fixture';

/**
 * v0.2.3 Блок 3 (ADR-007) — «Системийн тохиргоо» (/settings), эрхгүй цэс нуух (PIL-19), олгосон роль «олгогдсон» (PIL-18),
 * V2 эрх матрицад «удахгүй» (V2-05).
 * Хэрэглэгч: `devReq` (REQUESTER, Кемп/HR эрхгүй) · `devUserAdmin` (ADMIN). admin@test.mn — Кемп админ (бүх кемп,
 * `supabase/dev/camp_e2e_grant.sql`). Хуваалцсан хэрэглэгчийн төлвийг өөрчлөхгүй (TEST-026/027) — зөвхөн уншина.
 */
const nav = (page: Page) => page.getByRole('navigation').first();

test.describe('v0.2.3 Блок 3 — эрх, системийн тохиргоо', () => {
  test('PIL-19: Кемп / HR эрхгүй хэрэглэгч — цэс харагдахгүй, хаягаар орвол «эрх алга»', async ({ page }) => {
    await loginAsUser(page, 'devReq');
    await expect(nav(page).getByRole('button', { name: 'Санал хүсэлт' })).toBeVisible();
    await expect(nav(page).getByRole('button', { name: 'Хүний нөөц', exact: true })).toHaveCount(0);
    await expect(nav(page).getByRole('button', { name: 'Кемп', exact: true })).toHaveCount(0);
    await expect(nav(page).getByRole('button', { name: 'Системийн тохиргоо', exact: true })).toHaveCount(0);

    await page.goto('/hr');
    await expect(page.getByText('Танд энэ хэсэгт хандах эрх алга. Админтай холбогдоно уу.')).toBeVisible();
    await page.goto('/camp');
    await expect(page.getByText('Танд энэ хэсэгт хандах эрх алга. Админтай холбогдоно уу.')).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByText('Системийн тохиргоо: энэ хэсэгт хандах эрх алга.')).toBeVisible({ timeout: 15_000 });
  });

  test('ADMIN: «Системийн тохиргоо» цэс → роль ба эрх; V2 эрх «удахгүй»; хуучин хаяг → /settings', async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin');
    await nav(page).getByRole('button', { name: 'Системийн тохиргоо', exact: true }).click();
    await page.waitForURL('**/settings/profile');
    const sections = page.getByRole('navigation', { name: 'Системийн тохиргоо' });
    for (const s of ['Роль ба эрх', 'Хэрэглэгчийн роль', 'Байгууллага', 'Орчуулга']) await expect(sections.getByRole('link', { name: s })).toBeVisible();
    await sections.getByRole('link', { name: 'Роль ба эрх', exact: true }).click();
    await page.waitForURL('**/settings/roles');

    // V2-05: зардлын тайлан, хоолны захиалга харагдана; хэрэгжээгүй модулийнх «удахгүй»
    await expect(page.getByText('Кемп › Зардлын тайлан харах')).toBeVisible();
    await expect(page.getByText('Кемп › Хоолны захиалга өгөх')).toBeVisible();
    await expect(page.getByText('удахгүй').first()).toBeVisible();
    // ADR-007: HR-ийн эрх шинэ кодоор, устгасан эрх алга
    await expect(page.getByText('hr.employee.manage', { exact: true })).toBeVisible();
    await expect(page.getByText('camp.roles.manage')).toHaveCount(0);

    await page.goto('/camp/admin/roles');
    await page.waitForURL('**/settings/roles');
    await page.goto('/camp/system/translations');
    await page.waitForURL('**/settings/translations');

    // «Кемпийн тохиргоо» — зөвхөн кемптэй холбоотой 3 хэсэг
    await page.goto('/camp/system');
    await expect(page.getByText('Кемпийн тохиргоо').first()).toBeVisible();
    const camp = page.getByRole('navigation', { name: 'Кемпийн тохиргоо' });
    for (const s of ['Кемпүүд', 'Байрны төрөл', 'Хөрөнгийн ангилал']) await expect(camp.getByRole('link', { name: s })).toBeVisible();
    await expect(camp.getByRole('link', { name: 'Роль ба эрх' })).toHaveCount(0);
  });

  test('PIL-18: аль хэдийн олгосон роль «олгогдсон» — идэвхгүй', async ({ page }) => {
    await loginAsUser(page, 'devUserAdmin');
    await page.goto('/settings/user-roles');
    const userSelect = page.getByLabel('Хэрэглэгч', { exact: true });
    const value = await userSelect.locator('option', { hasText: 'admin@test.mn' }).first().getAttribute('value');
    expect(value).toBeTruthy();
    await userSelect.selectOption(value as string);
    await page.getByLabel('Хамрах хүрээ', { exact: true }).selectOption('');
    const granted = page.getByLabel('Роль', { exact: true }).locator('option', { hasText: 'Кемп админ' });
    await expect(granted).toHaveText(/олгогдсон/);
    await expect(granted).toBeDisabled();

  });
});
