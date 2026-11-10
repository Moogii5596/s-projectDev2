import ExcelJS from 'exceljs';
import { LANGS, Lang, currentLang } from '../i18n/i18n-context';
import { badRequest } from '../i18n/app-error';
import { MessageCode } from '../i18n/messages';
import { I18nParams, t } from '../i18n/translate';
import { cellText, looksLikeXlsx, normToken, parseDateCell } from './cells';

/**
 * v0.2.0 §0.5 — Нийтлэг Excel / хүснэгтийн импорт-экспорт.
 *   - Нэг `TableSpec` → загвар (толгой + жишээ + dropdown + "Заавар"), задлагч (xlsx эсвэл JSON мөрүүд), экспорт.
 *   - Экспортын формат = импортын формат (татаж засаад буцааж оруулна).
 *   - Толгой/утгыг 3 хэлээр (mn/en/zh) + кодоор таньна; загвар нь хэрэглэгчийн хэлээр.
 *   - Мөрийн алдаа = код + параметр (хэлээр нь хариу өгөх үед орчуулна).
 */
const TABLE_MAX_BYTES = 2 * 1024 * 1024;
export const TABLE_MAX_ROWS = 5000;

type CellType = 'text' | 'int' | 'enum' | 'date' | 'bool' | 'phone' | 'email';
export type CellValue = string | number | boolean | null;

export interface ColumnSpec {
  /** Дотоод нэр (JSON мөрийн түлхүүр) */
  key: string;
  /** Толгойн орчуулгын түлхүүр (col.*) */
  label: MessageCode;
  /** Нэмэлт таних нэрс (кодонд — орчуулга засахад импорт эвдрэхгүй) */
  aliases?: string[];
  type: CellType;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** enum: утга → орчуулгын түлхүүр (шошго). Шошго 3 хэлээр + утга өөрөө + `enumAliases` хүлээн авна */
  enumValues?: Record<string, MessageCode>;
  enumAliases?: Record<string, string>;
  /** Загварын жишээ мөр(үүд) */
  examples?: CellValue[];
  width?: number;
  /** Text-ийн нэмэлт шалгалт (жнь код) */
  pattern?: RegExp;
  /**
   * v0.2.3 Блок D (S9): буруу утга мөрийг АЛДААТАЙ болгохгүй — утга null, эх утга `issues`-д
   * (handler «Мэдээлэл дутуу»-д хадгална). Хоосон + required бол алдаа хэвээр.
   */
  soft?: boolean;
}

export interface TableSpec {
  type: string;
  /** Хуудасны нэр (table.*) */
  title: MessageCode;
  columns: ColumnSpec[];
  /** Файл доторх давхардлыг шалгах түлхүүр багана (жнь ажилтны код) */
  keyColumn?: string;
  maxRows?: number;
}

export interface RowError {
  column?: string;
  code: string;
  params?: I18nParams;
}

export interface ParsedTableRow {
  /** Excel-ийн мөрийн дугаар (толгой = 1) эсвэл хүснэгтийн 1-ээс эхэлсэн дугаар + 1 */
  row: number;
  /** Файлд байхгүй багана → түлхүүр алга (шинэчлэхэд өөрчлөхгүй); байгаа ч хоосон → null */
  values: Record<string, CellValue>;
  errors: RowError[];
  /** v0.2.3 Блок D (S9): `soft` баганын буруу утга — анхааруулга (оруулахад саад болохгүй) */
  issues?: RowError[];
}

// ── Таних ───────────────────────────────────────────────────

const langLabels = (key: MessageCode): string[] => LANGS.map((l: Lang) => t(key, {}, l));

/** Баганын хүлээн авах толгойнууд (normToken) */
function headerTokens(col: ColumnSpec): Set<string> {
  return new Set([col.key, col.key.replace(/([a-z])([A-Z])/g, '$1_$2'), ...langLabels(col.label), ...(col.aliases ?? [])].map(normToken));
}

/** enum: хүлээн авах токен → утга */
function enumTokens(col: ColumnSpec): Map<string, string> {
  const map = new Map<string, string>();
  for (const [value, label] of Object.entries(col.enumValues ?? {})) {
    map.set(normToken(value), value);
    for (const l of langLabels(label)) map.set(normToken(l), value);
  }
  for (const [alias, value] of Object.entries(col.enumAliases ?? {})) map.set(normToken(alias), value);
  return map;
}

