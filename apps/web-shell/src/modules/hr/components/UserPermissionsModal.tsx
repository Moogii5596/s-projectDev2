import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-bridge'
import type { CampUser, PermissionDef } from '../api/camp-bridge'
import { campKeys } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { isComingSoon, permissionLabel, visiblePermissions } from '../../../core/permissions'
import { directPermissionCodes } from '../api/camp-bridge'
import { Badge, Button, Empty, ErrorBox, Loading, Modal, inputSmCls } from '../../../core/ui'
import { outdatedAssignments, permissionView } from '../lib/user-access'

/**
 * v0.2.2 Блок 4 (B4-Q4) — хэрэглэгчийн эрх: эрх бүр «Загвараас (роль)» / «Шууд», загвараас зөрүүтэй олголт;
 * шууд эрх нэмэх (бүх кемп / нэг кемп), хасах. Загварын эрхийг энд хасахгүй (роль → «Роль ба эрх» / «Хэрэглэгчийн роль»).
 */
export default function UserPermissionsModal({ user, onClose }: { user: CampUser; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const key = campKeys.userPerms(user.id)
  const data = useQuery({ queryKey: key, queryFn: () => campApi.userPermissions(user.id) })
  const catalog = useQuery({ queryKey: campKeys.permissions, queryFn: campApi.permissions })
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })
  const [code, setCode] = useState('')
  const [campId, setCampId] = useState('')
  const grant = useAppMutation(() => campApi.grantDirect(user.id, { permissionCode: code, campId: campId || null }), [key], () => setCode(''))
  const revoke = useAppMutation((id: string) => campApi.revokeDirect(id), [key])

  const visible: PermissionDef[] = visiblePermissions(catalog.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
  const label = (c: string) => {
    const p = visible.find((x) => x.code === c) ?? { code: c, name: c }
    return permissionLabel(p, (k) => i18n.exists(k), (k) => t(k))
  }
  const campName = (id: string | null) => (id ? (camps.data?.find((c) => c.id === id)?.code ?? '…') : t('hr.perms.all_camps'))
  const rows = data.data ? permissionView(data.data, visible.map((p) => p.code)) : []
  const outdated = data.data ? outdatedAssignments(data.data) : []
  // PIL-18: сонгосон хүрээнд аль хэдийн шууд олгосон эрх → «олгогдсон», идэвхгүй
  const granted = directPermissionCodes(data.data?.permissions ?? [], campId || null)

  return (
    <Modal title={t('hr.perms.title', { name: user.fullName ?? user.email })} onClose={onClose} wide>
      {(data.isLoading || catalog.isLoading) && <Loading />}
      <ErrorBox error={data.error ?? catalog.error} onRetry={() => data.refetch()} />
      {outdated.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-lg px-3 py-2">
          {t('hr.perms.outdated', { roles: outdated.map((a) => a.role.name).join(', ') })}
        </div>
      )}
      {data.data && rows.length === 0 && <Empty>{t('hr.perms.none')}</Empty>}
      {rows.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {rows.map((r) => (
            <li key={r.code} className="px-3 py-2">
              <div className="text-sm text-gray-900">{label(r.code)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {r.template.map((x, i) => (
                  <Badge key={`t${i}`} tone="blue">
                    {t('hr.perms.from_role', { role: x.roleName })} · {campName(x.campId)}
                  </Badge>
                ))}
                {r.direct.map((x) => (
                  <span key={x.id} className="inline-flex items-center gap-1">
                    <Badge tone="green">
                      {t('hr.perms.direct')} · {campName(x.campId)}
                    </Badge>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      aria-label={t('hr.perms.revoke', { perm: label(r.code) })}
                      onClick={() => revoke.mutate(x.id)}
                      disabled={revoke.isPending}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2 items-end pt-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (code) grant.mutate(undefined)
        }}
      >
        <select aria-label={t('hr.perms.add_perm')} className={`${inputSmCls} flex-1 min-w-[12rem]`} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">{t('hr.perms.add_perm')}</option>
          {visible.map((p) => (
            <option key={p.code} value={p.code} disabled={granted.has(p.code)}>
              {label(p.code)}
              {isComingSoon(p.code) ? ` · ${t('perm.coming_soon')}` : ''}
              {granted.has(p.code) ? ` — ${t('perm.granted')}` : ''}
            </option>
          ))}
        </select>
        <select aria-label={t('hr.perms.scope')} className={inputSmCls} value={campId} onChange={(e) => setCampId(e.target.value)}>
          <option value="">{t('hr.perms.all_camps')}</option>
          {(camps.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
        <Button size="sm" type="submit" disabled={!code || granted.has(code)} loading={grant.isPending}>
          {t('hr.perms.grant')}
        </Button>
      </form>
      <p className="text-xs text-gray-500">{t('hr.perms.help')}</p>
      <ErrorBox error={grant.error ?? revoke.error} />
    </Modal>
  )
}
