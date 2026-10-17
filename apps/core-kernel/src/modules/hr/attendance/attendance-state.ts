import { CampEmployeeStatus, CampMovementDirection, CampShiftAdjustmentReason } from '@prisma/client';
import { fromDbDate, toDbDate, Tx } from '../../camp/common/camp-tx';
import { getRosterSettings } from '../../camp/common/camp-lookup';
import { addDays } from '../../camp/common/camp-date';
import { ImportPlan, movementKey, PlannerState } from './import-planner';
import { conflict } from '../../../common/i18n/app-error';
import type { AttendanceStayStore } from './stay-store';

/** Төлөвлөгчийн DB төлөв: тухайн ажилтнуудын (кодоор) байх хугацаа, бүртгэл, зохицуулалт — огнооны мужид хамаарах */
export async function loadPlannerState(
  tx: Tx,
  tenantId: string,
  campId: string,
  codes: string[],
  dates: string[],
  stayStore: AttendanceStayStore,
): Promise<PlannerState> {
  const settings = await getRosterSettings(tx, tenantId, campId);
  const uniqCodes = [...new Set(codes.filter(Boolean))];
  const valid = dates.filter(Boolean).sort();
  const minDate = valid[0] ?? '1970-01-01';
  const maxDate = valid[valid.length - 1] ?? '1970-01-01';
  const employees = await tx.hrEmployee.findMany({
    where: { tenantId, employeeCode: { in: uniqCodes } },
    select: { id: true, campId: true, status: true, employeeCode: true, crew: { select: { rosterAnchorDate: true } } },
  });
  const ids = employees.map((e) => e.id);
  const [stays, movements, adjustments] = await Promise.all([
    stayStore.findForPlanner(tx, tenantId, ids, toDbDate(minDate)),
    tx.hrMovement.findMany({
      where: { tenantId, employeeId: { in: ids }, movementDate: { gte: toDbDate(minDate), lte: toDbDate(maxDate) } },
      select: { employeeId: true, movementDate: true, direction: true },
    }),
    tx.hrShiftAdjustment.findMany({
      where: { tenantId, employeeId: { in: ids }, endDate: { gte: toDbDate(minDate) }, startDate: { lte: toDbDate(addDays(maxDate, settings.rosterOnDays)) } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);
  const group = <T extends { employeeId: string }, R>(rows: T[], map: (r: T) => R) => {
    const m = new Map<string, R[]>();
    for (const r of rows) m.set(r.employeeId, [...(m.get(r.employeeId) ?? []), map(r)]);
    return m;
  };
  return {
    campId,
    settings,
    // v0.2.2 Блок 5 (Q-C2): нэг код ажлаас гарсан + шинэ бүртгэлд байж болно — TERMINATED биш нь давуу (сүүлд бичигдэнэ)
    employees: new Map(
      [...employees]
        .sort((x, y) => Number(x.status !== CampEmployeeStatus.TERMINATED) - Number(y.status !== CampEmployeeStatus.TERMINATED))
        .map((e) => [e.employeeCode, { id: e.id, campId: e.campId, status: e.status, crewAnchor: e.crew ? fromDbDate(e.crew.rosterAnchorDate) : null }]),
    ),
    stays: group(stays, (s) => ({ id: s.id, startDate: fromDbDate(s.startDate), endDate: s.endDate ? fromDbDate(s.endDate) : null })),
    movementKeys: new Set(movements.map((m) => movementKey(m.employeeId, fromDbDate(m.movementDate), m.direction))),
    adjustments: group(adjustments, (a) => ({ startDate: fromDbDate(a.startDate), endDate: fromDbDate(a.endDate) })),
  };
}

/**
 * Төлөвлөгөөг DB-д бичнэ (НЭГ transaction дотор дуудна): бүртгэл → байх хугацаа (шинэ/хаах) → зохицуулалт.
 * Хаах stay өөрчлөгдсөн байвал (зэрэгцээ үйлдэл) → 409, transaction rollback.
 */
export async function applyPlan(
  tx: Tx,
  ctx: { tenantId: string; campId: string; actorId: string; importId: string | null; reason: string },
  plan: ImportPlan,
  stayStore: AttendanceStayStore,
): Promise<{ movements: number; newStays: number; closedStays: number; adjustments: number }> {
  const { tenantId, campId, actorId, importId, reason } = ctx;
  const created = plan.movements.length
    ? await tx.hrMovement.createManyAndReturn({
        data: plan.movements.map((m) => ({
          tenantId, campId, employeeId: m.employeeId, movementDate: toDbDate(m.date), direction: m.direction, kind: m.kind,
          meals: m.meals, importId, createdBy: actorId,
        })),
        select: { id: true, employeeId: true, movementDate: true, direction: true },
      })
    : [];
  const idOf = new Map(created.map((m) => [movementKey(m.employeeId, fromDbDate(m.movementDate), m.direction as CampMovementDirection), m.id]));
  const must = (key: string) => {
    const id = idOf.get(key);
    if (!id) throw conflict('camp.err.attendance_state.1', { key });
    return id;
  };
  if (plan.newStays.length) {
    await stayStore.createMany(
      tx,
      plan.newStays.map((s) => ({
        tenantId, campId, employeeId: s.employeeId, arrivalMovementId: must(s.arrivalKey),
        departureMovementId: s.departureKey ? must(s.departureKey) : null,
        startDate: toDbDate(s.startDate), endDate: s.endDate ? toDbDate(s.endDate) : null,
      })),
    );
  }
  for (const c of plan.closeStays) {
    const count = await stayStore.close(tx, tenantId, c.stayId, toDbDate(c.endDate), must(c.departureKey));
    if (count !== 1) throw conflict('camp.err.attendance_state.2');
  }
  if (plan.adjustments.length) {
    await tx.hrShiftAdjustment.createMany({
      data: plan.adjustments.map((a) => ({
        tenantId, employeeId: a.employeeId, startDate: toDbDate(a.startDate), endDate: toDbDate(a.endDate), shift: a.shift,
        reasonType: CampShiftAdjustmentReason.OTHER, reason, createdBy: actorId,
      })),
    });
  }
  return { movements: created.length, newStays: plan.newStays.length, closedStays: plan.closeStays.length, adjustments: plan.adjustments.length };
}

/** Кемп бүрт нэг зэрэг нэг ирцийн бичилт (импорт/гараар) — race-ээс хамгаална */
export async function lockCampAttendance(tx: Tx, campId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`camp-attendance:${campId}`}))`;
}
