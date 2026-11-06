import { Injectable } from '@nestjs/common';
import { CampImportStatus, CampMovementDirection, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CAMP_PERMISSIONS } from '../../camp/common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate } from '../../camp/common/camp-tx';
import { withCampErrors } from '../../camp/common/camp-errors';
import { getCampOr404 } from '../../camp/common/camp-lookup';
import { assertDate, assertRange } from './range';
import { buildAttendanceTemplate, parseAttendanceXlsx, ParsedRow } from './import-parser';
import { planImport, PlannedRow } from './import-planner';
import { applyPlan, loadPlannerState, lockCampAttendance } from './attendance-state';
import { CreateMovementDto, ManualMovementsDto, QueryImportsDto, RangeQueryDto, UpdateImportRowsDto } from './hr-attendance.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { HrAttendanceHooks } from './stay-store';
import { collectShiftChange, isAttendanceTemplate, loadXlsx, SkippedSheet } from './shiftchange-parser';
import { loadResolverEmployees, resolveShiftChange } from './shiftchange-resolver';
import { applyRowEdits, planWithDeleted } from './import-edits';
import { loadRosterGaps, RosterGap } from './roster-gaps';
import type { Tx } from '../../camp/common/camp-tx';

const P = CAMP_PERMISSIONS;
const CONFIRM_TX = { timeout: 120_000, maxWait: 10_000 };
const MAX_RANGE_DAYS = 93;
const IMPORT_SELECT = { id: true, fileName: true, status: true, totalRows: true, okRows: true, errorRows: true, createdAt: true } as const;

/** PREVIEW-ийн нэмэлт мэдээлэл (v0.2.3 Блок R) */
interface PreviewMeta {
  format: 'TEMPLATE' | 'SHIFTCHANGE' | 'MANUAL';
  skippedSheets?: SkippedSheet[];
}

/** Хуучин импорт ('{}') → TEMPLATE */
const readMeta = (v: unknown): PreviewMeta => {
  const m = (v ?? {}) as Partial<PreviewMeta>;
  return { format: m.format ?? 'TEMPLATE', skippedSheets: m.skippedSheets ?? [] };
};

const rowErrors = (rows: PlannedRow[]) =>
  rows
    .filter((r) => r.errors.length > 0)
    .map((r) => ({ row: r.row, employeeCode: r.employeeCode, messages: r.errors, ...(r.source ? { sheet: r.source.sheet, sheetRow: r.source.row } : {}) }));

/**
 * Ирц (Шат 3.3): xlsx импорт PREVIEW → CONFIRM (нэг transaction, бүх мөр зөв үед л), гараар бүртгэл, байх хугацаа.
 * Дүрэм нэг газарт: planImport (цэвэр) — PREVIEW, CONFIRM (DB төлвийг дахин уншина), гараар бүртгэл гурвуулаа.
 */
