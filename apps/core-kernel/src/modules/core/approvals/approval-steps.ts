import { UserRole } from '@prisma/client';

/**
 * v0.2.4 Блок 6 (WF-06) — батлах урсгалын алхам.
 *   - `permission` (ADR-007) — эрх тухайн объектын ажлын байранд (siteId) эсвэл tenant даяар. Шинэ урсгалд заавал.
 *   - `role` — v0.2.4-өөс өмнөх MR-ийн тодорхойлолт (UserRole). Зөвхөн уншина.
 *   - `quorum` — тухайн алхмыг дуусгах батлалтын тоо (≥2 = зэрэгцээ батлалт); алхмууд хооронд дараалсан.
 *   - `minAmount` / `maxAmount` — нөхцөл: объектын дүн хүрээнд бол алхам орно (instance үүсэхэд snapshot).
 */
export interface ApprovalStep {
  order: number;
  name?: string;
  permission?: string;
  role?: string;
  quorum: number;
  allowRequester?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

/** OWNER/ADMIN — аль ч алхмыг батлах эрхтэй (жижиг байгууллагад урсгал гацахаас сэргийлнэ; SLA escalation-ийн хүлээн авагч) */
export const APPROVAL_OVERRIDE_ROLES: readonly string[] = [UserRole.OWNER, UserRole.ADMIN];

/** workflow instance-гүй / алхамгүй хуучин MR — 1 алхам, APPROVER, quorum 1 */
export const LEGACY_STEPS: readonly ApprovalStep[] = [{ order: 0, role: UserRole.APPROVER, quorum: 1 }];

const num = (v: unknown): number | undefined => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

/** JSON → эрэмбэлсэн, шалгасан алхмууд (index = order дараалал). Хоосон/буруу бол `fallback`. */
export function normalizeApprovalSteps(raw: unknown, fallback: readonly ApprovalStep[] = LEGACY_STEPS): ApprovalStep[] {
  if (!Array.isArray(raw)) return [...fallback];
  const steps = raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
    .filter((s) => (typeof s.permission === 'string' && s.permission !== '') || (typeof s.role === 'string' && s.role !== ''))
    .filter((s) => Number.isFinite(Number(s.order ?? 0)))
    .map((s, i) => {
      const step: ApprovalStep = {
        order: Number(s.order ?? i),
        quorum: Number.isInteger(s.quorum) && (s.quorum as number) >= 1 ? (s.quorum as number) : 1,
      };
      if (typeof s.name === 'string' && s.name.trim()) step.name = s.name.trim();
      if (typeof s.permission === 'string' && s.permission) step.permission = s.permission;
      else step.role = String(s.role);
      if (s.allowRequester === true) step.allowRequester = true;
      const min = num(s.minAmount);
      const max = num(s.maxAmount);
      if (min !== undefined) step.minAmount = min;
      if (max !== undefined) step.maxAmount = max;
      return step;
    })
    .sort((a, b) => a.order - b.order);
  return steps.length > 0 ? steps : [...fallback];
}

/** Дүнгийн нөхцөлөөр алхам сонгох (дүн тодорхойгүй бол нөхцөлтэй алхам орно — аюулгүй тал) */
export function stepsForAmount(steps: readonly ApprovalStep[], amount: number | null | undefined): ApprovalStep[] {
  const out = steps.filter((s) => {
    if (amount === null || amount === undefined) return true;
    if (s.minAmount !== undefined && amount < s.minAmount) return false;
    if (s.maxAmount !== undefined && amount > s.maxAmount) return false;
    return true;
  });
  return out.length > 0 ? out : [steps[steps.length - 1]].filter(Boolean);
}

export interface ApprovalActorPerms {
  /** core_users.id */
  id: string;
  role: string;
  /** tenant даяарх эрх */
  global: readonly string[];
  /** siteId → эрх */
  bySite: Readonly<Record<string, readonly string[]>>;
}

/** Алхамд хэрэглэгч (өөрийн эрхээр) шийдэх эрхтэй эсэх — хүсэгчийн шалгалтаас бусад */
export function canActOnStep(actor: ApprovalActorPerms, step: ApprovalStep, siteId: string | null): boolean {
  if (APPROVAL_OVERRIDE_ROLES.includes(actor.role)) return true;
  if (step.permission) {
    if (actor.global.includes(step.permission)) return true;
    return siteId !== null && (actor.bySite[siteId]?.includes(step.permission) ?? false);
  }
  return !!step.role && actor.role === step.role;
}

/**
 * Шийдэх эрх: null = эрхтэй, string = i18n алдааны код.
 *   - хүсэгч өөрөө шийдэхгүй (OWNER/ADMIN ч гэсэн — үүргийн тусгаарлалт)
 */
export function approvalDenialCode(actor: ApprovalActorPerms, requesterId: string | null, step: ApprovalStep, siteId: string | null): string | null {
  if (!step.allowRequester && requesterId && actor.id === requesterId) return 'core.approvals.self';
  return canActOnStep(actor, step, siteId) ? null : 'core.approvals.step_permission';
}
