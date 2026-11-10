import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorBox, Field, Loading, PageHeader, inputCls } from '../../core/ui'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useAuth } from '../../hooks/useAuth'
import { useMe } from '../../hooks/useMe'
import { CHANGE_PASSWORD_PATH, displayLogin } from '../../lib/password-change'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { approvalKeys, approvalsApi, notificationKeys, notificationsApi, type NotificationPrefView } from './api'

/** v0.2.4 UX-01 — профайл: хэл, нууц үг, төхөөрөмж, мэдэгдлийн тохиргоо (NTF-01), орлон гүйцэтгэгч (WF-06) */
export default function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { me } = useMe()

  useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader title={t('profile.title')} subtitle={displayLogin(me, user?.email)} />
      <Card title={t('profile.account')}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">{t('profile.language')}</span>
          <LanguageSwitcher persist />
          <Button variant="secondary" size="sm" onClick={() => navigate(CHANGE_PASSWORD_PATH)}>{t('auth.change.link')}</Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/account/devices')}>{t('devices.nav')}</Button>
        </div>
      </Card>
      <NotificationPrefsCard />
      <DelegationsCard />
    </div>
  )
}

function NotificationPrefsCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: notificationKeys.prefs, queryFn: notificationsApi.preferences })
  const [rows, setRows] = useState<NotificationPrefView[] | null>(null)
  useEffect(() => {
    if (q.data) setRows(q.data.items)
  }, [q.data])
  const save = useMutation({
    mutationFn: () => notificationsApi.updatePreferences((rows ?? []).map(({ type, inApp, email }) => ({ type, inApp, email }))),
    onSuccess: (data) => qc.setQueryData(notificationKeys.prefs, data),
  })
  const dirty = !!rows && !!q.data && JSON.stringify(rows) !== JSON.stringify(q.data.items)
  const toggle = (type: string, field: 'inApp' | 'email') =>
    setRows((r) => r?.map((x) => (x.type === type ? { ...x, [field]: !x[field] } : x)) ?? null)

  return (
    <div id="notifications">
      <Card title={t('notify.prefs.title')} actions={<Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>{t('camp.common.save')}</Button>}>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {save.isError && <ErrorBox error={save.error} />}
        {save.isSuccess && !dirty && <p className="mb-2 text-xs text-green-700">{t('notify.prefs.saved')}</p>}
        {rows && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">{t('notify.prefs.type')}</th>
                <th className="w-20 py-1 text-center font-medium">{t('notify.prefs.in_app')}</th>
                <th className="w-20 py-1 text-center font-medium">{t('notify.prefs.email')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-t border-gray-100">
                  <td className="py-2">{t(r.labelKey)}</td>
                  <td className="text-center"><input type="checkbox" aria-label={`${t(r.labelKey)} — ${t('notify.prefs.in_app')}`} checked={r.inApp} onChange={() => toggle(r.type, 'inApp')} /></td>
                  <td className="text-center"><input type="checkbox" aria-label={`${t(r.labelKey)} — ${t('notify.prefs.email')}`} checked={r.email} onChange={() => toggle(r.type, 'email')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function DelegationsCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [delegateId, setDelegateId] = useState('')
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')
  const q = useQuery({ queryKey: approvalKeys.delegations, queryFn: approvalsApi.delegations })
  const candidates = useQuery({ queryKey: approvalKeys.delegates, queryFn: approvalsApi.delegates, enabled: open })
  const create = useMutation({
    mutationFn: () => approvalsApi.createDelegation({ delegateId, validUntil: new Date(`${until}T23:59:59`).toISOString(), reason: reason.trim() || undefined }),
    onSuccess: (data) => {
      qc.setQueryData(approvalKeys.delegations, data)
      setOpen(false)
      setDelegateId('')
      setUntil('')
      setReason('')
    },
  })
  const revoke = useMutation({ mutationFn: approvalsApi.revokeDelegation, onSuccess: (data) => qc.setQueryData(approvalKeys.delegations, data) })
  const locale = INTL_LOCALE[currentLang()]
  const d = (iso: string) => new Date(iso).toLocaleDateString(locale)

  return (
    <Card title={t('delegation.title')} actions={!open && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t('delegation.add')}</Button>}>
      <p className="mb-3 text-xs text-gray-500">{t('delegation.hint')}</p>
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {revoke.isError && <ErrorBox error={revoke.error} />}
      {q.data && q.data.items.length === 0 && !open && <p className="text-sm text-gray-400">{t('delegation.empty')}</p>}
      <ul className="space-y-2">
        {q.data?.items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex-1">
              {x.mine ? t('delegation.mine', { name: x.delegateName }) : t('delegation.for_me', { name: x.delegatorName })}
              <span className="ml-2 text-xs text-gray-500">{d(x.validFrom)} – {d(x.validUntil)}{x.reason && ` · ${x.reason}`}</span>
            </span>
            {x.mine && <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === x.id} onClick={() => revoke.mutate(x.id)}>{t('delegation.revoke')}</Button>}
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={t('delegation.delegate')}>
            {(id) => (
              <select id={id} className={inputCls} value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
                <option value="">—</option>
                {candidates.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('delegation.until')} hint={t('delegation.max_days')}>
            {(id) => <input id={id} type="date" className={inputCls} value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />}
          </Field>
          <Field label={t('delegation.reason')}>
            {(id) => <input id={id} className={inputCls} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="flex gap-2 sm:col-span-3">
            <Button disabled={!delegateId || !until} loading={create.isPending} onClick={() => create.mutate()}>{t('camp.common.save')}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('feed.link.dialog.cancel')}</Button>
          </div>
          {create.isError && <div className="sm:col-span-3"><ErrorBox error={create.error} /></div>}
        </div>
      )}
    </Card>
  )
}
