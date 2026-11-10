import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { MrHeader, MrStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CreateMrDto } from '../dto/create-mr.dto';
import { UpdateMrDto } from '../dto/update-mr.dto';
import { QueryMrDto } from '../dto/query-mr.dto';
import { SubmitMrDto } from '../dto/submit-mr.dto';
import { ApproveMrDto } from '../dto/approve-mr.dto';
import { RejectMrDto } from '../dto/reject-mr.dto';
import { AmountRouterService } from '../../workflow/amount-router.service';
import { CacheService } from '../../../cache/cache.service';
import { CursorPaginationResult } from '../../../common/dto/cursor-pagination.dto';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { MrLifecycleService } from '../../mr-lifecycle/mr-lifecycle.service';
import { inTenantTx, TenantTx } from '../../../db/tenant-tx';
import { EventBusService } from '../../event-bus/event-bus.service';
import { EventTypes } from '../../event-bus/interfaces/cloud-event.interface';
import { ApprovalActor, MrWorkflowSummary, normalizeSteps, summarizeWorkflow } from '../mr-approval';
import { ApprovalEngineService, LEGACY_ENTITY_TYPE } from '../../core/approvals/approval-engine.service';
import { ApprovalEntityRegistry, type ApprovalDecisionContext } from '../../core/approvals/approval-entity.registry';
import { PERMISSIONS } from '../../core/permissions/permission-registry';
import { SequenceService } from '../../core/sequences/sequence.service';

const MR_DETAIL_INCLUDE = {
  items: { orderBy: { lineNumber: 'asc' } },
  requester: { select: { fullName: true, email: true } },
} satisfies Prisma.MrHeaderInclude;

type MrDetail = Prisma.MrHeaderGetPayload<{ include: typeof MR_DETAIL_INCLUDE }>;

/** Phase 6.0b [SEC-004]: дэлгэрэнгүй + workflow-ийн байдал (алхам, батлалтууд) */
const MR_WORKFLOW_INCLUDE = {
  ...MR_DETAIL_INCLUDE,
  workflowInstance: {
    select: {
      id: true,
      status: true,
      currentStep: true,
      resolvedSteps: true,
      stepLogs: { select: { stepOrder: true, actorId: true, action: true, actedAt: true }, orderBy: { actedAt: 'asc' } },
    },
  },
} satisfies Prisma.MrHeaderInclude;

export type MrDetailWithWorkflow = MrDetail & { workflow: MrWorkflowSummary };

/** Батлалтын үед ачаалах workflow (instance-гүй хуучин MR → LEGACY_STEPS) */

/**
 * Phase 4.8.3 (2026-10-10): бүх DB хандалт `inTenantTx` (set_config + query нэг transaction) дотор —
 * app `app_user`-ээр холбогдоход RLS ажиллана [RLS-004]. Төлөв/эзэмшигчийн шалгалт cache-ээс биш
 * transaction доторх ШИНЭ мөрөөс, өөрчлөлтийн дараа tenant-ийн MR cache-ийг цэвэрлэнэ [CACHE-001].
 */
