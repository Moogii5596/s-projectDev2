import { Injectable } from '@nestjs/common';
import { CampImportStatus, CampMovementDirection, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { assertDate, assertRange } from './range';
import { buildAttendanceTemplate, parseAttendanceXlsx, ParsedRow } from './import-parser';
import { planImport, PlannedRow } from './import-planner';
import { applyPlan, loadPlannerState, lockCampAttendance } from './attendance-state';
import { CreateMovementDto, ManualMovementsDto, QueryImportsDto, RangeQueryDto } from './camp-attendance.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

const P = CAMP_PERMISSIONS;
const CONFIRM_TX = { timeout: 120_000, maxWait: 10_000 };
const MAX_RANGE_DAYS = 93;

const rowErrors = (rows: PlannedRow[]) => rows.filter((r) => r.errors.length > 0).map((r) => ({ row: r.row, employeeCode: r.employeeCode, messages: r.errors }));

/**
 * Ирц (Шат 3.3): xlsx импорт PREVIEW → CONFIRM (нэг transaction, бүх мөр зөв үед л), гараар бүртгэл, байх хугацаа.
 * Дүрэм нэг газарт: planImport (цэвэр) — PREVIEW, CONFIRM (DB төлвийг дахин уншина), гараар бүртгэл гурвуулаа.
 */
@Injectable()
export class CampAttendanceService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  template(): Promise<Buffer> {
    return buildAttendanceTemplate();
  }

  async preview(tenantId: string, authId: string, campId: string, fileName: string, buffer: Buffer) {
    const parsed = await parseAttendanceXlsx(buffer);
    return this.previewParsed(tenantId, authId, campId, fileName, parsed);
  }

  /**
   * FB-14 (v0.2.0) — олон ажилтны ирц нэг дор: сонгосон ажилтан бүрт нэг мөр → xlsx-тэй ИЖИЛ planner/PREVIEW/confirm.
   * meals: алга/null = ростерын анхдагч (ээлжийн бус бол planner алдаа өгнө), [] = NONE.
   */
  async previewManual(tenantId: string, authId: string, campId: string, dto: ManualMovementsDto) {
    const employees = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      return tx.campEmployee.findMany({ where: { tenantId, campId, id: { in: dto.employeeIds } }, select: { employeeCode: true }, orderBy: { employeeCode: 'asc' } });
    });
    if (employees.length !== dto.employeeIds.length) throw badRequest('camp.err.attendance.1');
    const parsed: ParsedRow[] = employees.map((e, i) => ({
      row: i + 2,
      employeeCode: e.employeeCode,
      date: dto.date,
      direction: dto.direction,
      meals: dto.meals === undefined || dto.meals === null ? null : dto.meals,
      shift: dto.shift ?? null,
      errors: [],
    }));
    return this.previewParsed(tenantId, authId, campId, `manual-${dto.date}-${dto.direction.toLowerCase()}-${employees.length}`, parsed);
  }

  private async previewParsed(tenantId: string, authId: string, campId: string, fileName: string, parsed: ParsedRow[]) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
        await getCampOr404(tx, tenantId, campId);
        const state = await loadPlannerState(tx, tenantId, campId, parsed.map((r) => r.employeeCode), parsed.map((r) => r.date ?? ''));
        const plan = planImport(parsed, state);
        const imp = await tx.campMovementImport.create({
          data: {
            tenantId, campId, fileName: fileName.slice(0, 200) || 'import.xlsx', status: CampImportStatus.PREVIEW,
            totalRows: plan.rows.length, okRows: plan.rows.length - plan.errorRows, errorRows: plan.errorRows,
            errors: rowErrors(plan.rows) as unknown as Prisma.InputJsonValue,
            parsedRows: parsed as unknown as Prisma.InputJsonValue,
            uploadedBy: actorId,
          },
          select: { id: true, fileName: true, status: true, totalRows: true, okRows: true, errorRows: true, createdAt: true },
        });
        return { import: imp, rows: plan.rows, summary: this.summary(plan) };
      }),
    );
  }

  private summary(plan: ReturnType<typeof planImport>) {
    return {
      arrivals: plan.movements.filter((m) => m.direction === CampMovementDirection.ARRIVAL).length,
      departures: plan.movements.filter((m) => m.direction === CampMovementDirection.DEPARTURE).length,
      offRoster: plan.movements.filter((m) => m.kind === 'OFF_ROSTER').length,
      shiftAdjustments: plan.adjustments.length,
      errorRows: plan.errorRows,
    };
  }

  async listImports(tenantId: string, authId: string, campId: string, q: QueryImportsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      return tx.campMovementImport.findMany({
        where: { tenantId, campId, ...(q.status ? { status: q.status } : {}) },
        select: { id: true, fileName: true, status: true, totalRows: true, okRows: true, errorRows: true, createdAt: true, confirmedAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
    });
  }

  async getImport(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      const imp = await tx.campMovementImport.findFirst({
        where: { id, tenantId, campId },
        select: { id: true, fileName: true, status: true, totalRows: true, okRows: true, errorRows: true, errors: true, parsedRows: true, createdAt: true, confirmedAt: true },
      });
      if (!imp) throw notFound('camp.err.attendance.2');
      return imp;
    });
  }

  /** Бүх мөр зөв үед л бичнэ (all-or-nothing). DB төлвийг transaction дотор дахин уншиж төлөвлөнө (PREVIEW-ээс хойш өөрчлөгдсөн байж болно). */
  async confirm(tenantId: string, authId: string, campId: string, id: string) {
    const result = await withCampErrors(() =>
      inTenantTx(
        this.prisma,
        tenantId,
        async (tx) => {
          const actorId = await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
          await lockCampAttendance(tx, campId);
          const imp = await tx.campMovementImport.findFirst({ where: { id, tenantId, campId }, select: { id: true, status: true, fileName: true, parsedRows: true } });
          if (!imp) throw notFound('camp.err.attendance.2');
          if (imp.status !== CampImportStatus.PREVIEW) throw conflict('camp.err.attendance.3', { status: imp.status });
          const parsed = imp.parsedRows as unknown as ParsedRow[];
          const state = await loadPlannerState(tx, tenantId, campId, parsed.map((r) => r.employeeCode), parsed.map((r) => r.date ?? ''));
          const plan = planImport(parsed, state);
          if (plan.errorRows > 0) {
            // алдааг хадгалж (commit) дараа нь 409 өгнө
            await tx.campMovementImport.update({
              where: { id },
              data: { okRows: plan.rows.length - plan.errorRows, errorRows: plan.errorRows, errors: rowErrors(plan.rows) as unknown as Prisma.InputJsonValue },
            });
            return { ok: false as const, errors: rowErrors(plan.rows) };
          }
          const applied = await applyPlan(tx, { tenantId, campId, actorId, importId: id, reason: `Ирц импорт: ${imp.fileName}` }, plan);
          await tx.campMovementImport.update({
            where: { id },
            data: { status: CampImportStatus.CONFIRMED, confirmedBy: actorId, confirmedAt: new Date(), okRows: plan.rows.length, errorRows: 0, errors: [] },
          });
          return { ok: true as const, applied };
        },
        CONFIRM_TX,
      ),
    );
    if (!result.ok) {
      throw conflict('camp.err.attendance.8', { n: result.errors.length }, { errors: result.errors });
    }
    return { status: CampImportStatus.CONFIRMED, ...result.applied };
  }

  async cancel(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      const res = await tx.campMovementImport.updateMany({ where: { id, tenantId, campId, status: CampImportStatus.PREVIEW }, data: { status: CampImportStatus.CANCELLED } });
      if (res.count !== 1) throw conflict('camp.err.attendance.4');
      return { status: CampImportStatus.CANCELLED };
    });
  }

  // ── Гараар бүртгэл ─────────────────────────────────────────

  async createMovement(tenantId: string, authId: string, campId: string, dto: CreateMovementDto) {
    assertDate(dto.date);
    const result = await withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
        await lockCampAttendance(tx, campId);
        const emp = await tx.campEmployee.findFirst({ where: { id: dto.employeeId, tenantId, campId }, select: { employeeCode: true } });
        if (!emp) throw badRequest('camp.err.attendance.5');
        const row: ParsedRow = { row: 1, employeeCode: emp.employeeCode, date: dto.date, direction: dto.direction, meals: dto.meals ?? null, shift: dto.shift ?? null, errors: [] };
        const state = await loadPlannerState(tx, tenantId, campId, [emp.employeeCode], [dto.date]);
        const plan = planImport([row], state);
        if (plan.errorRows > 0) return { ok: false as const, errors: plan.rows[0].errors };
        await applyPlan(tx, { tenantId, campId, actorId, importId: null, reason: 'Гараар бүртгэсэн ирэлт' }, plan);
        return { ok: true as const, movement: plan.movements[0] };
      }),
    );
    if (!result.ok) throw badRequest('camp.err.attendance.9', { errors: result.errors.join('; ') });
    return { employeeId: dto.employeeId, date: dto.date, direction: dto.direction, kind: result.movement.kind, meals: result.movement.meals };
  }

  /** Зөвхөн ажилтны ХАМГИЙН СҮҮЛИЙН бүртгэлийг устгана: ирэлт → stay устгана, явалт → stay-г дахин нээнэ */
  async deleteMovement(tenantId: string, authId: string, campId: string, id: string) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
        await lockCampAttendance(tx, campId);
        const m = await tx.campMovement.findFirst({ where: { id, tenantId, campId }, select: { id: true, employeeId: true, movementDate: true, direction: true } });
        if (!m) throw notFound('camp.err.attendance.6');
        const later = await tx.campMovement.findFirst({
          where: {
            tenantId, employeeId: m.employeeId, NOT: { id },
            OR: [
              { movementDate: { gt: m.movementDate } },
              ...(m.direction === CampMovementDirection.ARRIVAL ? [{ movementDate: m.movementDate, direction: CampMovementDirection.DEPARTURE }] : []),
            ],
          },
          select: { movementDate: true },
        });
        if (later) throw conflict('camp.err.attendance.7', { date: fromDbDate(later.movementDate) });
        if (m.direction === CampMovementDirection.ARRIVAL) {
          await tx.campStay.deleteMany({ where: { tenantId, arrivalMovementId: id, departureMovementId: null } });
        } else {
          await tx.campStay.updateMany({ where: { tenantId, departureMovementId: id }, data: { endDate: null, departureMovementId: null } });
        }
        await tx.campMovement.delete({ where: { id } });
        return { deleted: true };
      }),
    );
  }

  async listMovements(tenantId: string, authId: string, campId: string, q: RangeQueryDto) {
    assertRange(q.from, q.to, MAX_RANGE_DAYS);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const rows = await tx.campMovement.findMany({
        where: {
          tenantId,
          campId,
          movementDate: { gte: toDbDate(q.from), lte: toDbDate(q.to) },
          ...(q.employeeId ? { employeeId: q.employeeId } : {}),
          // FB-14: ажилтны шүүлт
          ...(q.departmentId || q.crewId || q.position || q.q
            ? {
                employee: {
                  ...(q.departmentId ? { departmentId: q.departmentId } : {}),
                  ...(q.crewId ? { crewId: q.crewId === 'none' ? null : q.crewId } : {}),
                  ...(q.position ? { position: { equals: q.position, mode: 'insensitive' as const } } : {}),
                  ...(q.q
                    ? { OR: [{ employeeCode: { contains: q.q, mode: 'insensitive' as const } }, { fullName: { contains: q.q, mode: 'insensitive' as const } }] }
                    : {}),
                },
              }
            : {}),
        },
        select: {
          id: true, movementDate: true, direction: true, kind: true, meals: true, importId: true, createdAt: true,
          employee: { select: { id: true, employeeCode: true, fullName: true, position: true, department: { select: { code: true } }, crew: { select: { code: true } } } },
        },
        orderBy: [{ movementDate: 'asc' }, { direction: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map((r) => ({ ...r, movementDate: fromDbDate(r.movementDate) }));
    });
  }

  /** D өдөр кемпэд байгаа (D-г хамарсан stay) ажилтнууд — ирсэн/явсан/бүтэн өдөр */
  async listStays(tenantId: string, authId: string, campId: string, date: string) {
    assertDate(date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const d = toDbDate(date);
      const rows = await tx.campStay.findMany({
        where: { tenantId, campId, startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] },
        select: {
          id: true, startDate: true, endDate: true,
          employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { code: true, name: true } }, crew: { select: { code: true } } } },
        },
        orderBy: { employee: { employeeCode: 'asc' } },
      });
      return rows.map((r) => {
        const start = fromDbDate(r.startDate);
        const end = r.endDate ? fromDbDate(r.endDate) : null;
        return { ...r, startDate: start, endDate: end, dayType: start === date ? 'ARRIVAL' : end === date ? 'DEPARTURE' : 'FULL_DAY' };
      });
    });
  }
}
