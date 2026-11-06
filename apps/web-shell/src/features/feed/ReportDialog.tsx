import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FEED_REPORT_REASONS, type FeedReportReason } from './types'

export const MAX_REPORT_NOTE = 500

interface Props {
  onSubmit: (v: { reason: FeedReportReason; note: string }) => void
  onCancel: () => void
  isLoading?: boolean
}

export default function ReportDialog({ onSubmit, onCancel, isLoading = false }: Props) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<FeedReportReason | null>(null)
  const [note, setNote] = useState('')
  const tooLong = note.length > MAX_REPORT_NOTE
  const canSubmit = reason !== null && !tooLong && !isLoading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('feed.report.title')}
        className="mx-4 w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (reason && canSubmit) onSubmit({ reason, note: note.trim() })
        }}
      >
        <h2 className="mb-3 text-base font-semibold text-gray-900">{t('feed.report.title')}</h2>
        <fieldset className="mb-3 space-y-1">
          <legend className="mb-1 text-sm font-medium text-gray-700">{t('feed.report.reason')}</legend>
          {FEED_REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-gray-800">
              <input type="radio" name="feed-report-reason" checked={reason === r} onChange={() => setReason(r)} />
              {t(`feed.report.reason.${r}`)}
            </label>
          ))}
        </fieldset>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="feed-report-note">
          {t('feed.report.note')}
        </label>
        <textarea
          id="feed-report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className={`mb-3 text-xs ${tooLong ? 'text-red-600' : 'text-gray-500'}`} role={tooLong ? 'alert' : undefined}>
          {tooLong ? t('feed.report.noteTooLong', { max: MAX_REPORT_NOTE }) : `${note.length}/${MAX_REPORT_NOTE}`}
        </p>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {t('feed.report.submit')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('feed.report.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
