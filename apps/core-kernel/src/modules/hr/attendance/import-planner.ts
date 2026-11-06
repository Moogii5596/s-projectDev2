import { CampEmployeeStatus, CampMealType, CampMovementDirection, CampMovementKind, CampShiftAdjustmentReason, CampShiftType } from '@prisma/client';
import { t } from '../../../common/i18n/translate';
import { addDays } from '../../camp/common/camp-date';
import { ROSTER_ARRIVAL_MEALS, ROSTER_DEPARTURE_MEALS } from './meal-rules';
import { classifyMovement, rosterDayNo, RosterSettings } from './roster';
import { PatternSegment, uniformShift } from './shift-resolver';
import type { ParsedRow, ShiftChangeSource } from './import-parser';

/**
 * Ирэлт/явалтын төлөвлөгч (Шат 3.3) — ЦЭВЭР функц: DB төлөв + мөрүүд → мөрийн алдаа + бичих үйлдлүүд.
 * PREVIEW ба CONFIRM (transaction дотор DB төлвийг дахин уншиж) хоёулаа үүнийг ашиглана → дүрэм нэг газарт.
 * Нэг ажилтны мөрүүдийг огноогоор (нэг өдөрт DEPARTURE эхэлж) дараалан шалгана.
 */
export interface PlannerEmployee {
  id: string;
  campId: string;
  status: CampEmployeeStatus;
  crewAnchor: string | null;
  /** v0.2.3 Блок R: сунгалтын ээлж (хэлтсийн загвар) */
  departmentId?: string;
}
export interface PlannerStay {
  id: string;
  startDate: string;
  endDate: string | null;
}
export interface PlannerState {
  campId: string;
  settings: RosterSettings & { extensionDefaultDays?: number };
  employees: Map<string, PlannerEmployee>; // employee_code → ажилтан
  stays: Map<string, PlannerStay[]>; // employeeId → байх хугацаанууд
  movementKeys: Set<string>; // `${employeeId}|${date}|${direction}`
  adjustments: Map<string, { startDate: string; endDate: string; reasonType?: CampShiftAdjustmentReason }[]>; // employeeId → зохицуулалт
  /** v0.2.3 Блок R: departmentId → ээлжийн загвар (сунгалтын ээлж) */
  patterns?: Map<string, PatternSegment[]>;
}

export interface PlannedRow {
  row: number;
  employeeCode: string;
  employeeId: string | null;
  date: string | null;
  direction: CampMovementDirection | null;
  kind: CampMovementKind | null;
  meals: CampMealType[] | null;
  shift: CampShiftType | null;
  errors: string[];
  /** v0.2.3 Блок R */
  action?: 'EXTEND';
  /** EXTEND: сунгалтын сүүлийн өдөр */
  extendTo?: string;
  warnings?: string[];
  /** ShiftChange эх мөр (хуудас, мөр, нэр) */
  source?: ShiftChangeSource;
}
export interface PlannedMovement {
  key: string;
  employeeId: string;
  date: string;
  direction: CampMovementDirection;
  kind: CampMovementKind;
  meals: CampMealType[];
}
export interface ImportPlan {
  rows: PlannedRow[];
  movements: PlannedMovement[];
  /** Шинэ байх хугацаа (ирэлтээр нээгдэнэ; нэг файлд явалт байвал хаагдсан) */
  newStays: { employeeId: string; arrivalKey: string; departureKey: string | null; startDate: string; endDate: string | null }[];
  /** DB-д байгаа нээлттэй байх хугацааг хаах */
  closeStays: { stayId: string; departureKey: string; endDate: string }[];
  adjustments: { employeeId: string; startDate: string; endDate: string; shift: CampShiftType; reasonType?: CampShiftAdjustmentReason }[];
  errorRows: number;
}

export const movementKey = (employeeId: string, date: string, direction: CampMovementDirection) => `${employeeId}|${date}|${direction}`;
const overlaps = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

