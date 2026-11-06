import { useTranslation } from 'react-i18next'
import { INTL_LOCALE, currentLang } from '../../i18n'
import type { FeedRevisionListDto } from './types'

interface Props {
  data: FeedRevisionListDto
  onClose: () => void
}

export default function RevisionsDialog({ data, onClose }: Props) {
  const { t } = useTranslation()
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[currentLang()], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('feed.rev.title')}
        className="mx-4 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-gray-900">{t('feed.rev.title')}</h2>
        {data.editedAt && (
          <p className="mb-3 text-xs text-gray-500">{t('feed.rev.edited', { date: fmt(data.editedAt) })}</p>
        )}
        <section className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="mb-1 text-xs font-medium text-blue-700">{t('feed.rev.current')}</p>
          <p className="whitespace-pre-wrap text-sm text-gray-900">{data.current}</p>
        </section>
        {data.revisions.length === 0 ? (
          <p className="text-sm text-gray-500">{t('feed.rev.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {data.revisions.map((r, i) => (
              <li key={`${r.replacedAt}-${i}`} className="rounded-lg border border-gray-200 p-3">
                <p className="mb-1 text-xs text-gray-500">{t('feed.rev.previous', { date: fmt(r.replacedAt) })}</p>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t('feed.rev.close')}
        </button>
      </div>
    </div>
  )
}
