import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader } from '../../core/ui'
import { useAppMutation } from '../../core/useAppMutation'
import { feedApi, feedKeys, type FeedReportStatus } from './api'
import { TimeAgo } from './components/PostCard'

const STATUSES: FeedReportStatus[] = ['OPEN', 'DISMISSED', 'REMOVED']

/** v0.2.3 Блок 5 — `/feed/reports`: модератор (`feed.content.moderate`, OWNER / ADMIN). Backend 403 → ErrorBox */
export default function FeedReportsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<FeedReportStatus>('OPEN')
  const q = useQuery({ queryKey: feedKeys.reports(status), queryFn: () => feedApi.reports(status) })
  const resolve = useAppMutation(
    (v: { id: string; action: 'DISMISS' | 'REMOVE' }) => feedApi.resolveReport(v.id, v.action),
    [feedKeys.all],
  )

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title={t('feed.reports.title')} subtitle={t('feed.reports.subtitle')} />
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={s === status ? 'primary' : 'secondary'} onClick={() => setStatus(s)}>
            {t(`feed.reports.status.${s}`)}
          </Button>
        ))}
      </div>
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {resolve.isError && <ErrorBox error={resolve.error} />}
      {q.isSuccess && q.data.length === 0 && <Empty>{t('feed.reports.empty')}</Empty>}
      <ul className="space-y-2">
        {q.data?.map((r) => (
          <li key={r.id} className="space-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <Badge tone="blue">{t(`feed.reports.target.${r.targetType}`)}</Badge>
              <Badge tone="red">{t(`feed.ui.report.reason.${r.reason}`)}</Badge>
              {r.contentHidden && <Badge tone="yellow">{t('feed.hidden')}</Badge>}
              {r.contentDeleted && <Badge>{t('feed.reports.deleted')}</Badge>}
              <span>{t('feed.reports.by', { name: r.reporter.name })}</span>
              <span>·</span>
              <TimeAgo iso={r.createdAt} />
            </div>
            <div className="text-xs text-gray-500">{r.contentAuthor.name}:</div>
            <p className="whitespace-pre-wrap break-words text-gray-800">{r.excerpt || '—'}</p>
            {r.note && <p className="text-xs italic text-gray-600">“{r.note}”</p>}
            {r.status === 'OPEN' && (
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="secondary" loading={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, action: 'DISMISS' })}>
                  {t('feed.reports.dismiss')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={resolve.isPending}
                  onClick={() => { if (window.confirm(t('feed.confirm_delete'))) resolve.mutate({ id: r.id, action: 'REMOVE' }) }}
                >
                  {t('feed.reports.remove')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
