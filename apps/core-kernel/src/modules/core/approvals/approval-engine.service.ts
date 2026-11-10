import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { badRequest, conflict, forbidden, notFound } from '../../../common/i18n/app-error';
import { NotificationService } from '../notifications/notification.service';
import { usersWithPermission } from '../notifications/permission-recipients';
import { ApprovalEntityRegistry, type ApprovalDecision } from './approval-entity.registry';
import {
  APPROVAL_OVERRIDE_ROLES,
  approvalDenialCode,
  canActOnStep,
  normalizeApprovalSteps,
  stepsForAmount,
  type ApprovalActorPerms,
  type ApprovalStep,
} from './approval-steps';

type Tx = Prisma.TransactionClient;

export interface StartApprovalInput {
  entityType: string;
  entityId: string;
  /** core_users.id */
  requesterId: string | null;
  siteId?: string | null;
  amount?: number | null;
  title: string;
  /** Апп доторх зам — мэдэгдэл, «Миний батлах»-аас нээх */
  link: string;
  /** Тодорхойлолтоос бус, дуудагч тооцсон алхмууд (хуучин MR-ийн amount_rules) */
  steps?: ApprovalStep[];
  /** Энэ хүсэлтийн requester тухайн алхамд өөрөө шийдвэр гаргаж болох эсэх */
  allowRequester?: boolean;
}

export interface DecideInput {
  instanceId: string;
  /** core_users.id */
  actorId: string;
  action: ApprovalDecision;
  comment?: string | null;
}

export interface DecideResult {
  /** false = idempotent (өмнө нь ижил шийдвэр гаргасан) */
  changed: boolean;
  final: boolean;
  status: 'PENDING' | ApprovalDecision;
  currentStep: number;
  totalSteps: number;
}

interface InstanceRow {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step: number;
  resolved_steps: unknown;
  requester_id: string | null;
  site_id: string | null;
  title: string | null;
  link: string | null;
  sla_hours: number;
  delegation_enabled: boolean;
}

/** Хуучин (v0.2.4-өөс өмнөх) MR тодорхойлолт entity_type = NULL */
export const LEGACY_ENTITY_TYPE = 'MATERIAL_REQUISITION';

/**
 * v0.2.4 Блок 6 (WF-06) — батлах урсгалын нэгдсэн хөдөлгүүр (цөм). Бүх метод ДУУДАГЧИЙН tenant transaction дотор
 * ажиллана — объектын өөрчлөлт, урсгалын алхам, мэдэгдэл нэг commit.
 *   - Зэрэгцээ шийдвэр: instance мөрийг `FOR UPDATE` түгжинэ (quorum давхар тоологдохгүй)
 *   - Idempotent: ижил хүн ижил алхамд ижил шийдвэр → changed=false
 *   - Орлон гүйцэтгэгч: идэвхтэй delegation-ий эзэн алхмын эрхтэй бол delegate түүний өмнөөс шийднэ (хүрээ = эзнийх)
 *   - SLA: алхам бүрт эрхтэй эхний хэрэглэгчид `workflow_sla_logs`; хэтэрвэл `ApprovalSlaScheduler` (алхам алгасахгүй — WF-01)
 */
@Injectable()
export class ApprovalEngineService {
  private readonly logger = new Logger(ApprovalEngineService.name);

  constructor(
    private readonly registry: ApprovalEntityRegistry,
    private readonly notifications: NotificationService,
  ) {}