const BOOL_TRUE = ['TRUE', '1', 'YES', 'Y', 'ТИЙМ', 'ИДЭВХТЭЙ', '是', '启用'];
const BOOL_FALSE = ['FALSE', '0', 'NO', 'N', 'ҮГҮЙ', 'ИДЭВХГҮЙ', '否', '停用'];

// ── Нэг нүд ─────────────────────────────────────────────────

const PHONE_RE = /^(\+\d{8,15}|\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Нүдний түүхий утга (xlsx эсвэл JSON) → төрөлжсөн утга + алдаа */
export function coerceCell(col: ColumnSpec, raw: unknown): { value: CellValue; error?: RowError } {
  const isDateType = col.type === 'date';
  const text = (raw instanceof Date ? (isDateType ? '' : raw.toISOString()) : typeof raw === 'object' && raw !== null ? cellText(raw as ExcelJS.CellValue) : String(raw ?? '')).trim();
  const empty = isDateType ? raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') : text === '';
  if (empty) return col.required ? { value: null, error: { column: col.key, code: 'row.required' } } : { value: null };
  const err = (code: string, params: I18nParams = {}) => ({ value: null, error: { column: col.key, code, params: { value: text.slice(0, 60), ...params } } });

  switch (col.type) {
    case 'text': {
      if (col.maxLength && text.length > col.maxLength) return err('row.too_long', { max: col.maxLength });
      if (col.pattern && !col.pattern.test(text)) return err('row.bad_format');
      return { value: text };
    }
    case 'int': {
      const n = typeof raw === 'number' ? raw : Number(text.replace(/\s/g, ''));
      if (!Number.isInteger(n)) return err('row.bad_int');
      if ((col.min !== undefined && n < col.min) || (col.max !== undefined && n > col.max)) {
        return err('row.out_of_range', { min: col.min ?? '', max: col.max ?? '' });
      }
      return { value: n };
    }
    case 'enum': {
      const v = enumTokens(col).get(normToken(text));
      if (!v) return err('row.bad_enum', { allowed: Object.keys(col.enumValues ?? {}).join(', ') });
      return { value: v };
    }
    case 'bool': {
      const tok = normToken(text);
      if (BOOL_TRUE.includes(tok) || raw === true) return { value: true };
      if (BOOL_FALSE.includes(tok) || raw === false) return { value: false };
      return err('row.bad_enum', { allowed: `${t('enum.bool.true')}, ${t('enum.bool.false')}` });
    }
    case 'date': {
      const iso = parseDateCell(raw as ExcelJS.CellValue);
      return iso ? { value: iso } : err('row.bad_date');
    }
    case 'phone': {
      const compact = text.replace(/[\s\-()]/g, '');
      return PHONE_RE.test(compact) ? { value: compact } : err('row.bad_phone');
    }
    case 'email': {
      const e = text.toLowerCase();
      if (col.maxLength && e.length > col.maxLength) return err('row.too_long', { max: col.maxLength });
      return EMAIL_RE.test(e) ? { value: e } : err('row.bad_email');
    }
  }
}

/** Мөрийг баганаар хөрвүүлж, файл доторх түлхүүрийн давхардлыг шалгана */
function finishRows(spec: TableSpec, raws: { row: number; cells: Record<string, unknown> }[], present: ReadonlySet<string>): ParsedTableRow[] {
  const seen = new Map<string, number>();
  return raws.map(({ row, cells }) => {
    const values: Record<string, CellValue> = {};
    const errors: RowError[] = [];
    const issues: RowError[] = [];
    for (const col of spec.columns) {
      if (!present.has(col.key)) {
        if (col.required) errors.push({ column: col.key, code: 'row.required' });
        continue;
      }
      const { value, error } = coerceCell(col, cells[col.key]);
      values[col.key] = value;
      if (error && col.soft && error.code !== 'row.required') issues.push(error);
      else if (error) errors.push(error);
    }
    if (spec.keyColumn) {
      const k = values[spec.keyColumn];
      if (typeof k === 'string' && k) {
        const norm = k.toUpperCase();
        const first = seen.get(norm);
        if (first !== undefined) errors.push({ column: spec.keyColumn, code: 'row.duplicate_in_file', params: { value: k, first } });
        else seen.set(norm, row);
      }
    }
    return issues.length ? { row, values, errors, issues } : { row, values, errors };
  });
}

const isBlankRow = (cells: Record<string, unknown>) =>
  Object.values(cells).every((v) => v === null || v === undefined || (typeof v !== 'object' && String(v).trim() === '') || (typeof v === 'object' && !(v instanceof Date) && cellText(v as ExcelJS.CellValue).trim() === ''));

// ── Задлагч ─────────────────────────────────────────────────

/** xlsx: 1-р хуудас, 1-р мөр = толгой; хоосон мөрийг алгасна. Файлын алдаа → 400 (код + параметр). */
export async function parseTableXlsx(buffer: Buffer, spec: TableSpec): Promise<ParsedTableRow[]> {
  const maxRows = spec.maxRows ?? TABLE_MAX_ROWS;
  if (buffer.length > TABLE_MAX_BYTES) throw badRequest('import.file_too_large', { max: TABLE_MAX_BYTES / 1024 / 1024 });
  if (!looksLikeXlsx(buffer)) throw badRequest('import.not_xlsx');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('import.unreadable');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('import.no_sheet');

  const colIndex: Record<string, number> = {};
  const tokens = spec.columns.map((c) => [c, headerTokens(c)] as const);
  ws.getRow(1).eachCell((cell, c) => {
    const h = normToken(cellText(cell.value));
    for (const [col, set] of tokens) if (colIndex[col.key] === undefined && set.has(h)) colIndex[col.key] = c;
  });
  assertColumns(spec, Object.keys(colIndex));

  const raws: { row: number; cells: Record<string, unknown> }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, unknown> = {};
    for (const col of spec.columns) cells[col.key] = colIndex[col.key] === undefined ? null : row.getCell(colIndex[col.key]).value;
    if (isBlankRow(cells)) continue;
    raws.push({ row: r, cells });
    if (raws.length > maxRows) throw badRequest('import.too_many_rows', { max: maxRows });
  }
  if (raws.length === 0) throw badRequest('import.empty');
  return finishRows(spec, raws, new Set(Object.keys(colIndex)));
}

