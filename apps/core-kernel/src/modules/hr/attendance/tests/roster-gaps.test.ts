import { describe, it, expect } from 'vitest';
import { CampMovementDirection } from '@prisma/client';
import { findRosterGaps, GapEmployee } from '../roster-gaps';
import type { ParsedRow } from '../import-parser';

const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };
// A баг: ирэх 2026-11-04 (өдөр 0); D баг: явах 2026-11-05 (өдөр 15) → anchor 2026-10-21
const A = '2026-11-04';
const D = '2026-10-21';
const emp = (id: string, code: string, anchor: string, crew: string): GapEmployee => ({ id, employeeCode: code, fullName: `Ажилтан ${code}`, crew, anchor });
const src: ParsedRow['source'] = { sheet: 's', row: 3, idRaw: '1', idType: 'CODE', lastName: 'О', firstName: 'Н', crew: null, extendDays: null };
const row = (code: string, date: string, direction: CampMovementDirection | null, p: Partial<ParsedRow> = {}): ParsedRow => ({
  row: 1, employeeCode: code, date, direction, meals: null, shift: null, errors: [], source: src, ...p,
});
const ARR = CampMovementDirection.ARRIVAL;
const DEP = CampMovementDirection.DEPARTURE;
const employees = [emp('a1', '10001', A, 'A'), emp('a2', '10002', A, 'A'), emp('a3', '10003', A, 'A'), emp('d1', '20001', D, 'D'), emp('d2', '20002', D, 'D'), emp('d3', '20003', D, 'D'), emp('d4', '20004', D, 'D')];
const stays = new Map([
  ['a3', [{ startDate: '2026-11-01', endDate: null }]],                // эрт ирсэн — кемпэд байгаа
  ['d1', [{ startDate: '2026-10-21', endDate: null }]],
  ['d2', [{ startDate: '2026-10-21', endDate: null }]],
  ['d3', [{ startDate: '2026-10-21', endDate: null }]],
  ['d4', [{ startDate: '2026-10-21', endDate: '2026-11-03' }]],        // эрт явсан
]);
const adjustments = new Map([['d3', [{ startDate: '2026-11-05', endDate: '2026-11-11' }]]]); // өмнө сунгасан

describe('findRosterGaps (R4.2)', () => {
  it('ирэх: ростероор ирэх ёстой, кемпэд байгаагүй, жагсаалтад алга; явах: кемпэд байгаа, сунгалтгүй, буух / Сунахад алга', () => {
    const rows = [row('10001', '2026-11-04', ARR), row('20001', '2026-11-05', DEP)];
    const gaps = findRosterGaps(rows, employees, stays, adjustments, S);
    expect(gaps).toEqual([
      { date: '2026-11-04', direction: ARR, total: 1, employees: [{ id: 'a2', employeeCode: '10002', fullName: 'Ажилтан 10002', crew: 'A' }] },
      { date: '2026-11-05', direction: DEP, total: 1, employees: [{ id: 'd2', employeeCode: '20002', fullName: 'Ажилтан 20002', crew: 'D' }] },
    ]);
  });

  it('Сунах мөр = явахад тооцогдоно; өөр өдөр жагсаалтад байвал гэмтэл биш; устгасан мөр тооцогдохгүй', () => {
    const rows = [
      row('10001', '2026-11-04', ARR),
      row('10002', '2026-11-05', ARR),                     // хоцорч ирсэн
      row('20001', '2026-11-05', DEP),
      row('20002', '2026-11-05', null, { action: 'EXTEND' }),
    ];
    expect(findRosterGaps(rows, employees, stays, adjustments, S)).toEqual([]);
    const del = [...rows.slice(0, 3), { ...rows[3], deleted: true }];
    expect(findRosterGaps(del, employees, stays, adjustments, S).map((g) => [g.date, g.direction, g.employees.map((e) => e.employeeCode)])).toEqual([['2026-11-05', DEP, ['20002']]]);
  });

  it('файлд тухайн чиглэлийн өдөр алга бол шалгахгүй; «Ирц» загварын мөр (source-гүй) тооцогдохгүй; limit', () => {
    expect(findRosterGaps([row('20001', '2026-11-05', DEP)], employees, stays, adjustments, S).every((g) => g.direction === DEP)).toBe(true);
    expect(findRosterGaps([row('10001', '2026-11-04', ARR, { source: undefined })], employees, stays, adjustments, S)).toEqual([]);
    const g = findRosterGaps([row('X', '2026-11-04', ARR)], employees, stays, adjustments, S, 1);
    expect(g[0]).toMatchObject({ total: 2 });
    expect(g[0].employees).toHaveLength(1);
  });
});
