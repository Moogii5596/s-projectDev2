import { describe, it, expect } from 'vitest';
import { CampMealType, CampMovementDirection, CampShiftType } from '@prisma/client';
import { addDays, diffDays, eachDay, isRealIsoDate, weekday } from '../../common/camp-date';
import { classifyMovement, expectedNight, rosterDayNo } from '../../../hr/attendance/roster';
import { resolveShift, uniformShift } from '../../../hr/attendance/shift-resolver';
import { fullDayMeals, movementMealSlots } from '../../../hr/attendance/meal-rules';
import { computePresence, employeeDay, PresenceEmployee } from '../presence';

const { DAY, NIGHT } = CampShiftType;
const { BREAKFAST: B, LUNCH: L, DINNER: D, NIGHT: N } = CampMealType;
const { ARRIVAL, DEPARTURE } = CampMovementDirection;
const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
const ANCHOR = '2026-10-07'; // Лхагва — А багийн ирэх өдөр
const MINE_7_7 = [{ dayFrom: 1, dayTo: 7, shift: DAY }, { dayFrom: 8, dayTo: 14, shift: NIGHT }];
const ADM_14 = [{ dayFrom: 1, dayTo: 14, shift: DAY }];

describe('camp-date', () => {
  it('огноо арифметик (сар/жил дамжих, гараг)', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-10-07', '2026-11-04')).toBe(28);
    expect(weekday('2026-10-07')).toBe(3);
    expect(weekday('2026-10-08')).toBe(4);
    expect(eachDay('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(isRealIsoDate('2026-02-30')).toBe(false);
    expect(isRealIsoDate('2026-02-28')).toBe(true);
  });
});

describe('roster — 14 ажил, замын хоног амралтад (Лхагва ирж, Пүрэв явна)', () => {
  it('өдрийн дугаар: Лхагва 0, Пүрэв 1, дараагийн Лхагва 14, явах Пүрэв 15, 28 хоногийн дараа 0', () => {
    expect(rosterDayNo(ANCHOR, '2026-10-07', S)).toBe(0);
    expect(rosterDayNo(ANCHOR, '2026-10-08', S)).toBe(1);
    expect(rosterDayNo(ANCHOR, '2026-10-21', S)).toBe(14);
    expect(rosterDayNo(ANCHOR, '2026-10-22', S)).toBe(15);
    expect(rosterDayNo(ANCHOR, '2026-11-04', S)).toBe(0);
    expect(rosterDayNo(ANCHOR, '2026-09-30', S)).toBe(21); // anchor-оос өмнөх огноо
  });

  it('ROSTER: ирэх Лхагва + явах Пүрэв; бусад, багагүй → OFF_ROSTER', () => {
    expect(classifyMovement(ANCHOR, '2026-10-07', ARRIVAL, S)).toBe('ROSTER');
    expect(classifyMovement(ANCHOR, '2026-10-22', DEPARTURE, S)).toBe('ROSTER');
    expect(classifyMovement(ANCHOR, '2026-11-04', ARRIVAL, S)).toBe('ROSTER');
    expect(classifyMovement(ANCHOR, '2026-10-21', DEPARTURE, S)).toBe('OFF_ROSTER'); // Лхагва явсан = ээлжийн бус
    expect(classifyMovement(ANCHOR, '2026-10-06', ARRIVAL, S)).toBe('OFF_ROSTER');
    expect(classifyMovement(ANCHOR, '2026-10-22', ARRIVAL, S)).toBe('OFF_ROSTER');
    expect(classifyMovement(null, '2026-10-07', ARRIVAL, S)).toBe('OFF_ROSTER');
  });

  it('хоног: ирсэн шөнө (0) … Лхагва шөнө (14) кемпэд, явах Пүрэв шөнө (15) байхгүй; багагүй → үргэлж', () => {
    expect(expectedNight(ANCHOR, '2026-10-07', S)).toBe(true);
    expect(expectedNight(ANCHOR, '2026-10-21', S)).toBe(true);
    expect(expectedNight(ANCHOR, '2026-10-22', S)).toBe(false);
    expect(expectedNight(ANCHOR, '2026-11-03', S)).toBe(false);
    expect(expectedNight(null, '2026-11-03', S)).toBe(true);
  });
});

describe('ShiftResolver', () => {
  const base = { adjustments: [], pattern: MINE_7_7, crewAnchor: ANCHOR, settings: S };
  it('7/7 загвар: Пүрэв (1)…Лхагва (7) ӨДӨР, Пүрэв (8)…Лхагва (14) ШӨНӨ', () => {
    expect(resolveShift({ ...base, date: '2026-10-08' })).toEqual({ shift: DAY, source: 'PATTERN', dayNo: 1 });
    expect(resolveShift({ ...base, date: '2026-10-14' }).shift).toBe(DAY);
    expect(resolveShift({ ...base, date: '2026-10-15' })).toEqual({ shift: NIGHT, source: 'PATTERN', dayNo: 8 });
    expect(resolveShift({ ...base, date: '2026-10-21' }).shift).toBe(NIGHT);
  });
  it('ирэх (0) / явах (15) / амралт / ээлжээс өмнө ирсэн → UNKNOWN (таамаглахгүй)', () => {
    expect(resolveShift({ ...base, date: '2026-10-07' }).source).toBe('UNKNOWN');
    expect(resolveShift({ ...base, date: '2026-10-22' }).source).toBe('UNKNOWN');
    expect(resolveShift({ ...base, date: '2026-10-30' })).toEqual({ shift: null, source: 'UNKNOWN', dayNo: 23 });
  });
  it('зохицуулалт загварыг дарна (амралтын өдөр ч)', () => {
    const adjustments = [{ startDate: '2026-10-10', endDate: '2026-10-11', shift: NIGHT }, { startDate: '2026-11-02', endDate: '2026-11-03', shift: DAY }];
    expect(resolveShift({ ...base, adjustments, date: '2026-10-10' })).toEqual({ shift: NIGHT, source: 'ADJUSTMENT', dayNo: 3 });
    expect(resolveShift({ ...base, adjustments, date: '2026-10-12' }).shift).toBe(DAY);
    expect(resolveShift({ ...base, adjustments, date: '2026-11-02' })).toMatchObject({ shift: DAY, source: 'ADJUSTMENT' });
  });
  it('багагүй: нэг ээлжтэй загвар → тэр ээлж; холимог/загваргүй → UNKNOWN', () => {
    expect(resolveShift({ date: '2026-10-30', adjustments: [], pattern: ADM_14, crewAnchor: null, settings: S })).toEqual({ shift: DAY, source: 'UNIFORM_PATTERN', dayNo: null });
    expect(resolveShift({ date: '2026-10-30', adjustments: [], pattern: MINE_7_7, crewAnchor: null, settings: S }).source).toBe('UNKNOWN');
    expect(resolveShift({ date: '2026-10-30', adjustments: [], pattern: [], crewAnchor: null, settings: S }).source).toBe('UNKNOWN');
    expect(uniformShift([{ dayFrom: 1, dayTo: 7, shift: NIGHT }, { dayFrom: 8, dayTo: 14, shift: NIGHT }])).toBe(NIGHT);
  });
});

describe('Хоолны дүрэм', () => {
  it('ӨДӨР: Ө(кемп) Ө(хэлтэс) О(кемп); ШӨНӨ: Ө О Ш(хэлтэс) [+эхний шөнө Өдөр(кемп)]; тодорхойгүй: Ө О', () => {
    expect(fullDayMeals(DAY, false)).toEqual([{ meal: B, place: 'CAMP' }, { meal: L, place: 'DEPT' }, { meal: D, place: 'CAMP' }]);
    expect(fullDayMeals(NIGHT, false)).toEqual([{ meal: B, place: 'CAMP' }, { meal: D, place: 'CAMP' }, { meal: N, place: 'DEPT' }]);
    expect(fullDayMeals(NIGHT, true)).toContainEqual({ meal: L, place: 'CAMP' });
    expect(fullDayMeals(null, false)).toEqual([{ meal: B, place: 'CAMP' }, { meal: D, place: 'CAMP' }]);
  });
  it('ирэх/явах өдрийн хоол: ажлын хоол → хэлтэс', () => {
    expect(movementMealSlots([L, D, N])).toEqual([{ meal: L, place: 'DEPT' }, { meal: D, place: 'CAMP' }, { meal: N, place: 'DEPT' }]);
  });
});

describe('Presence — D өдрийн суурь тоо (ERD v4 жишээнүүд)', () => {
  const emp = (over: Partial<PresenceEmployee>): PresenceEmployee => ({
    id: 'e1', employeeCode: 'E001', fullName: 'Бат', departmentCode: 'MINE', workMealLocationId: 'loc-mine',
    crewAnchor: ANCHOR, pattern: MINE_7_7, adjustments: [],
    stays: [{ startDate: '2026-10-07', endDate: '2026-10-22', arrivalMeals: [D], departureMeals: [B] }],
    ...over,
  });
  const day = (e: PresenceEmployee, d: string) => employeeDay(e, d, S);
  const meals = (e: PresenceEmployee, d: string) => day(e, d)?.slots.map((s) => `${s.meal}@${s.place}`) ?? null;

  it('Лхагва ирэлт → зөвхөн Орой; Пүрэв явалт → зөвхөн Өглөө; явсны дараа → байхгүй', () => {
    expect(meals(emp({}), '2026-10-07')).toEqual(['DINNER@CAMP']);
    expect(meals(emp({}), '2026-10-22')).toEqual(['BREAKFAST@CAMP']);
    expect(day(emp({}), '2026-10-23')).toBeNull();
    expect(day(emp({}), '2026-10-06')).toBeNull();
  });

  it('7/7: Пүрэв (1) өдрийн ээлж; 2 дахь Пүрэв (8) шөнийн эхний өдөр → + Өдөр (кемп); Баасан (9) — үгүй', () => {
    expect(meals(emp({}), '2026-10-08')).toEqual(['BREAKFAST@CAMP', 'LUNCH@DEPT', 'DINNER@CAMP']);
    expect(day(emp({}), '2026-10-15')).toMatchObject({ shift: NIGHT, firstNight: true });
    expect(meals(emp({}), '2026-10-15')).toEqual(['BREAKFAST@CAMP', 'DINNER@CAMP', 'NIGHT@DEPT', 'LUNCH@CAMP']);
    expect(meals(emp({}), '2026-10-16')).toEqual(['BREAKFAST@CAMP', 'DINNER@CAMP', 'NIGHT@DEPT']);
  });

  it('шөнөөр эхэлдэг загвар: Лхагва ирж Пүрэв (1) шөнө → эхний шөнө (Пүрэвт өдрийн хоол)', () => {
    const e = emp({ pattern: [{ dayFrom: 1, dayTo: 14, shift: NIGHT }] });
    expect(day(e, '2026-10-08')).toMatchObject({ firstNight: true });
    expect(day(e, '2026-10-09')).toMatchObject({ firstNight: false });
  });

  it('зохицуулалтаар өдрөөс шөнө рүү → эхний шөнө өдрийн хоол; дараагийн шөнө — үгүй; буцаж өдөр', () => {
    const e = emp({ adjustments: [{ startDate: '2026-10-10', endDate: '2026-10-11', shift: NIGHT }] });
    expect(day(e, '2026-10-10')).toMatchObject({ shift: NIGHT, firstNight: true });
    expect(day(e, '2026-10-11')).toMatchObject({ shift: NIGHT, firstNight: false });
    expect(day(e, '2026-10-12')).toMatchObject({ shift: DAY });
  });

  it('ERD жишээ: Даваа ээлжийн бусаар ирж шөнө гарах → Даваа сонгосон хоол, Мягмар Ө О Ш (өдрийн хоолгүй)', () => {
    const e = emp({
      crewAnchor: null, pattern: ADM_14,
      adjustments: [{ startDate: '2026-10-12', endDate: '2026-10-26', shift: NIGHT }],
      stays: [{ startDate: '2026-10-12', endDate: null, arrivalMeals: [L, D, N], departureMeals: null }],
    });
    expect(meals(e, '2026-10-12')).toEqual(['LUNCH@DEPT', 'DINNER@CAMP', 'NIGHT@DEPT']);
    expect(meals(e, '2026-10-13')).toEqual(['BREAKFAST@CAMP', 'DINNER@CAMP', 'NIGHT@DEPT']);
  });

  it('ээлжээс өмнө ирсэн (зохицуулалтгүй) → тодорхойгүй: Ө О + анхааруулга', () => {
    const e = emp({ stays: [{ startDate: '2026-10-05', endDate: null, arrivalMeals: [D], departureMeals: null }] });
    expect(day(e, '2026-10-06')).toMatchObject({ shift: null, shiftSource: 'UNKNOWN' });
    const r = computePresence([e], '2026-10-06', S, 'loc-camp');
    expect(r.warnings.unknownShift).toEqual([{ employeeId: 'e1', employeeCode: 'E001', fullName: 'Бат', departmentCode: 'MINE' }]);
    expect(r.lines).toEqual([
      { mealType: B, mealLocationId: 'loc-camp', count: 1 },
      { mealType: D, mealLocationId: 'loc-camp', count: 1 },
    ]);
  });

  it('computePresence: хоол × байршил, хэлтсийн байршил, хүн-өдөр = нийт ÷ 3, задаргаа', () => {
    const r = computePresence(
      [
        emp({ id: 'a' }),
        emp({ id: 'b', employeeCode: 'E002' }),
        emp({ id: 'c', employeeCode: 'E003', departmentCode: 'ADM', workMealLocationId: 'loc-camp', crewAnchor: null, pattern: ADM_14,
          stays: [{ startDate: '2026-10-01', endDate: null, arrivalMeals: [D], departureMeals: null }] }),
        emp({ id: 'x', stays: [] }),
      ],
      '2026-10-08', S, 'loc-camp',
    );
    expect(r.presentCount).toBe(3);
    expect(r.lines).toEqual([
      { mealType: B, mealLocationId: 'loc-camp', count: 3 },
      { mealType: L, mealLocationId: 'loc-camp', count: 1 },
      { mealType: L, mealLocationId: 'loc-mine', count: 2 },
      { mealType: D, mealLocationId: 'loc-camp', count: 3 },
    ]);
    expect(r.personDays).toBe('3.0000');
    expect(r.breakdown).toContainEqual({ departmentCode: 'MINE', group: 'DAY', mealType: L, mealLocationId: 'loc-mine', count: 2 });
    expect(r.warnings).toEqual({ unknownShift: [], noDefaultMealLocation: false });
  });

  it('солигдох Лхагва: явах баг (ӨМНӨХ мөчлөг) Лхагва ажлын өдөр, ирэх баг Орой; кемпийн анхдагч байршилгүй → анхааруулга', () => {
    const leaving = emp({ id: 'c', crewAnchor: '2026-09-23', stays: [{ startDate: '2026-09-23', endDate: '2026-10-08', arrivalMeals: [D], departureMeals: [B] }] });
    const arriving = emp({ id: 'a' });
    const r = computePresence([leaving, arriving], '2026-10-07', S, null);
    expect(r.presentCount).toBe(2);
    expect(r.lines.find((l) => l.mealType === D)?.count).toBe(2);
    expect(r.warnings.noDefaultMealLocation).toBe(true);
  });
});
