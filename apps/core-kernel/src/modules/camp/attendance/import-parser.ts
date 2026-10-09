import { BadRequestException } from '@nestjs/common';
import { CampMealType, CampMovementDirection, CampShiftType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { isRealIsoDate, msToIso } from './camp-date';

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

/** exceljs нүдний утгыг текст болгох (rich text, formula, hyperlink) */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v);
}

/** Огноо: Excel огноо (Date, UTC) · Excel serial тоо · 'YYYY-MM-DD' / 'YYYY.MM.DD' / 'YYYY/MM/DD' */
export function parseDateCell(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return msToIso(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
  }
  if (v && typeof v === 'object' && 'result' in v) return parseDateCell(v.result as ExcelJS.CellValue);
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(cellText(v).trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isRealIsoDate(iso) ? iso : null;
}

export function parseMeals(text: string): { meals: CampMealType[] | null; error?: string } {
  const tokens = norm(text).split(/[,;\s]+/).filter(Boolean);
  if (tokens.length === 0) return { meals: null };
  if (tokens.some((t) => NONE.has(t))) {
    return tokens.length === 1 ? { meals: [] } : { meals: null, error: 'NONE-ийг бусад хоолтой хамт бичих боломжгүй' };
  }
  const unknown = tokens.filter((t) => !MEALS[t]);
  if (unknown.length > 0) return { meals: null, error: `Үл мэдэгдэх хоол: ${unknown.join(', ')} (BREAKFAST, LUNCH, DINNER, NIGHT эсвэл NONE)` };
  const set = new Set(tokens.map((t) => MEALS[t]));
  return { meals: MEAL_ORDER.filter((m) => set.has(m)) };
}

export async function parseAttendanceXlsx(buffer: Buffer): Promise<ParsedRow[]> {
  if (buffer.length > IMPORT_MAX_BYTES) throw new BadRequestException('Файл 2 MB-ээс их байна');
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new BadRequestException('Зөвхөн .xlsx файл хүлээн авна');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('xlsx файлыг уншиж чадсангүй (эвдэрсэн эсвэл .xlsx биш)');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('Файлд хуудас алга');

  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const h = norm(cellText(cell.value));
    for (const [field, aliases] of Object.entries(HEADERS)) if (aliases.includes(h)) col[field as keyof typeof HEADERS] = c;
  });
  const missing = (['employeeCode', 'date', 'direction'] as const).filter((f) => col[f] === undefined);
  if (missing.length > 0) {
    throw new BadRequestException(`Заавал багана алга: ${missing.map((f) => HEADERS[f][0].toLowerCase()).join(', ')} (загвар файлыг ашиглана уу)`);
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
    if (!code) errors.push('employee_code хоосон');
    const date = parseDateCell(dateRaw);
    if (!date) errors.push(`Огноо буруу: "${cellText(dateRaw)}" (YYYY-MM-DD)`);
    const direction = DIRECTIONS[dirText] ?? null;
    if (!direction) errors.push(`direction буруу: "${dirText}" (ARRIVAL эсвэл DEPARTURE)`);
    const m = parseMeals(mealsText);
    if (m.error) errors.push(m.error);
    let shift: CampShiftType | null = null;
    if (shiftText) {
      shift = SHIFTS[shiftText] ?? null;
      if (!shift) errors.push(`shift буруу: "${shiftText}" (DAY эсвэл NIGHT)`);
    }
    rows.push({ row: r, employeeCode: code, date, direction, meals: m.meals, shift, errors });
    if (rows.length > IMPORT_MAX_ROWS) throw new BadRequestException(`Хэт олон мөр (> ${IMPORT_MAX_ROWS})`);
  }
  if (rows.length === 0) throw new BadRequestException('Файлд өгөгдлийн мөр алга');
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
