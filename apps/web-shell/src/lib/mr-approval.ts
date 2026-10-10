/**
 * Phase 6.0b [SEC-004] — MR дэлгэрэнгүйд "Батлах / Татгалзах" харуулах эсэх (цэвэр функц).
 * Backend-ийн `approvalDenial` (mr-approval.ts)-тэй ИЖИЛ дүрэм. Энэ нь зөвхөн UX —
 * жинхэнэ хамгаалалт backend-ийн 403.
 */
import type { MrWorkflow } from '../types/mr.types'

/** Алхмын role-оос гадна ямар ч алхмыг батлах эрхтэй (backend APPROVAL_OVERRIDE_ROLES) */
export const APPROVAL_OVERRIDE_ROLES: readonly string[] = ['OWNER', 'ADMIN']

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Эзэмшигч',
  ADMIN: 'Админ',
  APPROVER: 'Батлагч',
  REQUESTER: 'Хүсэгч',
  VIEWER: 'Үзэгч',
}
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? role

export interface ApprovalState {
  canAct: boolean
  /** canAct=false үед харуулах тайлбар (null = юу ч харуулахгүй) */
  reason: string | null
}

export function approvalState(
  mr: { status: string; requesterId: string; workflow?: MrWorkflow | null },
  me: { id: string; role: string } | null,
): ApprovalState {
  if (mr.status !== 'PENDING_APPROVAL') return { canAct: false, reason: null }
  if (!me) return { canAct: false, reason: null }
  if (me.id === mr.requesterId) return { canAct: false, reason: 'Таны үүсгэсэн MR — батлагчийг хүлээж байна' }
  const wf = mr.workflow
  if (!wf) return { canAct: true, reason: null } // хуучин API хариу — backend шийднэ
  if (wf.approvals.some((a) => a.actorId === me.id && a.action === 'APPROVED')) {
    return { canAct: false, reason: 'Та энэ MR-г баталсан — дараагийн батлагчийг хүлээж байна' }
  }
  const step = wf.steps[wf.currentStep]
  if (!step) return { canAct: false, reason: null }
  if (me.role === step.role || APPROVAL_OVERRIDE_ROLES.includes(me.role)) return { canAct: true, reason: null }
  return { canAct: false, reason: `Энэ алхмыг ${roleLabel(step.role)} (${step.role}) батална` }
}

export type StepView = { index: number; role: string; quorum: number; approved: number; state: 'done' | 'current' | 'waiting' | 'rejected' }

/** Алхам бүрийн төлөв (progress-д). MR-ийн статусыг тооцно (хуучин/LEGACY MR-д instance алга) */
export function stepViews(wf: MrWorkflow, mrStatus: string): StepView[] {
  return wf.steps.map((s, index) => {
    const approved = wf.approvals.filter((a) => a.stepIndex === index && a.action === 'APPROVED').length
    const rejectedHere = wf.approvals.some((a) => a.stepIndex === index && a.action === 'REJECTED')
    let state: StepView['state']
    if (rejectedHere) state = 'rejected'
    else if (mrStatus === 'APPROVED' || index < wf.currentStep) state = 'done'
    else if (mrStatus === 'PENDING_APPROVAL' && index === wf.currentStep) state = 'current'
    else state = 'waiting'
    return { index, role: s.role, quorum: s.quorum, approved, state }
  })
}
