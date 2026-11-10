import { useTranslation } from 'react-i18next'
import { INTL_LOCALE, currentLang } from '../../../i18n'
import { Badge, Button, Empty, Modal } from '../../../core/ui'
import type { FeedRevisionListDto } from '../types'

interface Props {
  data: FeedRevisionListDto
  onClose: () => void
}

export default function RevisionsDialog({ data, onClose }: Props) {
  const { t } = useTranslation()
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[currentLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  return (
    <Modal
      title={t('feed.ui.rev.title')}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('feed.ui.rev.close')}
        </Button>
      }
    >
      {data.editedAt && <p className="text-xs text-gray-500">{t('feed.ui.rev.edited', { date: fmt(data.editedAt) })}</p>}
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="mb-1">
          <Badge tone="blue">{t('feed.ui.rev.current')}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm text-gray-900">{data.current}</p>
      </section>
      {data.revisions.length === 0 ? (
        <Empty>{t('feed.ui.rev.empty')}</Empty>
      ) : (
        <ul className="space-y-2">
          {data.revisions.map((r, i) => (
            <li key={`${r.replacedAt}-${i}`} className="rounded-lg border border-gray-200 p-3">
              <p className="mb-1 text-xs text-gray-500">{t('feed.ui.rev.previous', { date: fmt(r.replacedAt) })}</p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
