import { UserRole } from '@prisma/client';

/**
 * Phase 6.0b [SEC-004] — MR батлалтын цэвэр логик (DB-гүй, unit тестлэгдэнэ).
 *
 * Өмнө: `POST /requisitions/:id/approve` нь role, өөрийгөө батлах, workflow алхмыг ШАЛГАЛГҮЙ
 * MR-г шууд APPROVED болгодог байв (amount_rules-ийн олон алхам үл тоомсорлогдож,
 * workflow instance/SLA PENDING хэвээр үлддэг).
 */

export interface ApprovalStep {
  order: number;
  role: string;
  quorum: number;
}

/** Алхмын role-оос гадна ямар ч алхмыг батлах эрхтэй (жижиг байгууллагад MR гацахаас сэргийлнэ) — шийдвэр А */
export const APPROVAL_OVERRIDE_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN];

/**
 * workflow instance-гүй / алхамгүй хуучин MR (энэ засвараас өмнө илгээгдсэн, seed) —
 * өмнөх зан төлөвтэй ойролцоо: 1 алхам, APPROVER (+ OWNER/ADMIN), quorum 1.
 */
export const LEGACY_STEPS: readonly ApprovalStep[] = [{ order: 0, role: UserRole.APPROVER, quorum: 1 }];

/** resolved_steps (JSON) → эрэмбэлсэн, шалгасан алхмууд; хоосон/буруу бол LEGACY_STEPS */
export function normalizeSteps(raw: unknown): ApprovalStep[] {
  if (!Array.isArray(raw)) return [...LEGACY_STEPS];
  const steps = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
    .filter((s) => typeof s.role === 'string' && s.role !== '' && Number.isFinite(Number(s.order)))
    .map((s) => ({
      order: Number(s.order),
      role: String(s.role),
      quorum: Number.isInteger(s.quorum) && (s.quorum as number) >= 1 ? (s.quorum as number) : 1,
    }))
    .sort((a, b) => a.order - b.order);
  return steps.length > 0 ? steps : [...LEGACY_STEPS];
}

export interface ApprovalActor {
  id: string; // core_users.id
  role: string;
}

/**
 * Тухайн алхамд батлах/татгалзах эрх. null = эрхтэй, string = 403-ийн монгол мессеж.
 * - MR үүсгэгч өөрөө батлах/татгалзахгүй (OWNER/ADMIN ч гэсэн)
 * - Алхмын role эсвэл OWNER/ADMIN
 */
export function approvalDenial(actor: ApprovalActor, requesterId: string, step: ApprovalStep): string | null {
  if (actor.id === requesterId) return 'Өөрийн үүсгэсэн MR-г батлах/татгалзах боломжгүй';
  if (actor.role === step.role || APPROVAL_OVERRIDE_ROLES.includes(actor.role)) return null;
  return `Энэ алхамд ${step.role} эрх шаардлагатай`;
}

/** Алхам дууссан эсэх (тухайн алхмын APPROVED тоо ≥ quorum) */
export const quorumReached = (approvedCount: number, step: ApprovalStep): boolean => approvedCount >= step.quorum;

export interface StepLogLike {
  stepOrder: number; // алхмын индекс (workflow_step_logs.step_order = instance.current_step)
  actorId: string;
  action: string;
  actedAt: Date | string;
}

/** API хариу / frontend-д: workflow-ийн одоогийн байдал */
export interface MrWorkflowSummary {
  instanceId: string | null;
  status: string; // PENDING | APPROVED | REJECTED | LEGACY
  /** 0-ээс эхэлсэн индекс; дууссан бол totalSteps */
  currentStep: number;
  totalSteps: number;
  steps: ApprovalStep[];
  approvals: { stepIndex: number; actorId: string; action: string; actedAt: string }[];
}

export function summarizeWorkflow(
  instance: { id: string; status: string; currentStep: number; resolvedSteps: unknown; stepLogs?: StepLogLike[] } | null,
): MrWorkflowSummary {
  if (!instance) {
    return { instanceId: null, status: 'LEGACY', currentStep: 0, totalSteps: LEGACY_STEPS.length, steps: [...LEGACY_STEPS], approvals: [] };
  }
  const steps = normalizeSteps(instance.resolvedSteps);
  return {
    instanceId: instance.id,
    status: instance.status,
    currentStep: Math.min(Math.max(instance.currentStep, 0), steps.length),
    totalSteps: steps.length,
    steps,
    approvals: (instance.stepLogs ?? []).map((l) => ({
      stepIndex: l.stepOrder,
      actorId: l.actorId,
      action: l.action,
      actedAt: new Date(l.actedAt).toISOString(),
    })),
  };
}