export function planImport(input: ParsedRow[], state: PlannerState): ImportPlan {
  const plan: ImportPlan = { rows: [], movements: [], newStays: [], closeStays: [], adjustments: [], errorRows: 0 };
  const seen = new Set<string>();
  const order = (r: ParsedRow) => `${r.employeeCode}|${r.date ?? ''}|${r.direction === CampMovementDirection.DEPARTURE ? 0 : 1}|${String(r.row).padStart(6, '0')}`;
  const sorted = [...input].sort((a, b) => order(a).localeCompare(order(b)));

  // ажилтан бүрийн ажлын төлөв (DB + энэ файлд төлөвлөсөн)
  type WorkStay = { id: string | null; newIdx: number | null; startDate: string; endDate: string | null };
  const work = new Map<string, WorkStay[]>();
  const adjOf = (id: string) => state.adjustments.get(id) ?? [];
  const plannedAdj = new Map<string, { idx: number; stayNewIdx: number }>();

  for (const r of sorted) {
    const out: PlannedRow = { row: r.row, employeeCode: r.employeeCode, employeeId: null, date: r.date, direction: r.direction, kind: null, meals: r.meals, shift: r.shift, errors: [...r.errors] };
    if (r.warnings?.length) out.warnings = [...r.warnings];
    if (r.action) out.action = r.action;
    if (r.source) out.source = r.source;
    plan.rows.push(out);
    const emp = r.employeeCode ? state.employees.get(r.employeeCode) : undefined;
    if (r.employeeCode && !emp) out.errors.push(t('camp.row.employee_not_found', { code: r.employeeCode }));
    else if (emp && emp.campId !== state.campId) out.errors.push(t('camp.row.other_camp'));
    else if (emp && emp.status !== CampEmployeeStatus.ACTIVE) out.errors.push(t('camp.row.employee_inactive'));
    if (r.action === 'EXTEND') {
      if (emp) out.employeeId = emp.id;
      if (out.errors.length === 0 && emp && r.date) planExtension(plan, state, out, emp, r.date, r.source?.extendDays ?? null, work);
      continue;
    }
    if (out.errors.length > 0 || !emp || !r.date || !r.direction) {
      if (emp) out.employeeId = emp.id;
      continue;
    }
    out.employeeId = emp.id;
    const date = r.date;
    const key = movementKey(emp.id, date, r.direction);
    if (seen.has(key)) {
      out.errors.push(t('camp.row.duplicate'));   // тодорхой мессеж (бусад шалгалтыг алгасна)
      continue;
    }
    if (state.movementKeys.has(key)) out.errors.push(t('camp.row.already_registered'));
    const kind = classifyMovement(emp.crewAnchor, date, r.direction, state.settings);
    out.kind = kind;
    // R-8: ShiftChange (HR файл)-д хоолны багана алга → анхдагч хоол
    if (kind === CampMovementKind.OFF_ROSTER && r.meals === null && !r.source) {
      out.errors.push(t('camp.row.meals_required'));
    }
    const meals = r.meals ?? (r.direction === CampMovementDirection.ARRIVAL ? ROSTER_ARRIVAL_MEALS : ROSTER_DEPARTURE_MEALS);
    out.meals = meals;

    const stays = work.get(emp.id) ?? (state.stays.get(emp.id) ?? []).map((s) => ({ id: s.id, newIdx: null, startDate: s.startDate, endDate: s.endDate }));
    work.set(emp.id, stays);

    if (r.direction === CampMovementDirection.ARRIVAL) {
      const clash = stays.find((s) => s.endDate === null || s.endDate >= date);
      if (clash) out.errors.push(clash.endDate === null ? t('camp.row.still_in_camp', { date: clash.startDate }) : t('camp.row.stay_overlap', { from: clash.startDate, to: clash.endDate }));
      let adjEnd: string | null = null;
      if (r.shift) {
        adjEnd = addDays(date, state.settings.rosterOnDays);
        const busy = [...adjOf(emp.id), ...plan.adjustments.filter((a) => a.employeeId === emp.id)].find((a) => overlaps(date, adjEnd as string, a.startDate, a.endDate));
        if (busy) out.errors.push(t('camp.row.adjustment_overlap', { from: busy.startDate, to: busy.endDate }));
      }
      if (out.errors.length > 0) continue;
      seen.add(key);
      plan.movements.push({ key, employeeId: emp.id, date, direction: r.direction, kind, meals });
      const newIdx = plan.newStays.push({ employeeId: emp.id, arrivalKey: key, departureKey: null, startDate: date, endDate: null }) - 1;
      stays.push({ id: null, newIdx, startDate: date, endDate: null });
      if (r.shift && adjEnd) {
        const idx = plan.adjustments.push({ employeeId: emp.id, startDate: date, endDate: adjEnd, shift: r.shift }) - 1;
        plannedAdj.set(`${emp.id}|${newIdx}`, { idx, stayNewIdx: newIdx });
      }
    } else {
      if (r.shift) out.errors.push(t('camp.row.shift_arrival_only'));
      const open = stays.find((s) => s.endDate === null);
      if (!open) out.errors.push(t('camp.row.not_in_camp'));
      else if (open.startDate > date) out.errors.push(t('camp.row.departure_before_arrival', { date: open.startDate }));
      if (out.errors.length > 0 || !open) continue;
      seen.add(key);
      plan.movements.push({ key, employeeId: emp.id, date, direction: r.direction, kind, meals });
      open.endDate = date;
      if (open.newIdx !== null) {
        plan.newStays[open.newIdx].departureKey = key;
        plan.newStays[open.newIdx].endDate = date;
        const adj = plannedAdj.get(`${emp.id}|${open.newIdx}`);
        if (adj && plan.adjustments[adj.idx].endDate > date) plan.adjustments[adj.idx].endDate = date;
      } else {
        plan.closeStays.push({ stayId: open.id as string, departureKey: key, endDate: date });
      }
    }
  }
  plan.rows.sort((a, b) => a.row - b.row);
  plan.errorRows = plan.rows.filter((r) => r.errors.length > 0).length;
  return plan;
}

