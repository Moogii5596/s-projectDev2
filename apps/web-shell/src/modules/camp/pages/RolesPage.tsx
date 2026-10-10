import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { PermissionDef, Role } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P, mergeRolePermissions, visiblePermissions } from '../lib/permissions'
import { SYSTEM_ROLE_LABEL } from '../lib/labels'
import { Badge, Button, Card, ErrorBox, Field, Loading, Modal, NoAccess, PageHeader, inputCls } from '../components/ui'

/**
 * /camp/admin/roles — роль × эрхийн матриц (roles.manage, tenant түвшин).
 * V2 эрх (availableIn = 'v2') харагдахгүй, гэхдээ роль эзэмшиж байвал хадгалахад хасагдахгүй.
 */
export default function RolesPage() {
  const perms = useCampPermissions()
  const canManage = perms.can(P.ROLES_MANAGE)
  const catalog = useQuery({ queryKey: campKeys.permissions, queryFn: campApi.permissions, enabled: canManage })
  const roles = useQuery({ queryKey: campKeys.roles, queryFn: campApi.roles, enabled: canManage })
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [roleModal, setRoleModal] = useState<Role | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const visible = useMemo(() => visiblePermissions(catalog.data ?? []), [catalog.data])
  const visibleCodes = visible.map((p) => p.code)
  const selectedOf = (r: Role) => draft[r.id] ?? r.permissionCodes.filter((c) => visibleCodes.includes(c))
  const changed = (roles.data ?? []).filter((r) => draft[r.id] !== undefined)

  const save = useCampMutation(
    async () => {
      for (const r of changed) await campApi.setRolePermissions(r.id, mergeRolePermissions(r.permissionCodes, visibleCodes, draft[r.id]))
    },
    [campKeys.roles, campKeys.all],
    () => setDraft({}),
  )

  if (perms.isLoading) return <Loading />
  if (!canManage) return <NoAccess what="Роль ба эрх" />

  const toggle = (r: Role, code: string) => {
    const cur = selectedOf(r)
    setDraft((d) => ({ ...d, [r.id]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] }))
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        <Link to="/camp" className="hover:text-blue-600">
          Кемпүүд
        </Link>{' '}
        / Роль ба эрх
      </div>
      <PageHeader
        title="Роль ба эрх"
        subtitle="Роль бүрт эрх сонгоод хадгална. Хэрэглэгчид ролийг 'Хэрэглэгчийн роль' хуудсанд ононо."
        actions={
          <>
            <Button variant="secondary" onClick={() => setRoleModal('new')}>
              + Роль
            </Button>
            <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={changed.length === 0}>
              Хадгалах{changed.length > 0 ? ` (${changed.length})` : ''}
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
                  <th className="text-left font-medium text-gray-600 px-3 py-2 min-w-[16rem]">Эрх</th>
                  {roles.data.map((r) => (
                    <th key={r.id} className="px-2 py-2 text-center font-medium text-gray-700 min-w-[7rem]">
                      <div>{r.name}</div>
                      <div className="text-[11px] font-normal text-gray-400">{r.userCount} хэрэглэгч</div>
                      <div className="mt-1 space-x-2">
                        <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setRoleModal(r)}>
                          Засах
                        </button>
                        {!r.isSystem && (
                          <button type="button" className="text-[11px] text-red-600 hover:underline" onClick={() => setDeleting(r)}>
                            Устгах
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
                      <div className="text-gray-900">{p.name}</div>
                      <div className="text-[11px] font-mono text-gray-400">{p.code}</div>
                    </td>
                    {roles.data.map((r) => (
                      <td key={r.id} className={`text-center ${draft[r.id] ? 'bg-blue-50/40' : ''}`}>
                        <input
                          type="checkbox"
                          aria-label={`${r.name}: ${p.name}`}
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
              Хадгалаагүй өөрчлөлт: {changed.map((r) => r.name).join(', ')}
              <Button variant="ghost" onClick={() => setDraft({})}>
                Буцаах
              </Button>
            </div>
          )}
        </Card>
      )}
      {roleModal && <RoleModal role={roleModal === 'new' ? null : roleModal} onClose={() => setRoleModal(null)} />}
      {deleting && <DeleteRoleModal role={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

function RoleModal({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const m = useCampMutation(
    () =>
      role
        ? campApi.updateRole(role.id, { name: name.trim(), description: description.trim() || null })
        : campApi.createRole({ name: name.trim(), description: description.trim() || null, permissionCodes: [] }),
    [campKeys.roles],
    onClose,
  )
  return (
    <Modal
      title={role ? 'Роль засах' : 'Роль нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim()}>
            Хадгалах
          </Button>
        </>
      }
    >
      {role?.isSystem && role.systemCode && <Badge tone="blue">{SYSTEM_ROLE_LABEL[role.systemCode] ?? 'Системийн роль'}</Badge>}
      <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
      <Field label="Тайлбар">{(id) => <input id={id} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}</Field>
      {!role && <p className="text-xs text-gray-500">Эрхийг матриц дээр сонгоод "Хадгалах" дарна.</p>}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function DeleteRoleModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const m = useCampMutation(() => campApi.deleteRole(role.id), [campKeys.roles, campKeys.all], onClose)
  return (
    <Modal
      title="Роль устгах"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button variant="danger" onClick={() => m.mutate(undefined)} loading={m.isPending}>
            Устгах
          </Button>
        </>
      }
    >
      <p className="text-sm">
        "{role.name}" ролийг устгах уу?{role.userCount > 0 && ` ${role.userCount} хэрэглэгчээс энэ роль хасагдана.`}
      </p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
