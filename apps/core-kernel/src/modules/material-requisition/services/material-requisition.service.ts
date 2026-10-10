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

const MR_DETAIL_INCLUDE = {
  items: { orderBy: { lineNumber: 'asc' } },
  requester: { select: { fullName: true, email: true } },
} satisfies Prisma.MrHeaderInclude;

type MrDetail = Prisma.MrHeaderGetPayload<{ include: typeof MR_DETAIL_INCLUDE }>;

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
  ) {}

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
        const isMrNumberConflict = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
          && Array.isArray(error.meta?.target)
          && error.meta.target.includes('mr_number');
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
  async findOne(tenantId: string, id: string): Promise<MrDetail> {
    const cacheKey = this.cache.buildKey('mr', tenantId, 'detail', id);
    const cached = await this.cache.get<MrDetail>(cacheKey);
    if (cached) return cached;

    const header = await inTenantTx(this.prisma, tenantId, (tx) => this.loadOne(tx, tenantId, id));

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

      const definition = await tx.workflowDefinition.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!definition) {
        throw new ForbiddenException('Идэвхтэй workflow definition олдсонгүй');
      }

      const resolvedSteps = this.amountRouter.resolveStepsFromConfig(
        Number(header.totalAmount),
        definition.stepsConfig,
      );
      const instance = await tx.workflowInstance.create({
        data: {
          tenantId,
          definitionId: definition.id,
          entityType: 'MATERIAL_REQUISITION',
          entityId: id,
          currentStep: 0,
          status: 'PENDING',
          resolvedSteps: resolvedSteps as unknown as Prisma.InputJsonValue,
        },
      });
      const firstStep = resolvedSteps[0];
      const firstApprover = firstStep
        ? await tx.coreUser.findFirst({
            where: { tenantId, isActive: true, role: firstStep.role as any },
            select: { id: true },
          })
        : null;
      if (firstStep && firstApprover) {
        await tx.workflowSlaLog.create({
          data: {
            tenantId,
            instanceId: instance.id,
            stepOrder: firstStep.order,
            assignedToId: firstApprover.id,
            dueAt: new Date(Date.now() + definition.slaHours * 60 * 60 * 1000),
            status: 'PENDING',
          },
        });
      }
      await tx.mrHeader.update({
        where: { id },
        data: { workflowInstanceId: instance.id },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'MR_SUBMITTED',
          aggregateType: 'MR',
          aggregateId: id,
          payload: { mrId: id, mrNumber: header.mrNumber, requesterId },
        },
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
  async approve(tenantId: string, id: string, authId: string, dto: ApproveMrDto) {
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const approverId = await this.resolveUserId(tx, tenantId, authId);

      // Idempotency шалгах: status шалгалтаас ӨМНӨ — давхар approve 200 буцаах
      const existingLog = await tx.approvalLog.findUnique({
        where: { mrId_approverId_action: { mrId: id, approverId, action: 'APPROVED' } },
      });
      if (existingLog) {
        this.logger.log(`MR approve idempotent: ${id} (approver: ${approverId})`);
        return { idempotent: true as const, header: await this.loadOne(tx, tenantId, id) };
      }

      const existing = await this.loadOne(tx, tenantId, id);
      if (existing.status !== MrStatus.PENDING_APPROVAL) {
        throw new ForbiddenException('Зөвхөн PENDING_APPROVAL статуст батлах боломжтой');
      }

      const header = await tx.mrHeader.update({
        where: { id },
        data: {
          status: MrStatus.APPROVED,
          approvedBy: approverId,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      // Phase 4.1: төсөв COMMITTED → SPENT
      await this.lifecycle.onApproved(tx, tenantId, id);

      await tx.approvalLog.create({
        data: {
          tenantId,
          mrId: id,
          approverId,
          action: 'APPROVED',
          notes: dto.notes,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'MR_APPROVED',
          aggregateType: 'MR',
          aggregateId: id,
          payload: { mrId: id, mrNumber: header.mrNumber, approverId },
        },
      });

      return { idempotent: false as const, header };
    });

    if (result.idempotent) return result.header;
    await this.invalidate(tenantId);
    this.logger.log(`MR approved: ${result.header.mrNumber} (tenant: ${tenantId})`);
    return result.header;
  }

  async reject(tenantId: string, id: string, authId: string, dto: RejectMrDto) {
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const approverId = await this.resolveUserId(tx, tenantId, authId);

      // Idempotency шалгах: status шалгалтаас ӨМНӨ — давхар reject 200 буцаах
      const existingLog = await tx.approvalLog.findUnique({
        where: { mrId_approverId_action: { mrId: id, approverId, action: 'REJECTED' } },
      });
      if (existingLog) {
        this.logger.log(`MR reject idempotent: ${id} (approver: ${approverId})`);
        return { idempotent: true as const, header: await this.loadOne(tx, tenantId, id) };
      }

      const existing = await this.loadOne(tx, tenantId, id);
      if (existing.status !== MrStatus.PENDING_APPROVAL) {
        throw new ForbiddenException('Зөвхөн PENDING_APPROVAL статуст татгалзах боломжтой');
      }

      const header = await tx.mrHeader.update({
        where: { id },
        data: {
          status: MrStatus.REJECTED,
          version: { increment: 1 },
        },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });

      // Phase 4.1: төсөв COMMITTED → RELEASED
      await this.lifecycle.onRejected(tx, tenantId, id);

      await tx.approvalLog.create({
        data: {
          tenantId,
          mrId: id,
          approverId,
          action: 'REJECTED',
          reason: dto.reason,
          notes: dto.notes,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId,
          eventType: 'MR_REJECTED',
          aggregateType: 'MR',
          aggregateId: id,
          payload: { mrId: id, mrNumber: header.mrNumber, approverId, reason: dto.reason },
        },
      });

      return { idempotent: false as const, header };
    });

    if (result.idempotent) return result.header;
    await this.invalidate(tenantId);
    this.logger.log(`MR rejected: ${result.header.mrNumber} (tenant: ${tenantId})`);
    return result.header;
  }

  // ────────────────────────────────────────────────
  // PRIVATE: mrNumber генерэх (tenant transaction дотор)
  // ────────────────────────────────────────────────
  private async generateMrNumber(tx: TenantTx, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();

    const lastMr = await tx.mrHeader.findFirst({
      where: {
        tenantId,
        mrNumber: { startsWith: `MR-${year}-` },
      },
      orderBy: { mrNumber: 'desc' },
      select: { mrNumber: true },
    });

    let seq = 1;
    if (lastMr) {
      const parts = lastMr.mrNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    return `MR-${year}-${String(seq).padStart(4, '0')}`;
  }
}
