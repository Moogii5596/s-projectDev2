import { describe, it, expect } from 'vitest';
import { CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { planImport, PlannerState } from '../import-planner';
import type { ParsedRow } from '../import-parser';
import { firstOverCapacityNight } from '../../../camp/attendance/camp-rooms.service';

const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3, extensionDefaultDays: 7 };
const ANCHOR = '2026-10-22'; // ирэх = өдөр 0, явах (on + 1) = 2026-11-06
const src = (p: Partial<NonNullable<ParsedRow['source']>> = {}): ParsedRow['source'] => ({
  sheet: '2026.11.06 Сунах', row: 4, idRaw: '10001', idType: 'CODE', lastName: 'О', firstName: 'Н', crew: 'D', extendDays: null, ...p,
});
const ext = (code: string, date: string, p: Partial<ParsedRow> = {}): ParsedRow => ({
  row: 1, employeeCode: code, date, direction: null, meals: null, shift: null, errors: [], action: 'EXTEND', source: src(), ...p,
});
function state(over: Partial<PlannerState> = {}): PlannerState {
  return {
    campId: 'c1',
    settings: S,
    employees: new Map([
      ['10001', { id: 'e1', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: ANCHOR, departmentId: 'd-night' }],
      ['10002', { id: 'e2', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: ANCHOR, departmentId: 'd-none' }],
      ['10003', { id: 'e3', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: null, departmentId: 'd-night' }],
    ]),
    stays: new Map([
      ['e1', [{ id: 's1', startDate: ANCHOR, endDate: null }]],
      ['e3', [{ id: 's3', startDate: ANCHOR, endDate: null }]],
    ]),
    movementKeys: new Set(),
    adjustments: new Map(),
    patterns: new Map([['d-night', [{ dayFrom: 1, dayTo: 7, shift: 'DAY' as const }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' as const }]]]),
    ...over,
  };
}

describe('planImport — Сунах (R-6)', () => {
  it('ростерын явах өдрөөс анхдагч 7 хоног, ээлж = загварын өдөр 14; явалт / ирэлт үүсгэхгүй', () => {
    const plan = planImport([ext('10001', '2026-11-06')], state());
    expect(plan.errorRows).toBe(0);
    expect(plan.movements).toEqual([]);
    expect(plan.adjustments).toEqual([{ employeeId: 'e1', startDate: '2026-11-06', endDate: '2026-11-12', shift: 'NIGHT', reasonType: 'EXTENSION' }]);
    expect(plan.rows[0]).toMatchObject({ action: 'EXTEND', date: '2026-11-06', extendTo: '2026-11-12', shift: 'NIGHT', source: { sheet: '2026.11.06 Сунах' } });
    expect(plan.rows[0].warnings).toBeUndefined();
  });

  it('«N хоног» → N; кемпийн тохиргоо', () => {
    expect(planImport([ext('10001', '2026-11-06', { source: src({ extendDays: 14 }) })], state()).adjustments[0].endDate).toBe('2026-11-19');
    expect(planImport([ext('10001', '2026-11-06')], state({ settings: { ...S, extensionDefaultDays: 3 } })).adjustments[0].endDate).toBe('2026-11-08');
  });

  it('дахин сунгавал өмнөх сунгалтын дараагаас (DB ба нэг файлд)', () => {
    const db = state({ adjustments: new Map([['e1', [{ startDate: '2026-11-06', endDate: '2026-11-12', reasonType: 'EXTENSION' as const }]]]) });
    expect(planImport([ext('10001', '2026-11-06')], db).adjustments[0]).toMatchObject({ startDate: '2026-11-13', endDate: '2026-11-19' });
    const twice = planImport([ext('10001', '2026-11-06'), ext('10001', '2026-11-06', { row: 2 })], state());
    expect(twice.adjustments.map((a) => [a.startDate, a.endDate])).toEqual([['2026-11-06', '2026-11-12'], ['2026-11-13', '2026-11-19']]);
  });

  it('бусад зохицуулалттай давхцвал алдаа', () => {
    const st = state({ adjustments: new Map([['e1', [{ startDate: '2026-11-08', endDate: '2026-11-09', reasonType: 'OTHER' as const }]]]) });
    const plan = planImport([ext('10001', '2026-11-06')], st);
    expect(plan.errorRows).toBe(1);
    expect(plan.rows[0].errors).toEqual(['Ээлжийн зохицуулалт давхцана (2026-11-08 – 2026-11-09)']);
  });

  it('анхааруулга: явах өдөр биш, кемпэд алга, загвар алга (→ ӨДӨР), багагүй (алгасна)', () => {
    const plan = planImport([ext('10001', '2026-11-05'), ext('10002', '2026-11-06', { row: 2 }), ext('10003', '2026-11-06', { row: 3 })], state());
    expect(plan.errorRows).toBe(0);
    expect(plan.rows[0].warnings).toEqual(['Ростерын явах өдөр 2026-11-06 — файлын огноотой зөрүүтэй']);
    expect(plan.rows[1].warnings).toEqual([
      'Кемпэд ирэлт бүртгэгдээгүй (нээлттэй байх хугацаа алга)',
      'Хэлтсийн ээлжийн загвараас ээлж тодорхойгүй — ӨДӨР гэж авав',
    ]);
    expect(plan.rows[1].shift).toBe('DAY');
    expect(plan.rows[2].warnings).toEqual(['Ростергүй (багагүй) ажилтан — сунгалт шаардлагагүй, алгасав']);
    expect(plan.adjustments.map((a) => a.employeeId)).toEqual(['e1', 'e2']);
  });

  it('R-8: ShiftChange-ийн ростерын бус явалт → анхдагч хоол (алдаагүй); «Ирц» загварт хоол заавал хэвээр', () => {
    const dep: ParsedRow = { row: 1, employeeCode: '10001', date: '2026-11-13', direction: CampMovementDirection.DEPARTURE, meals: null, shift: null, errors: [] };
    expect(planImport([{ ...dep, source: src({ sheet: '2026.11.13 D буух' }) }], state()).movements[0]).toMatchObject({ kind: 'OFF_ROSTER', meals: ['BREAKFAST'] });
    expect(planImport([dep], state()).rows[0].errors).toEqual(['Ээлжийн бус ирэлт/явалтад хоол заавал (хоол идэхгүй бол NONE)']);
  });
});

describe('firstOverCapacityNight — сунгалт (R-7)', () => {
  it('сунгасан шөнө (ростерын бус) тоологдоно', () => {
    const D = ANCHOR;
    const A = '2026-11-05'; // эсрэг баг: D-гийн явах өдрөөс 1 хоногийн өмнө ирнэ
    const occ = [
      { employeeCode: 'D1', crewAnchor: D, startDate: '2026-10-01', endDate: null },
      { employeeCode: 'A1', crewAnchor: A, startDate: '2026-10-01', endDate: null },
    ];
    const S0 = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
    expect(firstOverCapacityNight(occ, 1, '2026-11-06', 7, S0)).toBeNull();
    const withExt = [{ ...occ[0], extensions: [{ startDate: '2026-11-06', endDate: '2026-11-12' }] }, occ[1]];
    expect(firstOverCapacityNight(withExt, 1, '2026-11-06', 7, S0)).toEqual({ date: '2026-11-06', count: 2, codes: ['A1', 'D1'] });
  });
});
