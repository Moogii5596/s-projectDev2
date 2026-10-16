import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { campApi } from '../../camp/api/camp-api'
import type { Employee } from '../../camp/api/types'
import { campKeys, useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { P } from '../../camp/lib/permissions'
import { Badge, Button, ErrorBox, inputSmCls } from '../../camp/components/ui'
import InviteActions from './InviteActions'
import { loginName, userState } from '../lib/user-access'

const STATE_TONE = { ACTIVE: 'green', INVITED: 'yellow', NO_INVITE: 'gray', INACTIVE: 'red' } as const

/**
 * v0.2.2 Блок 4 (B4-Q1) — ажилтны засах цонхны «Нэвтрэх эрх» хэсэг (зөвхөн `camp.roles.manage`).
 * Холбоогүй → «Нэвтрэх эрх үүсгэх» (имэйл: картынх / өөр / имэйлгүй); холбосон → нэвтрэх нэр, төлөв, урилга.
 */
export default function EmployeeAccess({ campId, emp }: { campId: string; emp: Employee }) {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canManage = perms.can(P.ROLES_MANAGE)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const userId = emp.userId ?? createdId
  const users = useQuery({ queryKey: campKeys.users, queryFn: campApi.users, enabled: canManage && !!userId })
  const [noEmail, setNoEmail] = useState(!emp.email)
  const [email, setEmail] = useState(emp.email ?? '')
  const create = useCampMutation(
    () => campApi.createEmployeeUser(campId, emp.id, noEmail ? null : email.trim() || null),
    [campKeys.users, campKeys.employees(campId)],
    (res) => setCreatedId(res.userId),
  )

  if (!canManage || emp.status !== 'ACTIVE') return null
  const u = userId ? users.data?.find((x) => x.id === userId) : undefined

  return (
    <section className="rounded-lg border border-gray-200 p-3 space-y-2" aria-label={t('hr.access.title')}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">{t('hr.access.title')}</h3>
        {u && <Badge tone={STATE_TONE[userState(u)]}>{t(`hr.users.state.${userState(u)}`)}</Badge>}
      </div>
      {!userId && (
        <>
          <p className="text-xs text-gray-500">{t('hr.access.none_hint')}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={noEmail} onChange={(e) => setNoEmail(e.target.checked)} />
            {t('hr.access.no_email')}
          </label>
          {!noEmail && (
            <input aria-label={t('hr.access.email')} className={`${inputSmCls} w-full`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          )}
          <Button size="sm" onClick={() => create.mutate(undefined)} loading={create.isPending} disabled={!noEmail && !email.trim()}>
            {t('hr.access.create')}
          </Button>
          <ErrorBox error={create.error} />
        </>
      )}
      {userId && (
        <>
          <p className="text-sm text-gray-700">
            {t('hr.access.login')}: <span className="font-mono">{u ? (loginName(u) ?? '—') : '…'}</span>
            {u && !u.isActive && <span className="ml-2 text-red-600">{t('hr.users.state.INACTIVE')}</span>}
          </p>
          {(!u || u.isActive) && <InviteActions userId={userId} hasRealEmail={!!u && !u.internalEmail} />}
          <Link to={`/hr/${campId}/users`} className="text-xs text-blue-600 hover:underline">
            {t('hr.access.to_users')}
          </Link>
        </>
      )}
    </section>
  )
}