@Injectable()
export class HrAttendanceService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly hooks: HrAttendanceHooks,
  ) {}

  template(): Promise<Buffer> {
    return buildAttendanceTemplate();
  }

  /**
   * xlsx PREVIEW — загварыг автоматаар таньна: «Ирц» загвар (employee_code / date / direction) эсвэл
   * HR-ийн ShiftChange (v0.2.3 Блок R: ирэх / буух / Сунах хуудас → ажилтантай тулгаж planner руу).
   */
  async preview(tenantId: string, authId: string, campId: string, fileName: string, buffer: Buffer) {
    const wb = await loadXlsx(buffer);
    const sc = isAttendanceTemplate(wb) ? null : collectShiftChange(wb);
    if (!sc || sc.rows.length === 0) {
      const parsed = await parseAttendanceXlsx(buffer); // «Ирц» загварын алдаа (багана алга г.м.) эндээс
      return this.previewParsed(tenantId, authId, campId, fileName, parsed, { format: 'TEMPLATE' });
    }
    const employees = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      return loadResolverEmployees(tx, tenantId, campId);
    });
    const parsed = resolveShiftChange(sc.rows, employees);
    return this.previewParsed(tenantId, authId, campId, fileName, parsed, { format: 'SHIFTCHANGE', skippedSheets: sc.skipped });
  }

  /**
   * FB-14 (v0.2.0) — олон ажилтны ирц нэг дор: сонгосон ажилтан бүрт нэг мөр → xlsx-тэй ИЖИЛ planner/PREVIEW/confirm.
   * meals: алга/null = ростерын анхдагч (ээлжийн бус бол planner алдаа өгнө), [] = NONE.
   */
  async previewManual(tenantId: string, authId: string, campId: string, dto: ManualMovementsDto) {
    const employees = await inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      return tx.hrEmployee.findMany({ where: { tenantId, campId, id: { in: dto.employeeIds } }, select: { employeeCode: true }, orderBy: { employeeCode: 'asc' } });
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
    return this.previewParsed(tenantId, authId, campId, `manual-${dto.date}-${dto.direction.toLowerCase()}-${employees.length}`, parsed, { format: 'MANUAL' });
  }

  private async previewParsed(tenantId: string, authId: string, campId: string, fileName: string, parsed: ParsedRow[], meta: PreviewMeta) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
        await getCampOr404(tx, tenantId, campId);
        const planned = await this.planPreview(tx, tenantId, campId, parsed);
        const gaps = await this.rosterGaps(tx, tenantId, campId, parsed, meta);
        const imp = await tx.hrMovementImport.create({
          data: {
            tenantId, campId, fileName: fileName.slice(0, 200) || 'import.xlsx', status: CampImportStatus.PREVIEW,
            ...this.counts(planned.plan),
            parsedRows: parsed as unknown as Prisma.InputJsonValue,
            previewMeta: { format: meta.format, skippedSheets: meta.skippedSheets ?? [] } as unknown as Prisma.InputJsonValue,
            uploadedBy: actorId,
          },
          select: IMPORT_SELECT,
        });
        return this.previewResponse(imp, planned, meta, gaps);
      }),
    );
  }

  private async planPreview(tx: Tx, tenantId: string, campId: string, parsed: ParsedRow[]) {
    const active = parsed.filter((r) => !r.deleted);
    const state = await loadPlannerState(tx, tenantId, campId, active.map((r) => r.employeeCode), active.map((r) => r.date ?? ''), this.hooks.stays);
    return planWithDeleted(parsed, state);
  }

  /** totalRows = устгаагүй мөр (ok + error = total) */
  private counts(plan: ReturnType<typeof planImport>) {
    return {
      totalRows: plan.rows.length, okRows: plan.rows.length - plan.errorRows, errorRows: plan.errorRows,
      errors: rowErrors(plan.rows) as unknown as Prisma.InputJsonValue,
    };
  }

  /** R4.2 — зөвхөн ShiftChange: ростероор ирэх / явах ёстой боловч файлд алга (анхааруулга) */
  private rosterGaps(tx: Tx, tenantId: string, campId: string, parsed: ParsedRow[], meta: PreviewMeta): Promise<RosterGap[]> {
    return meta.format === 'SHIFTCHANGE' ? loadRosterGaps(tx, tenantId, campId, parsed, this.hooks.stays) : Promise.resolve([]);
  }

  private previewResponse(imp: unknown, planned: ReturnType<typeof planWithDeleted>, meta: PreviewMeta, rosterGaps: RosterGap[]) {
    return {
      import: imp,
      rows: planned.rows,
      summary: { ...this.summary(planned.plan), deletedRows: planned.deletedRows },
      format: meta.format,
      skippedSheets: meta.skippedSheets ?? [],
      rosterGaps,
    };
  }

  /**
   * v0.2.3 Блок R4.1 (R-10…R-12) — PREVIEW-ийн мөрийг засах / устгах → дахин төлөвлөж шинэ PREVIEW буцаана.
   * Зөвхөн PREVIEW (бусад төлөвт 409); ажилтан = энэ кемпийн ажилтан. Ирцийн lock-оор CONFIRM-тэй дараалуулна.
   */
  async updateRows(tenantId: string, authId: string, campId: string, id: string, dto: UpdateImportRowsDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
        await lockCampAttendance(tx, campId);
        const imp = await tx.hrMovementImport.findFirst({ where: { id, tenantId, campId }, select: { status: true, parsedRows: true, previewMeta: true } });
        if (!imp) throw notFound('camp.err.attendance.2');
        if (imp.status !== CampImportStatus.PREVIEW) throw conflict('camp.err.attendance.11', { status: imp.status });
        const ids = [...new Set(dto.rows.map((r) => r.employeeId).filter((x): x is string => !!x))];
        const emps = ids.length
          ? await tx.hrEmployee.findMany({ where: { tenantId, campId, id: { in: ids } }, select: { id: true, employeeCode: true } })
          : [];
        const parsed = applyRowEdits(imp.parsedRows as unknown as ParsedRow[], dto.rows, new Map(emps.map((e) => [e.id, e.employeeCode])));
        const planned = await this.planPreview(tx, tenantId, campId, parsed);
        const updated = await tx.hrMovementImport.update({
          where: { id },
          data: { ...this.counts(planned.plan), parsedRows: parsed as unknown as Prisma.InputJsonValue },
          select: IMPORT_SELECT,
        });
        const meta = readMeta(imp.previewMeta);
        return this.previewResponse(updated, planned, meta, await this.rosterGaps(tx, tenantId, campId, parsed, meta));
      }),
    );
  }

  private summary(plan: ReturnType<typeof planImport>) {
    return {
      arrivals: plan.movements.filter((m) => m.direction === CampMovementDirection.ARRIVAL).length,
      departures: plan.movements.filter((m) => m.direction === CampMovementDirection.DEPARTURE).length,
      offRoster: plan.movements.filter((m) => m.kind === 'OFF_ROSTER').length,
      shiftAdjustments: plan.adjustments.filter((a) => a.reasonType !== 'EXTENSION').length,
      extensions: plan.adjustments.filter((a) => a.reasonType === 'EXTENSION').length,
      warningRows: plan.rows.filter((r) => (r.warnings?.length ?? 0) > 0).length,
      errorRows: plan.errorRows,
    };
  }

  async listImports(tenantId: string, authId: string, campId: string, q: QueryImportsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.MOVEMENT_IMPORT);
      return tx.hrMovementImport.findMany({
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
      const imp = await tx.hrMovementImport.findFirst({
        where: { id, tenantId, campId },
        select: { id: true, fileName: true, status: true, totalRows: true, okRows: true, errorRows: true, errors: true, parsedRows: true, previewMeta: true, createdAt: true, confirmedAt: true },
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
          const imp = await tx.hrMovementImport.findFirst({ where: { id, tenantId, campId }, select: { id: true, status: true, fileName: true, parsedRows: true } });
          if (!imp) throw notFound('camp.err.attendance.2');
          if (imp.status !== CampImportStatus.PREVIEW) throw conflict('camp.err.attendance.3', { status: imp.status });
          const parsed = (imp.parsedRows as unknown as ParsedRow[]).filter((r) => !r.deleted); // R4.1: устгасан мөр бичигдэхгүй
          if (parsed.length === 0) throw badRequest('camp.err.attendance.10');
          const state = await loadPlannerState(tx, tenantId, campId, parsed.map((r) => r.employeeCode), parsed.map((r) => r.date ?? ''), this.hooks.stays);
          const plan = planImport(parsed, state);
          if (plan.errorRows > 0) {
            // алдааг хадгалж (commit) дараа нь 409 өгнө
            await tx.hrMovementImport.update({
              where: { id },
              data: { okRows: plan.rows.length - plan.errorRows, errorRows: plan.errorRows, errors: rowErrors(plan.rows) as unknown as Prisma.InputJsonValue },
            });
            return { ok: false as const, errors: rowErrors(plan.rows) };
          }
          const applied = await applyPlan(tx, { tenantId, campId, actorId, importId: id, reason: `Ирц импорт: ${imp.fileName}` }, plan, this.hooks.stays);
          await tx.hrMovementImport.update({
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
      const res = await tx.hrMovementImport.updateMany({ where: { id, tenantId, campId, status: CampImportStatus.PREVIEW }, data: { status: CampImportStatus.CANCELLED } });
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
        const emp = await tx.hrEmployee.findFirst({ where: { id: dto.employeeId, tenantId, campId }, select: { employeeCode: true } });
        if (!emp) throw badRequest('camp.err.attendance.5');
        const row: ParsedRow = { row: 1, employeeCode: emp.employeeCode, date: dto.date, direction: dto.direction, meals: dto.meals ?? null, shift: dto.shift ?? null, errors: [] };
        const state = await loadPlannerState(tx, tenantId, campId, [emp.employeeCode], [dto.date], this.hooks.stays);
        const plan = planImport([row], state);
        if (plan.errorRows > 0) return { ok: false as const, errors: plan.rows[0].errors };
        await applyPlan(tx, { tenantId, campId, actorId, importId: null, reason: 'Гараар бүртгэсэн ирэлт' }, plan, this.hooks.stays);
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
        const m = await tx.hrMovement.findFirst({ where: { id, tenantId, campId }, select: { id: true, employeeId: true, movementDate: true, direction: true } });
        if (!m) throw notFound('camp.err.attendance.6');
        const later = await tx.hrMovement.findFirst({
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
          await this.hooks.stays.undoArrival(tx, tenantId, id);
        } else {
          await this.hooks.stays.undoDeparture(tx, tenantId, id);
        }
        await tx.hrMovement.delete({ where: { id } });
        return { deleted: true };
      }),
    );
  }

  async listMovements(tenantId: string, authId: string, campId: string, q: RangeQueryDto) {
    assertRange(q.from, q.to, MAX_RANGE_DAYS);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const rows = await tx.hrMovement.findMany({
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
}
