import { Injectable } from '@nestjs/common';
import { CampAuditAction, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { inTenantTx } from '../../../db/tenant-tx';
import { badRequest, conflict, forbidden, notFound } from '../../../common/i18n/app-error';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { CoreTenantModulesService } from '../modules/core-tenant-modules.service';
import { isTenantModuleId, TENANT_MODULES } from '../modules/module-registry';
import { isPermission } from '../permissions/permission-registry';
import { ApprovalEngineService } from './approval-engine.service';
import { ApprovalEntityRegistry, type ApprovalEntityHandler } from './approval-entity.registry';
import { canActOnStep, normalizeApprovalSteps, type ApprovalActorPerms, type ApprovalStep } from './approval-steps';
import type { CreateDelegationDto, DecideApprovalDto, SaveApprovalDefinitionDto } from './approvals.dto';

type Tx = Prisma.TransactionClient;

const INBOX_LIMIT = 500;

export interface ApprovalListItem {
  id: string;
  entityType: string;
  labelKey: string;
  title: string;
  link: string | null;
  status: string;
  currentStep: number;
  totalSteps: number;
  stepName: string | null;
  requesterName: string | null;
  amount: number | null;
  createdAt: string;
  dueAt: string | null;
  onBehalfOf: string | null;
}

/**
 * v0.2.4 Блок 6 (WF-06) — батлах урсгалын API: «Миний батлах», дэлгэрэнгүй, шийдвэр, тохиргоо (хувилбартай), орлон гүйцэтгэгч.
 * Объектын төлөв өөрчлөх логик — модулийн handler (`ApprovalEntityRegistry`) дотор.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly modules: CoreTenantModulesService,
    private readonly registry: ApprovalEntityRegistry,
    private readonly engine: ApprovalEngineService,
  ) {}

  // ── Батлах жагсаалт ──────────────────────────────────────

  async inbox(tenantId: string, authId: string): Promise<{ items: ApprovalListItem[] }> {
    const types = await this.visibleTypes(tenantId, authId);
    if (types.length === 0) return { items: [] };
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const actor = (await this.engine.loadActor(tx, tenantId, me))!;
      const delegators = await this.delegators(tx, tenantId, me);
      const rows = await tx.workflowInstance.findMany({
        where: { tenantId, status: 'PENDING', entityType: { in: types.map((t) => t.entityType) } },
        orderBy: { createdAt: 'asc' },
        take: INBOX_LIMIT,
        include: { definition: { select: { delegationEnabled: true } }, stepLogs: { select: { stepOrder: true, actorId: true, onBehalfOf: true, action: true } }, slaLogs: { where: { status: { in: ['PENDING', 'ESCALATED'] } }, select: { dueAt: true } } },
      });
      const items: ApprovalListItem[] = [];
      for (const row of rows) {
        const steps = normalizeApprovalSteps(row.resolvedSteps);
        const step = steps[row.currentStep];
        if (!step) continue;
        const who = this.actingAs(actor, row.definition.delegationEnabled ? delegators : [], step, row.siteId, row.requesterId);
        if (who === undefined) continue;
        const acted = row.stepLogs.some((l) => (l.onBehalfOf ?? l.actorId) === (who ?? me) && (l.stepOrder === row.currentStep || l.action === 'APPROVED'));
        if (acted) continue;
        items.push(await this.listItem(tx, tenantId, row, steps, types, who));
      }
      return { items };
    });
  }

  /** Миний илгээсэн (хүсэгч) — сүүлийн 100 */
  async mine(tenantId: string, authId: string): Promise<{ items: ApprovalListItem[] }> {
    const types = await this.visibleTypes(tenantId, authId);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const rows = await tx.workflowInstance.findMany({
        where: { tenantId, requesterId: me, entityType: { in: types.map((t) => t.entityType) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { slaLogs: { where: { status: { in: ['PENDING', 'ESCALATED'] } }, select: { dueAt: true } } },
      });
      const items: ApprovalListItem[] = [];
      for (const row of rows) items.push(await this.listItem(tx, tenantId, row, normalizeApprovalSteps(row.resolvedSteps), types, null));
      return { items };
    });
  }

  async detail(tenantId: string, authId: string, id: string) {
    const types = await this.visibleTypes(tenantId, authId);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const row = await tx.workflowInstance.findFirst({
        where: { id, tenantId },
        include: { stepLogs: { orderBy: { actedAt: 'asc' } }, slaLogs: { where: { status: { in: ['PENDING', 'ESCALATED'] } }, select: { dueAt: true } } },
      });
      if (!row || !types.some((t) => t.entityType === row.entityType)) throw notFound('core.approvals.not_found');
      const actor = (await this.engine.loadActor(tx, tenantId, me))!;
      const canDecide = await this.engine.canDecide(tx, tenantId, me, row);
      const involved = row.requesterId === me || row.stepLogs.some((l) => l.actorId === me || l.onBehalfOf === me);
      const isAdmin = actor.role === 'OWNER' || actor.role === 'ADMIN';
      if (!canDecide && !involved && !isAdmin) throw notFound('core.approvals.not_found');
      const steps = normalizeApprovalSteps(row.resolvedSteps);
      const userIds = [...new Set(row.stepLogs.flatMap((l) => [l.actorId, l.onBehalfOf]).filter((v): v is string => !!v))];
      const names = await this.names(tx, tenantId, userIds);
      const base = await this.listItem(tx, tenantId, row, steps, types, null);
      return {
        ...base,
        canDecide,
        steps: steps.map((s, i) => ({ index: i, name: s.name ?? null, permission: s.permission ?? null, role: s.role ?? null, quorum: s.quorum })),
        logs: row.stepLogs.map((l) => ({
          stepOrder: l.stepOrder,
          action: l.action,
          comment: l.comment,
          actorName: names.get(l.actorId) ?? null,
          onBehalfOfName: l.onBehalfOf ? (names.get(l.onBehalfOf) ?? null) : null,
          actedAt: l.actedAt.toISOString(),
        })),
      };
    });
  }

  async decide(tenantId: string, authId: string, id: string, dto: DecideApprovalDto) {
    if (dto.action === 'REJECT' && !dto.comment?.trim()) throw badRequest('core.approvals.reason_required');
    const types = await this.visibleTypes(tenantId, authId);
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const row = await tx.workflowInstance.findFirst({
        where: { id, tenantId },
        include: { stepLogs: { select: { actorId: true, onBehalfOf: true } } },
      });
      if (!row || !types.some((t) => t.entityType === row.entityType)) throw notFound('core.approvals.not_found');
      const actor = (await this.engine.loadActor(tx, tenantId, me))!;
      const canDecide = await this.engine.canDecide(tx, tenantId, me, row);
      const involved = row.requesterId === me || row.stepLogs.some((log) => log.actorId === me || log.onBehalfOf === me);
      if (!canDecide && !involved && actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
        throw notFound('core.approvals.not_found');
      }
      await this.engine.decide(tx, tenantId, { instanceId: id, actorId: me, action: dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', comment: dto.comment });
    });
    return this.detail(tenantId, authId, id);
  }

  // ── Тохиргоо (tenant admin) ──────────────────────────────

  async entityTypes(tenantId: string, authId: string) {
    const types = await this.visibleTypes(tenantId, authId);
    await inTenantTx(this.prisma, tenantId, (tx) => this.access.requireTenantAdmin(tx, tenantId, authId));
    return { items: types.map((t) => ({ entityType: t.entityType, module: t.module, labelKey: t.labelKey, approvePermissions: [...t.approvePermissions] })) };
  }

  async definitions(tenantId: string, authId: string, entityType: string) {
    await this.requireType(tenantId, authId, entityType);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const rows = await tx.workflowDefinition.findMany({ where: { tenantId, entityType }, orderBy: { version: 'desc' } });
      const counts = await tx.workflowInstance.groupBy({ by: ['definitionId'], where: { tenantId, status: 'PENDING', definitionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
      const pending = new Map(counts.map((c) => [c.definitionId, c._count._all]));
      return {
        items: rows.map((r) => ({
          id: r.id, version: r.version, name: r.name, isActive: r.isActive, slaHours: r.slaHours,
          escalationEnabled: r.escalationEnabled, delegationEnabled: r.delegationEnabled,
          steps: normalizeApprovalSteps(r.stepsConfig, []), pendingCount: pending.get(r.id) ?? 0, createdAt: r.createdAt.toISOString(),
        })),
      };
    });
  }

  /** Шинэ хувилбар үүсгэж идэвхжүүлнэ — өмнөх идэвхтэй хувилбар is_active=false (ажиллаж буй instance хуучнаараа) */
  async saveDefinition(tenantId: string, authId: string, dto: SaveApprovalDefinitionDto) {
    const type = await this.requireType(tenantId, authId, dto.entityType);
    const steps: ApprovalStep[] = dto.steps.map((s, i) => {
      if (!isPermission(s.permission) || !type.approvePermissions.includes(s.permission) && !s.permission.startsWith(`${type.module}.`)) {
        throw badRequest('core.approvals.invalid_permission', { permission: s.permission });
      }
      if (s.minAmount !== undefined && s.maxAmount !== undefined && s.minAmount > s.maxAmount) throw badRequest('core.approvals.invalid_amount_range');
      return { order: i, name: s.name?.trim() || undefined, permission: s.permission, quorum: s.quorum, minAmount: s.minAmount, maxAmount: s.maxAmount };
    });
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`approval-def:${tenantId}:${dto.entityType}`}))`;
      const last = await tx.workflowDefinition.findFirst({ where: { tenantId, entityType: dto.entityType }, orderBy: { version: 'desc' }, select: { version: true } });
      await tx.workflowDefinition.updateMany({ where: { tenantId, entityType: dto.entityType, isActive: true }, data: { isActive: false } });
      const created = await tx.workflowDefinition.create({
        data: {
          tenantId, entityType: dto.entityType, version: (last?.version ?? 0) + 1, name: dto.name.trim(),
          stepsConfig: steps.map((s) => JSON.parse(JSON.stringify(s))) as Prisma.InputJsonValue,
          slaHours: dto.slaHours, escalationEnabled: dto.escalationEnabled, delegationEnabled: dto.delegationEnabled,
          isActive: true, createdBy: actorId,
        },
      });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'approval_definition', entityId: created.id, action: CampAuditAction.CREATE, actorUserId: actorId,
        fields: ['entityType', 'version', 'name', 'steps', 'slaHours'],
        after: { entityType: created.entityType, version: created.version, name: created.name, steps: steps.length, slaHours: created.slaHours },
        summaryParams: { name: created.name, version: created.version },
      });
    });
    return this.definitions(tenantId, authId, dto.entityType);
  }

  // ── Орлон гүйцэтгэгч (өөрийн) ────────────────────────────

  async delegations(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const rows = await tx.workflowDelegation.findMany({
        where: { tenantId, OR: [{ delegatorId: me }, { delegateId: me }], isActive: true, validUntil: { gt: new Date() } },
        orderBy: { validFrom: 'asc' },
      });
      const names = await this.names(tx, tenantId, rows.flatMap((r) => [r.delegatorId, r.delegateId]));
      return {
        items: rows.map((r) => ({
          id: r.id, mine: r.delegatorId === me, delegatorName: names.get(r.delegatorId) ?? null, delegateName: names.get(r.delegateId) ?? null,
          delegateId: r.delegateId, validFrom: r.validFrom.toISOString(), validUntil: r.validUntil.toISOString(), reason: r.reason,
        })),
      };
    });
  }

  /** Орлон гүйцэтгэгч сонгох — идэвхтэй хэрэглэгчдийн нэр (өөрөөс бусад; имэйл/утас ✖) */
  async delegateCandidates(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const users = await tx.coreUser.findMany({
        where: { tenantId, isActive: true, NOT: { id: me } },
        select: { id: true, fullName: true, username: true },
        orderBy: { fullName: 'asc' },
        take: 1000,
      });
      return { items: users.map((u) => ({ id: u.id, name: u.fullName?.trim() || u.username || u.id.slice(0, 8) })) };
    });
  }

  async createDelegation(tenantId: string, authId: string, dto: CreateDelegationDto) {
    const from = dto.validFrom ? new Date(dto.validFrom) : new Date();
    const until = new Date(dto.validUntil);
    if (!(until > from)) throw badRequest('core.approvals.delegation_range');
    if (until.getTime() - from.getTime() > 90 * 86_400_000) throw badRequest('core.approvals.delegation_too_long');
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      if (dto.delegateId === me) throw badRequest('core.approvals.delegation_self');
      const delegate = await tx.coreUser.findFirst({ where: { tenantId, id: dto.delegateId, isActive: true }, select: { id: true } });
      if (!delegate) throw notFound('core.approvals.delegate_not_found');
      const overlap = await tx.workflowDelegation.count({
        where: { tenantId, delegatorId: me, isActive: true, validFrom: { lt: until }, validUntil: { gt: from } },
      });
      if (overlap > 0) throw conflict('core.approvals.delegation_overlap');
      const row = await tx.workflowDelegation.create({ data: { tenantId, delegatorId: me, delegateId: delegate.id, validFrom: from, validUntil: until, reason: dto.reason?.trim() || null } });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'approval_delegation', entityId: row.id, action: CampAuditAction.CREATE, actorUserId: me,
        fields: ['delegateId', 'validFrom', 'validUntil'], after: { delegateId: row.delegateId, validFrom: from.toISOString(), validUntil: until.toISOString() },
      });
    });
    return this.delegations(tenantId, authId);
  }

  async revokeDelegation(tenantId: string, authId: string, id: string) {
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      const me = await this.me(tx, tenantId, authId);
      const row = await tx.workflowDelegation.findFirst({ where: { id, tenantId, delegatorId: me, isActive: true } });
      if (!row) throw notFound('core.approvals.delegation_not_found');
      await tx.workflowDelegation.update({ where: { id }, data: { isActive: false } });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'approval_delegation', entityId: id, action: CampAuditAction.UPDATE, actorUserId: me,
        fields: ['isActive'], before: { isActive: true }, after: { isActive: false },
      });
    });
    return this.delegations(tenantId, authId);
  }

  // ── Дотоод ───────────────────────────────────────────────

  /** Идэвхтэй модулийн (debug-only бол Debug эрхтэй хэрэглэгчид л) батлах төрлүүд */
  private async visibleTypes(tenantId: string, authId: string): Promise<ApprovalEntityHandler[]> {
    const out: ApprovalEntityHandler[] = [];
    let debug: boolean | null = null;
    for (const h of this.registry.list()) {
      if (h.module !== 'core') {
        if (!isTenantModuleId(h.module) || !(await this.modules.isActive(tenantId, h.module))) continue;
        if (TENANT_MODULES.find((m) => m.id === h.module)?.debugOnly) {
          debug ??= await this.modules.canViewDebugModules(tenantId, authId);
          if (!debug) continue;
        }
      }
      out.push(h);
    }
    return out;
  }

  private async requireType(tenantId: string, authId: string, entityType: string): Promise<ApprovalEntityHandler> {
    const type = (await this.visibleTypes(tenantId, authId)).find((t) => t.entityType === entityType);
    if (!type) throw notFound('core.approvals.type_unknown', { entity: entityType });
    return type;
  }

  private async me(tx: Tx, tenantId: string, authId: string): Promise<string> {
    const user = await tx.coreUser.findFirst({ where: { authId, tenantId, isActive: true }, select: { id: true } });
    if (!user) throw forbidden('camp.err.access.1');
    return user.id;
  }

  private async delegators(tx: Tx, tenantId: string, me: string): Promise<ApprovalActorPerms[]> {
    const now = new Date();
    const rows = await tx.workflowDelegation.findMany({
      where: { tenantId, delegateId: me, isActive: true, validFrom: { lte: now }, validUntil: { gt: now } },
      select: { delegatorId: true },
    });
    const out: ApprovalActorPerms[] = [];
    for (const r of rows) {
      const a = await this.engine.loadActor(tx, tenantId, r.delegatorId);
      if (a) out.push(a);
    }
    return out;
  }

  /** null = өөрийн эрхээр, string = орлон (delegator id), undefined = эрхгүй */
  private actingAs(actor: ApprovalActorPerms, delegators: ApprovalActorPerms[], step: ApprovalStep, siteId: string | null, requesterId: string | null): string | null | undefined {
    if (actor.id === requesterId && !step.allowRequester) return undefined;
    if (canActOnStep(actor, step, siteId)) return null;
    const d = delegators.find((x) => x.id !== requesterId && canActOnStep(x, step, siteId));
    return d ? d.id : undefined;
  }

  private async names(tx: Tx, tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await tx.coreUser.findMany({ where: { tenantId, id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.fullName?.trim() || u.email]));
  }

  private async listItem(
    tx: Tx,
    tenantId: string,
    row: { id: string; entityType: string; title: string | null; link: string | null; status: string; currentStep: number; requesterId: string | null; amount: Prisma.Decimal | null; createdAt: Date; slaLogs?: Array<{ dueAt: Date }> },
    steps: ApprovalStep[],
    types: ApprovalEntityHandler[],
    onBehalfOf: string | null,
  ): Promise<ApprovalListItem> {
    const names = await this.names(tx, tenantId, [row.requesterId, onBehalfOf].filter((v): v is string => !!v));
    const due = row.slaLogs?.map((s) => s.dueAt).sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      id: row.id,
      entityType: row.entityType,
      labelKey: types.find((t) => t.entityType === row.entityType)?.labelKey ?? row.entityType,
      title: row.title ?? '',
      link: row.link,
      status: row.status,
      currentStep: row.currentStep,
      totalSteps: steps.length,
      stepName: steps[row.currentStep]?.name ?? null,
      requesterName: row.requesterId ? (names.get(row.requesterId) ?? null) : null,
      amount: row.amount === null ? null : Number(row.amount),
      createdAt: row.createdAt.toISOString(),
      dueAt: due?.toISOString() ?? null,
      onBehalfOf: onBehalfOf ? (names.get(onBehalfOf) ?? null) : null,
    };
  }
}
