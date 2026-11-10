import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, ErrorBox, Field, Loading, PageHeader, inputCls } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { approvalKeys, approvalsApi } from './api'
import { approvalStatusTone } from './ApprovalsPage'
import { notificationKeys } from './api'

/** v0.2.4 WF-06 — батлах хүсэлтийн дэлгэрэнгүй: алхмууд, түүх, батлах/татгалзах (шалтгаан заавал) */
export default function ApprovalDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const q = useQuery({ queryKey: approvalKeys.detail(id), queryFn: () => approvalsApi.detail(id), enabled: !!id })
  const decide = useMutation({
    mutationFn: (action: 'APPROVE' | 'REJECT') => approvalsApi.decide(id, action, comment.trim() || undefined),
    onSuccess: (data) => {
      qc.setQueryData(approvalKeys.detail(id), data)
      setComment('')
      void qc.invalidateQueries({ queryKey: ['core', 'approvals'] })
      void qc.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
  const locale = INTL_LOCALE[currentLang()]
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale)

  if (q.isLoading) return <Loading />
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  const a = q.data

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t(a.labelKey)} · ${a.title}`}
        subtitle={<>{a.requesterName && <>{t('approval.requester')}: {a.requesterName} · </>}{fmt(a.createdAt)}</>}
        actions={<Badge tone={approvalStatusTone(a.status)}>{t(`approval.status.${a.status.toLowerCase()}`)}</Badge>}
      />
      {a.link && <Link to={a.link} className="text-sm text-blue-600 hover:underline">{t('approval.open_object')}</Link>}
      <Card title={t('approval.steps')}>
        <ol className="space-y-2">
          {a.steps.map((s) => {
            const done = a.status === 'APPROVED' || s.index < a.currentStep
            const current = a.status === 'PENDING' && s.index === a.currentStep
            return (
              <li key={s.index} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${current ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-green-600 text-white' : current ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{s.index + 1}</span>
                <span className="flex-1">
                  {s.name ?? (s.permission ? t(`perm.${s.permission}`, { defaultValue: s.permission }) : s.role)}
                  {s.quorum > 1 && <span className="ml-2 text-xs text-gray-500">{t('approval.quorum', { n: s.quorum })}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </Card>
      {a.canDecide && (
        <Card title={t('approval.decide')}>
          <div className="space-y-3">
            <Field label={t('approval.comment')} hint={t('approval.comment_hint')}>
              {(fid) => <textarea id={fid} className={inputCls} rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />}
            </Field>
            {decide.isError && <ErrorBox error={decide.error} />}
            <div className="flex gap-2">
              <Button loading={decide.isPending} onClick={() => decide.mutate('APPROVE')}>{t('approval.approve')}</Button>
              <Button variant="danger" disabled={!comment.trim() || decide.isPending} onClick={() => decide.mutate('REJECT')}>{t('approval.reject')}</Button>
            </div>
          </div>
        </Card>
      )}
      <Card title={t('approval.history')}>
        {a.logs.length === 0 ? (
          <p className="text-sm text-gray-400">{t('approval.no_history')}</p>
        ) : (
          <ul className="space-y-2">
            {a.logs.map((l, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{l.actorName ?? '—'}</span>
                {l.onBehalfOfName && <span className="text-gray-500"> ({t('approval.on_behalf', { name: l.onBehalfOfName })})</span>}
                {' · '}
                <Badge tone={l.action === 'APPROVED' ? 'green' : 'red'}>{t(`approval.action.${l.action.toLowerCase()}`)}</Badge>
                {' · '}<span className="text-xs text-gray-500">{t('approval.step_n', { n: l.stepOrder + 1 })} · {fmt(l.actedAt)}</span>
                {l.comment && <p className="mt-0.5 whitespace-pre-wrap text-gray-600">{l.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
