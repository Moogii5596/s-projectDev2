/**
 * v0.2.0 §0.6 — Хоолны тооцооны "golden" regression тест (v0.2.1/0.2.2-ын өөрчлөлтөөс хамгаална).
 *
 * 9 ажилтан × 44 хоног (ростер, ростергүй, шөнийн эхний өдөр, ирэх/явах өдөр, нэг өдөр ирж явах, зохицуулалт,
 * ээлжээс өмнө ирсэн, тодорхойгүй ээлж) — `computePresence`-ийн ӨНӨӨДРИЙН үр дүнг `__golden__/presence-44d.txt`-д түгжинэ.
 *
 * Тооцоо САНААТАЙ өөрчлөгдвөл: `UPDATE_GOLDEN=1 pnpm vitest run presence-golden` → diff-ийг хянаж, CHANGELOG-д
 * тайлбарлаад commit хийнэ. Санамсаргүй зөрүү = regression.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CampMealType, CampShiftType } from '@prisma/client';
import { addDays } from '../camp-date';
import { computePresence, employeeDay, PresenceEmployee, PresenceResult } from '../presence';

const { DAY, NIGHT } = CampShiftType;
const { BREAKFAST: B, LUNCH: L, DINNER: D, NIGHT: N } = CampMealType;
const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
const A = '2026-09-02'; // Лхагва — А баг ирнэ
const BB = '2026-09-16'; // Лхагва — Б баг ирнэ (14 хоногийн дараа)
const FROM = '2026-08-31'; // Даваа
const DAYS = 44;

const ADM_14 = [{ dayFrom: 1, dayTo: 14, shift: DAY }];
const PRD_7_7 = [{ dayFrom: 1, dayTo: 7, shift: DAY }, { dayFrom: 8, dayTo: 14, shift: NIGHT }];
const PRD_NIGHT_FIRST = [{ dayFrom: 1, dayTo: 7, shift: NIGHT }, { dayFrom: 8, dayTo: 14, shift: DAY }];
const MIXED = [{ dayFrom: 1, dayTo: 3, shift: DAY }, { dayFrom: 4, dayTo: 14, shift: NIGHT }];

const emp = (id: string, dept: 'ADM' | 'PRD' | 'MIX', over: Partial<PresenceEmployee>): PresenceEmployee => ({
  id,
  employeeCode: id,
  fullName: id,
  departmentCode: dept,
  workMealLocationId: `loc-${dept.toLowerCase()}`,
  crewAnchor: null,
  pattern: dept === 'ADM' ? ADM_14 : dept === 'PRD' ? PRD_7_7 : MIXED,
  adjustments: [],
  stays: [],
  ...over,
});

/** Ростерын стандарт: Лхагва ирж (Орой), 15 дахь өдөр Пүрэв явна (Өглөө) */
const rosterStay = (anchor: string) => ({ startDate: anchor, endDate: addDays(anchor, 15), arrivalMeals: [D], departureMeals: [B] });

