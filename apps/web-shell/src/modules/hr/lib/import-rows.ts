import type { ImportPreview, ImportRow, ImportRowEdit } from '../../camp/api/types'

/**
 * v0.2.3 Блок R4.4–R4.6 — PREVIEW хүснэгт (цэвэр): шүүлт, эх мөрийн байрлал / нэр, засварын горимын payload.
 * Дүрэм (R-10): алдаатай мөрийг алгасаж батлахгүй — засах / устгах; бүх мөр зөв үед л CONFIRM.
 */
export type RowFilter = 'errors' | 'warnings' | 'all'

export const hasErrors = (r: ImportRow) => !r.deleted && r.errors.length > 0
export const hasWarnings = (r: ImportRow) => !r.deleted && (r.warnings?.length ?? 0) > 0

export function filterRows(rows: ImportRow[], f: RowFilter): ImportRow[] {
  if (f === 'errors') return rows.filter(hasErrors)
  if (f === 'warnings') return rows.filter(hasWarnings)
  return rows
}

/** Алдаатай байвал «алдаатай», эс бөгөөс анхааруулгатай байвал «анхааруулгатай», эс бөгөөс «бүгд» */
export function defaultFilter(p: ImportPreview): RowFilter {
  if (p.rows.some(hasErrors)) return 'errors'
  if (p.rows.some(hasWarnings)) return 'warnings'
  return 'all'
}

export function filterCounts(rows: ImportRow[]): Record<RowFilter, number> {
  return { errors: rows.filter(hasErrors).length, warnings: rows.filter(hasWarnings).length, all: rows.length }
}

/** Эх байрлал: ShiftChange → «хуудас · мөр», «Ирц» загвар → мөрийн дугаар */
export const rowPlace = (r: ImportRow): string => (r.source ? `${r.source.sheet} · ${r.source.row}` : String(r.row))

/** Файл дахь нэр (ShiftChange) */
export const fileName = (r: ImportRow): string => (r.source ? `${r.source.lastName} ${r.source.firstName}`.trim() : '')

/** Ажилтан хайх анхдагч утга: файлын нэр (нэр → овог) эсвэл код */
export const pickerQuery = (r: ImportRow): string => (r.source ? r.source.firstName || r.source.lastName : r.employeeCode).trim()

/** Засварын горимын мөр бүрийн сонголт */
export interface RowDraft {
  employeeId?: string
  deleted?: boolean
}

/** Засварын горим → PATCH payload (өөрчлөгдсөн мөр л; устгах нь ажилтан солихоос давуу) */
export function buildEdits(rows: ImportRow[], drafts: Record<number, RowDraft>): ImportRowEdit[] {
  const out: ImportRowEdit[] = []
  for (const r of rows) {
    const d = drafts[r.row]
    if (!d) continue
    if (d.deleted !== undefined && d.deleted !== !!r.deleted) out.push({ row: r.row, deleted: d.deleted })
    else if (!d.deleted && d.employeeId && d.employeeId !== r.employeeId) out.push({ row: r.row, employeeId: d.employeeId })
  }
  return out
}

/** R4.6 — «Алдаатай бүх мөрийг устгах» */
export const deleteErrorRowsEdits = (rows: ImportRow[]): ImportRowEdit[] => rows.filter(hasErrors).map((r) => ({ row: r.row, deleted: true }))
