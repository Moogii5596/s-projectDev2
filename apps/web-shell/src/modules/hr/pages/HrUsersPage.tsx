import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { campApi } from '../../camp/api/camp-api'
import type { CampUser } from '../../camp/api/types'
import { campKeys, useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { isSystemAdmin } from '../../camp/lib/permissions'
import { Badge, Button, Card, Empty, ErrorBox, Loading, Modal, NoAccess, Table, inputSmCls, td } from '../../camp/components/ui'
import InviteActions from '../components/InviteActions'
import UserPermissionsModal from '../components/UserPermissionsModal'
import { type UserState, filterUsers, loginName, userState } from '../lib/user-access'

const STATE_TONE = { ACTIVE: 'green', INVITED: 'yellow', NO_INVITE: 'gray', INACTIVE: 'red' } as const
const STATES: UserState[] = ['ACTIVE', 'INVITED', 'NO_INVITE', 'INACTIVE']

/**
 * /hr/:campId/users — v0.2.2 Блок 4 (B4-Q1…Q4): байгууллагын бүх хэрэглэгч (tenant түвшин).
 * Нэвтрэх нэр, холбогдсон ажилтан, урилгын төлөв; эрх, шинэ линк, идэвхгүй болгох / сэргээх. Эрх: системийн админ (OWNER / ADMIN, SEC-009).
 * Шинэ хэрэглэгч — «Ажилтан» → засах → «Нэвтрэх эрх».
 */
export default function HrUsersPage() {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canManage = isSystemAdmin(perms.data)
  const users = useQuery({ queryKey: campKeys.users, queryFn: campApi.users, enabled: canManage })
  const [q, setQ] = useState('')
  const [state, setState] = useState<UserState | ''>('')
  const [permsOf, setPermsOf] = useState<CampUser | null>(null)
  const [inviteOf, setInviteOf] = useState<CampUser | null>(null)
  const [toggling, setToggling] = useState<CampUser | null>(null)

  if (perms.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('hr.section.users')} />
  const list = filterUsers(users.data ?? [], q, state)

  return (
    <Card title={t('hr.users.title')}>
      <p className="text-xs text-gray-500 mb-3">{t('hr.users.help')}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label={t('camp.common.search')} placeholder={t('hr.users.search')} className={`${inputSmCls} flex-1 min-w-[12rem]`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label={t('camp.common.status')} className={inputSmCls} value={state} onChange={(e) => setState(e.target.value as UserState | '')}>
          <option value="">{t('camp.common.all')}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {t(`hr.users.state.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {users.isLoading && <Loading />}
      <ErrorBox error={users.error} onRetry={() => users.refetch()} />
      {users.data && list.length === 0 && <Empty>{t('hr.users.empty')}</Empty>}
      {list.length > 0 && (
        <Table head={[t('camp.common.name'), t('hr.access.login'), t('hr.users.col.employee'), t('camp.common.status'), '']}>
          {list.map((u) => {
            const s = userState(u)
            return (
              <tr key={u.id} className="border-t border-gray-100">
                <td className={td}>
                  <div className="text-gray-900">{u.fullName ?? '—'}</div>
                  {u.role === 'OWNER' || u.role === 'ADMIN' ? <div className="text-[11px] text-gray-400">{u.role}</div> : null}
                </td>
                <td className={`${td} font-mono text-xs`}>{loginName(u) ?? '—'}</td>
                <td className={`${td} text-gray-600`}>
                  {u.employee ? (
                    <Link to={`/hr/${u.employee.campId}/employees`} className="hover:text-blue-600">
                      {u.employee.employeeCode} · {u.employee.fullName} <span className="text-xs text-gray-400">({u.employee.campCode})</span>
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>
                  <Badge tone={STATE_TONE[s]}>{t(`hr.users.state.${s}`)}</Badge>
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  <Button variant="ghost" onClick={() => setPermsOf(u)}>
                    {t('hr.users.perms')}
                  </Button>
                  {u.isActive && (
                    <Button variant="ghost" onClick={() => setInviteOf(u)}>
                      {t('hr.users.new_link')}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setToggling(u)}>
                    {u.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
                  </Button>
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      {permsOf && <UserPermissionsModal user={permsOf} onClose={() => setPermsOf(null)} />}
      {inviteOf && (
        <Modal title={t('hr.users.invite_title', { name: inviteOf.fullName ?? '' })} onClose={() => setInviteOf(null)}>
          <p className="text-xs text-gray-500">{t('hr.users.invite_help')}</p>
          <InviteActions userId={inviteOf.id} hasRealEmail={!inviteOf.internalEmail} />
        </Modal>
      )}
      {toggling && <ToggleActiveModal user={toggling} onClose={() => setToggling(null)} />}
    </Card>
  )
}

function ToggleActiveModal({ user, onClose }: { user: CampUser; onClose: () => void }) {
  const { t } = useTranslation()
  const next = !user.isActive
  const m = useCampMutation(() => campApi.setUserActive(user.id, next), [campKeys.users], onClose)
  return (
    <Modal
      title={next ? t('hr.users.activate_title') : t('hr.users.deactivate_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button variant={next ? 'primary' : 'danger'} onClick={() => m.mutate(undefined)} loading={m.isPending}>
            {next ? t('camp.common.activate') : t('camp.common.deactivate')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{t(next ? 'hr.users.activate_confirm' : 'hr.users.deactivate_confirm', { name: user.fullName ?? loginName(user) ?? '' })}</p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
