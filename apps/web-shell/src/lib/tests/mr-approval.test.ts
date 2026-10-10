import { describe, expect, it } from 'vitest'
import type { MrWorkflow } from '../../types/mr.types'
import { approvalState, roleLabel, stepViews } from '../mr-approval'

const wf = (over: Partial<MrWorkflow> = {}): MrWorkflow => ({
  instanceId: 'w1',
  status: 'PENDING',
  currentStep: 0,
  totalSteps: 2,
  steps: [
    { order: 1, role: 'APPROVER', quorum: 2 },
    { order: 2, role: 'ADMIN', quorum: 1 },
  ],
  approvals: [],
  ...over,
})
const mr = (over: Partial<{ status: string; requesterId: string; workflow: MrWorkflow }> = {}) => ({
  status: 'PENDING_APPROVAL',
  requesterId: 'req',
  workflow: wf(),
  ...over,
})

describe('approvalState [SEC-004] — backend approvalDenial-тэй ижил', () => {
  it('PENDING_APPROVAL биш / нэвтрээгүй → товчгүй, тайлбаргүй', () => {
    expect(approvalState(mr({ status: 'APPROVED' }), { id: 'a', role: 'ADMIN' })).toEqual({ canAct: false, reason: null })
    expect(approvalState(mr(), null)).toEqual({ canAct: false, reason: null })
  })

  it('MR үүсгэгч (ADMIN ч гэсэн) → батлахгүй', () => {
    expect(approvalState(mr(), { id: 'req', role: 'ADMIN' })).toMatchObject({ canAct: false, reason: expect.stringMatching(/Таны үүсгэсэн/) })
  })

  it('алхмын role эсвэл OWNER/ADMIN → батална; бусад → алхмын role-ийг нэрлэнэ', () => {
    expect(approvalState(mr(), { id: 'a', role: 'APPROVER' }).canAct).toBe(true)
    expect(approvalState(mr(), { id: 'a', role: 'OWNER' }).canAct).toBe(true)
    expect(approvalState(mr(), { id: 'a', role: 'VIEWER' })).toEqual({ canAct: false, reason: 'Энэ алхмыг Батлагч (APPROVER) батална' })
    const step2 = mr({ workflow: wf({ currentStep: 1 }) })
    expect(approvalState(step2, { id: 'a', role: 'APPROVER' })).toEqual({ canAct: false, reason: 'Энэ алхмыг Админ (ADMIN) батална' })
    expect(approvalState(step2, { id: 'a', role: 'ADMIN' }).canAct).toBe(true)
  })

  it('аль хэдийн баталсан хүн → дахин товч харуулахгүй', () => {
    const m = mr({ workflow: wf({ approvals: [{ stepIndex: 0, actorId: 'a', action: 'APPROVED', actedAt: '' }] }) })
    expect(approvalState(m, { id: 'a', role: 'APPROVER' })).toMatchObject({ canAct: false, reason: expect.stringMatching(/баталсан/) })
    expect(approvalState(m, { id: 'b', role: 'APPROVER' }).canAct).toBe(true)
  })
})

describe('stepViews', () => {
  it('quorum явц: 1/2 → current; дараагийнх waiting', () => {
    const v = stepViews(wf({ approvals: [{ stepIndex: 0, actorId: 'a', action: 'APPROVED', actedAt: '' }] }), 'PENDING_APPROVAL')
    expect(v.map((s) => [s.state, s.approved])).toEqual([
      ['current', 1],
      ['waiting', 0],
    ])
  })

  it('батлагдсан → бүгд done; 2-р алхамд татгалзсан → rejected', () => {
    expect(stepViews(wf({ status: 'APPROVED', currentStep: 2 }), 'APPROVED').map((s) => s.state)).toEqual(['done', 'done'])
    const rej = wf({ status: 'REJECTED', currentStep: 1, approvals: [{ stepIndex: 1, actorId: 'x', action: 'REJECTED', actedAt: '' }] })
    expect(stepViews(rej, 'REJECTED').map((s) => s.state)).toEqual(['done', 'rejected'])
  })

  it('LEGACY (instance-гүй) PENDING_APPROVAL → current; APPROVED → done', () => {
    const legacy = wf({ instanceId: null, status: 'LEGACY', totalSteps: 1, steps: [{ order: 0, role: 'APPROVER', quorum: 1 }] })
    expect(stepViews(legacy, 'PENDING_APPROVAL')[0].state).toBe('current')
    expect(stepViews(legacy, 'APPROVED')[0].state).toBe('done')
  })

  it('roleLabel: мэдэгдэхгүй role → өөрөө', () => {
    expect(roleLabel('APPROVER')).toBe('Батлагч')
    expect(roleLabel('BOSS')).toBe('BOSS')
  })
})
