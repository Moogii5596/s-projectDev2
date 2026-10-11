import type ExcelJS from 'exceljs';

/**
 * Excel нүдний нийтлэг хөрвүүлэлт (v0.2.0 §0.5 — ирцийн импортоос шилжүүлсэн, ижил зан төлөв).
 */
const DAY_MS = 86_400_000;
const pad2 = (n: string) => n.padStart(2, '0');
const isRealIsoDate = (iso: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso;

/** exceljs нүдний утгыг текст болгох (rich text, formula, hyperlink) */
export function cellText(v: ExcelJS.CellValue | undefined): string {
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
export function parseDateCell(v: ExcelJS.CellValue | undefined): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY_MS).toISOString().slice(0, 10);
  }
  if (v && typeof v === 'object' && 'result' in v) return parseDateCell(v.result as ExcelJS.CellValue);
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(cellText(v).trim());
  if (!m) return null;
  const iso = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return isRealIsoDate(iso) ? iso : null;
}

/** Толгой/утга харьцуулах: зай, доогуур зураас, том жижиг үсэг ялгахгүй ('Employee_code' = 'EMPLOYEE CODE') */
export const normToken = (s: string): string => s.normalize('NFKC').trim().toUpperCase().replace(/[\s_]+/g, ' ');

/** xlsx (zip) мөн эсэх — эхний 2 байт 'PK' */
export const looksLikeXlsx = (buf: Buffer): boolean => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
