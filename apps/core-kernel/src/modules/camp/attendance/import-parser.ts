import { t } from '../../../common/i18n/translate';
import { CampMealType, CampMovementDirection, CampShiftType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { cellText, parseDateCell } from '../../../common/xlsx/cells';
import { badRequest } from '../../../common/i18n/app-error';

/**
 * Ирцийн xlsx задлагч (Шат 3.3). Багана (англи эсвэл монгол, том жижиг үсэг хамаарахгүй):
 *   employee_code* | date* | direction* (ARRIVAL/DEPARTURE) | meals (BREAKFAST,LUNCH,DINNER,NIGHT | NONE) | shift (DAY/NIGHT)
 * meals: ростерын бол заавал биш (анхдагч), ээлжийн бус бол ЗААВАЛ (хоол идэхгүй бол NONE) — планнер шалгана.
 */
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface ParsedRow {
  row: number;
  employeeCode: string;
  date: string | null;
  direction: CampMovementDirection | null;
  /** null = багана хоосон (өгөөгүй); [] = NONE */
  meals: CampMealType[] | null;
  shift: CampShiftType | null;
  errors: string[];
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

const HEADERS: Record<string, string[]> = {
  employeeCode: ['EMPLOYEE_CODE', 'EMPLOYEE CODE', 'CODE', 'КОД', 'АЖИЛТНЫ КОД', 'АЖИЛТНЫ_КОД'],
  date: ['DATE', 'ОГНОО'],
  direction: ['DIRECTION', 'ЧИГЛЭЛ'],
  meals: ['MEALS', 'MEAL', 'ХООЛ'],
  shift: ['SHIFT', 'ЭЭЛЖ'],
};
const DIRECTIONS: Record<string, CampMovementDirection> = {
  ARRIVAL: CampMovementDirection.ARRIVAL, IN: CampMovementDirection.ARRIVAL, 'ИРСЭН': CampMovementDirection.ARRIVAL, 'ИРЭХ': CampMovementDirection.ARRIVAL,
  DEPARTURE: CampMovementDirection.DEPARTURE, OUT: CampMovementDirection.DEPARTURE, 'ЯВСАН': CampMovementDirection.DEPARTURE, 'ЯВАХ': CampMovementDirection.DEPARTURE,
};
const MEALS: Record<string, CampMealType> = {
  BREAKFAST: CampMealType.BREAKFAST, B: CampMealType.BREAKFAST, 'ӨГЛӨӨ': CampMealType.BREAKFAST,
  LUNCH: CampMealType.LUNCH, L: CampMealType.LUNCH, 'ӨДӨР': CampMealType.LUNCH,
  DINNER: CampMealType.DINNER, D: CampMealType.DINNER, 'ОРОЙ': CampMealType.DINNER,
  NIGHT: CampMealType.NIGHT, N: CampMealType.NIGHT, 'ШӨНӨ': CampMealType.NIGHT,
};
const NONE = new Set(['NONE', '-', 'ҮГҮЙ']);
const SHIFTS: Record<string, CampShiftType> = { DAY: CampShiftType.DAY, 'ӨДӨР': CampShiftType.DAY, NIGHT: CampShiftType.NIGHT, 'ШӨНӨ': CampShiftType.NIGHT };
const MEAL_ORDER = [CampMealType.BREAKFAST, CampMealType.LUNCH, CampMealType.DINNER, CampMealType.NIGHT];

// cellText, parseDateCell → common/xlsx/cells.ts (v0.2.0 §0.5, зан төлөв ижил)
export { parseDateCell };

export function parseMeals(text: string): { meals: CampMealType[] | null; error?: string } {
  const tokens = norm(text).split(/[,;\s]+/).filter(Boolean);
  if (tokens.length === 0) return { meals: null };
  if (tokens.some((tok) => NONE.has(tok))) {
    return tokens.length === 1 ? { meals: [] } : { meals: null, error: t('camp.row.meals_none_mixed') };
  }
  const unknown = tokens.filter((tok) => !MEALS[tok]);
  if (unknown.length > 0) return { meals: null, error: t('camp.row.meals_unknown', { values: unknown.join(', ') }) };
  const set = new Set(tokens.map((tok) => MEALS[tok]));
  return { meals: MEAL_ORDER.filter((m) => set.has(m)) };
}

export async function parseAttendanceXlsx(buffer: Buffer): Promise<ParsedRow[]> {
  if (buffer.length > IMPORT_MAX_BYTES) throw badRequest('camp.err.attendance_ctl.3');
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw badRequest('camp.err.import_parser.1');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('camp.err.import_parser.2');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('camp.err.import_parser.3');

  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const h = norm(cellText(cell.value));
    for (const [field, aliases] of Object.entries(HEADERS)) if (aliases.includes(h)) col[field as keyof typeof HEADERS] = c;
  });
  const missing = (['employeeCode', 'date', 'direction'] as const).filter((f) => col[f] === undefined);
  if (missing.length > 0) {
    throw badRequest('camp.err.import_parser.4', { columns: missing.map((f) => HEADERS[f][0].toLowerCase()).join(', ') });
  }

  const rows: ParsedRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (f: keyof typeof HEADERS) => (col[f] === undefined ? null : row.getCell(col[f] as number).value);
    const code = cellText(get('employeeCode')).trim();
    const dateRaw = get('date');
    const dirText = norm(cellText(get('direction')));
    const mealsText = cellText(get('meals'));
    const shiftText = norm(cellText(get('shift')));
    if (!code && !cellText(dateRaw).trim() && !dirText && !mealsText.trim() && !shiftText) continue; // хоосон мөр

    const errors: string[] = [];
    if (!code) errors.push(t('camp.row.code_empty'));
    const date = parseDateCell(dateRaw);
    if (!date) errors.push(t('camp.row.bad_date', { value: cellText(dateRaw) }));
    const direction = DIRECTIONS[dirText] ?? null;
    if (!direction) errors.push(t('camp.row.bad_direction', { value: dirText }));
    const m = parseMeals(mealsText);
    if (m.error) errors.push(m.error);
    let shift: CampShiftType | null = null;
    if (shiftText) {
      shift = SHIFTS[shiftText] ?? null;
      if (!shift) errors.push(t('camp.row.bad_shift', { value: shiftText }));
    }
    rows.push({ row: r, employeeCode: code, date, direction, meals: m.meals, shift, errors });
    if (rows.length > IMPORT_MAX_ROWS) throw badRequest('camp.err.import_parser.5', { max: IMPORT_MAX_ROWS });
  }
  if (rows.length === 0) throw badRequest('camp.err.import_parser.6');
  return rows;
}

