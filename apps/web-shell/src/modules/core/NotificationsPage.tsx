import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, Empty, ErrorBox, Loading, PageHeader } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { notificationKeys, notificationsApi, type NotificationView } from './api'
import { notificationText, relativeTime } from './notification-text'

/** v0.2.4 NTF-01 — бүх мэдэгдэл (уншаагүйгээр шүүх, цааш ачаалах) */
export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const q = useInfiniteQuery({
    queryKey: [...notificationKeys.all, 'page', unreadOnly],
    queryFn: ({ pageParam }) => notificationsApi.list({ unreadOnly, before: pageParam ?? undefined, limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  const readAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate })
  const open = async (n: NotificationView) => {
    if (!n.readAt) {
      await notificationsApi.markRead(n.id).catch(() => undefined)
      void invalidate()
    }
    if (n.link) navigate(n.link)
  }
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  const locale = INTL_LOCALE[currentLang()]

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('notify.bell.title')}
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              {t('notify.bell.unread_only')}
            </label>
            <Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>{t('notify.bell.read_all')}</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/profile#notifications')}>{t('notify.prefs.title')}</Button>
          </div>
        }
      />
      <Card>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {!q.isLoading && !q.isError && items.length === 0 && <Empty>{t('notify.bell.empty')}</Empty>}
        <ul className="divide-y divide-gray-100">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={`flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-gray-50 ${n.readAt ? '' : 'bg-blue-50/50'}`}>
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.readAt ? 'bg-transparent' : 'bg-blue-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.readAt ? 'text-gray-700' : 'font-medium text-gray-900'}`}>{notificationText(t, n.titleKey, n.params)}</span>
                  {n.bodyKey && <span className="mt-0.5 block text-xs text-gray-500">{notificationText(t, n.bodyKey, n.params)}</span>}
                  <span className="mt-1 block text-[11px] text-gray-400">{relativeTime(n.createdAt, locale)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {q.hasNextPage && (
          <div className="pt-3 text-center">
            <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t('notify.bell.more')}</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