  async start(tx: Tx, tenantId: string, input: StartApprovalInput) {
    const handler = this.registry.get(input.entityType);
    if (!handler) throw new Error(`Бүртгэлгүй approval entity type: ${input.entityType}`);
    let definition = await this.activeDefinition(tx, tenantId, input.entityType);
    if (!definition && handler.defaultSteps?.length) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`approval-default:${tenantId}:${input.entityType}`}))`;
      definition = await this.activeDefinition(tx, tenantId, input.entityType);
      if (!definition) {
        const latest = await tx.workflowDefinition.findFirst({
          where: { tenantId, entityType: input.entityType },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        definition = await tx.workflowDefinition.create({
          data: {
            tenantId,
            entityType: input.entityType,
            version: (latest?.version ?? 0) + 1,
            name: `${input.entityType} — default`,
            stepsConfig: handler.defaultSteps.map((step, order) => ({ ...step, order })) as Prisma.InputJsonValue,
            slaHours: 48,
            isActive: true,
            createdBy: input.requesterId,
          },
        });
      }
    }
    if (!definition) throw badRequest('core.approvals.no_definition', { entity: input.entityType });

    const amount = input.amount ?? null;
    const configuredSteps = input.steps ?? stepsForAmount(normalizeApprovalSteps(definition.stepsConfig), amount);
    const steps = configuredSteps.map((configuredStep, i) => {
      const step = { ...configuredStep };
      delete step.allowRequester;
      return { ...step, order: i, ...(input.allowRequester && i === 0 ? { allowRequester: true } : {}) };
    });
    const instance = await tx.workflowInstance.create({
      data: {
        tenantId,
        definitionId: definition.id,
        entityType: input.entityType,
        entityId: input.entityId,
        currentStep: 0,
        status: 'PENDING',
        resolvedSteps: steps as unknown as Prisma.InputJsonValue,
        requesterId: input.requesterId,
        siteId: input.siteId ?? null,
        title: input.title.slice(0, 300),
        link: input.link,
        amount: amount === null ? null : new Prisma.Decimal(amount),
      },
    });
    const approvers = await this.eligibleUsers(tx, tenantId, steps[0], input.siteId ?? null, input.requesterId);
    await this.assignSla(tx, tenantId, instance.id, 0, approvers, definition.slaHours);
    await this.notifyApprovers(tx, tenantId, approvers, input.requesterId, {
      instanceId: instance.id, labelKey: handler.labelKey, title: input.title, link: input.link,
    });
    return instance;
  }

  async decide(tx: Tx, tenantId: string, input: DecideInput): Promise<DecideResult> {
    const row = await this.lock(tx, tenantId, input.instanceId);
    const steps = normalizeApprovalSteps(row.resolved_steps);
    const totalSteps = steps.length;

    // Idempotency — төлөв шалгахаас өмнө (давхар товшилт 200)
    const repeat = await tx.workflowStepLog.findFirst({
      where: { tenantId, instanceId: row.id, actorId: input.actorId, action: input.action, stepOrder: Math.min(row.current_step, totalSteps - 1) },
      select: { id: true },
    });
    if (repeat && (row.status !== 'PENDING' || input.action === 'APPROVED')) {
      return { changed: false, final: row.status !== 'PENDING', status: row.status as DecideResult['status'], currentStep: row.current_step, totalSteps };
    }

    if (row.status !== 'PENDING') throw conflict('core.approvals.not_pending');
    const step = steps[row.current_step];
    if (!step) throw conflict('core.approvals.not_pending');

    const onBehalfOf = await this.authorize(tx, tenantId, input.actorId, row, step);
    // Нэг хүн өмнөх алхмыг баталсан бол дараагийн алхмыг батлахгүй (үүргийн тусгаарлалт)
    const who = onBehalfOf ?? input.actorId;
    const earlier = await tx.workflowStepLog.count({
      where: { tenantId, instanceId: row.id, action: 'APPROVED', stepOrder: { lt: row.current_step }, OR: [{ actorId: who, onBehalfOf: null }, { onBehalfOf: who }] },
    });
    if (earlier > 0) throw forbidden('core.approvals.already_acted');
    const handler = this.registry.get(row.entity_type);
    const comment = input.comment?.trim() ? input.comment.trim().slice(0, 2000) : null;

    await tx.workflowStepLog.create({
      data: { tenantId, instanceId: row.id, stepOrder: row.current_step, actorId: input.actorId, onBehalfOf, action: input.action, comment },
    });

    let status: DecideResult['status'] = 'PENDING';
    let nextStep = row.current_step;
    if (input.action === 'REJECTED') {
      status = 'REJECTED';
    } else {
      const approvals = await tx.workflowStepLog.findMany({
        where: { tenantId, instanceId: row.id, stepOrder: row.current_step, action: 'APPROVED' },
        select: { actorId: true, onBehalfOf: true },
      });
      // Нэг хүн (өөрөө + орлон) нэг л тоологдоно
      const distinct = new Set(approvals.map((a) => a.onBehalfOf ?? a.actorId));
      if (distinct.size >= step.quorum) {
        nextStep = row.current_step + 1;
        if (nextStep >= totalSteps) status = 'APPROVED';
      }
    }

    const final = status !== 'PENDING';
    const advanced = nextStep !== row.current_step;
    if (final || advanced) await this.completeSla(tx, tenantId, row.id);
    if (final) {
      await tx.workflowInstance.update({
        where: { id: row.id },
        data: { status, currentStep: status === 'APPROVED' ? totalSteps : row.current_step, decidedAt: new Date(), lockedBy: null, lockedAt: null },
      });
    } else if (advanced) {
      await tx.workflowInstance.update({ where: { id: row.id }, data: { currentStep: nextStep, lockedBy: null, lockedAt: null } });
      const approvers = await this.eligibleUsers(tx, tenantId, steps[nextStep], row.site_id, row.requester_id);
      await this.assignSla(tx, tenantId, row.id, nextStep, approvers, row.sla_hours);
      await this.notifyApprovers(tx, tenantId, approvers, row.requester_id, {
        instanceId: row.id, labelKey: handler?.labelKey ?? row.entity_type, title: row.title ?? '', link: row.link,
      });
    }

    const ctx = {
      tenantId, entityId: row.entity_id, instanceId: row.id, actorId: input.actorId, onBehalfOf,
      action: input.action, comment, final, status,
    };
    await handler?.onStep?.(tx, ctx);
    if (final) {
      await handler?.onFinal?.(tx, ctx);
      if (row.requester_id) {
        const actor = await tx.coreUser.findFirst({ where: { tenantId, id: input.actorId }, select: { fullName: true, email: true } });
        await this.notifications.notify(tx, tenantId, {
          type: 'core.approval.decided',
          recipients: [row.requester_id],
          excludeUserId: input.actorId,
          titleKey: status === 'APPROVED' ? 'notify.approval.approved.title' : 'notify.approval.rejected.title',
          bodyKey: 'notify.approval.decided.body',
          params: { entityKey: handler?.labelKey ?? row.entity_type, title: row.title ?? '', actor: actor?.fullName ?? actor?.email ?? '', comment: comment ?? '' },
          link: row.link,
        });
      }
    }
    return { changed: true, final, status, currentStep: final && status === 'APPROVED' ? totalSteps : nextStep, totalSteps };
  }

  /** Дуудсан модуль entity-ийн эрх/төлөвийг шалгасны дараа pending instance-ийг цуцална. */
  async cancel(tx: Tx, tenantId: string, instanceId: string): Promise<void> {
    const row = await this.lock(tx, tenantId, instanceId);
    if (row.status !== 'PENDING') throw conflict('core.approvals.not_pending');
    await tx.workflowInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED', decidedAt: new Date(), lockedBy: null, lockedAt: null },
    });
    await this.completeSla(tx, tenantId, instanceId);
  }

  /** Хэрэглэгч тухайн instance-ийн одоогийн алхамд шийдэх эрхтэй эсэх (өөрийн эсвэл орлон) — UI товч харуулах */
  async canDecide(
    tx: Tx, tenantId: string, actorId: string,
    instance: { status: string; currentStep: number; resolvedSteps: unknown; requesterId: string | null; siteId: string | null; definitionId: string },
  ): Promise<boolean> {
    if (instance.status !== 'PENDING') return false;
    const step = normalizeApprovalSteps(instance.resolvedSteps)[instance.currentStep];
    if (!step || (instance.requesterId === actorId && !step.allowRequester)) return false;
    const actor = await this.loadActor(tx, tenantId, actorId);
    if (actor && canActOnStep(actor, step, instance.siteId)) return true;
    const def = await tx.workflowDefinition.findFirst({ where: { id: instance.definitionId, tenantId }, select: { delegationEnabled: true } });
    if (!def?.delegationEnabled) return false;
    return (await this.delegatorFor(tx, tenantId, actorId, step, instance.siteId, instance.requesterId)) !== null;
  }

  async activeDefinition(tx: Tx, tenantId: string, entityType: string) {
    const typed = await tx.workflowDefinition.findFirst({
      where: { tenantId, isActive: true, entityType },
      orderBy: { version: 'desc' },
    });
    if (typed || entityType !== LEGACY_ENTITY_TYPE) return typed;
    return tx.workflowDefinition.findFirst({ where: { tenantId, isActive: true, entityType: null }, orderBy: { createdAt: 'asc' } });
  }

  /** core_users.id → role + эрхийн зураглал (ADR-007: core_user_permissions) */
  async loadActor(tx: Tx, tenantId: string, userId: string): Promise<ApprovalActorPerms | null> {
    const user = await tx.coreUser.findFirst({ where: { tenantId, id: userId, isActive: true }, select: { id: true, role: true } });
    if (!user) return null;
    const rows = await tx.coreUserPermission.findMany({ where: { tenantId, userId }, select: { campId: true, permissionCode: true } });
    const global: string[] = [];
    const bySite: Record<string, string[]> = {};
    for (const r of rows) (r.campId === null ? global : (bySite[r.campId] ??= [])).push(r.permissionCode);
    return { id: user.id, role: user.role, global, bySite };
  }

  // ── Дотоод ───────────────────────────────────────────────

  private async lock(tx: Tx, tenantId: string, instanceId: string): Promise<InstanceRow> {
    const rows = await tx.$queryRaw<InstanceRow[]>`
      SELECT i.id::text, i.entity_type, i.entity_id::text, i.status, i.current_step, i.resolved_steps,
             i.requester_id::text, i.site_id::text, i.title, i.link, d.sla_hours, d.delegation_enabled
      FROM workflow_instances i JOIN workflow_definitions d ON d.id = i.definition_id
      WHERE i.id = ${instanceId}::uuid AND i.tenant_id = ${tenantId}::uuid
      FOR UPDATE OF i`;
    if (!rows[0]) throw notFound('core.approvals.not_found');
    return rows[0];
  }

  /** null = өөрийн эрхээр, string = орлон (delegator core_users.id). Эрхгүй бол 403 */
  private async authorize(tx: Tx, tenantId: string, actorId: string, row: InstanceRow, step: ApprovalStep): Promise<string | null> {
    const actor = await this.loadActor(tx, tenantId, actorId);
    if (!actor) throw forbidden('camp.err.access.1');
    const denial = approvalDenialCode(actor, row.requester_id, step, row.site_id);
    if (!denial) return null;
    if (denial === 'core.approvals.step_permission' && row.delegation_enabled) {
      const delegator = await this.delegatorFor(tx, tenantId, actorId, step, row.site_id, row.requester_id);
      if (delegator) return delegator;
    }
    throw forbidden(denial);
  }

  private async delegatorFor(tx: Tx, tenantId: string, actorId: string, step: ApprovalStep, siteId: string | null, requesterId: string | null): Promise<string | null> {
    const now = new Date();
    const delegations = await tx.workflowDelegation.findMany({
      where: { tenantId, delegateId: actorId, isActive: true, validFrom: { lte: now }, validUntil: { gt: now } },
      select: { delegatorId: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const d of delegations) {
      if (d.delegatorId === requesterId) continue;
      const owner = await this.loadActor(tx, tenantId, d.delegatorId);
      if (owner && canActOnStep(owner, step, siteId)) return owner.id;
    }
    return null;
  }

  /** Алхмыг шийдэх эрхтэй идэвхтэй хэрэглэгчид (хүсэгчээс бусад). Эрхтэй хүн байхгүй бол tenant admin. */
  private async eligibleUsers(tx: Tx, tenantId: string, step: ApprovalStep | undefined, siteId: string | null, requesterId: string | null): Promise<string[]> {
    if (!step) return [];
    let ids: string[];
    if (step.permission) {
      ids = await usersWithPermission(tx, tenantId, step.permission, siteId, { includeTenantAdmins: false });
    } else {
      ids = (await tx.coreUser.findMany({
        where: { tenantId, isActive: true, role: step.role as never },
        select: { id: true }, orderBy: { createdAt: 'asc' },
      })).map((u) => u.id);
    }
    if (!step.allowRequester) ids = ids.filter((id) => id !== requesterId);
    if (ids.length > 0) return ids;
    const admins = await tx.coreUser.findMany({
      where: { tenantId, isActive: true, role: { in: APPROVAL_OVERRIDE_ROLES as never } },
      select: { id: true }, orderBy: { createdAt: 'asc' },
    });
    return admins.map((u) => u.id).filter((id) => id !== requesterId);
  }

  private async assignSla(tx: Tx, tenantId: string, instanceId: string, stepOrder: number, approvers: string[], slaHours: number) {
    const assignee = approvers[0];
    if (!assignee || slaHours <= 0) return;
    await tx.workflowSlaLog.create({
      data: { tenantId, instanceId, stepOrder, assignedToId: assignee, dueAt: new Date(Date.now() + slaHours * 3_600_000), status: 'PENDING' },
    });
  }

  private async completeSla(tx: Tx, tenantId: string, instanceId: string) {
    await tx.workflowSlaLog.updateMany({
      where: { tenantId, instanceId, status: { in: ['PENDING', 'ESCALATED'] } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  private async notifyApprovers(
    tx: Tx, tenantId: string, approvers: string[], requesterId: string | null,
    p: { instanceId: string; labelKey: string; title: string; link: string | null },
  ) {
    if (approvers.length === 0) return;
    const requester = requesterId
      ? await tx.coreUser.findFirst({ where: { tenantId, id: requesterId }, select: { fullName: true, email: true } })
      : null;
    await this.notifications.notify(tx, tenantId, {
      type: 'core.approval.requested',
      recipients: approvers,
      excludeUserId: requesterId,
      titleKey: 'notify.approval.requested.title',
      bodyKey: 'notify.approval.requested.body',
      params: { entityKey: p.labelKey, title: p.title, requester: requester?.fullName ?? requester?.email ?? '' },
      link: `/approvals/${p.instanceId}`,
    });
  }
}
