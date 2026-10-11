import { CampMealType, CampShiftType } from '@prisma/client';
import { addDays } from './camp-date';
import { fullDayMeals, MealSlot, movementMealSlots } from './meal-rules';
import { RosterSettings } from './roster';
import { AdjustmentRange, PatternSegment, resolveShift, ShiftSource } from './shift-resolver';

export interface PresenceStay {
  startDate: string;
  endDate: string | null;
  arrivalMeals: CampMealType[];
  departureMeals: CampMealType[] | null;
}

export interface PresenceEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  departmentCode: string;
  /** v0.2.1 (C-01): албан тушаалын нэр (каталог) — задаргаанд */
  positionName?: string | null;
  /**
   * Ажлын хоолны (Өдөр/Шөнө) байршил — ажилтан ?? албан тушаал(кемп) ?? null (= кемпийн анхдагч).
   * v0.2.0 хүртэл хэлтсийн байршил байсан (Q1: хэлтсээс хасав).
   */
  workMealLocationId: string | null;
  /** v0.2.1 (C-04, Q3): false = хоолны тоонд огт орохгүй (ирэх/явах өдөр ч), ирц/хоног/өрөөнд хэвээр */
  mealsIncluded?: boolean;
  crewAnchor: string | null;
  pattern: PatternSegment[];
  adjustments: AdjustmentRange[];
  stays: PresenceStay[];
}

export type DayKind = 'MOVEMENT' | 'FULL_DAY';
export interface EmployeeDay {
  employeeId: string;
  kind: DayKind;
  shift: CampShiftType | null;
  shiftSource: ShiftSource | null;
  firstNight: boolean;
  slots: MealSlot[];
}

export interface PresenceLine {
  mealType: CampMealType;
  mealLocationId: string | null;
  count: number;
}
export interface PresenceBreakdown {
  departmentCode: string;
  /** DAY | NIGHT | UNKNOWN | MOVEMENT (ирэх/явах өдөр) */
  group: string;
  mealType: CampMealType;
  mealLocationId: string | null;
  count: number;
}
/** Албан тушаалаар задаргаа (v0.2.1) — "хэлтэс / албан тушаал" сонголт */
export interface PresencePositionBreakdown {
  positionName: string | null;
  mealType: CampMealType;
  mealLocationId: string | null;
  count: number;
}
export interface PresenceResult {
  date: string;
  presentCount: number;
  /** Кемпэд байгаа ч хоол авдаггүй (C-04) — presentCount-д орсон, хоолны тоонд ороогүй */
  noMealCount: number;
  byPosition: PresencePositionBreakdown[];
  lines: PresenceLine[];
  breakdown: PresenceBreakdown[];
  personDays: string;
  warnings: {
    unknownShift: { employeeId: string; employeeCode: string; fullName: string; departmentCode: string }[];
    noDefaultMealLocation: boolean;
  };
}

const MEAL_ORDER: CampMealType[] = [CampMealType.BREAKFAST, CampMealType.LUNCH, CampMealType.DINNER, CampMealType.NIGHT];

/** d өдрийг бүтэн өнгөрүүлсэн эсэх (тэр өдөр ирээгүй, яваагүй) */
const fullDayAt = (stays: PresenceStay[], d: string) => stays.some((s) => s.startDate < d && (s.endDate === null || s.endDate > d));
/** d өдрийн шөнө кемпэд байсан эсэх (ирсэн өдөр орно, явсан өдөр орохгүй) */
const nightAt = (stays: PresenceStay[], d: string) => stays.some((s) => s.startDate <= d && (s.endDate === null || s.endDate > d));

/**
 * Нэг ажилтны D өдөр (ERD v4 "Суурь тооцоо"):
 *   - D өдөр ирсэн/явсан → movement.meals (ирэх + явах нэгтгэнэ)
 *   - бүтэн өдөр → ээлж (ShiftResolver) × хоолны дүрэм; шөнийн эхний өдөр = D ШӨНӨ ба D−1 шөнө кемпэд ШӨНИЙН ээлжээр
 *     хонож байгаагүй (өдрийн ээлж, ээлж тодорхойгүй эсвэл кемпэд байгаагүй) → + Өдөр (кемп)
 *   - кемпэд байхгүй → null
 */
