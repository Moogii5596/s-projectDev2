import { t } from '../../../common/i18n/translate';
import { CampMealType, CampMovementDirection, CampShiftType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { cellText, parseDateCell } from '../../../common/xlsx/cells';
import { badRequest } from '../../../common/i18n/app-error';

/**
 * Ирцийн xlsx задлагч (Шат 3.3). Багана (англи, монгол эсвэл хятад — I18N-02; том жижиг үсэг, төгсгөлийн * хамаарахгүй):
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
  /** v0.2.3 Блок R: ShiftChange «Сунах» мөр (direction = null) — planner зохицуулалт үүсгэнэ (R-6) */
  action?: 'EXTEND';
  /** v0.2.3 Блок R: ShiftChange эх мөр (PREVIEW-д харуулах; анхдагч хоол R-8) */
  source?: ShiftChangeSource;
  /** Анхааруулга — импортыг зогсоохгүй */
  warnings?: string[];
  /** v0.2.3 Блок R4.1: PREVIEW-д устгасан (түүхэнд үлдэнэ, planner алгасна) */
  deleted?: boolean;
  /** v0.2.3 Блок R4.1: PREVIEW-д ажилтныг гараар сольсон — анхны код (файлын / тулгасан) */
  edited?: { fromCode: string };
}
export interface ShiftChangeSource {
  sheet: string;
  row: number;
  idRaw: string;
  idType: 'CODE' | 'NEW' | 'CONTRACTOR' | 'EMPTY';
  lastName: string;
  firstName: string;
  crew: string | null;
  /** EXTEND: «N хоног» — null бол кемпийн анхдагч */
  extendDays: number | null;
  /** v0.2.3 R9: файлын «Албан тушаал», «Хэлтэс» (шинэ ажилтан бүртгэхэд урьдчилан бөглөнө) */
  position?: string;
  department?: string;
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
/** Толгой: "date*", "日期 *" → "DATE", "日期" */
const normHeader = (s: string) => norm(s).replace(/\s*\*+$/, '');

const HEADERS: Record<string, string[]> = {
  employeeCode: ['EMPLOYEE_CODE', 'EMPLOYEE CODE', 'CODE', 'КОД', 'АЖИЛТНЫ КОД', 'АЖИЛТНЫ_КОД', '员工编号', '员工代码', '工号'],
  date: ['DATE', 'ОГНОО', '日期'],
  direction: ['DIRECTION', 'ЧИГЛЭЛ', '方向', '进出'],
  meals: ['MEALS', 'MEAL', 'ХООЛ', '餐', '餐别', '用餐'],
  shift: ['SHIFT', 'ЭЭЛЖ', '班次'],
};
const DIRECTIONS: Record<string, CampMovementDirection> = {
  ARRIVAL: CampMovementDirection.ARRIVAL, IN: CampMovementDirection.ARRIVAL, 'ИРСЭН': CampMovementDirection.ARRIVAL, 'ИРЭХ': CampMovementDirection.ARRIVAL,
  DEPARTURE: CampMovementDirection.DEPARTURE, OUT: CampMovementDirection.DEPARTURE, 'ЯВСАН': CampMovementDirection.DEPARTURE, 'ЯВАХ': CampMovementDirection.DEPARTURE,
  '到达': CampMovementDirection.ARRIVAL, '离开': CampMovementDirection.DEPARTURE,
};
const MEALS: Record<string, CampMealType> = {
  BREAKFAST: CampMealType.BREAKFAST, B: CampMealType.BREAKFAST, 'ӨГЛӨӨ': CampMealType.BREAKFAST,
  LUNCH: CampMealType.LUNCH, L: CampMealType.LUNCH, 'ӨДӨР': CampMealType.LUNCH,
  DINNER: CampMealType.DINNER, D: CampMealType.DINNER, 'ОРОЙ': CampMealType.DINNER,
  NIGHT: CampMealType.NIGHT, N: CampMealType.NIGHT, 'ШӨНӨ': CampMealType.NIGHT,
  '早餐': CampMealType.BREAKFAST, '午餐': CampMealType.LUNCH, '晚餐': CampMealType.DINNER, '夜宵': CampMealType.NIGHT,
};
const NONE = new Set(['NONE', '-', 'ҮГҮЙ', '无', '不用餐']);
const SHIFTS: Record<string, CampShiftType> = {
  DAY: CampShiftType.DAY, 'ӨДӨР': CampShiftType.DAY, '白班': CampShiftType.DAY,
  NIGHT: CampShiftType.NIGHT, 'ШӨНӨ': CampShiftType.NIGHT, '夜班': CampShiftType.NIGHT,
};
/** Хятад хоолыг тусгаарлагчгүй бичсэн ч ("午餐晚餐") салгана */
const ZH_MEAL_RE = /(早餐|午餐|晚餐|夜宵)/g;
const MEAL_ORDER = [CampMealType.BREAKFAST, CampMealType.LUNCH, CampMealType.DINNER, CampMealType.NIGHT];

// cellText, parseDateCell → common/xlsx/cells.ts (v0.2.0 §0.5, зан төлөв ижил)
export { parseDateCell };

export function parseMeals(text: string): { meals: CampMealType[] | null; error?: string } {
  const tokens = norm(text.replace(ZH_MEAL_RE, ' $1 ')).split(/[,;，；、\s]+/).filter(Boolean);
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
    const h = normHeader(cellText(cell.value));
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

/** Ирцийн загварын заавар — хуудасны нэр → мөрүүд (I18N-02) */
const ATTENDANCE_HELP: Record<string, string[]> = {
  'Заавар_MN': [
    'Ирцийн импорт — заавар',
    'employee_code: ажилтны код (заавал)',
    'date: YYYY-MM-DD (заавал). Ирээдүйн огноо зөвшөөрнө (маргаашийн ирэлтийг урьдчилан оруулж болно)',
    'direction: ARRIVAL (ирсэн) / DEPARTURE (явсан) (заавал)',
    'meals: BREAKFAST, LUNCH, DINNER, NIGHT — таслалаар. Хоол идэхгүй бол NONE.',
    '   • Ростерын ирэлт/явалт (багийн ирэх Лхагва / явах Пүрэв): хоосон бол анхдагч (ирэлт → DINNER, явалт → BREAKFAST)',
    '   • Ээлжийн бус ирэлт/явалт: ЗААВАЛ бөглөнө',
    'shift: DAY / NIGHT — зөвхөн ARRIVAL мөрөнд; ирсэн өдрөөс явах хүртэл (эсвэл ажлын өдрийн тоогоор) ээлжийн зохицуулалт үүснэ',
    'Монгол утга ч хүлээн авна: ИРСЭН/ЯВСАН, ӨГЛӨӨ/ӨДӨР/ОРОЙ/ШӨНӨ, ӨДӨР/ШӨНӨ',
    'Хятад толгой, утга ч хүлээн авна: 员工编号/日期/方向/餐/班次; 到达/离开; 早餐/午餐/晚餐/夜宵 (无); 白班/夜班',
    'Өгөгдлийг зөвхөн эхний "Ирц" хуудсанд бичнэ.',
  ],
  'Заавар_EN': [
    'Attendance import — instructions',
    'employee_code: employee code (required)',
    'date: YYYY-MM-DD (required). Future dates are allowed (e.g. enter tomorrow\'s arrival in advance)',
    'direction: ARRIVAL / DEPARTURE (required)',
    'meals: BREAKFAST, LUNCH, DINNER, NIGHT — comma separated. NONE if no meals.',
    '   • Roster arrival/departure (crew arrives Wednesday / leaves Thursday): blank = default (arrival → DINNER, departure → BREAKFAST)',
    '   • Off-roster arrival/departure: REQUIRED',
    'shift: DAY / NIGHT — ARRIVAL rows only; applies from the arrival date until departure (or for the number of work days)',
    'Mongolian values are accepted: ИРСЭН/ЯВСАН, ӨГЛӨӨ/ӨДӨР/ОРОЙ/ШӨНӨ, ӨДӨР/ШӨНӨ',
    'Chinese headers and values are accepted: 员工编号/日期/方向/餐/班次; 到达/离开; 早餐/午餐/晚餐/夜宵 (无); 白班/夜班',
    'Enter data on the first sheet ("Ирц") only.',
  ],
  'Заавар_中文': [
    '考勤导入 — 说明',
    'employee_code（员工编号）：必填',
    'date（日期）：YYYY-MM-DD，必填。允许未来日期（可提前录入明天的到达）',
    'direction（方向）：ARRIVAL/到达 或 DEPARTURE/离开，必填',
    'meals（餐）：早餐、午餐、晚餐、夜宵（或 BREAKFAST, LUNCH, DINNER, NIGHT），用逗号或顿号分隔。不用餐填 无（NONE）。',
    '   • 轮班到达/离开（班组周三到达 / 周四离开）：留空则按默认（到达 → 晚餐，离开 → 早餐）',
    '   • 非轮班到达/离开：必须填写',
    'shift（班次）：白班/DAY 或 夜班/NIGHT — 仅用于到达行；从到达日起至离开（或按工作天数）生效',
    '表头可用中文：员工编号 / 日期 / 方向 / 餐 / 班次',
    '数据只填写在第一个工作表（"Ирц"）中。',
  ],
};

/** Загвар файл: "Ирц" (толгой + жишээ + dropdown) ба "Заавар_MN/EN/中文" хуудсууд */
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
  // I18N-02: "Заавар" хэл тус бүрээр тусдаа хуудас (эхний хуудас "Ирц" хэвээр — задлагч worksheets[0]-ийг уншина)
  for (const [name, lines] of Object.entries(ATTENDANCE_HELP)) {
    const help = wb.addWorksheet(name);
    help.getColumn(1).width = 110;
    lines.forEach((text, i) => {
      help.getCell(`A${i + 1}`).value = text;
    });
    help.getCell('A1').font = { bold: true, size: 13 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
