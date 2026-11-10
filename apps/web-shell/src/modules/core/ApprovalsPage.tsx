import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { approvalKeys, approvalsApi, type ApprovalListItem } from './api'
import { relativeTime } from './notification-text'

export function approvalStatusTone(status: string): 'yellow' | 'green' | 'red' | 'gray' {
  return status === 'PENDING' ? 'yellow' : status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'gray'
}

/** v0.2.4 WF-06 / UX-01 — «Миний батлах» (бүх модуль) + «Миний илгээсэн» */
export default function ApprovalsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'inbox' | 'mine'>('inbox')
  const q = useQuery({
    queryKey: tab === 'inbox' ? approvalKeys.inbox : approvalKeys.mine,
    queryFn: tab === 'inbox' ? approvalsApi.inbox : approvalsApi.mine,
    refetchInterval: tab === 'inbox' ? 60_000 : false,
  })
  const locale = INTL_LOCALE[currentLang()]
  const nf = new Intl.NumberFormat(locale)
  const tabCls = (k: string) => `rounded-lg px-3 py-1.5 text-sm ${tab === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`

  const row = (a: ApprovalListItem) => {
    const overdue = a.dueAt && new Date(a.dueAt).getTime() < Date.now() && a.status === 'PENDING'
    return (
      <li key={a.id}>
        <button type="button" onClick={() => navigate(`/approvals/${a.id}`)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 text-left hover:bg-gray-50">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900">{t(a.labelKey)} · {a.title}</span>
            <span className="block text-xs text-gray-500">
              {a.requesterName && <>{a.requesterName} · </>}
              {t('approval.step_of', { current: Math.min(a.currentStep + 1, a.totalSteps), total: a.totalSteps })}
              {a.stepName && <> · {a.stepName}</>}
              {a.amount !== null && <> · {nf.format(a.amount)}</>}
              {a.onBehalfOf && <> · {t('approval.on_behalf', { name: a.onBehalfOf })}</>}
            </span>
          </span>
          {overdue && <Badge tone="red">{t('approval.overdue')}</Badge>}
          <Badge tone={approvalStatusTone(a.status)}>{t(`approval.status.${a.status.toLowerCase()}`)}</Badge>
          <span className="text-[11px] text-gray-400">{relativeTime(a.createdAt, locale)}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('approval.title')} />
      <div className="flex gap-2">
        <button type="button" className={tabCls('inbox')} onClick={() => setTab('inbox')}>{t('approval.tab.inbox')}</button>
        <button type="button" className={tabCls('mine')} onClick={() => setTab('mine')}>{t('approval.tab.mine')}</button>
      </div>
      <Card>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {q.data && q.data.items.length === 0 && <Empty>{t(tab === 'inbox' ? 'approval.empty.inbox' : 'approval.empty.mine')}</Empty>}
        <ul className="divide-y divide-gray-100">{q.data?.items.map(row)}</ul>
      </Card>
    </div>
  )
}
