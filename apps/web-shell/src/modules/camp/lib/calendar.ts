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

export const CELL_TEXT: Record<CellKind, string> = { DAY: 'Ө', NIGHT: 'Ш', UNKNOWN: '?', ARRIVE_TRAVEL: 'И', LEAVE_TRAVEL: 'Я', OFF: '' }
export const CELL_TITLE: Record<CellKind, string> = {
  DAY: 'Өдрийн ээлж',
  NIGHT: 'Шөнийн ээлж',
  UNKNOWN: 'Ээлж тодорхойгүй (зохицуулалт хэрэгтэй)',
  ARRIVE_TRAVEL: 'Ирэх өдөр (ростер)',
  LEAVE_TRAVEL: 'Явах өдөр (ростер)',
  OFF: 'Амралт',
}

/** 'YYYY-MM-DD' хоёр огнооны зай (өдөр); to < from бол сөрөг */
export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** Мужийн шалгалт (backend-тэй ижил хязгаар) — алдааны мессеж эсвэл null */
export function rangeProblem(from: string, to: string, maxDays: number): string | null {
  if (!from || !to) return 'Огноо сонгоно уу'
  const n = daySpan(from, to)
  if (n < 1) return 'Дуусах огноо эхлэхээс өмнө байна'
  if (n > maxDays) return `Муж ${maxDays} хоногоос хэтэрч болохгүй (${n})`
  return null
}
