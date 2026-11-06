import { describe, it, expect } from 'vitest';
import { CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { applyRowEdits, planWithDeleted } from '../import-edits';
import type { PlannerState } from '../import-planner';
import type { ParsedRow } from '../import-parser';

const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3, extensionDefaultDays: 7 };
const src = (p: Partial<NonNullable<ParsedRow['source']>> = {}): ParsedRow['source'] => ({
  sheet: '2026.11.04 A ирэх', row: 5, idRaw: 'NEW', idType: 'NEW', lastName: 'Бат', firstName: 'Дорж', crew: 'A', extendDays: null, ...p,
});
const arr = (row: number, code: string, p: Partial<ParsedRow> = {}): ParsedRow => ({
  row, employeeCode: code, date: '2026-11-04', direction: CampMovementDirection.ARRIVAL, meals: [], shift: null, errors: [], ...p,
});
const state = (): PlannerState => ({
  campId: 'c1',
  settings: S,
  employees: new Map([
    ['10001', { id: 'e1', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: null }],
    ['10002', { id: 'e2', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: null }],
  ]),
  stays: new Map(),
  movementKeys: new Set(),
  adjustments: new Map(),
});
const codes = new Map([['e1', '10001'], ['e2', '10002']]);
const code = (e: unknown) => (e as { getResponse: () => { code: string } }).getResponse().code;

describe('applyRowEdits (R4.1)', () => {
  it('ShiftChange мөрийн ажилтныг солиход тулгалтын алдаа / анхааруулга арилж, анхны код хадгалагдана', () => {
    const parsed = [arr(1, '', { errors: ['бүртгэлгүй'], warnings: ['нэр зөрүүтэй'], source: src() })];
    const [r] = applyRowEdits(parsed, [{ row: 1, employeeId: 'e1' }], codes);
    expect(r).toMatchObject({ employeeCode: '10001', errors: [], edited: { fromCode: '' } });
    expect(r.warnings).toBeUndefined();
    expect(parsed[0].employeeCode).toBe(''); // оролтыг өөрчлөхгүй
    // дахин солиход анхны код хэвээр
    const [r2] = applyRowEdits([r], [{ row: 1, employeeId: 'e2' }], codes);
    expect(r2.edited).toEqual({ fromCode: '' });
    expect(r2.employeeCode).toBe('10002');
  });

  it('«Ирц» загварын задлалтын алдаа ажилтан солиход хэвээр', () => {
    const [r] = applyRowEdits([arr(2, '99999', { errors: ['огноо буруу'] })], [{ row: 2, employeeId: 'e1' }], codes);
    expect(r.errors).toEqual(['огноо буруу']);
    expect(r.employeeCode).toBe('10001');
  });

  it('устгах / сэргээх', () => {
    const [d] = applyRowEdits([arr(1, '10001')], [{ row: 1, deleted: true }], codes);
    expect(d.deleted).toBe(true);
    const [u] = applyRowEdits([d], [{ row: 1, deleted: false }], codes);
    expect(u.deleted).toBeUndefined();
  });

  it('алдаа: мөр алга, давхар, хоосон / хоёулаа, өөр кемпийн ажилтан', () => {
    const p = [arr(1, '10001')];
    expect(() => applyRowEdits(p, [{ row: 9, deleted: true }], codes)).toThrow();
    try { applyRowEdits(p, [{ row: 9, deleted: true }], codes); } catch (e) { expect(code(e)).toBe('camp.err.attendance.12'); }
    try { applyRowEdits(p, [{ row: 1, deleted: true }, { row: 1, deleted: false }], codes); } catch (e) { expect(code(e)).toBe('camp.err.attendance.13'); }
    try { applyRowEdits(p, [{ row: 1 }], codes); } catch (e) { expect(code(e)).toBe('camp.err.attendance.13'); }
    try { applyRowEdits(p, [{ row: 1, employeeId: 'e1', deleted: true }], codes); } catch (e) { expect(code(e)).toBe('camp.err.attendance.13'); }
    try { applyRowEdits(p, [{ row: 1, employeeId: 'zz' }], codes); } catch (e) { expect(code(e)).toBe('camp.err.attendance.5'); }
    expect.assertions(6);
  });
});

describe('planWithDeleted (R4.1)', () => {
  it('устгасан мөрийг planner алгасаж, хариунд `deleted` (алдаагүй) дарааллаар', () => {
    const parsed = [arr(1, '10001'), arr(2, 'XXXXX', { deleted: true }), arr(3, '10002')];
    const { plan, rows, deletedRows } = planWithDeleted(parsed, state());
    expect(plan.errorRows).toBe(0);
    expect(plan.movements.map((m) => m.employeeId)).toEqual(['e1', 'e2']);
    expect(rows.map((r) => [r.row, !!r.deleted, r.errors.length])).toEqual([[1, false, 0], [2, true, 0], [3, false, 0]]);
    expect(deletedRows).toBe(1);
  });

  it('засварын дараа алдаа арилна (олдохгүй ажилтан → сольсон)', () => {
    const before = planWithDeleted([arr(1, '', { errors: ['бүртгэлгүй'], source: src() })], state());
    expect(before.plan.errorRows).toBe(1);
    const fixed = applyRowEdits([arr(1, '', { errors: ['бүртгэлгүй'], source: src() })], [{ row: 1, employeeId: 'e2' }], codes);
    const after = planWithDeleted(fixed, state());
    expect(after.plan.errorRows).toBe(0);
    expect(after.rows[0]).toMatchObject({ employeeId: 'e2', edited: { fromCode: '' } });
  });
});
