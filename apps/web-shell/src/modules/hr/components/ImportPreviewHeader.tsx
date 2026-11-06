import { useTranslation } from 'react-i18next'
import type { ImportPreview } from '../../camp/api/types'
import { Badge } from '../../camp/components/ui'
import { SKIP_REASON_KEY, previewBadges, rosterGapTotals } from '../lib/import-preview'

/**
 * v0.2.3 Блок R4.3 — ирцийн импортын PREVIEW-ийн дээд хэсэг: файл, загвар, тоолуур (сунгалт, анхааруулга, устгасан),
 * алгассан хуудас (шалтгаантай), ростероор ирэх / явах ёстой боловч файлд алга ажилтан (R4.2).
 */
export default function ImportPreviewHeader({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation()
  const skipped = preview.skippedSheets ?? []
  const gaps = preview.rosterGaps ?? []
  const totals = rosterGapTotals(preview)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{preview.import.fileName}</span>
        {previewBadges(preview).map((b) => (
          <Badge key={b.key} tone={b.tone}>
            {b.n === undefined ? t(b.key) : t(b.key, { n: b.n })}
          </Badge>
        ))}
      </div>
      {skipped.length > 0 && (
        <details className="text-xs text-gray-600" data-testid="import-skipped-sheets">
          <summary className="cursor-pointer">{t('camp.att.skipped_sheets', { n: skipped.length })}</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {skipped.map((s) => (
              <li key={s.sheet}>
                <span className="font-medium">{s.sheet}</span> — {t(SKIP_REASON_KEY[s.reason] ?? 'camp.att.skip.unknown_kind')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {gaps.length > 0 && (
        <details className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800" data-testid="import-roster-gaps">
          <summary className="cursor-pointer font-medium">{t('camp.att.roster_gaps', { arrivals: totals.arrivals, departures: totals.departures })}</summary>
          <p className="mt-1 text-yellow-700">{t('camp.att.roster_gaps_help')}</p>
          {gaps.map((g) => (
            <div key={`${g.date}-${g.direction}`} className="mt-2">
              <div className="font-medium">
                {t(g.direction === 'ARRIVAL' ? 'camp.att.roster_gap_arrival' : 'camp.att.roster_gap_departure', { date: g.date, n: g.total })}
              </div>
              <ul className="ml-4 list-disc">
                {g.employees.map((e) => (
                  <li key={e.id}>
                    <span className="font-mono">{e.employeeCode}</span> {e.fullName}
                    {e.crew ? ` (${e.crew})` : ''}
                  </li>
                ))}
                {g.total > g.employees.length && <li>{t('camp.att.roster_gap_more', { n: g.total - g.employees.length })}</li>}
              </ul>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