/** Загвар файл: "Ирц" (толгой + жишээ + dropdown) ба "Заавар" хуудас */
export async function buildAttendanceTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ирц');
  ws.columns = [
    { header: 'employee_code', key: 'code', width: 16 },
    { header: 'date', key: 'date', width: 14 },
    { header: 'direction', key: 'direction', width: 14 },
    { header: 'meals', key: 'meals', width: 28 },
    { header: 'shift', key: 'shift', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ code: 'E001', date: '2026-10-07', direction: 'ARRIVAL', meals: '', shift: '' });
  ws.addRow({ code: 'E002', date: '2026-10-12', direction: 'ARRIVAL', meals: 'LUNCH,DINNER,NIGHT', shift: 'NIGHT' });
  ws.addRow({ code: 'E003', date: '2026-10-22', direction: 'DEPARTURE', meals: '', shift: '' });
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"ARRIVAL,DEPARTURE"'] };
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"DAY,NIGHT"'] };
  }
  const help = wb.addWorksheet('Заавар');
  help.getColumn(1).width = 110;
  [
    'Ирцийн импорт — заавар',
    'employee_code: ажилтны код (заавал)',
    'date: YYYY-MM-DD (заавал). Ирээдүйн огноо зөвшөөрнө (маргаашийн ирэлтийг урьдчилан оруулж болно)',
    'direction: ARRIVAL (ирсэн) / DEPARTURE (явсан) (заавал)',
    'meals: BREAKFAST, LUNCH, DINNER, NIGHT — таслалаар. Хоол идэхгүй бол NONE.',
    '   • Ростерын ирэлт/явалт (багийн ирэх Лхагва / явах Пүрэв): хоосон бол анхдагч (ирэлт → DINNER, явалт → BREAKFAST)',
    '   • Ээлжийн бус ирэлт/явалт: ЗААВАЛ бөглөнө',
    'shift: DAY / NIGHT — зөвхөн ARRIVAL мөрөнд; ирсэн өдрөөс явах хүртэл (эсвэл ажлын өдрийн тоогоор) ээлжийн зохицуулалт үүснэ',
    'Монгол утга ч хүлээн авна: ИРСЭН/ЯВСАН, ӨГЛӨӨ/ӨДӨР/ОРОЙ/ШӨНӨ, ӨДӨР/ШӨНӨ',
  ].forEach((t, i) => {
    help.getCell(`A${i + 1}`).value = t;
    if (i === 0) help.getCell('A1').font = { bold: true, size: 13 };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
