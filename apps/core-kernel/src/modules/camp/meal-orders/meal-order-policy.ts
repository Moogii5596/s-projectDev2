import { addDays } from '../common/camp-date';
import type {
  DefaultFillMode,
  MealOrderAction,
  MealOrderLineView,
  MealOrderSettings,
  MealOrderStatus,
  MealType,
} from './meal-order.types';

/**
 * Хоолны захиалгын урсгалын ГАНЦ эх сурвалж (G-8): бүх шийдвэр `MealOrderSettings`-ээс. Цэвэр функц — DB/Nest хамааралгүй.
 * Хэн юу хийх = эрхээр (`camp.meal.order` / `camp.meal.accept`) — роль кодод тогтоохгүй.
 */

export const MEAL_ORDER_SETTINGS_DEFAULTS: MealOrderSettings = {
  leadDays: 1,
  cutoffTime: null,
  afterCutoff: 'BLOCK',
  requiresAccept: true,
  editAfterAccept: 'TWO_SIDED',
  defaultFill: 'EMPTY',
  allowSelfAccept: false,
};

export interface UbClock {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' */
  hhmm: string;
}

/** Asia/Ulaanbaatar-ын одоогийн огноо, цаг */
export function nowUb(now = new Date()): UbClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
}

/** Захиалгын cutoff: (orderDate − leadDays) өдрийн cutoffTime (null = тэр өдрийн төгсгөл) */
export function cutoffDeadline(orderDate: string, s: MealOrderSettings): { date: string; time: string | null } {
  return { date: addDays(orderDate, -s.leadDays), time: s.cutoffTime };
}

/** cutoff өнгөрсөн эсэх. Өнгөрсөн өдрийн захиалга үргэлж өнгөрсөн */
export function isPastCutoff(orderDate: string, s: MealOrderSettings, clock: UbClock): boolean {
  if (orderDate < clock.date) return true;
  const d = cutoffDeadline(orderDate, s);
  if (clock.date > d.date) return true;
  if (clock.date < d.date) return false;
  return d.time !== null && clock.hhmm > d.time;
}

export type SubmitDecision =
  | { ok: true; isLate: boolean; nextStatus: 'ORDERED' | 'ACCEPTED' }
  | { ok: false; code: 'CUTOFF' | 'PAST_DATE' };

/** Илгээх: cutoff-ийн горим + хүлээн авах шаардлага → дараагийн төлөв */
export function decideSubmit(orderDate: string, s: MealOrderSettings, clock: UbClock): SubmitDecision {
  const late = isPastCutoff(orderDate, s, clock);
  if (late && s.afterCutoff === 'BLOCK') {
    return { ok: false, code: orderDate < clock.date ? 'PAST_DATE' : 'CUTOFF' };
  }
  // APPROVAL: cutoff-оос хойш илгээсэн захиалга хүлээн авах тохиргоогүй ч заавал батлагдана
  const needsAccept = s.requiresAccept || (late && s.afterCutoff === 'APPROVAL');
  return { ok: true, isLate: late, nextStatus: needsAccept ? 'ORDERED' : 'ACCEPTED' };
}

/** Өөрөө хүлээн авах уу (захиалагч = хянагч) — тохиргоо зөвшөөрсөн эсэх */
function canReviewOwn(s: MealOrderSettings): boolean {
  return s.allowSelfAccept;
}

export interface ActionContext {
  status: MealOrderStatus;
  settings: MealOrderSettings;
  canOrder: boolean;
  canAccept: boolean;
  /** actor = захиалагч (orderedBy) */
  isOrderer: boolean;
}

/**
 * Тухайн төлөвт actor-ийн хийж чадах үйлдлүүд. Backend хүсэлт бүрт шалгана, frontend товч харуулахад ашиглана.
 * DRAFT/REJECTED → засах/илгээх · ORDERED → хүлээн авагч шийднэ (захиалагч дахин засаж болно) ·
 * ACCEPTED → editAfterAccept (FORBID | ALLOW | TWO_SIDED) · CHANGE_REQUESTED → хүлээн авагч шийднэ.
 */
export function allowedActions(c: ActionContext): MealOrderAction[] {
  const out: MealOrderAction[] = [];
  const reviewerOk = c.canAccept && (!c.isOrderer || canReviewOwn(c.settings));
  switch (c.status) {
    case 'DRAFT':
    case 'REJECTED':
      if (c.canOrder) out.push('edit', 'submit');
      if (c.canOrder && c.status === 'DRAFT') out.push('delete');
      break;
    case 'ORDERED':
      if (c.canOrder) out.push('edit', 'submit');
      if (reviewerOk) out.push('accept', 'reject');
      break;
    case 'ACCEPTED':
      if (c.canOrder && c.settings.editAfterAccept === 'ALLOW') out.push('edit');
      if (c.canOrder && c.settings.editAfterAccept === 'TWO_SIDED') out.push('requestChange');
      break;
    case 'CHANGE_REQUESTED':
      if (c.canOrder) out.push('withdrawChange');
      if (reviewerOk) out.push('approveChange', 'rejectChange');
      break;
  }
  return out;
}

export interface MealTotals {
  totalMeals: number;
  /** totalMeals ÷ 3, 2 оронтой */
  personDays: string;
}

/** Нийт хоол = Σ base + Σ зочин/нэмэлт; хүн-өдөр = ÷ 3 (G-2: ирцээс хамаарахгүй) */
export function mealTotals(lines: ReadonlyArray<{ baseCount: number }>, extras: ReadonlyArray<{ guestCount: number }>): MealTotals {
  const total = lines.reduce((a, l) => a + l.baseCount, 0) + extras.reduce((a, e) => a + e.guestCount, 0);
  return { totalMeals: total, personDays: (Math.round((total / 3) * 100) / 100).toFixed(2) };
}

/** Илгээхэд хоосон захиалга (бүх тоо 0, зочин алга) зөвшөөрөхгүй */
export function isEmptyOrder(lines: ReadonlyArray<{ baseCount: number }>, extras: ReadonlyArray<unknown>): boolean {
  return extras.length === 0 && lines.every((l) => l.baseCount === 0);
}

export interface FillSources {
  /** өмнөх захиалга (хамгийн ойрын өмнөх өдөр) — COPY_PREV */
  previous: ReadonlyArray<MealOrderLineView>;
  /** тогтмол загвар — TEMPLATE */
  template: ReadonlyArray<MealOrderLineView>;
}

/** Шинэ захиалгын анхдагч мөрүүд. EMPTY → хоосон. Зочин/нэмэлт хуулагдахгүй (тэр өдрийн онцлог) */
export function defaultLines(mode: DefaultFillMode, src: FillSources): MealOrderLineView[] {
  const pick = mode === 'COPY_PREV' ? src.previous : mode === 'TEMPLATE' ? src.template : [];
  const seen = new Set<string>();
  const out: MealOrderLineView[] = [];
  for (const l of pick) {
    const key = lineKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mealType: l.mealType, mealLocationId: l.mealLocationId, baseCount: l.baseCount });
  }
  return out;
}

const lineKey = (l: { mealType: MealType; mealLocationId: string }): string => `${l.mealType}|${l.mealLocationId}`;

/** Мөрүүдийн давхардал (ижил хоол × байршил) — DB UNIQUE-ээс өмнө 400 өгөх */
export function duplicateLineKeys(lines: ReadonlyArray<{ mealType: MealType; mealLocationId: string }>): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const l of lines) {
    const k = lineKey(l);
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return [...dup];
}
