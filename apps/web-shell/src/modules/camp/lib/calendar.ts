import i18n from '../../../i18n'
import type { CalendarCell } from '../api/types'

/** Календарийн нүдний төрөл (UI өнгө/тэмдэг) */
export type CellKind = 'DAY' | 'NIGHT' | 'UNKNOWN' | 'ARRIVE_TRAVEL' | 'LEAVE_TRAVEL' | 'OFF'

/**
 * Нүдийг ангилна:
 *   ээлжтэй → DAY | NIGHT; багийн ростерын 0-р өдөр → ARRIVE_TRAVEL (ирэх), on+1 → LEAVE_TRAVEL (явах),
 *   бусад ростерын өдөр (амралт) → OFF; багагүй/загваргүй (UNKNOWN) → UNKNOWN.
 */
export function cellKind(cell: CalendarCell, onDays: number): CellKind {
  if (cell.shift) return cell.shift
  if (cell.dayNo !== null) {
    if (cell.dayNo === 0) return 'ARRIVE_TRAVEL'
    if (cell.dayNo === onDays + 1) return 'LEAVE_TRAVEL'
    if (cell.dayNo < 1 || cell.dayNo > onDays) return 'OFF'
  }
  return 'UNKNOWN'
}

const KINDS: CellKind[] = ['DAY', 'NIGHT', 'UNKNOWN', 'ARRIVE_TRAVEL', 'LEAVE_TRAVEL', 'OFF']
const byKind = (group: string) => {
  const o = {} as Record<CellKind, string>
  for (const k of KINDS) Object.defineProperty(o, k, { enumerable: true, get: () => (k === 'OFF' && group === 'cell_text' ? '' : i18n.t(`camp.${group}.${k}`)) })
  return o
}
/** Нүдний товч тэмдэг (Ө/Ш/И/Я — хэлээр) ба тайлбар */
export const CELL_TEXT = byKind('cell_text')
export const CELL_TITLE = byKind('cell_title')

/** 'YYYY-MM-DD' хоёр огнооны зай (өдөр); to < from бол сөрөг */
export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** Мужийн шалгалт (backend-тэй ижил хязгаар) — алдааны мессеж эсвэл null */
export function rangeProblem(from: string, to: string, maxDays: number): string | null {
  if (!from || !to) return i18n.t('camp.range.pick_dates')
  const n = daySpan(from, to)
  if (n < 1) return i18n.t('camp.range.end_before_start')
  if (n > maxDays) return i18n.t('camp.range.too_long', { max: maxDays, n })
  return null
}
