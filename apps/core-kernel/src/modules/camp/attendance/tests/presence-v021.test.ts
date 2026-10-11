/**
 * v0.2.1 (C-01, C-04; Q1–Q3, Д-1, Д-2) — ажлын хоолны байршил / хоол авах / ээлжийн загвар:
 *   ажилтан (эцсийн) ?? албан тушаал(кемп) ?? анхдагч (кемпийн байршил, тийм, хэлтсийн загвар)
 */
import { describe, expect, it } from 'vitest';
import { CampMealType, CampShiftType } from '@prisma/client';
import { computePresence, PresenceEmployee } from '../presence';
import { effectiveEmployee, PositionDefaults } from '../camp-presence.service';

const { DAY, NIGHT } = CampShiftType;
const { BREAKFAST: B, LUNCH: L, DINNER: D, NIGHT: N } = CampMealType;
const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
const ANCHOR = '2026-10-07';
const DEPT_DAY = [{ dayFrom: 1, dayTo: 14, shift: DAY }];
const POS_NIGHT = [{ dayFrom: 1, dayTo: 14, shift: NIGHT }];

const defaults: PositionDefaults = new Map([
  ['p-driver', { mealLocationId: 'loc-mine', mealsIncluded: null, pattern: POS_NIGHT }],
  ['p-guest', { mealLocationId: null, mealsIncluded: false, pattern: [] }],
]);

describe('effectiveEmployee', () => {
  it('ажилтан > албан тушаал > анхдагч', () => {
    expect(effectiveEmployee({ positionId: null, mealLocationId: null, mealsIncluded: null }, defaults, DEPT_DAY))
      .toEqual({ workMealLocationId: null, mealsIncluded: true, pattern: DEPT_DAY });
    expect(effectiveEmployee({ positionId: 'p-driver', mealLocationId: null, mealsIncluded: null }, defaults, DEPT_DAY))
      .toEqual({ workMealLocationId: 'loc-mine', mealsIncluded: true, pattern: POS_NIGHT });
    expect(effectiveEmployee({ positionId: 'p-driver', mealLocationId: 'loc-x', mealsIncluded: false }, defaults, DEPT_DAY))
      .toEqual({ workMealLocationId: 'loc-x', mealsIncluded: false, pattern: POS_NIGHT });
    // албан тушаалд загваргүй → хэлтсийнх (Д-1); хоол авахгүй анхдагч (Q3)
    expect(effectiveEmployee({ positionId: 'p-guest', mealLocationId: null, mealsIncluded: null }, defaults, DEPT_DAY))
      .toEqual({ workMealLocationId: null, mealsIncluded: false, pattern: DEPT_DAY });
    // ажилтан дээр "тийм" нь албан тушаалын "үгүй"-г дарна
    expect(effectiveEmployee({ positionId: 'p-guest', mealLocationId: null, mealsIncluded: true }, defaults, DEPT_DAY).mealsIncluded).toBe(true);
  });
});

describe('computePresence — v0.2.1', () => {
  const emp = (id: string, over: Partial<PresenceEmployee>): PresenceEmployee => ({
    id, employeeCode: id, fullName: id, departmentCode: 'ADM', positionName: null, workMealLocationId: null, mealsIncluded: true,
    crewAnchor: ANCHOR, pattern: DEPT_DAY, adjustments: [],
    stays: [{ startDate: ANCHOR, endDate: null, arrivalMeals: [D], departureMeals: null }],
    ...over,
  });
  const date = '2026-10-08'; // ростерын 1 дэх өдөр

  it('ажлын хоол (Өдөр/Шөнө) ажлын байршилд; бусад нь кемпийн анхдагчид; null → анхдагч', () => {
    const r = computePresence([emp('a', { workMealLocationId: 'loc-mine', positionName: 'Жолооч' }), emp('b', {})], date, S, 'loc-camp');
    expect(r.lines).toEqual([
      { mealType: B, mealLocationId: 'loc-camp', count: 2 },
      { mealType: L, mealLocationId: 'loc-camp', count: 1 },
      { mealType: L, mealLocationId: 'loc-mine', count: 1 },
      { mealType: D, mealLocationId: 'loc-camp', count: 2 },
    ]);
    expect(r.byPosition).toEqual([
      { positionName: null, mealType: B, mealLocationId: 'loc-camp', count: 1 },
      { positionName: null, mealType: L, mealLocationId: 'loc-camp', count: 1 },
      { positionName: null, mealType: D, mealLocationId: 'loc-camp', count: 1 },
      { positionName: 'Жолооч', mealType: B, mealLocationId: 'loc-camp', count: 1 },
      { positionName: 'Жолооч', mealType: L, mealLocationId: 'loc-mine', count: 1 },
      { positionName: 'Жолооч', mealType: D, mealLocationId: 'loc-camp', count: 1 },
    ]);
  });

  it('хоол авахгүй (C-04): кемпэд тоологдоно (presentCount), хоолонд огт орохгүй — ирэх өдөр ч', () => {
    const r = computePresence([emp('a', {}), emp('g', { mealsIncluded: false })], date, S, 'loc-camp');
    expect(r.presentCount).toBe(2);
    expect(r.noMealCount).toBe(1);
    expect(r.lines.reduce((n, l) => n + l.count, 0)).toBe(3);
    const arrival = computePresence([emp('g', { mealsIncluded: false })], ANCHOR, S, 'loc-camp');
    expect(arrival).toMatchObject({ presentCount: 1, noMealCount: 1, lines: [], personDays: '0.0000' });
  });

  it('албан тушаалын шөнийн загвар → Шөнө (ажлын байршилд), эхний шөнө + Өдөр (кемп)', () => {
    const r = computePresence([emp('n', { pattern: POS_NIGHT, workMealLocationId: 'loc-mine' })], date, S, 'loc-camp');
    expect(r.lines).toEqual([
      { mealType: B, mealLocationId: 'loc-camp', count: 1 },
      { mealType: L, mealLocationId: 'loc-camp', count: 1 },
      { mealType: D, mealLocationId: 'loc-camp', count: 1 },
      { mealType: N, mealLocationId: 'loc-mine', count: 1 },
    ]);
  });

  it('кемпийн анхдагчгүй + ажлын байршилгүй → анхааруулга', () => {
    expect(computePresence([emp('a', {})], date, S, null).warnings.noDefaultMealLocation).toBe(true);
    // ажлын хоол л байршилтай, бусад нь анхдагч шаардана → анхааруулга хэвээр
    expect(computePresence([emp('a', { workMealLocationId: 'loc-mine' })], date, S, null).warnings.noDefaultMealLocation).toBe(true);
  });
});
