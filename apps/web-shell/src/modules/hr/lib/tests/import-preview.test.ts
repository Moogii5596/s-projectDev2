/**
 * v0.2.3 Блок R4.3 — ирцийн импортын PREVIEW-ийн дээд хэсэг
 */
import { describe, expect, it } from 'vitest'
import mn from '@s-project/i18n/web.mn.json'
import type { ImportPreview } from '../../api/camp-bridge'
import { FORMAT_KEY, SKIP_REASON_KEY, previewBadges, rosterGapTotals } from '../import-preview'

const base = (p: Partial<ImportPreview> = {}, summary: Partial<ImportPreview['summary']> = {}): ImportPreview => ({
  import: { id: 'i1', fileName: 'f.xlsx', status: 'PREVIEW', totalRows: 5, okRows: 5, errorRows: 0, createdAt: '2026-11-06' },
  rows: [],
  summary: { arrivals: 2, departures: 1, offRoster: 0, shiftAdjustments: 0, errorRows: 0, extensions: 0, warningRows: 0, deletedRows: 0, ...summary },
  format: 'TEMPLATE',
  skippedSheets: [],
  rosterGaps: [],
  ...p,
})
const keys = (p: ImportPreview) => previewBadges(p).map((b) => (b.n === undefined ? b.key : `${b.key}=${b.n}`))

describe('previewBadges', () => {
  it('«Ирц» загвар: сунгалт / анхааруулга / устгасан 0 бол нуугдана', () => {
    expect(keys(base())).toEqual([
      'camp.att.format.template', 'camp.att.rows=5', 'camp.att.arrivals=2', 'camp.att.departures=1', 'camp.att.off_roster=0', 'camp.att.adjustments=0', 'camp.att.no_errors',
    ])
  })

  it('ShiftChange: сунгалт үргэлж; анхааруулга, устгасан, алдаа', () => {
    const b = previewBadges(base({ format: 'SHIFTCHANGE' }, { extensions: 0, warningRows: 3, deletedRows: 1, errorRows: 2 }))
    expect(b.map((x) => `${x.key}:${x.tone}`)).toEqual([
      'camp.att.format.shiftchange:blue', 'camp.att.rows:gray', 'camp.att.arrivals:green', 'camp.att.departures:blue', 'camp.att.off_roster:yellow',
      'camp.att.adjustments:gray', 'camp.att.extensions:blue', 'camp.att.warning_rows:yellow', 'camp.att.deleted_rows:gray', 'camp.att.error_rows:red',
    ])
  })

  it('хуучин хариу (format / шинэ тоолуур алга) эвдрэхгүй', () => {
    const old = { ...base(), format: undefined, summary: { arrivals: 1, departures: 0, offRoster: 0, shiftAdjustments: 0, errorRows: 0 } } as unknown as ImportPreview
    expect(keys(old)[0]).toBe('camp.att.format.template')
    expect(rosterGapTotals(old)).toEqual({ arrivals: 0, departures: 0 })
  })
})

describe('rosterGapTotals', () => {
  it('ирэх / явахаар нийлбэр (total — хязгаарлалтаас үл хамаарна)', () => {
    const p = base({
      rosterGaps: [
        { date: '2026-11-04', direction: 'ARRIVAL', total: 3, employees: [] },
        { date: '2026-11-05', direction: 'DEPARTURE', total: 250, employees: [] },
        { date: '2026-11-05', direction: 'ARRIVAL', total: 1, employees: [] },
      ],
    })
    expect(rosterGapTotals(p)).toEqual({ arrivals: 4, departures: 250 })
  })
})

describe('i18n түлхүүр', () => {
  it('загвар, алгассан шалтгаан бүр mn-д байна', () => {
    for (const k of [...Object.values(FORMAT_KEY), ...Object.values(SKIP_REASON_KEY)]) expect((mn as Record<string, string>)[k], k).toBeTruthy()
  })
})
