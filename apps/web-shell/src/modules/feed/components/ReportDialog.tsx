import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, inputCls, Modal } from '../../camp/components/ui'
import { FEED_REPORT_REASONS, type FeedReportReason } from '../types'

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
  const canSubmit = reason !== null && !tooLong

  const submit = () => {
    if (reason && canSubmit) onSubmit({ reason, note: note.trim() })
  }

  return (
    <Modal
      title={t('feed.ui.report.title')}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('feed.ui.report.cancel')}
          </Button>
          <Button variant="danger" disabled={!canSubmit} loading={isLoading} onClick={submit}>
            {t('feed.ui.report.submit')}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium text-gray-600">{t('feed.ui.report.reason')}</legend>
        {FEED_REPORT_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-gray-800">
            <input type="radio" name="feed-report-reason" checked={reason === r} onChange={() => setReason(r)} />
            {t(`feed.ui.report.reason.${r}`)}
          </label>
        ))}
      </fieldset>
      <Field
        label={t('feed.ui.report.note')}
        hint={`${note.length}/${MAX_REPORT_NOTE}`}
        error={tooLong ? t('feed.ui.report.noteTooLong', { max: MAX_REPORT_NOTE }) : null}
      >
        {(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} resize-none`} />}
      </Field>
    </Modal>
  )
}
