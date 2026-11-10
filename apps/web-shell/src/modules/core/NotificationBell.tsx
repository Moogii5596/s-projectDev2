import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { notificationKeys, notificationsApi, type NotificationView } from './api'
import { notificationText, relativeTime } from './notification-text'

/** v0.2.4 NTF-01 / UX-01 — мэдэгдлийн хонх: уншаагүй тоо (≤30с polling), сүүлийн 10, бүгдийг уншсан болгох */
export default function NotificationBell({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const list = useQuery({
    queryKey: [...notificationKeys.all, 'bell'],
    queryFn: () => notificationsApi.list({ limit: 10 }),
    enabled: open,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  const readAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate })

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openItem = async (n: NotificationView) => {
    setOpen(false)
    if (!n.readAt) {
      await notificationsApi.markRead(n.id).catch(() => undefined)
      void invalidate()
    }
    if (n.link) navigate(n.link)
  }

  const count = unread.data?.count ?? 0
  const locale = INTL_LOCALE[currentLang()]
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notify.bell.title')}
        aria-expanded={open}
        className="relative rounded-full p-1.5 text-gray-600 hover:bg-gray-100 hover:text-blue-600"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,360px)] rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <span className="text-sm font-semibold text-gray-900">{t('notify.bell.title')}</span>
            {count > 0 && (
              <button type="button" className="text-xs text-blue-600 hover:underline disabled:opacity-50" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
                {t('notify.bell.read_all')}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {list.isLoading && <p className="px-4 py-6 text-center text-sm text-gray-400">{t('camp.common.loading')}</p>}
            {list.isError && <p className="px-4 py-6 text-center text-sm text-red-600">{t('notify.bell.error')}</p>}
            {list.data && list.data.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">{t('notify.bell.empty')}</p>}
            {list.data?.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={`block w-full border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${n.readAt ? '' : 'bg-blue-50/60'}`}
              >
                <p className={`text-sm ${n.readAt ? 'text-gray-700' : 'font-medium text-gray-900'}`}>{notificationText(t, n.titleKey, n.params)}</p>
                {n.bodyKey && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{notificationText(t, n.bodyKey, n.params)}</p>}
                <p className="mt-1 text-[11px] text-gray-400">{relativeTime(n.createdAt, locale)}</p>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate('/notifications') }} className="block w-full rounded-b-xl px-4 py-2 text-center text-sm text-blue-600 hover:bg-gray-50">
            {t('notify.bell.all')}
          </button>
        </div>
      )}
    </div>
  )
}