/** "Хүснэгтээр оруулах" (grid, Excel-ээс paste) — JSON мөрүүд `{ key: value }`. Мөрийн дугаар = индекс + 2 (Excel-тэй ижил). */
export function parseTableRows(input: Record<string, unknown>[], spec: TableSpec): ParsedTableRow[] {
  const maxRows = spec.maxRows ?? TABLE_MAX_ROWS;
  const keys = new Set(spec.columns.map((c) => c.key));
  const raws = input
    .map((obj, i) => ({ row: i + 2, cells: Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => keys.has(k))) }))
    .filter((r) => !isBlankRow(r.cells));
  if (raws.length > maxRows) throw badRequest('import.too_many_rows', { max: maxRows });
  if (raws.length === 0) throw badRequest('import.empty');
  const present = new Set(raws.flatMap((r) => Object.keys(r.cells)));
  assertColumns(spec, [...present]);
  return finishRows(spec, raws, present);
}

function assertColumns(spec: TableSpec, found: string[]) {
  const missing = spec.columns.filter((c) => c.required && !found.includes(c.key));
  if (missing.length > 0) throw badRequest('import.missing_columns', { columns: missing.map((c) => t(c.label)).join(', ') });
}

// ── Загвар, экспорт ─────────────────────────────────────────

const XLSX_LIST_LIMIT = 250; // Excel-ийн dropdown жагсаалтын урт (тэмдэгт) хязгаар

function enumDisplay(col: ColumnSpec, value: string, lang: Lang): string {
  const label = col.enumValues?.[value];
  return label ? t(label, {}, lang) : value;
}

