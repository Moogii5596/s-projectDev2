import ExcelJS from 'exceljs';
import { cellText } from '../../../common/xlsx/cells';
import { badRequest } from '../../../common/i18n/app-error';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from './import-parser';

/**
 * HR-ийн ээлж солилтын файл (`YYYYMMDD_ShiftChange.xlsx`) задлагч — v0.2.3 Блок R (PIL-23/24/25, R-1…R-9).
 * Үндсэн загвар: 20261104_ShiftChange («2026.11.04 A ирэх», «2026.11.05 D буух», «2026.11.05 Сунах»).
 *   - хуудас бүр = нэг жагсаалт; огноо + төрөл хуудасны нэр / эхний мөрийн гарчигт
 *   - толгой мөр (эхний 10 мөрт «ID»-тай мөр) — багана нэрээр (Shift, ID, Ажилтны овог, Ажилтны нэр, Албан тушаал, Хэлтэс, Тэмдэглэл…)
 *   - `Shift` = БАГИЙН ҮСЭГ (A–D, TIRE, Ээлжгүй…), DAY/NIGHT биш
 *   - ЗОХИЦУУЛАЛТ (хуучин формат), чөлөөний хуудсыг алгасна (анхааруулга)
 * ЦЭВЭР задлалт — ажилтантай тулгах нь R2 (DB).
 */
export type ShiftChangeKind = 'ARRIVAL' | 'DEPARTURE' | 'EXTEND';
/** CODE = 4–5 оронтой (5 орон болгоно, D-2); NEW = HR ID олгоогүй; CONTRACTOR = ACCL, MAK, TIRE г.м. текст; EMPTY = хоосон */
export type ShiftChangeIdType = 'CODE' | 'NEW' | 'CONTRACTOR' | 'EMPTY';
export type SkippedSheetReason = 'LEGACY_ADJUSTMENT' | 'LEAVE' | 'UNKNOWN_KIND' | 'NO_DATE' | 'NO_HEADER';