const EMPLOYEES: PresenceEmployee[] = [
  // 1. Захиргаа, А баг, 2 мөчлөг (дараагийн ирэлт 28 хоногийн дараа, явалт бүртгэгдээгүй)
  emp('A-ADM', 'ADM', { crewAnchor: A, stays: [rosterStay(A), { startDate: addDays(A, 28), endDate: null, arrivalMeals: [D], departureMeals: null }] }),
  // 2. Уурхай 7/7 (өдөр → шөнө: 8 дахь өдөр шөнийн эхний өдөр)
  emp('A-PRD', 'PRD', { crewAnchor: A, stays: [rosterStay(A)] }),
  // 3. Б баг, шөнөөр эхэлдэг загвар (1 дэх өдөр шөнийн эхний өдөр)
  emp('B-PRD', 'PRD', { crewAnchor: BB, pattern: PRD_NIGHT_FIRST, stays: [rosterStay(BB)] }),
  // 4. Ростергүй, нэг ээлжтэй загвар (UNIFORM_PATTERN), Даваа ээлжийн бусаар ирсэн (сонгосон хоол), нээлттэй
  emp('X-ADM', 'ADM', { stays: [{ startDate: FROM, endDate: null, arrivalMeals: [L, D], departureMeals: null }] }),
  // 5. А баг, ээлжээс 2 хоног өмнө ирсэн (тодорхойгүй) + 5–7 дахь өдөр зохицуулалтаар ШӨНӨ (өдрийн загвар дээр)
  emp('A-EARLY', 'PRD', {
    crewAnchor: A,
    adjustments: [{ startDate: addDays(A, 5), endDate: addDays(A, 7), shift: NIGHT }],
    stays: [{ startDate: addDays(A, -2), endDate: addDays(A, 15), arrivalMeals: [L, D], departureMeals: [B] }],
  }),
  // 6. Ростергүй, холимог загвар → үргэлж тодорхойгүй (анхааруулга)
  emp('Z-MIX', 'MIX', { stays: [{ startDate: addDays(A, 3), endDate: addDays(A, 12), arrivalMeals: [D, N], departureMeals: [B, L] }] }),
  // 7. Нэг өдөр ирж явсан (ирэх + явах хоол нэгтгэнэ) + дараа нь дахин ирсэн
  emp('V-DAY', 'ADM', {
    stays: [
      { startDate: addDays(A, 1), endDate: addDays(A, 1), arrivalMeals: [L], departureMeals: [D] },
      { startDate: addDays(A, 20), endDate: addDays(A, 22), arrivalMeals: [], departureMeals: [B, L] },
    ],
  }),
  // 8. А баг, амралтын өдрүүдэд зохицуулалтаар үлдсэн (16–20 ӨДӨР), дараа нь явсан
  emp('A-STAY', 'PRD', {
    crewAnchor: A,
    adjustments: [{ startDate: addDays(A, 15), endDate: addDays(A, 20), shift: DAY }],
    stays: [{ startDate: A, endDate: addDays(A, 21), arrivalMeals: [D], departureMeals: [B] }],
  }),
  // 9. Б баг, ростерын дунд шөнийн ээлжээр ээлжийн бусаар ирсэн (зохицуулалт эхний өдрөөсөө)
  emp('B-MID', 'PRD', {
    crewAnchor: BB,
    adjustments: [{ startDate: addDays(BB, 4), endDate: addDays(BB, 9), shift: NIGHT }],
    stays: [{ startDate: addDays(BB, 4), endDate: addDays(BB, 15), arrivalMeals: [N], departureMeals: [B] }],
  }),
];

const short: Record<CampMealType, string> = { BREAKFAST: 'B', LUNCH: 'L', DINNER: 'D', NIGHT: 'N' };

/** Нэг өдрийн үр дүнг нэг мөр болгоно (хүний нүдээр diff хийхэд хялбар) */
function line(r: PresenceResult): string {
  const lines = r.lines.map((l) => `${short[l.mealType]}@${l.mealLocationId ?? '-'}=${l.count}`).join(' ');
  const bd = r.breakdown.map((b) => `${b.departmentCode}/${b.group}/${short[b.mealType]}=${b.count}`).join(' ');
  const per = EMPLOYEES.map((e) => {
    const d = employeeDay(e, r.date, S);
    if (!d) return null;
    const tag = d.kind === 'MOVEMENT' ? 'MV' : `${d.shift ?? '?'}${d.firstNight ? '*' : ''}`;
    return `${e.id}:${tag}:${d.slots.map((s) => `${short[s.meal]}${s.place === 'CAMP' ? 'c' : 'd'}`).join('')}`;
  })
    .filter(Boolean)
    .join(' ');
  const warn = r.warnings.unknownShift.map((w) => w.employeeCode).join(',');
  return `${r.date} present=${r.presentCount} pd=${r.personDays} | ${lines} | ${bd} | ${per} | unknown=[${warn}] noLoc=${r.warnings.noDefaultMealLocation}`;
}

const GOLDEN = join(__dirname, '__golden__', 'presence-44d.txt');