function cellOut(col: ColumnSpec, v: CellValue, lang: Lang): string | number | null {
  if (v === null || v === undefined) return null;
  if (col.type === 'enum') return enumDisplay(col, String(v), lang);
  if (col.type === 'bool') return t(v ? 'enum.bool.true' : 'enum.bool.false', {}, lang);
  return typeof v === 'boolean' ? String(v) : v;
}

function addSheet(wb: ExcelJS.Workbook, spec: TableSpec, lang: Lang, rows: Record<string, CellValue>[], dropdownRows: number) {
  const ws = wb.addWorksheet(t(spec.title, {}, lang).slice(0, 31));
  ws.columns = spec.columns.map((c) => ({ header: t(c.label, {}, lang), key: c.key, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(Object.fromEntries(spec.columns.map((c) => [c.key, cellOut(c, r[c.key] ?? null, lang)])));
  spec.columns.forEach((c, i) => {
    const list =
      c.type === 'enum' ? Object.keys(c.enumValues ?? {}).map((v) => enumDisplay(c, v, lang)) : c.type === 'bool' ? [t('enum.bool.true', {}, lang), t('enum.bool.false', {}, lang)] : null;
    if (!list) return;
    const formula = `"${list.map((x) => x.replace(/"/g, '')).join(',')}"`;
    if (formula.length > XLSX_LIST_LIMIT) return;
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= Math.max(dropdownRows, rows.length + 50); r++) {
      ws.getCell(`${letter}${r}`).dataValidation = { type: 'list', allowBlank: !c.required, formulae: [formula] };
    }
  });
  return ws;
}

function addHelp(wb: ExcelJS.Workbook, spec: TableSpec, lang: Lang) {
  const help = wb.addWorksheet(t('xlsx.help_sheet', {}, lang).slice(0, 31));
  help.getColumn(1).width = 34;
  help.getColumn(2).width = 90;
  help.getCell('A1').value = t('xlsx.help_title', { name: t(spec.title, {}, lang) }, lang);
  help.getCell('A1').font = { bold: true, size: 13 };
  let r = 3;
  for (const c of spec.columns) {
    help.getCell(`A${r}`).value = t(c.label, {}, lang) + (c.required ? ` ${t('xlsx.help_required', {}, lang)}` : '');
    if (c.required) help.getCell(`A${r}`).font = { bold: true };
    const values =
      c.type === 'enum' ? Object.keys(c.enumValues ?? {}).map((v) => `${enumDisplay(c, v, lang)} (${v})`).join(', ') : c.type === 'bool' ? `${t('enum.bool.true', {}, lang)} / ${t('enum.bool.false', {}, lang)}` : c.type === 'date' ? 'YYYY-MM-DD' : '';
    help.getCell(`B${r}`).value = values ? t('xlsx.help_allowed', { values }, lang) : '';
    r++;
  }
  help.getCell(`A${r + 1}`).value = t('xlsx.help_langs', {}, lang);
  help.getCell(`A${r + 2}`).value = t('xlsx.help_roundtrip', {}, lang);
}

/** Загвар: толгой (хэрэглэгчийн хэлээр) + жишээ мөр + dropdown + "Заавар" */
export async function buildTemplate(spec: TableSpec, lang: Lang = currentLang()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const n = Math.max(0, ...spec.columns.map((c) => c.examples?.length ?? 0));
  const examples = Array.from({ length: n }, (_, i) => Object.fromEntries(spec.columns.map((c) => [c.key, c.examples?.[i] ?? null])));
  addSheet(wb, spec, lang, examples, 1000);
  addHelp(wb, spec, lang);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Экспорт = импортын формат (толгой, утгын шошго ижил) */
export async function buildExport(spec: TableSpec, rows: Record<string, CellValue>[], lang: Lang = currentLang()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, spec, lang, rows, 0);
  addHelp(wb, spec, lang);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Мөрийн алдааг хэлээр нь: "Утас: Утасны дугаар буруу …" */
export function localizeRowErrors(errors: RowError[], spec: TableSpec, lang: Lang = currentLang()) {
  const labels = new Map(spec.columns.map((c) => [c.key, c.label]));
  return errors.map((e) => {
    const label = e.column ? labels.get(e.column) : undefined;
    return { ...e, columnLabel: label ? t(label, {}, lang) : null, message: t(e.code, e.params, lang) };
  });
}
