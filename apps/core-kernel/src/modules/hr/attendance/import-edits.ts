import { badRequest } from '../../../common/i18n/app-error';
import type { ParsedRow } from './import-parser';
import { planImport, PlannedRow, PlannerState } from './import-planner';

/**
 * v0.2.3 Блок R4.1 (R-10…R-12) — PREVIEW-ийн мөрийг засах / устгах (ЦЭВЭР функц).
 *   employeeId → ажилтан солих (кемпийн ажилтан); ShiftChange мөрийн тулгалтын алдаа / анхааруулга арилна
 *     («Ирц» загварын задлалтын алдаа (огноо, чиглэл г.м.) ажилтан солиход засагдахгүй тул хэвээр)
 *   deleted: true → устгах (parsedRows-д үлдэнэ, planner алгасна); deleted: false → сэргээх
 * All-or-nothing хэвээр: CONFIRM нь устгаагүй бүх мөр зөв үед л бичнэ.
 */
export interface RowEdit {
  row: number;
  employeeId?: string;
  deleted?: boolean;
  /** R9 — service ажилтан үүсгээд `employeeId` болгоно; энд ирэхгүй */
  newEmployee?: unknown;
}

export function applyRowEdits(parsed: ParsedRow[], edits: RowEdit[], employeeCodeById: Map<string, string>): ParsedRow[] {
  const byRow = new Map(parsed.map((r, i) => [r.row, i]));
  const next = parsed.map((r) => ({ ...r }));
  const seen = new Set<number>();
  for (const e of edits) {
    const hasEmp = e.employeeId !== undefined;
    const hasDel = e.deleted !== undefined;
    if (seen.has(e.row) || hasEmp === hasDel) throw badRequest('camp.err.attendance.13', { row: e.row });
    seen.add(e.row);
    const idx = byRow.get(e.row);
    if (idx === undefined) throw badRequest('camp.err.attendance.12', { row: e.row });
    const r = next[idx];
    if (hasDel) {
      if (e.deleted) r.deleted = true;
      else delete r.deleted;
      continue;
    }
    const code = employeeCodeById.get(e.employeeId as string);
    if (!code) throw badRequest('camp.err.attendance.5');
    if (code === r.employeeCode) continue;
    r.edited = r.edited ?? { fromCode: r.employeeCode };
    r.employeeCode = code;
    delete r.deleted;
    if (r.source) {
      // ShiftChange: errors / warnings = зөвхөн тулгалтынх (shiftchange-resolver) → ажилтан сонгосноор арилна
      r.errors = [];
      delete r.warnings;
    }
  }
  return next;
}

/** Устгаагүй мөрийг төлөвлөж, устгасныг (алдаагүй, `deleted`) хариунд мөрийн дарааллаар нэмнэ */
export function planWithDeleted(parsed: ParsedRow[], state: PlannerState) {
  const plan = planImport(parsed.filter((r) => !r.deleted), state);
  const deleted: PlannedRow[] = parsed
    .filter((r) => r.deleted)
    .map((r) => ({
      row: r.row, employeeCode: r.employeeCode, employeeId: null, date: r.date, direction: r.direction, kind: null, meals: r.meals, shift: r.shift, errors: [],
      deleted: true,
      ...(r.action ? { action: r.action } : {}),
      ...(r.source ? { source: r.source } : {}),
      ...(r.edited ? { edited: r.edited } : {}),
    }));
  const rows = [...plan.rows, ...deleted].sort((a, b) => a.row - b.row);
  return { plan, rows, deletedRows: deleted.length };
}
