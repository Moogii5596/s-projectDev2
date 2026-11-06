import type { ImportFormat, ImportPreview, SkippedSheetReason } from '../../camp/api/types'

/**
 * v0.2.3 Блок R4.3 — ирцийн импортын PREVIEW-ийн дээд хэсэг (цэвэр): badge-ууд, алгассан хуудас, ростерын зөрүү.
 * Текст = i18n түлхүүр (`camp.att.*`), тоо = `{n}`.
 */
export type BadgeTone = 'gray' | 'green' | 'yellow' | 'red' | 'blue'
export interface PreviewBadge {
  key: string
  n?: number
  tone: BadgeTone
}

export const FORMAT_KEY: Record<ImportFormat, string> = {
  TEMPLATE: 'camp.att.format.template',
  SHIFTCHANGE: 'camp.att.format.shiftchange',
  MANUAL: 'camp.att.format.manual',
}

export const SKIP_REASON_KEY: Record<SkippedSheetReason, string> = {
  LEGACY_ADJUSTMENT: 'camp.att.skip.legacy_adjustment',
  LEAVE: 'camp.att.skip.leave',
  UNKNOWN_KIND: 'camp.att.skip.unknown_kind',
  NO_DATE: 'camp.att.skip.no_date',
  NO_HEADER: 'camp.att.skip.no_header',
}

/** Хуучин backend (талбар алга) → 0 / TEMPLATE */
export function previewBadges(p: ImportPreview): PreviewBadge[] {
  const s = p.summary
  const format = p.format ?? 'TEMPLATE'
  const out: PreviewBadge[] = [
    { key: FORMAT_KEY[format], tone: format === 'SHIFTCHANGE' ? 'blue' : 'gray' },
    { key: 'camp.att.rows', n: p.import.totalRows, tone: 'gray' },
    { key: 'camp.att.arrivals', n: s.arrivals, tone: 'green' },
    { key: 'camp.att.departures', n: s.departures, tone: 'blue' },
    { key: 'camp.att.off_roster', n: s.offRoster, tone: 'yellow' },
    { key: 'camp.att.adjustments', n: s.shiftAdjustments, tone: 'gray' },
  ]
  if (format === 'SHIFTCHANGE' || (s.extensions ?? 0) > 0) out.push({ key: 'camp.att.extensions', n: s.extensions ?? 0, tone: 'blue' })
  if ((s.warningRows ?? 0) > 0) out.push({ key: 'camp.att.warning_rows', n: s.warningRows, tone: 'yellow' })
  if ((s.deletedRows ?? 0) > 0) out.push({ key: 'camp.att.deleted_rows', n: s.deletedRows, tone: 'gray' })
  out.push(s.errorRows > 0 ? { key: 'camp.att.error_rows', n: s.errorRows, tone: 'red' } : { key: 'camp.att.no_errors', tone: 'green' })
  return out
}

/** Ростерын зөрүүний нийт ажилтан (ирэх / явах) */
export function rosterGapTotals(p: ImportPreview): { arrivals: number; departures: number } {
  let arrivals = 0
  let departures = 0
  for (const g of p.rosterGaps ?? []) {
    if (g.direction === 'ARRIVAL') arrivals += g.total
    else departures += g.total
  }
  return { arrivals, departures }
}
