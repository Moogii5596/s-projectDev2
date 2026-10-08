import { test, expect } from '@playwright/test';

/**
 * Multi-tenant RLS тусгаарлалтын E2E тест.
 * Tenant A-ийн MR Tenant B-д харагдахгүй байх ёстой (RLS баталгаа).
 *
 * NOTE: Энэ тест 2 tenant байхыг шаардана — CI орчинд seed хийгдсэн байх ёстой.
 * Локал dev-д нэг tenant ашигладаг тул тест skip болно.
 */

const TENANT_A = {
  email: 'admin@test.mn',
  password: 'test1234',
  host: 'http://localhost:5173',
};

test.describe('Multi-tenant RLS тусгаарлалт', () => {
  test.skip(!process.env['MULTI_TENANT_E2E'], 'MULTI_TENANT_E2E env set хийгдээгүй бол skip');

  test('Tenant A MR Tenant B API-аар харагдахгүй', async ({ request }) => {
    // 1. Tenant A-аар нэвтрэх, MR үүсгэх
    const loginA = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: { email: TENANT_A.email, password: TENANT_A.password },
      headers: { host: 'test-tenant.localhost' },
    });
    expect(loginA.ok()).toBeTruthy();
    const { accessToken: tokenA } = await loginA.json() as { accessToken: string };

    const createRes = await request.post('http://localhost:3000/api/v1/requisitions', {
      data: { title: `Tenant A MR ${Date.now()}`, items: [] },
      headers: {
        Authorization: `Bearer ${tokenA}`,
        host: 'test-tenant.localhost',
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const { id: mrId } = await createRes.json() as { id: string };

    // 2. Tenant B-ийн токеноор тухайн MR руу хандах → 403/404 хүлээнэ
    const tenantBToken = process.env['TENANT_B_TOKEN'] ?? '';
    const fetchRes = await request.get(`http://localhost:3000/api/v1/requisitions/${mrId}`, {
      headers: {
        Authorization: `Bearer ${tenantBToken}`,
        host: 'tenant-b.localhost',
      },
    });
    // RLS-ийн улмаас 403 эсвэл 404 буцна
    expect([403, 404]).toContain(fetchRes.status());
  });

  test('Tenant A жагсаалтад зөвхөн өөрийн MR харагдана', async ({ request }) => {
    const loginA = await request.post('http://localhost:3000/api/v1/auth/login', {
      data: { email: TENANT_A.email, password: TENANT_A.password },
      headers: { host: 'test-tenant.localhost' },
    });
    const { accessToken: tokenA } = await loginA.json() as { accessToken: string };

    const listRes = await request.get('http://localhost:3000/api/v1/requisitions', {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        host: 'test-tenant.localhost',
      },
    });
    expect(listRes.ok()).toBeTruthy();
    const data = await listRes.json() as { items: Array<{ tenantId: string }> };
    // Бүх MR test-tenant-д харьяалагдана
    for (const mr of data.items) {
      expect(mr.tenantId).toBe('00000000-0000-0000-0000-000000000003');
    }
  });
});
