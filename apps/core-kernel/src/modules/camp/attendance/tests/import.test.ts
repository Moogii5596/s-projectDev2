import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { CampEmployeeStatus, CampMovementDirection } from '@prisma/client';
import { buildAttendanceTemplate, parseAttendanceXlsx, parseDateCell, parseMeals } from '../import-parser';
import { movementKey, planImport, PlannerState } from '../import-planner';
import type { ParsedRow } from '../import-parser';

const { ARRIVAL, DEPARTURE } = CampMovementDirection;
const S = { rosterOnDays: 14, rosterOffDays: 14, changeoverWeekday: 3 };

async function xlsx(header: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ирц');
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('import-parser', () => {
  it('англи толгой, Excel огноо (Date), serial, string, хоосон мөр алгасна, англи/монгол утга', async () => {
    const buf = await xlsx(['employee_code', 'date', 'direction', 'meals', 'shift'], [
      ['E001', new Date(Date.UTC(2026, 9, 7)), 'ARRIVAL', '', ''],
      [],
      ['E002', 46303, 'ирсэн', 'lunch, Dinner;NIGHT', 'шөнө'],
      ['E003', '2026.10.22', 'departure', 'NONE', null],
    ]);
    const rows = await parseAttendanceXlsx(buf);
    expect(rows).toEqual([
      { row: 2, employeeCode: 'E001', date: '2026-10-07', direction: ARRIVAL, meals: null, shift: null, errors: [] },
      { row: 4, employeeCode: 'E002', date: '2026-10-08', direction: ARRIVAL, meals: ['LUNCH', 'DINNER', 'NIGHT'], shift: 'NIGHT', errors: [] },
      { row: 5, employeeCode: 'E003', date: '2026-10-22', direction: DEPARTURE, meals: [], shift: null, errors: [] },
    ]);
  });

  it('монгол толгой; мөрийн алдаа (огноо, чиглэл, хоол, ээлж) — бүгдийг нэг дор', async () => {
    const buf = await xlsx(['Ажилтны код', 'Огноо', 'Чиглэл', 'Хоол', 'Ээлж'], [['', '2026-02-30', 'MAYBE', 'LUNCH,PIZZA', 'EVENING']]);
    const [r] = await parseAttendanceXlsx(buf);
    expect(r.errors).toEqual([
      'employee_code хоосон',
      'Огноо буруу: "2026-02-30" (YYYY-MM-DD)',
      'direction буруу: "MAYBE" (ARRIVAL эсвэл DEPARTURE)',
      'Үл мэдэгдэх хоол: PIZZA (BREAKFAST, LUNCH, DINNER, NIGHT эсвэл NONE)',
      'shift буруу: "EVENING" (DAY эсвэл NIGHT)',
    ]);
  });

  it('заавал багана алга / xlsx биш / хоосон → 400', async () => {
    await expect(parseAttendanceXlsx(await xlsx(['code', 'date'], [['E1', '2026-10-07']]))).rejects.toThrow(/Заавал багана алга: direction/);
    await expect(parseAttendanceXlsx(Buffer.from('employee_code,date\nE1,2026'))).rejects.toThrow(/Зөвхөн \.xlsx/);
    await expect(parseAttendanceXlsx(Buffer.from('PK\u0003\u0004garbage'))).rejects.toThrow(/уншиж чадсангүй/);
    await expect(parseAttendanceXlsx(await xlsx(['employee_code', 'date', 'direction'], []))).rejects.toThrow(/өгөгдлийн мөр алга/);
  });

  it('загвар файл өөрийгөө задлана (жишээ мөрүүд хүчинтэй)', async () => {
    const rows = await parseAttendanceXlsx(await buildAttendanceTemplate());
    expect(rows.map((r) => [r.employeeCode, r.direction, r.errors.length])).toEqual([['E001', ARRIVAL, 0], ['E002', ARRIVAL, 0], ['E003', DEPARTURE, 0]]);
  });

  it('parseMeals / parseDateCell', () => {
    expect(parseMeals('')).toEqual({ meals: null });
    expect(parseMeals('night, b, b')).toEqual({ meals: ['BREAKFAST', 'NIGHT'] });
    expect(parseMeals('NONE, LUNCH').error).toMatch(/NONE/);
    expect(parseDateCell('2026/1/5')).toBe('2026-01-05');
    expect(parseDateCell('07.10.2026')).toBeNull();
  });
});

describe('import-planner', () => {
  const row = (over: Partial<ParsedRow>): ParsedRow => ({ row: 2, employeeCode: 'E1', date: '2026-10-07', direction: ARRIVAL, meals: null, shift: null, errors: [], ...over });
  const state = (over: Partial<PlannerState> = {}): PlannerState => ({
    campId: 'c1',
    settings: S,
    employees: new Map([
      ['E1', { id: 'e1', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: '2026-10-07' }],
      ['E2', { id: 'e2', campId: 'c1', status: CampEmployeeStatus.ACTIVE, crewAnchor: null }],
      ['X9', { id: 'x9', campId: 'c2', status: CampEmployeeStatus.ACTIVE, crewAnchor: null }],
      ['OFF', { id: 'off', campId: 'c1', status: CampEmployeeStatus.INACTIVE, crewAnchor: null }],
    ]),
    stays: new Map(),
    movementKeys: new Set(),
    adjustments: new Map(),
    ...over,
  });

  it('ростерын ирэлт (хоолгүй → DINNER) + явалт нэг файлд → хаагдсан шинэ stay', () => {
    const p = planImport([row({}), row({ row: 3, date: '2026-10-22', direction: DEPARTURE })], state());
    expect(p.errorRows).toBe(0);
    expect(p.movements.map((m) => [m.date, m.direction, m.kind, m.meals])).toEqual([
      ['2026-10-07', ARRIVAL, 'ROSTER', ['DINNER']],
      ['2026-10-22', DEPARTURE, 'ROSTER', ['BREAKFAST']],
    ]);
    expect(p.newStays).toEqual([{ employeeId: 'e1', arrivalKey: 'e1|2026-10-07|ARRIVAL', departureKey: 'e1|2026-10-22|DEPARTURE', startDate: '2026-10-07', endDate: '2026-10-22' }]);
    expect(p.closeStays).toEqual([]);
  });

  it('ээлжийн бус: хоол заавал (хоосон → алдаа, NONE → []); багагүй ажилтан үргэлж ээлжийн бус', () => {
    const p = planImport([row({ employeeCode: 'E2' }), row({ row: 3, employeeCode: 'E1', date: '2026-10-06' })], state());
    expect(p.rows.map((r) => r.errors)).toEqual([
      ['Ээлжийн бус ирэлт/явалтад хоол заавал (хоол идэхгүй бол NONE)'],
      ['Ээлжийн бус ирэлт/явалтад хоол заавал (хоол идэхгүй бол NONE)'],
    ]);
    expect(p.movements).toEqual([]);
    const ok = planImport([row({ employeeCode: 'E2', meals: [] })], state());
    expect(ok.movements[0]).toMatchObject({ kind: 'OFF_ROSTER', meals: [] });
  });

  it('DB-д нээлттэй stay байхад явалт → closeStays; дахин ирэлт → алдаа', () => {
    const st = state({ stays: new Map([['e1', [{ id: 's1', startDate: '2026-10-07', endDate: null }]]]) });
    const p = planImport([row({ date: '2026-10-22', direction: DEPARTURE })], st);
    expect(p.closeStays).toEqual([{ stayId: 's1', departureKey: 'e1|2026-10-22|DEPARTURE', endDate: '2026-10-22' }]);
    const again = planImport([row({ date: '2026-10-09', meals: ['DINNER'] })], st);
    expect(again.rows[0].errors[0]).toMatch(/Кемпэд байгаа хэвээр \(2026-10-07-нд ирсэн/);
  });

  it('нээлттэй stay-гүй явалт, ирснээс өмнөх явалт, хаагдсан stay-тэй давхцах ирэлт → алдаа', () => {
    expect(planImport([row({ direction: DEPARTURE, meals: ['BREAKFAST'] })], state()).rows[0].errors).toEqual(['Кемпэд байхгүй (нээлттэй ирэлт алга) — эхлээд ирэлтийг бүртгэнэ үү']);
    const st = state({ stays: new Map([['e1', [{ id: 's1', startDate: '2026-10-10', endDate: null }]]]) });
    expect(planImport([row({ date: '2026-10-08', direction: DEPARTURE, meals: [] })], st).rows[0].errors[0]).toMatch(/ирсэн огнооноос \(2026-10-10\) өмнө/);
    const closed = state({ stays: new Map([['e1', [{ id: 's1', startDate: '2026-10-07', endDate: '2026-10-22' }]]]) });
    expect(planImport([row({ date: '2026-10-20', meals: [] })], closed).rows[0].errors[0]).toMatch(/Байх хугацаа давхцана \(2026-10-07 – 2026-10-22\)/);
    expect(planImport([row({ date: '2026-10-22', meals: [] })], closed).rows[0].errors[0]).toMatch(/давхцана/); // явсан өдөр дахин ирэх
    expect(planImport([row({ date: '2026-10-23', meals: [] })], closed).errorRows).toBe(0);
  });

  it('давхардал: DB-д байгаа / файлд 2 удаа; ажилтан олдохгүй / өөр кемп / идэвхгүй', () => {
    const st = state({ movementKeys: new Set([movementKey('e1', '2026-10-07', ARRIVAL)]) });
    expect(planImport([row({})], st).rows[0].errors).toContain('Энэ ирэлт/явалт аль хэдийн бүртгэгдсэн');
    const dup = planImport([row({}), row({ row: 3 })], state());
    expect(dup.rows[1].errors).toEqual(['Файлд давхардсан мөр']);
    expect(dup.movements).toHaveLength(1);
    const errs = planImport([row({ employeeCode: 'NOPE' }), row({ row: 3, employeeCode: 'X9' }), row({ row: 4, employeeCode: 'OFF' })], state()).rows.map((r) => r.errors[0]);
    expect(errs).toEqual(['Ажилтан олдсонгүй: NOPE', 'Өөр кемпийн ажилтан', 'Ажилтан идэвхгүй']);
  });

  it('shift (ирэлт) → зохицуулалт: явалт хүртэл; явалтгүй бол +on хоног; зохицуулалт давхцал / явалтад shift → алдаа', () => {
    const p = planImport([row({ employeeCode: 'E2', date: '2026-10-12', meals: ['LUNCH', 'DINNER', 'NIGHT'], shift: 'NIGHT' }), row({ row: 3, employeeCode: 'E2', date: '2026-10-20', direction: DEPARTURE, meals: ['BREAKFAST'] })], state());
    expect(p.adjustments).toEqual([{ employeeId: 'e2', startDate: '2026-10-12', endDate: '2026-10-20', shift: 'NIGHT' }]);
    const open = planImport([row({ employeeCode: 'E2', date: '2026-10-12', meals: [], shift: 'DAY' })], state());
    expect(open.adjustments[0].endDate).toBe('2026-10-26');
    const busy = state({ adjustments: new Map([['e2', [{ startDate: '2026-10-20', endDate: '2026-10-25' }]]]) });
    expect(planImport([row({ employeeCode: 'E2', date: '2026-10-12', meals: [], shift: 'DAY' })], busy).rows[0].errors[0]).toMatch(/зохицуулалт давхцана \(2026-10-20 – 2026-10-25\)/);
    expect(planImport([row({ direction: DEPARTURE, shift: 'DAY' })], state()).rows[0].errors).toContain('shift зөвхөн ARRIVAL мөрөнд');
  });

  it('эрэмбэ: файлын дараалал үл хамаарна (явалт → ирэлт), мөрүүд row дугаараар буцна; parse алдаатай мөр бичигдэхгүй', () => {
    const st = state({ stays: new Map([['e1', [{ id: 's1', startDate: '2026-09-23', endDate: null }]]]) });
    const p = planImport([row({ row: 2, date: '2026-11-04' }), row({ row: 3, date: '2026-10-08', direction: DEPARTURE, meals: ['BREAKFAST'] })], st);
    expect(p.errorRows).toBe(0);
    expect(p.rows.map((r) => r.row)).toEqual([2, 3]);
    expect(p.closeStays[0].endDate).toBe('2026-10-08');
    const bad = planImport([row({ errors: ['Огноо буруу'], date: null })], state());
    expect(bad.errorRows).toBe(1);
    expect(bad.movements).toEqual([]);
  });
});