@Injectable()
export class MaterialRequisitionService {
  private readonly logger = new Logger(MaterialRequisitionService.name);

  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly amountRouter: AmountRouterService,
    private readonly cache: CacheService,
    private readonly lifecycle: MrLifecycleService, // Phase 4: Budget (+Inventory) — transaction дотор
    private readonly eventBus: EventBusService, // Phase 5.1 [EVT-003]: CloudEvent id/type/source outbox-д
    private readonly engine: ApprovalEngineService, // v0.2.4 WF-06: батлах урсгалын нэгдсэн хөдөлгүүр (цөм)
    registry: ApprovalEntityRegistry,
    private readonly sequences: SequenceService,
  ) {
    registry.register({
      entityType: LEGACY_ENTITY_TYPE,
      module: 'mr',
      labelKey: 'approval.entity.mr',
      approvePermissions: [PERMISSIONS.MR_APPROVE],
      onStep: (tx, ctx) => this.onApprovalStep(tx as TenantTx, ctx),
      onFinal: (tx, ctx) => this.onApprovalFinal(tx as TenantTx, ctx),
    });
  }

  // ────────────────────────────────────────────────
  // PRIVATE: Supabase authId → core_users.id (RULE-13) — tenant transaction дотор
  // ────────────────────────────────────────────────
  private async resolveUserId(tx: TenantTx, tenantId: string, authId: string): Promise<string> {
    const user = await tx.coreUser.findFirst({
      where: { authId, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Хэрэглэгч олдсонгүй');
    }
    return user.id;
  }

  /** Transaction доторх шинэ мөр (cache биш) — төлөв/эзэмшигч шалгахад */
  private async loadOne(tx: TenantTx, tenantId: string, id: string): Promise<MrDetail> {
    const header = await tx.mrHeader.findFirst({ where: { id, tenantId }, include: MR_DETAIL_INCLUDE });
    if (!header) {
      throw new NotFoundException(`MR олдсонгүй (id: ${id})`);
    }
    return header;
  }

  /** Phase 6.0b: дэлгэрэнгүй + `workflow` (findOne, approve, reject-ийн хариу) */
  private async loadDetail(tx: TenantTx, tenantId: string, id: string): Promise<MrDetailWithWorkflow> {
    const header = await tx.mrHeader.findFirst({ where: { id, tenantId }, include: MR_WORKFLOW_INCLUDE });
    if (!header) {
      throw new NotFoundException(`MR олдсонгүй (id: ${id})`);
    }
    const { workflowInstance, ...rest } = header;
    return { ...rest, workflow: summarizeWorkflow(workflowInstance) };
  }

  /** RULE-13 + role (батлах эрх шалгахад) */
  private async resolveActor(tx: TenantTx, tenantId: string, authId: string): Promise<ApprovalActor> {
    const user = await tx.coreUser.findFirst({ where: { authId, tenantId }, select: { id: true, role: true } });
    if (!user) {
      throw new NotFoundException('Хэрэглэгч олдсонгүй');
    }
    return user;
  }

  /**
   * Phase 6.0b: MR мөрийг түгжинэ (transaction дуустал) — зэрэгцээ батлалт quorum/алхмыг
   * давхар тоолохоос сэргийлнэ. Олдохгүй (өөр tenant / байхгүй) → 404.
   */
  private async lockMr(tx: TenantTx, tenantId: string, id: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM mr_headers WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException(`MR олдсонгүй (id: ${id})`);
    }
  }

  /** [CACHE-001] MR өөрчлөгдсөний дараа tenant-ийн жагсаалт/дэлгэрэнгүй cache-ийг цэвэрлэнэ */
  private async invalidate(tenantId: string): Promise<void> {
    try {
      await this.cache.invalidateTenant(tenantId);
    } catch (err) {
      // Cache алдаа нь бичсэн өгөгдлийг буцаахгүй (TTL 60с дотор өөрөө шинэчлэгдэнэ)
      this.logger.warn(`MR cache invalidate алдаа: ${(err as Error).message}`);
    }
  }

  // ────────────────────────────────────────────────
  // CREATE
  // ────────────────────────────────────────────────
  async create(tenantId: string, authId: string, dto: CreateMrDto) {
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * (item.unitPrice ?? 0),
      0,
    );

    let header;
    let mrNumber = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // P2002 нь PostgreSQL transaction-ийг таслах тул оролдлого бүр ШИНЭ transaction
        header = await inTenantTx(this.prisma, tenantId, async (tx) => {
          // authId (Supabase UUID) → core_users.id (PostgreSQL UUID)
          const requesterId = await this.resolveUserId(tx, tenantId, authId);
          mrNumber = await this.generateMrNumber(tx, tenantId);
          return tx.mrHeader.create({
            data: {
              tenantId,
              mrNumber,
              title: dto.title,
              status: MrStatus.DRAFT,
              requesterId,
              department: dto.department,
              requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
              totalAmount: new Prisma.Decimal(totalAmount),
              notes: dto.notes,
              items: {
                create: dto.items.map((item, idx) => ({
                  tenantId,
                  lineNumber: idx + 1,
                  description: item.description,
                  quantity: new Prisma.Decimal(item.quantity),
                  unitOfMeasure: item.unitOfMeasure ?? 'EA',
                  unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
                  notes: item.notes,
                })),
              },
            },
            include: {
              items: {
                orderBy: { lineNumber: 'asc' },
              },
            },
          });
        });
        break;
      } catch (error) {
        // Phase 6.4.7 [CONC-002]: advisory lock-ийн дараа давхцал гарах ёсгүй — энэ нь хамгаалалт.
        // Өмнө `target.includes('mr_number')` → зарим Prisma орчинд target = null → retry хийгддэггүй байв.
        const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
        const isMrNumberConflict = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
          && (!Array.isArray(target) || target.some((t) => /mr_?number/i.test(String(t))));
        if (!isMrNumberConflict || attempt === 2) throw error;
      }
    }

    if (!header) {
      throw new Error(`MR дугаар үүсгэж чадсангүй: ${mrNumber}`);
    }

    await this.invalidate(tenantId);
    this.logger.log(`MR created: ${mrNumber} (tenant: ${tenantId})`);
    return header;
  }

  // ────────────────────────────────────────────────
  // FIND ALL (pagination)
  // ────────────────────────────────────────────────
  async findAll(
    tenantId: string,
    query: QueryMrDto,
  ): Promise<
    | { data: MrHeader[]; total: number; page: number; limit: number }
    | CursorPaginationResult<MrHeader>
  > {
    // [3.6.3] Буруу cursor → 400 (cache/DB-д хүрэхээс өмнө). Өмнө нь UUID биш id → Prisma алдаа → 500
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const cacheKey = this.cache.buildKey('mr', tenantId, 'list', JSON.stringify(query));
    const cached = await this.cache.get<Awaited<ReturnType<MaterialRequisitionService['findAll']>>>(cacheKey);
    if (cached) return cached;

    if (cursor) {
      const { id, createdAt } = cursor;
      const order = query.order ?? 'desc';
      const limit = query.limit ?? 20;
      // [3.6.1] Index-д ээлтэй: created_at <= c AND (created_at < c OR id < cid)
      //   → idx_mr_headers_cursor (tenant_id, created_at DESC, id DESC)-ийн range scan (asc бол эсрэгээр)
      const where: Prisma.MrHeaderWhereInput = {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        createdAt: order === 'desc' ? { lte: createdAt } : { gte: createdAt },
        OR: [
          { createdAt: order === 'desc' ? { lt: createdAt } : { gt: createdAt } },
          { id: order === 'desc' ? { lt: id } : { gt: id } },
        ],
      };
      const items = await inTenantTx(this.prisma, tenantId, (tx) =>
        tx.mrHeader.findMany({
          where,
          orderBy: [{ createdAt: order }, { id: order }],
          take: limit + 1,
        }),
      );
      const hasMore = items.length > limit;
      const data = hasMore ? items.slice(0, limit) : items;
      const lastItem = data[data.length - 1];
      const result: CursorPaginationResult<MrHeader> = {
        data,
        nextCursor: hasMore && lastItem ? encodeCursor(lastItem.id, lastItem.createdAt) : null,
        hasMore,
      };
      await this.cache.set(cacheKey, result, 60);
      return result;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MrHeaderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await inTenantTx(this.prisma, tenantId, async (tx) => [
      await tx.mrHeader.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      await tx.mrHeader.count({ where }),
    ] as const);

    const result = { data, total, page, limit };
    await this.cache.set(cacheKey, result, 60);
    return result;
  }

  // ────────────────────────────────────────────────
  // FIND ONE
  // ────────────────────────────────────────────────
  async findOne(tenantId: string, id: string): Promise<MrDetailWithWorkflow> {
    const cacheKey = this.cache.buildKey('mr', tenantId, 'detail', id);
    const cached = await this.cache.get<MrDetailWithWorkflow>(cacheKey);
    if (cached) return cached;

    const header = await inTenantTx(this.prisma, tenantId, (tx) => this.loadDetail(tx, tenantId, id));

    await this.cache.set(cacheKey, header, 60);
    return header;
  }

  // ────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────
  async update(
    tenantId: string,
    id: string,
    authId: string,
    dto: UpdateMrDto,
  ) {
    const updated = await inTenantTx(this.prisma, tenantId, async (tx) => {
      // authId (Supabase UUID) → core_users.id (PostgreSQL UUID)
      const requesterId = await this.resolveUserId(tx, tenantId, authId);
      const existing = await this.loadOne(tx, tenantId, id);

      if (existing.status !== MrStatus.DRAFT) {
        throw new ForbiddenException('DRAFT статуст л засварлах боломжтой');
      }
      if (existing.requesterId !== requesterId) {
        throw new ForbiddenException('Зөвхөн үүсгэгч засварлах боломжтой');
      }

      const common = {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.requiredDate !== undefined
          ? { requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        version: { increment: 1 },
      };

      if (dto.items) {
        const totalAmount = dto.items.reduce(
          (sum, item) => sum + item.quantity * (item.unitPrice ?? 0),
          0,
        );
        await tx.mrItem.deleteMany({ where: { headerId: id } });
        return tx.mrHeader.update({
          where: { id },
          data: {
            ...common,
            totalAmount: new Prisma.Decimal(totalAmount),
            items: {
              create: dto.items.map((item, idx) => ({
                tenantId,
                lineNumber: idx + 1,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unitOfMeasure: item.unitOfMeasure ?? 'EA',
                unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
                notes: item.notes,
              })),
            },
          },
          include: {
            items: { orderBy: { lineNumber: 'asc' } },
          },
        });
      }

      return tx.mrHeader.update({
        where: { id },
        data: common,
        include: {
          items: { orderBy: { lineNumber: 'asc' } },
        },
      });
    });

    await this.invalidate(tenantId);
    return updated;
  }

  // ────────────────────────────────────────────────
  // REMOVE
  // ────────────────────────────────────────────────
  async remove(tenantId: string, id: string, authId: string) {
    await inTenantTx(this.prisma, tenantId, async (tx) => {
      // authId (Supabase UUID) → core_users.id (PostgreSQL UUID)
      const requesterId = await this.resolveUserId(tx, tenantId, authId);
      const existing = await this.loadOne(tx, tenantId, id);

      if (existing.status !== MrStatus.DRAFT) {
        throw new ForbiddenException('DRAFT статуст л устгах боломжтой');
      }
      if (existing.requesterId !== requesterId) {
        throw new ForbiddenException('Зөвхөн үүсгэгч устгах боломжтой');
      }

      await tx.mrHeader.delete({ where: { id } });
    });
    await this.invalidate(tenantId);
    this.logger.log(`MR deleted: ${id} (tenant: ${tenantId})`);
  }

  // ────────────────────────────────────────────────
  // SUBMIT
  // ────────────────────────────────────────────────
  async submit(tenantId: string, id: string, authId: string, dto: SubmitMrDto) {
    const updated = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const requesterId = await this.resolveUserId(tx, tenantId, authId);
      const existing = await this.loadOne(tx, tenantId, id);

      if (existing.status !== MrStatus.DRAFT) {
        throw new ForbiddenException('Зөвхөн DRAFT MR илгээх боломжтой');
      }
      if (existing.requesterId !== requesterId) {
        throw new ForbiddenException('Зөвхөн үүсгэгч илгээх боломжтой');
      }

      const header = await tx.mrHeader.update({
        where: { id },
        data: {
          status: MrStatus.PENDING_APPROVAL,
          version: { increment: 1 },
          ...(dto.notes ? { notes: dto.notes } : {}),
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      // Phase 4.1: төсөв шалгах + commit (хүрэлцэхгүй → 400, MR DRAFT хэвээр)
      await this.lifecycle.onSubmitted(tx, tenantId, {
        id,
        department: header.department,
        totalAmount: header.totalAmount,
      });

      await this.startFlow(tx, tenantId, { id, mrNumber: header.mrNumber, totalAmount: header.totalAmount, requesterId });

      await this.eventBus.emit({
        tx: tx as never,
        tenantId,
        eventType: 'MR_SUBMITTED', // outbox.event_type (хуучин нэр хэвээр)
        cloudEventType: EventTypes.MR_SUBMITTED,
        aggregateType: 'MR',
        aggregateId: id,
        data: { mrId: id, mrNumber: header.mrNumber, requesterId },
      });

      return header;
    });

    await this.invalidate(tenantId);
    this.logger.log(`MR submitted: ${updated.mrNumber} (tenant: ${tenantId})`);
    return updated;
  }

  // ────────────────────────────────────────────────
  // APPROVE / REJECT
  // ────────────────────────────────────────────────
  /**
   * Phase 6.0b [SEC-004]: workflow-ийн одоогийн алхмыг батална.
   * - Эрх: алхмын role эсвэл OWNER/ADMIN; MR үүсгэгч өөрөө батлахгүй; нэг хүн нэг MR-д нэг л удаа
   *   (approval_logs unique) → олон алхамд өөр өөр хүн
   * - quorum хүрвэл: завсрын алхам → дараагийн алхам (MR PENDING_APPROVAL хэвээр, шинэ SLA);
   *   сүүлийн алхам → MR APPROVED + төсөв SPENT + MR_APPROVED event
   * - Давтан батлах (ижил хүн) → 200, өөрчлөлтгүй (өмнөх idempotency хэвээр)
   */
  async approve(tenantId: string, id: string, authId: string, dto: ApproveMrDto): Promise<MrDetailWithWorkflow> {
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.resolveActor(tx, tenantId, authId);
      await this.lockMr(tx, tenantId, id);

      // Idempotency: status шалгалтаас ӨМНӨ — давхар approve 200 буцаах
      const existingLog = await tx.approvalLog.findUnique({
        where: { mrId_approverId_action: { mrId: id, approverId: actor.id, action: 'APPROVED' } },
      });
      if (existingLog) {
        this.logger.log(`MR approve idempotent: ${id} (approver: ${actor.id})`);
        return { changed: false as const, final: false, header: await this.loadDetail(tx, tenantId, id) };
      }

      const existing = await this.loadOne(tx, tenantId, id);
      if (existing.status !== MrStatus.PENDING_APPROVAL) {
        throw new ForbiddenException('Зөвхөн PENDING_APPROVAL статуст батлах боломжтой');
      }
      const instanceId = existing.workflowInstanceId ?? (await this.startFlow(tx, tenantId, existing));
      // v0.2.4 WF-06: эрх, quorum, алхам, SLA, мэдэгдэл — хөдөлгүүр; MR-ийн төлөв/төсөв/event — onApprovalStep/onApprovalFinal
      const r = await this.engine.decide(tx, tenantId, { instanceId, actorId: actor.id, action: 'APPROVED', comment: dto.notes });
      await tx.approvalLog.create({
        data: { tenantId, mrId: id, approverId: actor.id, action: 'APPROVED', notes: dto.notes },
      });
      return { changed: true as const, final: r.final, header: await this.loadDetail(tx, tenantId, id) };
    });

    if (!result.changed) return result.header;
    await this.invalidate(tenantId);
    const w = result.header.workflow;
    this.logger.log(
      result.final
        ? `MR approved: ${result.header.mrNumber} (tenant: ${tenantId})`
        : `MR step approved: ${result.header.mrNumber} алхам ${w.currentStep + 1}/${w.totalSteps} (tenant: ${tenantId})`,
    );
    return result.header;
  }

  /**
   * Phase 6.0b [SEC-004]: одоогийн алхмын эрхтэй хүн татгалзана → MR, workflow REJECTED,
   * төсөв RELEASED, SLA хаагдана. MR үүсгэгч өөрөө татгалзахгүй. v0.2.4: хөдөлгүүрээр (WF-06).
   */
  async reject(tenantId: string, id: string, authId: string, dto: RejectMrDto): Promise<MrDetailWithWorkflow> {
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actor = await this.resolveActor(tx, tenantId, authId);
      await this.lockMr(tx, tenantId, id);

      // Idempotency: status шалгалтаас ӨМНӨ — давхар reject 200 буцаах
      const existingLog = await tx.approvalLog.findUnique({
        where: { mrId_approverId_action: { mrId: id, approverId: actor.id, action: 'REJECTED' } },
      });
      if (existingLog) {
        this.logger.log(`MR reject idempotent: ${id} (approver: ${actor.id})`);
        return { changed: false as const, header: await this.loadDetail(tx, tenantId, id) };
      }

      const existing = await this.loadOne(tx, tenantId, id);
      if (existing.status !== MrStatus.PENDING_APPROVAL) {
        throw new ForbiddenException('Зөвхөн PENDING_APPROVAL статуст татгалзах боломжтой');
      }
      const instanceId = existing.workflowInstanceId ?? (await this.startFlow(tx, tenantId, existing));
      await this.engine.decide(tx, tenantId, { instanceId, actorId: actor.id, action: 'REJECTED', comment: dto.reason });
      await tx.approvalLog.create({
        data: { tenantId, mrId: id, approverId: actor.id, action: 'REJECTED', reason: dto.reason, notes: dto.notes },
      });
      return { changed: true as const, header: await this.loadDetail(tx, tenantId, id) };
    });

    if (!result.changed) return result.header;
    await this.invalidate(tenantId);
    this.logger.log(`MR rejected: ${result.header.mrNumber} (tenant: ${tenantId})`);
    return result.header;
  }

  /**
   * v0.2.4 WF-06: MR-ийн батлах урсгал эхлүүлэх (submit, эсвэл урсгалгүй хуучин MR-ийн анхны шийдвэр).
   * entity_type-тай (шинэ) тодорхойлолт → хөдөлгүүр алхмыг тооцно; хуучин (NULL) → amount_rules / role алхам.
   */
  private async startFlow(
    tx: TenantTx,
    tenantId: string,
    mr: { id: string; mrNumber: string; totalAmount: Prisma.Decimal | number; requesterId: string },
  ): Promise<string> {
    const definition = await this.engine.activeDefinition(tx, tenantId, LEGACY_ENTITY_TYPE);
    if (!definition) {
      throw new ForbiddenException('Идэвхтэй workflow definition олдсонгүй');
    }
    const amount = Number(mr.totalAmount);
    const steps = definition.entityType
      ? undefined
      : normalizeSteps(this.amountRouter.resolveStepsFromConfig(amount, definition.stepsConfig));
    const instance = await this.engine.start(tx, tenantId, {
      entityType: LEGACY_ENTITY_TYPE,
      entityId: mr.id,
      requesterId: mr.requesterId,
      amount,
      title: mr.mrNumber,
      link: `/debug/modules/mr/${mr.id}`,
      steps,
    });
    await tx.mrHeader.update({ where: { id: mr.id }, data: { workflowInstanceId: instance.id } });
    return instance.id;
  }

  /** Хөдөлгүүрийн алхам бүрт — MR-ийн version (optimistic UI) */
  private async onApprovalStep(tx: TenantTx, ctx: ApprovalDecisionContext): Promise<void> {
    if (ctx.final) return;
    await tx.mrHeader.update({ where: { id: ctx.entityId }, data: { version: { increment: 1 } } });
  }

  /** Урсгал дуусахад — MR төлөв, төсөв (SPENT/RELEASED), outbox event */
  private async onApprovalFinal(tx: TenantTx, ctx: ApprovalDecisionContext): Promise<void> {
    if (ctx.status === 'APPROVED') {
      const header = await tx.mrHeader.update({
        where: { id: ctx.entityId },
        data: { status: MrStatus.APPROVED, approvedBy: ctx.actorId, approvedAt: new Date(), version: { increment: 1 } },
      });
      await this.lifecycle.onApproved(tx, ctx.tenantId, ctx.entityId);
      await this.eventBus.emit({
        tx: tx as never,
        tenantId: ctx.tenantId,
        eventType: 'MR_APPROVED', // outbox.event_type (хуучин нэр хэвээр)
        cloudEventType: EventTypes.MR_APPROVED,
        aggregateType: 'MR',
        aggregateId: ctx.entityId,
        data: { mrId: ctx.entityId, mrNumber: header.mrNumber, approverId: ctx.actorId },
      });
      return;
    }
    const header = await tx.mrHeader.update({
      where: { id: ctx.entityId },
      data: { status: MrStatus.REJECTED, version: { increment: 1 } },
    });
    await this.lifecycle.onRejected(tx, ctx.tenantId, ctx.entityId);
    await this.eventBus.emit({
      tx: tx as never,
      tenantId: ctx.tenantId,
      eventType: 'MR_REJECTED', // outbox.event_type (хуучин нэр хэвээр)
      cloudEventType: EventTypes.MR_REJECTED,
      aggregateType: 'MR',
      aggregateId: ctx.entityId,
      data: { mrId: ctx.entityId, mrNumber: header.mrNumber, approverId: ctx.actorId, reason: ctx.comment },
    });
  }

  // ────────────────────────────────────────────────
  // PRIVATE: mrNumber генерэх (tenant transaction дотор)
  // ────────────────────────────────────────────────
  /**
   * Phase 6.4.7 [CONC-002]: tenant + он тус бүрд advisory lock (transaction дуустал) → дугаар цувралаар.
   * Өмнө `max+1` (READ COMMITTED) → нэг tenant-д зэрэгцээ үүсгэлт ижил дугаар авч P2002 → 500
   * (30 зэрэгцээ хүсэлтээс 22 нь унасан). Мөн `orderBy: mrNumber desc` нь текстээр эрэмбэлдэг тул
   * 9999-ээс хойш ('MR-2026-10000' < 'MR-2026-9999') дугаар давхцах байсан → тоон max.
   * Кемпийн ZAS дугаартай ижил загвар (camp-maintenance.service.ts).
   */
  private async generateMrNumber(tx: TenantTx, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    return this.sequences.next(tx, {
      tenantId,
      module: 'mr',
      key: 'material_requisition.number',
      year,
    });
  }
}
