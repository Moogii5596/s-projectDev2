import { describe, expect, it } from 'vitest';
import {
  MEAL_ORDER_SETTINGS_DEFAULTS as D,
  allowedActions,
  cutoffDeadline,
  decideSubmit,
  defaultLines,
  duplicateLineKeys,
  isEmptyOrder,
  isPastCutoff,
  mealTotals,
  nowUb,
} from '../meal-order-policy';
import type { MealOrderSettings, MealOrderStatus } from '../meal-order.types';

const S = (o: Partial<MealOrderSettings> = {}): MealOrderSettings => ({ ...D, cutoffTime: '15:00', ...o });
const clock = (date: string, hhmm: string) => ({ date, hhmm });

describe('cutoff', () => {
  it('хоол батлагдсаны дараах өөрчлөлт анхдагчаар хоёр талын баталгаатай', () => {
    expect(D.editAfterAccept).toBe('TWO_SIDED');
  });

  it('cutoff өдөр = orderDate − leadDays', () => {
    expect(cutoffDeadline('2026-11-10', S({ leadDays: 1 }))).toEqual({ date: '2026-11-09', time: '15:00' });
    expect(cutoffDeadline('2026-11-10', S({ leadDays: 0 }))).toEqual({ date: '2026-11-10', time: '15:00' });
    expect(cutoffDeadline('2026-11-10', S({ leadDays: 3 })).date).toBe('2026-11-07');
  });
  it('cutoff цагаас өмнө / дараа', () => {
    expect(isPastCutoff('2026-11-10', S(), clock('2026-11-09', '14:59'))).toBe(false);
    expect(isPastCutoff('2026-11-10', S(), clock('2026-11-09', '15:00'))).toBe(false);
    expect(isPastCutoff('2026-11-10', S(), clock('2026-11-09', '15:01'))).toBe(true);
    expect(isPastCutoff('2026-11-10', S(), clock('2026-11-10', '00:01'))).toBe(true);
  });
  it('cutoff цаггүй бол cutoff өдрийн төгсгөл хүртэл нээлттэй', () => {
    const s = S({ cutoffTime: null });
    expect(isPastCutoff('2026-11-10', s, clock('2026-11-09', '23:59'))).toBe(false);
    expect(isPastCutoff('2026-11-10', s, clock('2026-11-10', '00:00'))).toBe(true);
  });
  it('өнгөрсөн өдрийн захиалга үргэлж хоцорсон', () => {
    expect(isPastCutoff('2026-11-01', S({ cutoffTime: null, leadDays: 30 }), clock('2026-11-02', '00:00'))).toBe(true);
  });
});

describe('decideSubmit — тохиргооны хослол', () => {
  const early = clock('2026-11-09', '10:00');
  const late = clock('2026-11-09', '16:00');
  it('cutoff өмнө + хүлээн авах шаардлагатай → ORDERED', () => {
    expect(decideSubmit('2026-11-10', S(), early)).toEqual({ ok: true, isLate: false, nextStatus: 'ORDERED' });
  });
  it('cutoff өмнө + шаардлагагүй → шууд ACCEPTED', () => {
    expect(decideSubmit('2026-11-10', S({ requiresAccept: false }), early)).toEqual({ ok: true, isLate: false, nextStatus: 'ACCEPTED' });
  });
  it('хоцорсон + BLOCK → CUTOFF', () => {
    expect(decideSubmit('2026-11-10', S({ afterCutoff: 'BLOCK' }), late)).toEqual({ ok: false, code: 'CUTOFF' });
  });
  it('өнгөрсөн өдөр + BLOCK → PAST_DATE', () => {
    expect(decideSubmit('2026-11-08', S({ afterCutoff: 'BLOCK' }), early)).toEqual({ ok: false, code: 'PAST_DATE' });
  });
  it('хоцорсон + APPROVAL → хүлээн авах шаардлагагүй ч ORDERED, isLate', () => {
    expect(decideSubmit('2026-11-10', S({ afterCutoff: 'APPROVAL', requiresAccept: false }), late)).toEqual({
      ok: true,
      isLate: true,
      nextStatus: 'ORDERED',
    });
  });
  it('хоцорсон + FREE + шаардлагагүй → ACCEPTED, isLate тэмдэглэнэ', () => {
    expect(decideSubmit('2026-11-10', S({ afterCutoff: 'FREE', requiresAccept: false }), late)).toEqual({
      ok: true,
      isLate: true,
      nextStatus: 'ACCEPTED',
    });
  });
});

