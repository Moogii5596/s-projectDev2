import { test, expect } from '@playwright/test';
import { createSubmittedMr, fixture, headersFor, url } from '../helpers/fixture';

/**
 * Multi-tenant тусгаарлалт (API) — Phase 6.1.2
 * Өмнө: `MULTI_TENANT_E2E` + гараар өгсөн `TENANT_B_TOKEN` шаарддаг тул бараг үргэлж skip болдог байв.
 * Одоо fixture-ийн A, B tenant (globalSetup) → skip-гүй.
 */
test.describe.serial('Multi-tenant тусгаарлалт (A ↔ B)', () => {
  let mrId = '';
  let defA = '';

  test.beforeAll(async ({ request }) => {
    mrId = await createSubmittedMr(request, 'aReq', { title: `${fixture().prefix} A MR`, amount: 10_000 });
    const defs = await request.get(url('/workflow/definitions'), { headers: headersFor('aAdmin') });
    expect(defs.status()).toBe(200);
    defA = ((await defs.json()) as { id: string }[])[0].id;
  });

  test('B: жагсаалтад A-ийн MR, definition алга', async ({ request }) => {
    const list = await request.get(url('/requisitions'), { headers: headersFor('bAdmin') });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.map((m) => m.id)).not.toContain(mrId);

    const defs = await request.get(url('/workflow/definitions'), { headers: headersFor('bAdmin') });
    expect(((await defs.json()) as { id: string }[]).map((d) => d.id)).not.toContain(defA);
  });

  test('B: A-ийн MR-г id-аар унших / засах / батлах / татгалзах → 404', async ({ request }) => {
    const h = { headers: headersFor('bAdmin') };
    expect((await request.get(url(`/requisitions/${mrId}`), h)).status()).toBe(404);
    expect((await request.put(url(`/requisitions/${mrId}`), { ...h, data: { title: 'hack' } })).status()).toBe(404);
    expect((await request.post(url(`/requisitions/${mrId}/approve`), { ...h, data: {} })).status()).toBe(404);
    expect((await request.post(url(`/requisitions/${mrId}/reject`), { ...h, data: { reason: 'x' } })).status()).toBe(404);
  });

  test('B ADMIN: A-ийн workflow definition засах → 404 [SEC-002]', async ({ request }) => {
    const r = await request.put(url(`/workflow/definitions/${defA}`), {
      headers: headersFor('bAdmin'),
      data: { name: 'hacked', stepsConfig: [{ order: 1, role: 'APPROVER', quorum: 1 }] },
    });
    expect(r.status()).toBe(404);
  });

  test('B-ийн хэрэглэгч A-ийн Host-оор → 403 (гишүүн биш) [SEC-001]', async ({ request }) => {
    const r = await request.get(url(`/requisitions/${mrId}`), { headers: headersFor('bReq', 'a') });
    expect(r.status()).toBe(403);
  });

  test('A-ийн APPROVER → APPROVED (A дотор хэвийн ажиллана)', async ({ request }) => {
    const r = await request.post(url(`/requisitions/${mrId}/approve`), { headers: headersFor('aAppr'), data: {} });
    expect(r.status()).toBe(200);
    expect(((await r.json()) as { status: string }).status).toBe('APPROVED');
  });
});