describe('Хоолны тооцоо — golden (§0.6)', () => {
  const actual = Array.from({ length: DAYS }, (_, i) => line(computePresence(EMPLOYEES, addDays(FROM, i), S, 'loc-camp'))).join('\n') + '\n';

  it('44 хоногийн үр дүн түгжээтэй файлтай яг таарна', () => {
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) {
      if (process.env.CI) throw new Error(`Golden файл алга: ${GOLDEN}`);
      writeFileSync(GOLDEN, actual);
    }
    const expected = readFileSync(GOLDEN, 'utf8').replace(/\r\n/g, '\n');
    const a = actual.split('\n');
    const e = expected.split('\n');
    // Эхний зөрүүтэй мөрийг тодорхой харуулна
    const first = a.findIndex((l, i) => l !== e[i]);
    expect(first === -1 ? null : { line: first + 1, expected: e[first], actual: a[first] }).toBeNull();
    expect(a.length).toBe(e.length);
  });

  it('гол кейсүүд (golden-ийг гараар баталгаажуулсан цэгүүд)', () => {
    const per = (id: string, d: string) => {
      const x = employeeDay(EMPLOYEES.find((e) => e.id === id) as PresenceEmployee, d, S);
      return x ? `${x.kind === 'MOVEMENT' ? 'MV' : `${x.shift ?? '?'}${x.firstNight ? '*' : ''}`}:${x.slots.map((s) => `${short[s.meal]}${s.place === 'CAMP' ? 'c' : 'd'}`).join('')}` : null;
    };
    expect(per('A-ADM', A)).toBe('MV:Dc'); // ростерын ирэлт → Орой
    expect(per('A-ADM', addDays(A, 1))).toBe('DAY:BcLdDc');
    expect(per('A-ADM', addDays(A, 15))).toBe('MV:Bc'); // явах Пүрэв → Өглөө
    expect(per('A-ADM', addDays(A, 16))).toBeNull();
    expect(per('A-PRD', addDays(A, 8))).toBe('NIGHT*:BcDcNdLc'); // шөнийн эхний өдөр → + Өдөр (кемп)
    expect(per('A-PRD', addDays(A, 9))).toBe('NIGHT:BcDcNd');
    expect(per('B-PRD', addDays(BB, 1))).toBe('NIGHT*:BcDcNdLc'); // шөнөөр эхэлсэн
    expect(per('X-ADM', FROM)).toBe('MV:LdDc'); // ээлжийн бус ирэлт: сонгосон хоол
    expect(per('X-ADM', addDays(FROM, 1))).toBe('DAY:BcLdDc'); // UNIFORM_PATTERN
    expect(per('A-EARLY', addDays(A, -1))).toBe('?:BcDc'); // ээлжээс өмнө → тодорхойгүй
    expect(per('A-EARLY', A)).toBe('?:BcDc'); // ирэх Лхагва (өдөр 0) → тодорхойгүй
    expect(per('A-EARLY', addDays(A, 5))).toBe('NIGHT*:BcDcNdLc'); // зохицуулалтаар шөнө
    expect(per('A-EARLY', addDays(A, 8))).toBe('NIGHT:BcDcNd'); // зохицуулалт → загварын шөнө (эхний шөнө биш)
    expect(per('Z-MIX', addDays(A, 4))).toBe('?:BcDc');
    expect(per('V-DAY', addDays(A, 1))).toBe('MV:LdDc'); // нэг өдөр ирж явсан → нэгтгэнэ
    expect(per('V-DAY', addDays(A, 20))).toBe('MV:'); // хоолгүй ирэлт
    expect(per('A-STAY', addDays(A, 16))).toBe('DAY:BcLdDc'); // амралтад зохицуулалтаар үлдсэн
    expect(per('A-STAY', addDays(A, 15))).toBe('DAY:BcLdDc'); // явах өдөр ч бүтэн өдөр (явалт 21-нд)
    expect(per('B-MID', addDays(BB, 5))).toBe('NIGHT:BcDcNd'); // ирсэн өдрөө шөнө гарсан → дараагийн өдөр эхний шөнө БИШ
  });

  it('кемпийн анхдагч байршилгүй бол анхааруулга; хэлтсийн байршилд нөлөөлөхгүй', () => {
    const r = computePresence(EMPLOYEES, addDays(A, 3), S, null);
    expect(r.warnings.noDefaultMealLocation).toBe(true);
    expect(r.lines.filter((l) => l.mealLocationId === null).every((l) => l.mealType === B || l.mealType === D || l.mealType === L)).toBe(true);
  });
});