type WorkStays = Map<string, { endDate: string | null }[]>;

/** Ажлын сүүлийн өдрийн (ростерын өдөр on) ээлж: хэлтсийн загвар → нэг ээлжтэй загвар → null */
function lastWorkdayShift(state: PlannerState, emp: PlannerEmployee): CampShiftType | null {
  const pattern = (emp.departmentId && state.patterns?.get(emp.departmentId)) || [];
  const on = state.settings.rosterOnDays;
  return pattern.find((p) => on >= p.dayFrom && on <= p.dayTo)?.shift ?? uniformShift(pattern);
}

/**
 * R-6 — «Сунах»: явалт үүсгэхгүй, ростерын явах өдрөөс N хоногийн EXTENSION зохицуулалт.
 * Өмнөх сунгалт энэ өдрийг хамарвал түүний дараа үргэлжилнэ; бусад зохицуулалттай давхцвал алдаа.
 */
function planExtension(plan: ImportPlan, state: PlannerState, out: PlannedRow, emp: PlannerEmployee, date: string, days: number | null, work: WorkStays) {
  const warn = (code: string, params?: Record<string, string | number>) => (out.warnings ??= []).push(t(code, params));
  if (emp.crewAnchor === null) {
    warn('camp.row.sc_extend_no_crew');
    return;
  }
  const s = state.settings;
  const departDay = s.rosterOnDays + 1;
  const n = rosterDayNo(emp.crewAnchor, date, s);
  if (n !== departDay) warn('camp.row.sc_extend_not_departure_day', { date: addDays(date, departDay - n) });
  const stays = work.get(emp.id) ?? (state.stays.get(emp.id) ?? []);
  if (!stays.some((x) => x.endDate === null)) warn('camp.row.sc_extend_not_in_camp');

  const adjs = [...(state.adjustments.get(emp.id) ?? []), ...plan.adjustments.filter((a) => a.employeeId === emp.id)];
  let start = date;
  for (let guard = 0; guard < 50; guard++) {
    const prev = adjs.find((a) => a.reasonType === CampShiftAdjustmentReason.EXTENSION && a.startDate <= start && a.endDate >= start);
    if (!prev) break;
    start = addDays(prev.endDate, 1);
  }
  const end = addDays(start, (days ?? s.extensionDefaultDays ?? 7) - 1);
  const busy = adjs.find((a) => a.startDate <= end && start <= a.endDate);
  if (busy) {
    out.errors.push(t('camp.row.adjustment_overlap', { from: busy.startDate, to: busy.endDate }));
    return;
  }
  let shift = lastWorkdayShift(state, emp);
  if (!shift) {
    warn('camp.row.sc_extend_shift_unknown');
    shift = CampShiftType.DAY;
  }
  out.shift = shift;
  out.date = start;
  out.extendTo = end;
  plan.adjustments.push({ employeeId: emp.id, startDate: start, endDate: end, shift, reasonType: CampShiftAdjustmentReason.EXTENSION });
}
