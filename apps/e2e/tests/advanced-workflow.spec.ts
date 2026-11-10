import { test, expect } from '@playwright/test';
import { createSubmittedMr, fixture, headersFor, url } from '../helpers/fixture';

/**
 * Олон алхамт батлалт + төсөв (API) — Phase 6.1.3 [SEC-004]
 * wf tenant (fixture-д definition-гүй): ADMIN API-аар definition + төсөв үүсгэнэ.
 *   < 1,000,000 → [APPROVER]
 *   ≥ 1,000,000 → [APPROVER] → [ADMIN]
 */
const RULES = {
  amount_rules: [
    { min: 0, max: 1_000_000, steps: [{ order: 1, role: 'APPROVER', quorum: 1 }] },
    {
      min: 1_000_000,
      max: null,
      steps: [
        { order: 1, role: 'APPROVER', quorum: 1 },
        { order: 2, role: 'ADMIN', quorum: 1 },
      ],
    },
  ],
};

interface MrBody {
  status: string;
  workflow: { status: string; currentStep: number; totalSteps: number };
}
interface Allocation {
  department: string;
  committedAmount: string;
  spentAmount: string;
}

let approvalDepartment = '';

test.describe.serial('Олон алхамт батлалт + төсөв (wf tenant)', () => {
  const approve = (request: import('@playwright/test').APIRequestContext, who: Parameters<typeof headersFor>[0], id: string) =>
    request.post(url(`/requisitions/${id}/approve`), { headers: headersFor(who), data: {} });
  const allocation = async (request: import('@playwright/test').APIRequestContext, department = 'IT') => {
    const r = await request.get(url('/budget/allocations'), { headers: headersFor('wfAdmin') });
    expect(r.status()).toBe(200);
    return ((await r.json()) as Allocation[]).find((a) => a.department === department)!;
  };
  const createAllocation = async (request: import('@playwright/test').APIRequestContext, department: string) => {
    const h = { headers: headersFor('wfAdmin') };
    const p = await request.post(url('/budget/periods'), {
      ...h,
      data: { name: `${fixture().prefix} ${department}`, periodType: 'ANNUAL', startDate: '2000-01-01', endDate: '2099-12-31' },
    });
    expect(p.status()).toBe(201);
    const periodId = ((await p.json()) as { id: string }).id;
    const a = await request.post(url('/budget/allocations'), {
      ...h,
      data: { periodId, department, totalAmount: 20_000_000 },
    });
    expect(a.status()).toBe(201);
  };

  test('definition: APPROVER → 403, буруу body → 400, ADMIN → 201', async ({ request }) => {
    const body = { name: `${fixture().prefix} amount`, stepsConfig: RULES, slaHours: 24 };
    expect((await request.post(url('/workflow/definitions'), { headers: headersFor('wfAppr1'), data: body })).status()).toBe(403);
    const bad = await request.post(url('/workflow/definitions'), {
      headers: headersFor('wfAdmin'),
      data: { name: 'x', stepsConfig: [{ order: 1, role: 'BOSS' }] },
    });
    expect(bad.status()).toBe(400);
    expect((await request.post(url('/workflow/definitions'), { headers: headersFor('wfAdmin'), data: body })).status()).toBe(201);
  });

  test('төсөв: ADMIN хугацаа + IT хуваарилалт 20,000,000', async ({ request }) => {
    await createAllocation(request, 'IT');
  });

  test('5,000,000: өөрийгөө → 403; APPROVER → 2/2; APPROVER 2-р алхамд → 403; ADMIN → APPROVED; төсөв SPENT', async ({ request }) => {
    approvalDepartment = `WF-${fixture().stamp}-${Date.now()}`;
    await createAllocation(request, approvalDepartment);
    const id = await createSubmittedMr(request, 'wfReq', { title: `${fixture().prefix} big`, amount: 5_000_000, department: approvalDepartment });
    expect(Number((await allocation(request, approvalDepartment)).committedAmount)).toBe(5_000_000);

    const self = await approve(request, 'wfReq', id);
    expect(self.status()).toBe(403);

    const s1 = await approve(request, 'wfAppr1', id);
    expect(s1.status()).toBe(200);
    expect((await s1.json()) as MrBody).toMatchObject({ status: 'PENDING_APPROVAL', workflow: { currentStep: 1, totalSteps: 2 } });

    const wrong = await approve(request, 'wfAppr2', id);
    expect(wrong.status()).toBe(403);
    expect(((await wrong.json()) as { message: string }).message).toBe('Энэ алхмыг шийдэх эрх танд алга');

    const s2 = await approve(request, 'wfAdmin', id);
    expect(s2.status()).toBe(200);
    expect((await s2.json()) as MrBody).toMatchObject({ status: 'APPROVED', workflow: { status: 'APPROVED', currentStep: 2 } });

    const a = await allocation(request, approvalDepartment);
    expect(Number(a.spentAmount)).toBe(5_000_000);
    expect(Number(a.committedAmount)).toBe(0);
  });

  test('2,000,000: 2-р алхамд ADMIN татгалзана → REJECTED, төсөв RELEASED', async ({ request }) => {
    const id = await createSubmittedMr(request, 'wfReq', { title: `${fixture().prefix} rej`, amount: 2_000_000, department: approvalDepartment });
    expect((await approve(request, 'wfAppr2', id)).status()).toBe(200);
    const r = await request.post(url(`/requisitions/${id}/reject`), { headers: headersFor('wfAdmin'), data: { reason: 'төсөв хэтэрнэ' } });
    expect(r.status()).toBe(200);
    expect((await r.json()) as MrBody).toMatchObject({ status: 'REJECTED', workflow: { status: 'REJECTED' } });
    const a = await allocation(request, approvalDepartment);
    expect(Number(a.committedAmount)).toBe(0);
    expect(Number(a.spentAmount)).toBe(5_000_000);
  });

  test('300,000: 1 алхам — APPROVER → APPROVED', async ({ request }) => {
    const id = await createSubmittedMr(request, 'wfReq', { title: `${fixture().prefix} small`, amount: 300_000, department: 'IT' });
    const r = await approve(request, 'wfAppr2', id);
    expect(r.status()).toBe(200);
    expect((await r.json()) as MrBody).toMatchObject({ status: 'APPROVED', workflow: { currentStep: 1, totalSteps: 1 } });
  });
});
