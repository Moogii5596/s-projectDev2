/**
 * Phase 6.0b [SEC-004] — MR батлалтын цэвэр логик
 */
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_OVERRIDE_ROLES,
  LEGACY_STEPS,
  approvalDenial,
  normalizeSteps,
  quorumReached,
  summarizeWorkflow,
} from '../mr-approval';

const REQ = 'req-1';
const step = (role: string, quorum = 1, order = 1) => ({ order, role, quorum });

describe('normalizeSteps', () => {
  it('order-оор эрэмбэлнэ; quorum байхгүй/буруу → 1', () => {
    expect(
      normalizeSteps([
        { order: 2, role: 'ADMIN' },
        { order: 1, role: 'APPROVER', quorum: 2 },
        { order: 3, role: 'APPROVER', quorum: 0 },
      ]),
    ).toEqual([
      { order: 1, role: 'APPROVER', quorum: 2 },
      { order: 2, role: 'ADMIN', quorum: 1 },
      { order: 3, role: 'APPROVER', quorum: 1 },
    ]);
  });

  it('null / хоосон / буруу мөр → LEGACY (1 алхам APPROVER)', () => {
    expect(normalizeSteps(null)).toEqual(LEGACY_STEPS);
    expect(normalizeSteps([])).toEqual(LEGACY_STEPS);
    expect(normalizeSteps([null, 'x', { order: 'a', role: 'APPROVER' }, { order: 1, role: '' }])).toEqual(LEGACY_STEPS);
    expect(normalizeSteps({ amount_rules: [] })).toEqual(LEGACY_STEPS);
  });
});

describe('approvalDenial [SEC-004]', () => {
  it('MR үүсгэгч өөрөө — OWNER/ADMIN байсан ч хориглоно', () => {
    for (const role of ['REQUESTER', 'APPROVER', 'ADMIN', 'OWNER']) {
      expect(approvalDenial({ id: REQ, role }, REQ, step('APPROVER'))).toMatch(/Өөрийн/);
    }
  });

  it('алхмын role → зөвшөөрнө; OWNER/ADMIN → ямар ч алхамд зөвшөөрнө (шийдвэр А)', () => {
    expect(approvalDenial({ id: 'a', role: 'APPROVER' }, REQ, step('APPROVER'))).toBeNull();
    expect(APPROVAL_OVERRIDE_ROLES).toEqual(['OWNER', 'ADMIN']);
    expect(approvalDenial({ id: 'a', role: 'ADMIN' }, REQ, step('APPROVER'))).toBeNull();
    expect(approvalDenial({ id: 'a', role: 'OWNER' }, REQ, step('APPROVER'))).toBeNull();
  });

  it('бусад role → алхмын role-ийг нэрлэсэн мессеж', () => {
    for (const role of ['REQUESTER', 'VIEWER']) {
      expect(approvalDenial({ id: 'a', role }, REQ, step('APPROVER'))).toBe('Энэ алхамд APPROVER эрх шаардлагатай');
    }
    expect(approvalDenial({ id: 'a', role: 'APPROVER' }, REQ, step('ADMIN'))).toBe('Энэ алхамд ADMIN эрх шаардлагатай');
  });
});

describe('quorumReached', () => {
  it('тоо ≥ quorum', () => {
    expect(quorumReached(1, step('APPROVER', 2))).toBe(false);
    expect(quorumReached(2, step('APPROVER', 2))).toBe(true);
    expect(quorumReached(1, step('APPROVER'))).toBe(true);
  });
});

describe('summarizeWorkflow', () => {
  it('instance-гүй → LEGACY', () => {
    expect(summarizeWorkflow(null)).toMatchObject({ instanceId: null, status: 'LEGACY', currentStep: 0, totalSteps: 1 });
  });

  it('алхам, батлалтууд; currentStep-ийг [0, totalSteps]-д хязгаарлана', () => {
    const at = new Date('2026-10-10T10:00:00Z');
    const s = summarizeWorkflow({
      id: 'w1',
      status: 'PENDING',
      currentStep: 1,
      resolvedSteps: [step('APPROVER', 1, 1), step('ADMIN', 1, 2)],
      stepLogs: [{ stepOrder: 0, actorId: 'u1', action: 'APPROVED', actedAt: at }],
    });
    expect(s).toEqual({
      instanceId: 'w1',
      status: 'PENDING',
      currentStep: 1,
      totalSteps: 2,
      steps: [step('APPROVER', 1, 1), step('ADMIN', 1, 2)],
      approvals: [{ stepIndex: 0, actorId: 'u1', action: 'APPROVED', actedAt: at.toISOString() }],
    });
    expect(summarizeWorkflow({ id: 'w', status: 'APPROVED', currentStep: 9, resolvedSteps: [step('APPROVER')] }).currentStep).toBe(1);
    expect(summarizeWorkflow({ id: 'w', status: 'PENDING', currentStep: -1, resolvedSteps: [step('APPROVER')] }).currentStep).toBe(0);
  });
});
