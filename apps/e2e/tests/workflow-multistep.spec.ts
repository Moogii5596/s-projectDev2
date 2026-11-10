import { test, expect, type Browser, type Page } from '@playwright/test';
import { createSubmittedMr, fixture, loginAsUser, type FixtureUserKey } from '../helpers/fixture';

/**
 * Multi-level approval workflow (UI, DEV tenant) — Phase 6.1.5 [SEC-004]
 * DEV tenant-ийн "Default Advanced Approval" (seed.sql): 1,000,000–10,000,000 → APPROVER → APPROVER.
 * UI-д нэгж үнийн талбар алга тул 5,000,000₮ MR-г API-аар үүсгэж илгээнэ; батлалтыг UI-аар.
 */
async function pageAs(browser: Browser, key: FixtureUserKey): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAsUser(page, key);
  return page;
}

test.describe('Multi-level Approval Workflow', () => {
  test('2 алхам: үүсгэгч товчгүй → APPROVER 1 → "Алхам 2/2" → APPROVER 2 → Батлагдсан', async ({ browser, request }) => {
    const id = await createSubmittedMr(request, 'devReq', { title: `${fixture().prefix} WF 5M`, amount: 5_000_000 });

    const req = await pageAs(browser, 'devReq');
    await req.goto(`/requisitions/${id}`);
    await expect(req.getByText('Алхам 1/2')).toBeVisible();
    await expect(req.getByText('Таны үүсгэсэн MR — батлагчийг хүлээж байна')).toBeVisible();
    await expect(req.getByRole('main').getByRole('button', { name: /батлах/i })).toHaveCount(0);

    const a1 = await pageAs(browser, 'devAppr1');
    await a1.goto(`/requisitions/${id}`);
    await a1.getByRole('main').getByRole('button', { name: /батлах/i }).click();
    await expect(a1.getByText('Алхам 2/2')).toBeVisible({ timeout: 5_000 });
    await expect(a1.getByTestId('mr-step-0')).toHaveAttribute('data-state', 'done');
    await expect(a1.getByText(/Та энэ MR-г баталсан/)).toBeVisible();
    await expect(a1.getByRole('main').getByRole('button', { name: /батлах/i })).toHaveCount(0);

    const a2 = await pageAs(browser, 'devAppr2');
    await a2.goto(`/requisitions/${id}`);
    await a2.getByRole('main').getByRole('button', { name: /батлах/i }).click();
    await expect(a2.getByText('Батлагдсан', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(a2.getByTestId('mr-step-1')).toHaveAttribute('data-state', 'done');
    // Approve хийсний дараа дахин approve/reject хийж болохгүй
    await expect(a2.getByRole('main').getByRole('button', { name: /батлах/i })).toHaveCount(0);
    await expect(a2.getByRole('main').getByRole('button', { name: /reject|татгалзах/i })).toHaveCount(0);
  });

  test('Workflow Engine health check (API)', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/v1/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});