describe('allowedActions', () => {
  const act = (status: MealOrderStatus, o: Partial<MealOrderSettings>, who: { canOrder?: boolean; canAccept?: boolean; isOrderer?: boolean }) =>
    allowedActions({ status, settings: S(o), canOrder: !!who.canOrder, canAccept: !!who.canAccept, isOrderer: !!who.isOrderer });

  it('DRAFT: захиалагч засна/илгээнэ/устгана, хүлээн авагч юу ч хийхгүй', () => {
    expect(act('DRAFT', {}, { canOrder: true, isOrderer: true })).toEqual(['edit', 'submit', 'delete']);
    expect(act('DRAFT', {}, { canAccept: true })).toEqual([]);
  });
  it('REJECTED: дахин засаж илгээнэ (устгахгүй)', () => {
    expect(act('REJECTED', {}, { canOrder: true })).toEqual(['edit', 'submit']);
  });
  it('ORDERED: өөрөө хүлээн авах хориотой бол захиалагчид accept алга', () => {
    expect(act('ORDERED', { allowSelfAccept: false }, { canOrder: true, canAccept: true, isOrderer: true })).toEqual(['edit', 'submit']);
    expect(act('ORDERED', { allowSelfAccept: true }, { canOrder: true, canAccept: true, isOrderer: true })).toEqual(['edit', 'submit', 'accept', 'reject']);
    expect(act('ORDERED', {}, { canAccept: true })).toEqual(['accept', 'reject']);
  });
  it('ACCEPTED: editAfterAccept горим бүрт', () => {
    expect(act('ACCEPTED', { editAfterAccept: 'FORBID' }, { canOrder: true })).toEqual([]);
    expect(act('ACCEPTED', { editAfterAccept: 'ALLOW' }, { canOrder: true })).toEqual(['edit']);
    expect(act('ACCEPTED', { editAfterAccept: 'TWO_SIDED' }, { canOrder: true })).toEqual(['requestChange']);
    expect(act('ACCEPTED', { editAfterAccept: 'TWO_SIDED' }, { canAccept: true })).toEqual([]);
    expect(act('ACCEPTED', {}, { canOrder: true })).toEqual(['requestChange']);
  });
  it('CHANGE_REQUESTED: захиалагч цуцална, хүлээн авагч шийднэ', () => {
    expect(act('CHANGE_REQUESTED', {}, { canOrder: true, isOrderer: true })).toEqual(['withdrawChange']);
    expect(act('CHANGE_REQUESTED', {}, { canAccept: true })).toEqual(['approveChange', 'rejectChange']);
    expect(act('CHANGE_REQUESTED', {}, { canAccept: true, isOrderer: true })).toEqual([]);
  });
  it('эрхгүй хэрэглэгчид үйлдэл алга', () => {
    for (const st of ['DRAFT', 'ORDERED', 'ACCEPTED', 'REJECTED', 'CHANGE_REQUESTED'] as const) {
      expect(act(st, { editAfterAccept: 'TWO_SIDED' }, {})).toEqual([]);
    }
  });
});

describe('totals, fill, дубль', () => {
  it('нийт = Σ base + Σ зочин; хүн-өдөр ÷ 3', () => {
    expect(mealTotals([{ baseCount: 100 }, { baseCount: 50 }], [{ guestCount: 4 }])).toEqual({ totalMeals: 154, personDays: '51.33' });
    expect(mealTotals([], [])).toEqual({ totalMeals: 0, personDays: '0.00' });
  });
  it('хоосон захиалга', () => {
    expect(isEmptyOrder([{ baseCount: 0 }], [])).toBe(true);
    expect(isEmptyOrder([{ baseCount: 0 }], [{}])).toBe(false);
    expect(isEmptyOrder([{ baseCount: 1 }], [])).toBe(false);
  });
  const L = (m: 'BREAKFAST' | 'LUNCH', loc: string, n: number) => ({ mealType: m, mealLocationId: loc, baseCount: n });
  it('defaultLines: горим бүр', () => {
    const src = { previous: [L('BREAKFAST', 'a', 10)], template: [L('LUNCH', 'b', 20), L('LUNCH', 'b', 99)] };
    expect(defaultLines('EMPTY', src)).toEqual([]);
    expect(defaultLines('COPY_PREV', src)).toEqual([L('BREAKFAST', 'a', 10)]);
    expect(defaultLines('TEMPLATE', src)).toEqual([L('LUNCH', 'b', 20)]);
  });
  it('мөрийн давхардал', () => {
    expect(duplicateLineKeys([L('LUNCH', 'a', 1), L('LUNCH', 'a', 2), L('LUNCH', 'b', 1)])).toEqual(['LUNCH|a']);
  });
  it('nowUb форматтай', () => {
    expect(nowUb(new Date('2026-11-06T18:57:00Z'))).toEqual({ date: '2026-11-07', hhmm: '02:57' });
  });
});