export interface ShiftChangeRow {
  sheet: string;
  row: number;
  kind: ShiftChangeKind;
  /** Хуудасны огноо (YYYY-MM-DD) */
  date: string;
  idRaw: string;
  idType: ShiftChangeIdType;
  /** CODE үед 5 оронтой код, бусад үед null */
  employeeCode: string | null;
  lastName: string;
  firstName: string;
  position: string;
  department: string;
  /** Багийн үсэг (A–D, TIRE…) эсвэл null */
  crew: string | null;
  note: string;
  /** EXTEND: тэмдэглэлийн «N хоног» → N; үгүй бол null (кемпийн анхдагч) */
  extendDays: number | null;
}
export interface SkippedSheet {
  sheet: string;
  reason: SkippedSheetReason;
}
export interface ShiftChangeParse {
  rows: ShiftChangeRow[];
  skipped: SkippedSheet[];
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Хуудасны нэр + гарчгаас огноо (YYYY.MM.DD / YYYY-MM-DD) */
export function sheetDate(...texts: string[]): string | null {
  for (const text of texts) {
    const m = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(text);
    if (!m) continue;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Хуудасны төрөл: эхлээд нэр, дараа нь гарчиг. ЗОХИЦУУЛАЛТ, чөлөө → алгасна */
export function sheetKind(name: string, title: string): ShiftChangeKind | SkippedSheetReason {
  const n = lower(name);
  if (n.includes('зохицуулалт')) return 'LEGACY_ADJUSTMENT';
  if (n.includes('чөлөө')) return 'LEAVE';
  for (const text of [n, lower(title)]) {
    if (/сунах|сунаж/.test(text)) return 'EXTEND';
    if (text.includes('буух')) return 'DEPARTURE';
    if (text.includes('ирэх')) return 'ARRIVAL';
  }
  return 'UNKNOWN_KIND';
}

export function classifyId(raw: string): { idType: ShiftChangeIdType; employeeCode: string | null } {
  const v = raw.trim();
  if (!v) return { idType: 'EMPTY', employeeCode: null };
  if (/^\d{4,5}$/.test(v)) return { idType: 'CODE', employeeCode: v.padStart(5, '0') };
  if (/^new\s*\d*$/i.test(v)) return { idType: 'NEW', employeeCode: null };
  return { idType: 'CONTRACTOR', employeeCode: null };
}

/** «07 ХОНОГ», «14 хоног сунах» → 7, 14 */
export function extendDaysOf(note: string): number | null {
  const m = /(\d{1,3})\s*хоног/i.exec(note);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

type Field = 'crew' | 'id' | 'lastName' | 'firstName' | 'position' | 'department' | 'note';
/** Толгойн нэр → талбар (жижиг үсгээр, эхлэлээр) */
const HEADER_PREFIX: [string, Field][] = [
  ['shift', 'crew'],
  ['id', 'id'],
  ['ажилтны овог', 'lastName'],
  ['овог', 'lastName'],
  ['ажилтны нэр', 'firstName'],
  ['нэр', 'firstName'],
  ['албан тушаал', 'position'],
  ['хэлтэс', 'department'],
  ['тэмдэглэл', 'note'],
  ['тайлбар', 'note'],
];

function headerMap(values: string[]): Partial<Record<Field, number>> | null {
  if (!values.some((v) => v.trim().toUpperCase() === 'ID')) return null;
  const map: Partial<Record<Field, number>> = {};
  values.forEach((v, i) => {
    const h = lower(v);
    if (!h) return;
    const hit = HEADER_PREFIX.find(([p]) => (p === 'id' ? h === 'id' : h.startsWith(p)));
    if (hit && map[hit[1]] === undefined) map[hit[1]] = i;
  });
  // нэгтгэсэн толгойн 2 дахь мөр («Shift», «ID» л давтагдана) — толгой биш
  return map.lastName !== undefined || map.firstName !== undefined ? map : null;
}

const rowValues = (row: ExcelJS.Row, width: number): string[] =>
  Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value).trim());

function parseShiftChangeSheet(ws: ExcelJS.Worksheet): { rows: ShiftChangeRow[]; skipped: SkippedSheet | null } {
  const width = Math.max(ws.columnCount, 1);
  const title = rowValues(ws.getRow(1), width).find(Boolean) ?? '';
  const kind = sheetKind(ws.name, title);
  if (kind !== 'ARRIVAL' && kind !== 'DEPARTURE' && kind !== 'EXTEND') return { rows: [], skipped: { sheet: ws.name, reason: kind } };
  const date = sheetDate(ws.name, title);
  if (!date) return { rows: [], skipped: { sheet: ws.name, reason: 'NO_DATE' } };

  let map: Partial<Record<Field, number>> | null = null;
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !map; r++) map = headerMap(rowValues(ws.getRow(r), width));
  if (!map) return { rows: [], skipped: { sheet: ws.name, reason: 'NO_HEADER' } };

  const rows: ShiftChangeRow[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const values = rowValues(ws.getRow(r), width);
    const again = headerMap(values);
    if (again) {
      map = again; // давтагдсан толгой (нэг хуудсанд хэд хэдэн хэсэг)
      continue;
    }
    if (values.some((v) => v.toUpperCase() === 'ID')) continue; // нэгтгэсэн толгойн үргэлжлэл
    // гарчиг (нэгтгэсэн нүд — бүх утга ижил) / хоосон мөр
    if (new Set(values.filter(Boolean)).size <= 1) continue;
    const get = (f: Field) => (map?.[f] === undefined ? '' : values[map[f] as number]);
    const lastName = get('lastName');
    const firstName = get('firstName');
    const idRaw = get('id');
    if (!lastName && !firstName && !idRaw) continue;
    const note = get('note');
    const crew = get('crew');
    rows.push({
      sheet: ws.name,
      row: r,
      kind,
      date,
      idRaw,
      ...classifyId(idRaw),
      lastName,
      firstName,
      position: get('position'),
      department: get('department'),
      crew: crew || null,
      note,
      extendDays: kind === 'EXTEND' ? extendDaysOf(note) : null,
    });
  }
  return { rows, skipped: null };
}

/** «Ирц» загвар (эхний хуудасны 1-р мөрөнд employee_code / date / direction) эсвэл ShiftChange */
export function isAttendanceTemplate(wb: ExcelJS.Workbook): boolean {
  const ws = wb.worksheets[0];
  if (!ws) return false;
  const first = rowValues(ws.getRow(1), Math.max(ws.columnCount, 1)).map(lower);
  return first.some((h) => ['employee_code', 'employee code', 'code', 'код', 'ажилтны код', '员工编号', '工号'].includes(h.replace(/\s*\*+$/, '')));
}

export async function loadXlsx(buffer: Buffer): Promise<ExcelJS.Workbook> {
  if (buffer.length > IMPORT_MAX_BYTES) throw badRequest('camp.err.attendance_ctl.3');
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw badRequest('camp.err.import_parser.1');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('camp.err.import_parser.2');
  }
  if (wb.worksheets.length === 0) throw badRequest('camp.err.import_parser.3');
  return wb;
}

/** Мөр олдохгүй бол хоосон буцаана (service «Ирц» загварын алдаа руу шилжинэ) */
export function collectShiftChange(wb: ExcelJS.Workbook): ShiftChangeParse {
  const out: ShiftChangeParse = { rows: [], skipped: [] };
  for (const ws of wb.worksheets) {
    const { rows, skipped } = parseShiftChangeSheet(ws);
    if (skipped) out.skipped.push(skipped);
    out.rows.push(...rows);
    if (out.rows.length > IMPORT_MAX_ROWS) throw badRequest('camp.err.import_parser.5', { max: IMPORT_MAX_ROWS });
  }
  return out;
}

export function parseShiftChangeWorkbook(wb: ExcelJS.Workbook): ShiftChangeParse {
  const out = collectShiftChange(wb);
  if (out.rows.length === 0) throw badRequest('camp.err.import_parser.6');
  return out;
}
