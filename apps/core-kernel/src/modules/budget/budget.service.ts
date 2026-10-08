import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaTenantClientService } from '../../db/prisma-tenant-client.service';
import { requireRole } from '../../common/helpers/require-role.helper';
import {
  CheckBudgetDto,
  CreateBudgetAllocationDto,
  CreateBudgetPeriodDto,
  QueryBudgetAllocationsDto,
  QueryBudgetPeriodsDto,
  UpdateBudgetAllocationDto,
} from './dto/budget.dto';

type Tx = Prisma.TransactionClient;
const Decimal = Prisma.Decimal;
const BUDGET_ADMIN_ROLES = [UserRole.OWNER, UserRole.ADMIN];

/** Төсөв шалгахад шаардлагатай MR-ийн мэдээлэл */
export interface BudgetMrInput {
  id: string;
  department: string | null;
  totalAmount: Prisma.Decimal | number | string;
}

interface AllocationRow {
  id: string;
  department: string;
  total_amount: Prisma.Decimal;
  committed_amount: Prisma.Decimal;
  spent_amount: Prisma.Decimal;
}

/** 'YYYY-MM-DD' (Asia/Ulaanbaatar) — төсвийн хугацааг Монголын огноогоор харьцуулна */
export function budgetDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(now);
}

const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/**
 * BudgetService — Phase 4.1 (Sprint 9.B)
 *
 * Шийдвэр (2026-10-08):
 *   - Tenant-д идэвхтэй (is_active) budget_period байвал хяналт ИДЭВХТЭЙ:
 *     MR-д хэлтэс заавал + тухайн өдөр хамаарах идэвхтэй хугацааны тэр хэлтсийн төсөв заавал.
 *   - Идэвхтэй хугацаа нэг ч байхгүй бол шалгахгүй (модуль ашиглагдаагүй).
 *   - Давхцсан хугацаа (жил + улирал) → хамгийн богино (нарийвчилсан) хугацааны төсөв.
 *
 * Ledger (commit/spent/release) нь MrLifecycleService-ээр MR-ийн transaction ДОТРООС дуудагдана
 * (RULE-04) — allocation мөрийг `FOR UPDATE`-ээр түгжинэ.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(private readonly prisma: PrismaTenantClientService) {}

  /** RULE-04: set_config + query нэг transaction дотор */
  private inTenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  // ── Periods ─────────────────────────────────────────────
  listPeriods(tenantId: string, query: QueryBudgetPeriodsDto) {
    return this.inTenantTx(tenantId, (tx) =>
      tx.budgetPeriod.findMany({
        where: { tenantId, ...(query.activeOnly ? { isActive: true } : {}) },
        orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async createPeriod(tenantId: string, authId: string, dto: CreateBudgetPeriodDto) {
    if (dto.endDate.slice(0, 10) < dto.startDate.slice(0, 10)) {
      throw new BadRequestException('endDate нь startDate-ээс өмнө байж болохгүй');
    }
    return this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, BUDGET_ADMIN_ROLES);
      return tx.budgetPeriod.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          periodType: dto.periodType,
          startDate: toDate(dto.startDate),
          endDate: toDate(dto.endDate),
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  // ── Allocations ─────────────────────────────────────────
  listAllocations(tenantId: string, query: QueryBudgetAllocationsDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      const rows = await tx.budgetAllocation.findMany({
        where: { tenantId, ...(query.periodId ? { periodId: query.periodId } : {}) },
        include: { period: { select: { name: true, startDate: true, endDate: true, isActive: true } } },
        orderBy: [{ department: 'asc' }],
      });
      return rows.map((a) => ({
        ...a,
        remainingAmount: new Decimal(a.totalAmount).minus(a.committedAmount).minus(a.spentAmount),
      }));
    });
  }

  createAllocation(tenantId: string, authId: string, dto: CreateBudgetAllocationDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, BUDGET_ADMIN_ROLES);
      const period = await tx.budgetPeriod.findFirst({ where: { id: dto.periodId, tenantId } });
      if (!period) throw new NotFoundException('Төсвийн хугацаа олдсонгүй');
      try {
        return await tx.budgetAllocation.create({
          data: {
            tenantId,
            periodId: dto.periodId,
            department: dto.department.trim(),
            totalAmount: new Decimal(dto.totalAmount),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException(`"${dto.department}" хэлтэст энэ хугацаанд төсөв аль хэдийн байна`);
        }
        throw err;
      }
    });
  }

  updateAllocation(tenantId: string, authId: string, id: string, dto: UpdateBudgetAllocationDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      await requireRole(tx, tenantId, authId, BUDGET_ADMIN_ROLES);
      const rows = await tx.$queryRaw<AllocationRow[]>`
        SELECT id, department, total_amount, committed_amount, spent_amount
        FROM budget_allocations WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException('Төсөв олдсонгүй');
      const used = new Decimal(current.committed_amount).plus(current.spent_amount);
      if (new Decimal(dto.totalAmount).lessThan(used)) {
        throw new BadRequestException(`Шинэ дүн ашигласан дүнгээс (${used.toFixed(2)}) бага байж болохгүй`);
      }
      return tx.budgetAllocation.update({ where: { id }, data: { totalAmount: new Decimal(dto.totalAmount) } });
    });
  }

  /** Урьдчилан харах (түгжихгүй) — UI-д "үлдэгдэл хүрэлцэх үү" */
  check(tenantId: string, dto: CheckBudgetDto) {
    return this.inTenantTx(tenantId, async (tx) => {
      if (!(await this.isEnforced(tx, tenantId))) {
        return { enforced: false, ok: true };
      }
      const allocation = await this.findAllocation(tx, tenantId, dto.department, budgetDate(new Date()), false);
      if (!allocation) {
        return { enforced: true, ok: false, reason: 'NO_ALLOCATION' as const };
      }
      const remaining = this.remaining(allocation);
      return {
        enforced: true,
        ok: new Decimal(dto.amount).lessThanOrEqualTo(remaining),
        allocationId: allocation.id,
        remainingAmount: remaining,
      };
    });
  }

  // ── Ledger — MrLifecycleService-ээр MR transaction дотроос ──
  /**
   * MR submit: төсөв шалгаж COMMITTED бүртгэнэ. Хүрэлцэхгүй / төсөвгүй → 400 (transaction rollback → MR DRAFT хэвээр).
   * @returns commitment үүссэн эсэх
   */
  async commitForMr(tx: Tx, tenantId: string, mr: BudgetMrInput, now: Date): Promise<boolean> {
    if (!(await this.isEnforced(tx, tenantId))) return false;

    const department = mr.department?.trim();
    if (!department) {
      throw new BadRequestException('Төсвийн хяналттай байгууллагад MR-д хэлтэс (department) заавал');
    }

    const amount = new Decimal(mr.totalAmount);
    const asOf = budgetDate(now);
    const allocation = await this.findAllocation(tx, tenantId, department, asOf, true);
    if (!allocation) {
      throw new BadRequestException(`"${department}" хэлтэст ${asOf}-ний өдөр хамаарах идэвхтэй төсөв алга`);
    }
    if (amount.lessThanOrEqualTo(0)) return false;

    const remaining = this.remaining(allocation);
    if (amount.greaterThan(remaining)) {
      throw new BadRequestException(
        `Төсөв хүрэлцэхгүй: "${department}" үлдэгдэл ${remaining.toFixed(2)}, MR дүн ${amount.toFixed(2)}`,
      );
    }

    await tx.$executeRaw`
      UPDATE budget_allocations
      SET committed_amount = committed_amount + ${amount.toString()}::numeric, updated_at = clock_timestamp()
      WHERE id = ${allocation.id}::uuid
    `;
    await tx.budgetCommitment.create({
      data: { tenantId, allocationId: allocation.id, mrHeaderId: mr.id, amount, status: 'COMMITTED' },
    });
    this.logger.log(`Budget committed: MR ${mr.id} → ${department} ${amount.toFixed(2)}`);
    return true;
  }

  /** MR approved: COMMITTED → SPENT. Commitment байхгүй (хяналтгүй) бол юу ч хийхгүй — idempotent */
  markSpentForMr(tx: Tx, tenantId: string, mrId: string): Promise<boolean> {
    return this.settle(tx, tenantId, mrId, 'SPENT');
  }

  /** MR rejected: COMMITTED → RELEASED (төсөв буцаж чөлөөлөгдөнө). Idempotent */
  releaseForMr(tx: Tx, tenantId: string, mrId: string): Promise<boolean> {
    return this.settle(tx, tenantId, mrId, 'RELEASED');
  }

  // ── private ─────────────────────────────────────────────
  private async settle(tx: Tx, tenantId: string, mrId: string, to: 'SPENT' | 'RELEASED'): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string; allocation_id: string; amount: Prisma.Decimal }[]>`
      SELECT id, allocation_id, amount FROM budget_commitments
      WHERE mr_header_id = ${mrId}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'COMMITTED'
      FOR UPDATE
    `;
    const c = rows[0];
    if (!c) return false;

    if (to === 'SPENT') {
      await tx.$executeRaw`
        UPDATE budget_allocations
        SET committed_amount = committed_amount - ${new Decimal(c.amount).toString()}::numeric,
            spent_amount     = spent_amount + ${new Decimal(c.amount).toString()}::numeric,
            updated_at       = clock_timestamp()
        WHERE id = ${c.allocation_id}::uuid
      `;
    } else {
      await tx.$executeRaw`
        UPDATE budget_allocations
        SET committed_amount = committed_amount - ${new Decimal(c.amount).toString()}::numeric, updated_at = clock_timestamp()
        WHERE id = ${c.allocation_id}::uuid
      `;
    }
    await tx.budgetCommitment.update({ where: { id: c.id }, data: { status: to } });
    this.logger.log(`Budget ${to}: MR ${mrId} ${new Decimal(c.amount).toFixed(2)}`);
    return true;
  }

  private async isEnforced(tx: Tx, tenantId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ enforced: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM budget_periods WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      ) AS enforced
    `;
    return rows[0]?.enforced === true;
  }

  /** Тухайн өдөр хамаарах идэвхтэй хугацааны хэлтсийн төсөв — хамгийн богино хугацааг сонгоно */
  private async findAllocation(
    tx: Tx,
    tenantId: string,
    department: string,
    asOf: string,
    lock: boolean,
  ): Promise<AllocationRow | undefined> {
    const rows = lock
      ? await tx.$queryRaw<AllocationRow[]>`
          SELECT a.id, a.department, a.total_amount, a.committed_amount, a.spent_amount
          FROM budget_allocations a JOIN budget_periods p ON p.id = a.period_id
          WHERE a.tenant_id = ${tenantId}::uuid AND p.is_active = true
            AND p.start_date <= ${asOf}::date AND p.end_date >= ${asOf}::date
            AND lower(btrim(a.department)) = lower(btrim(${department}))
          ORDER BY (p.end_date - p.start_date) ASC, p.start_date DESC
          LIMIT 1
          FOR UPDATE OF a
        `
      : await tx.$queryRaw<AllocationRow[]>`
          SELECT a.id, a.department, a.total_amount, a.committed_amount, a.spent_amount
          FROM budget_allocations a JOIN budget_periods p ON p.id = a.period_id
          WHERE a.tenant_id = ${tenantId}::uuid AND p.is_active = true
            AND p.start_date <= ${asOf}::date AND p.end_date >= ${asOf}::date
            AND lower(btrim(a.department)) = lower(btrim(${department}))
          ORDER BY (p.end_date - p.start_date) ASC, p.start_date DESC
          LIMIT 1
        `;
    return rows[0];
  }

  private remaining(a: AllocationRow): Prisma.Decimal {
    return new Decimal(a.total_amount).minus(a.committed_amount).minus(a.spent_amount);
  }
}
