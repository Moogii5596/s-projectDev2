import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { PermissionDef, Role } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { isComingSoon, isSystemAdmin, mergeRolePermissions, permissionLabel, visiblePermissions } from '../../../core/permissions'
import { SYSTEM_ROLE_LABEL } from '../../../core/labels'
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, NoAccess, PageHeader, inputCls } from '../../../core/ui'
import { useTranslation } from 'react-i18next'

/**
 * /camp/admin/roles — роль × эрхийн матриц (системийн админ — SEC-009).
 * v0.2.3 Блок 3 (V2-05): бүх эрх харагдана, хэрэгжээгүй модулийнх «удахгүй» шошготой. (Өмнө: V2 эрх (availableIn = 'v2') харагдахгүй, гэхдээ роль эзэмшиж байвал хадгалахад хасагдахгүй.
 * v0.2.2 (ADR-003 §2.4): роль = загвар. Хадгалахад хэрэглэгчийн эрх АВТОМАТААР өөрчлөгдөхгүй →
 * "N хэрэглэгчид хэрэгжүүлэх" цонх (урьдчилсан харагдац → батлах); алгасвал баганад "хэрэгжээгүй" товч үлдэнэ.
 */
export default function RolesPage() {
  const { t, i18n } = useTranslation()
  const permLabel = (p: PermissionDef) => permissionLabel(p, (k) => i18n.exists(k), (k) => t(k))
  const perms = useAppPermissions()
  const canManage = isSystemAdmin(perms.data)
  const catalog = useQuery({ queryKey: campKeys.permissions, queryFn: campApi.permissions, enabled: canManage })
  const roles = useQuery({ queryKey: campKeys.roles, queryFn: campApi.roles, enabled: canManage })
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [roleModal, setRoleModal] = useState<Role | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  /** Хэрэгжүүлэх дараалал (хадгалсны дараа pendingUsers > 0 рольууд) */
  const [applyQueue, setApplyQueue] = useState<Role[]>([])

  const visible = useMemo(() => visiblePermissions(catalog.data ?? []), [catalog.data])
  const visibleCodes = visible.map((p) => p.code)
  const selectedOf = (r: Role) => draft[r.id] ?? r.permissionCodes.filter((c) => visibleCodes.includes(c))
  const changed = (roles.data ?? []).filter((r) => draft[r.id] !== undefined)

  const save = useAppMutation(
    async () => {
      const saved: Role[] = []
      for (const r of changed) saved.push(await campApi.setRolePermissions(r.id, mergeRolePermissions(r.permissionCodes, visibleCodes, draft[r.id])))
      return saved
    },
    [campKeys.roles, campKeys.all],
    (saved) => {
      setDraft({})
      setApplyQueue(saved.filter((r) => (r.pendingUsers ?? 0) > 0))
    },
  )

  if (perms.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.system.section.roles')} />

  const toggle = (r: Role, code: string) => {
    const cur = selectedOf(r)
    setDraft((d) => ({ ...d, [r.id]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] }))
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('camp.system.section.roles')}
        subtitle={t('camp.roles.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRoleModal('new')}>
              {t('camp.roles.add')}
            </Button>
            <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={changed.length === 0}>
              {t('camp.common.save')}
              {changed.length > 0 ? ` (${changed.length})` : ''}
            </Button>
          </>
        }
      />
      <ErrorBox error={save.error ?? catalog.error ?? roles.error} />
      {(catalog.isLoading || roles.isLoading) && <Loading />}
      {roles.data && catalog.data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="align-bottom">
                  <th className="text-left font-medium text-gray-600 px-3 py-2 min-w-[16rem]">{t('camp.roles.permission')}</th>
                  {roles.data.map((r) => (
                    <th key={r.id} className="px-2 py-2 text-center font-medium text-gray-700 min-w-[7rem]">
                      <div>{r.name}</div>
                      <div className="text-[11px] font-normal text-gray-400">{t('camp.roles.users', { n: r.userCount })}</div>
                      {(r.pendingUsers ?? 0) > 0 && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-amber-700 hover:underline"
                          title={t('camp.roles.pending_hint')}
                          onClick={() => setApplyQueue([r])}
                        >
                          ⚠ {t('camp.roles.pending', { n: r.pendingUsers })}
                        </button>
                      )}
                      <div className="mt-1 space-x-2">
                        <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setRoleModal(r)}>
                          {t('camp.common.edit')}
                        </button>
                        {!r.isSystem && (
                          <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={() => setDeleting(r)}>
                            {t('camp.att.delete')}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((p: PermissionDef) => (
                  <tr key={p.code}>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">
                        {permLabel(p)}
                        {isComingSoon(p.code) && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{t('perm.coming_soon')}</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-gray-400">{p.code}</div>
                    </td>
                    {roles.data.map((r) => (
                      <td key={r.id} className={`text-center ${draft[r.id] ? 'bg-blue-50/40' : ''}`}>
                        <input
                          type="checkbox"
                          aria-label={`${r.name}: ${permLabel(p)}`}
                          checked={selectedOf(r).includes(p.code)}
                          onChange={() => toggle(r, p.code)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changed.length > 0 && (
            <div className="flex items-center gap-3 mt-3 text-sm text-blue-700">
              {t('camp.roles.unsaved', { names: changed.map((r) => r.name).join(', ') })}
              <Button variant="ghost" onClick={() => setDraft({})}>
                {t('camp.roles.revert')}
              </Button>
            </div>
          )}
        </Card>
      )}
      {roleModal && <RoleModal role={roleModal === 'new' ? null : roleModal} onClose={() => setRoleModal(null)} />}
      {deleting && <DeleteRoleModal role={deleting} onClose={() => setDeleting(null)} />}
      {applyQueue[0] && <ApplyRoleModal key={applyQueue[0].id} role={applyQueue[0]} onClose={() => setApplyQueue((q) => q.slice(1))} />}
    </div>
  )
}

function RoleModal({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const m = useAppMutation(
    () =>
      role
        ? campApi.updateRole(role.id, { name: name.trim(), description: description.trim() || null })
        : campApi.createRole({ name: name.trim(), description: description.trim() || null, permissionCodes: [] }),
    [campKeys.roles],
    onClose,
  )
  return (
    <Modal
      title={role ? t('camp.roles.edit_title') : t('camp.roles.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim()}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      {role?.isSystem && role.systemCode && <Badge tone="blue">{SYSTEM_ROLE_LABEL[role.systemCode] ?? t('camp.roles.system')}</Badge>}
      <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
      <Field label={t('camp.roles.description')}>{(id) => <input id={id} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
      {!role && <p className="text-xs text-gray-500">{t('camp.roles.matrix_hint')}</p>}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function DeleteRoleModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { t } = useTranslation()
  const m = useAppMutation(() => campApi.deleteRole(role.id), [campKeys.roles, campKeys.all], onClose)
  return (
    <Modal
      title={t('camp.roles.delete_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => m.mutate(undefined)} loading={m.isPending}>
            {t('camp.att.delete')}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        {t('camp.roles.delete_confirm', { name: role.name })}
        {role.userCount > 0 && ` ${t('camp.roles.delete_users', { n: role.userCount })}`}
      </p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

/** v0.2.2 — загварыг тухайн рольтой хэрэглэгчдэд хэрэгжүүлэх: хэрэглэгч бүрийн + / − эрх → батлах */
function ApplyRoleModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { t } = useTranslation()
  const preview = useQuery({ queryKey: [...campKeys.roles, 'apply', role.id], queryFn: () => campApi.roleApplyPreview(role.id) })
  const catalog = useQuery({ queryKey: campKeys.permissions, queryFn: campApi.permissions })
  const nameOf = (code: string) => catalog.data?.find((p) => p.code === code)?.name ?? code
  const m = useAppMutation(() => campApi.applyRole(role.id), [campKeys.roles, campKeys.all], onClose)
  const items = preview.data?.items ?? []
  return (
    <Modal
      title={t('camp.roles.apply_title', { name: role.name })}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.roles.apply_later')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!preview.data || items.length === 0}>
            {t('camp.roles.apply_confirm', { n: preview.data?.affectedUsers ?? 0 })}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{t('camp.roles.apply_intro')}</p>
      {preview.isLoading && <Loading />}
      {preview.data && items.length === 0 && <p className="text-sm text-gray-500">{t('camp.roles.apply_none')}</p>}
      {items.length > 0 && (
        <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-gray-100 text-sm">
          {items.map((i) => (
            <li key={i.userRoleId} className="py-2">
              <div className="font-medium text-gray-900">{i.user?.fullName || i.user?.email || i.userId}</div>
              {i.add.length > 0 && <div className="text-green-700">+ {i.add.map(nameOf).join(', ')}</div>}
              {i.remove.length > 0 && <div className="text-red-700">− {i.remove.map(nameOf).join(', ')}</div>}
            </li>
          ))}
        </ul>
      )}
      <ErrorBox error={preview.error ?? m.error} />
    </Modal>
  )
}