export function employeeDay(e: PresenceEmployee, date: string, settings: RosterSettings): EmployeeDay | null {
  const movementMeals = new Set<CampMealType>();
  let movement = false;
  for (const s of e.stays) {
    if (s.startDate === date) {
      movement = true;
      s.arrivalMeals.forEach((m) => movementMeals.add(m));
    }
    if (s.endDate === date && s.departureMeals) {
      movement = true;
      s.departureMeals.forEach((m) => movementMeals.add(m));
    }
  }
  if (movement) {
    const meals = MEAL_ORDER.filter((m) => movementMeals.has(m));
    return { employeeId: e.id, kind: 'MOVEMENT', shift: null, shiftSource: null, firstNight: false, slots: movementMealSlots(meals) };
  }
  if (!fullDayAt(e.stays, date)) return null;

  const resolve = (d: string) => resolveShift({ date: d, adjustments: e.adjustments, pattern: e.pattern, crewAnchor: e.crewAnchor, settings });
  const today = resolve(date);
  const prev = addDays(date, -1);
  // ERD жишээ: Даваа ирж (зохицуулалтаар) шөнө гарсан → Мягмар "эхний шөнө" БИШ (ирсэн өдөр ч шөнийн ээлж тооцогдоно)
  const prevNight = nightAt(e.stays, prev) && resolve(prev).shift === CampShiftType.NIGHT;
  const firstNight = today.shift === CampShiftType.NIGHT && !prevNight;
  return { employeeId: e.id, kind: 'FULL_DAY', shift: today.shift, shiftSource: today.source, firstNight, slots: fullDayMeals(today.shift, firstNight) };
}

/** D өдрийн хоолны суурь тоо (хоол × байршил), задаргаа (хэлтэс × ээлж × хоол), анхааруулга */
export function computePresence(employees: PresenceEmployee[], date: string, settings: RosterSettings, defaultMealLocationId: string | null): PresenceResult {
  const lines = new Map<string, PresenceLine>();
  const breakdown = new Map<string, PresenceBreakdown>();
  const unknownShift: PresenceResult['warnings']['unknownShift'] = [];
  const byPosition = new Map<string, PresencePositionBreakdown>();
  let noMeal = 0;
  let present = 0;
  let total = 0;
  let needsCamp = false;

  for (const e of employees) {
    const day = employeeDay(e, date, settings);
    if (!day) continue;
    present++;
    if (e.mealsIncluded === false) {
      noMeal++;
      continue;
    }
    if (day.kind === 'FULL_DAY' && day.shift === null) {
      unknownShift.push({ employeeId: e.id, employeeCode: e.employeeCode, fullName: e.fullName, departmentCode: e.departmentCode });
    }
    const group = day.kind === 'MOVEMENT' ? 'MOVEMENT' : (day.shift ?? 'UNKNOWN');
    for (const slot of day.slots) {
      // 'DEPT' = ажлын хоол (Өдөр/Шөнө) → ажилтан/албан тушаалын байршил, байхгүй бол кемпийн анхдагч
      const loc = slot.place === 'DEPT' ? (e.workMealLocationId ?? defaultMealLocationId) : defaultMealLocationId;
      if (loc === defaultMealLocationId) needsCamp = true;
      const lk = `${slot.meal}|${loc}`;
      const line = lines.get(lk) ?? { mealType: slot.meal, mealLocationId: loc, count: 0 };
      line.count++;
      lines.set(lk, line);
      const bk = `${e.departmentCode}|${group}|${slot.meal}|${loc}`;
      const b = breakdown.get(bk) ?? { departmentCode: e.departmentCode, group, mealType: slot.meal, mealLocationId: loc, count: 0 };
      b.count++;
      breakdown.set(bk, b);
      const pk = `${e.positionName ?? ''}|${slot.meal}|${loc}`;
      const pb = byPosition.get(pk) ?? { positionName: e.positionName ?? null, mealType: slot.meal, mealLocationId: loc, count: 0 };
      pb.count++;
      byPosition.set(pk, pb);
      total++;
    }
  }
  const byMeal = (a: { mealType: CampMealType }, b: { mealType: CampMealType }) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType);
  return {
    date,
    presentCount: present,
    noMealCount: noMeal,
    byPosition: [...byPosition.values()].sort((a, b) => String(a.positionName ?? '').localeCompare(String(b.positionName ?? '')) || byMeal(a, b)),
    lines: [...lines.values()].sort((a, b) => byMeal(a, b) || String(a.mealLocationId).localeCompare(String(b.mealLocationId))),
    breakdown: [...breakdown.values()].sort((a, b) => a.departmentCode.localeCompare(b.departmentCode) || a.group.localeCompare(b.group) || byMeal(a, b)),
    // Хүн-өдөр = нийт хоол ÷ 3 (ERD v4) — 4 оронтой
    personDays: (Math.round((total / 3) * 10_000) / 10_000).toFixed(4),
    warnings: { unknownShift, noDefaultMealLocation: needsCamp && defaultMealLocationId === null },
  };
}
