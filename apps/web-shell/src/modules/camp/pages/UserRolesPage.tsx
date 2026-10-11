import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { UserRole } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, NoAccess, PageHeader, Table, inputCls, inputSmCls, td } from '../components/ui'
import { useTranslation } from 'react-i18next'

/** /camp/admin/user-roles — хэрэглэгчид роль оноох: бүх кемпэд (campId = null) эсвэл тодорхой кемпэд */
export default function UserRolesPage() {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canManage = perms.can(P.ROLES_MANAGE)
  const users = useQuery({ queryKey: campKeys.users, queryFn: campApi.users, enabled: canManage })
  const roles = useQuery({ queryKey: campKeys.roles, queryFn: campApi.roles, enabled: canManage })
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false), enabled: canManage })
  const assigned = useQuery({ queryKey: campKeys.userRoles, queryFn: () => campApi.userRoles(), enabled: canManage })
  const [f, setF] = useState({ userId: '', roleId: '', campId: '' })
  const [search, setSearch] = useState('')

  const assign = useCampMutation(
    () => campApi.assignUserRole({ userId: f.userId, roleId: f.roleId, campId: f.campId || null }),
    [campKeys.userRoles, campKeys.roles, campKeys.all],
    () => setF((p) => ({ ...p, roleId: '' })),
  )
  const remove = useCampMutation((id: string) => campApi.removeUserRole(id), [campKeys.userRoles, campKeys.roles, campKeys.all])

  if (perms.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.system.section.user-roles')} />

  const byUser = new Map<string, UserRole[]>()
  for (const ur of assigned.data ?? []) byUser.set(ur.user.id, [...(byUser.get(ur.user.id) ?? []), ur])
  const q = search.trim().toLowerCase()
  const shownUsers = (users.data ?? []).filter((u) => !q || u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('camp.system.section.user-roles')}
        subtitle={t('camp.uroles.subtitle')}
      />
      <Card title={t('camp.uroles.assign_title')}>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end"
          onSubmit={(e) => {
            e.preventDefault()
            assign.mutate(undefined)
          }}
        >
          <Field label={t('camp.uroles.user')}>
            {(id) => (
              <select id={id} className={inputCls} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
                <option value="">{t('camp.common.choose')}</option>
                {users.data
                  ?.filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName ? `${u.fullName} (${u.email})` : u.email}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <Field label={t('camp.uroles.role')}>
            {(id) => (
              <select id={id} className={inputCls} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
                <option value="">{t('camp.common.choose')}</option>
                {roles.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('camp.uroles.scope')}>
            {(id) => (
              <select id={id} className={inputCls} value={f.campId} onChange={(e) => setF({ ...f, campId: e.target.value })}>
                <option value="">{t('camp.uroles.all_camps')}</option>
                {camps.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Button type="submit" loading={assign.isPending} disabled={!f.userId || !f.roleId}>
            {t('camp.uroles.assign')}
          </Button>
        </form>
        <div className="mt-3">
          <ErrorBox error={assign.error ?? remove.error} />
        </div>
      </Card>

      <Card
        title={t('camp.uroles.users')}
        actions={
          <input aria-label={t('camp.uroles.search')} className={`${inputSmCls} w-56 max-w-full`} placeholder={t('camp.uroles.search_ph')} value={search} onChange={(e) => setSearch(e.target.value)} />
        }
      >
        {(users.isLoading || assigned.isLoading) && <Loading />}
        <ErrorBox error={users.error ?? assigned.error ?? roles.error ?? camps.error} />
        {users.data && shownUsers.length === 0 && <Empty>{t('camp.uroles.empty')}</Empty>}
        {shownUsers.length > 0 && (
          <Table head={[t('camp.uroles.user'), t('camp.uroles.role_scope')]}>
            {shownUsers.map((u) => (
              <tr key={u.id}>
                <td className={`${td} whitespace-nowrap`}>
                  <div className="font-medium text-gray-900">{u.fullName ?? u.email}</div>
                  <div className="text-xs text-gray-400">
                    {u.email} {!u.isActive && <Badge>{t('camp.common.inactive')}</Badge>}
                  </div>
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {(byUser.get(u.id) ?? []).length === 0 && <span className="text-gray-400 text-xs">{t('camp.uroles.no_role')}</span>}
                    {(byUser.get(u.id) ?? []).map((ur) => (
                      <span key={ur.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 text-xs px-2 py-1">
                        {ur.role.name} · {ur.camp ? ur.camp.code : t('camp.uroles.all_camps')}
                        <button
                          type="button"
                          aria-label={t('camp.picker.remove', { code: `${ur.role.name} (${ur.camp ? ur.camp.code : t('camp.uroles.all_camps')})` })}
                          className="ml-1 text-blue-400 hover:text-red-600"
                          onClick={() => remove.mutate(ur.id)}
                          disabled={remove.isPending}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
