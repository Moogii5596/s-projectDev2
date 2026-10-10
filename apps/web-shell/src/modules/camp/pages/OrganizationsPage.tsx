import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi, type OrganizationInput } from '../api/camp-api'
import type { Organization, OrgServiceType, OrgType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { ORG_SERVICE_LABEL, ORG_TYPE_LABEL } from '../lib/labels'
import { ActiveBadge, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../components/ui'

const SERVICES = Object.keys(ORG_SERVICE_LABEL) as OrgServiceType[]
const ORG_TYPES = Object.keys(ORG_TYPE_LABEL) as OrgType[]

/** /camp/admin/organizations — tenant түвшин (бүх кемпэд үйлчилнэ). Бичих: бүх кемпийн master.manage */
export default function OrganizationsPage() {
  const perms = useCampPermissions()
  const [showInactive, setShowInactive] = useState(false)
  const orgs = useQuery({ queryKey: [...campKeys.organizations, showInactive], queryFn: () => campApi.organizations({ activeOnly: !showInactive }) })
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        <Link to="/camp" className="hover:text-blue-600">
          Кемпүүд
        </Link>{' '}
        / Байгууллагууд
      </div>
      <PageHeader
        title="Байгууллагууд"
        subtitle="Үйлчилгээний төрөл: катеринг (кемпийн тохиргоонд сонгогдоно), хог/бохир ус тээвэрлэгч, хүлээн авах цэг"
        actions={canEdit && <Button onClick={() => setEditing('new')}>+ Байгууллага нэмэх</Button>}
      />
      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Идэвхгүйг харуулах
      </label>
      <Card>
        {orgs.isLoading && <Loading />}
        <ErrorBox error={orgs.error} onRetry={() => orgs.refetch()} />
        {orgs.data && orgs.data.length === 0 && <Empty>Байгууллага бүртгэгдээгүй</Empty>}
        {orgs.data && orgs.data.length > 0 && (
          <Table head={['Нэр', 'Төрөл', 'Үйлчилгээ', 'Холбоо барих', 'Төлөв', '']}>
            {orgs.data.map((o) => (
              <tr key={o.id}>
                <td className={td}>
                  <div className="font-medium text-gray-900">{o.name}</div>
                  {o.regNumber && <div className="text-xs text-gray-400">РД {o.regNumber}</div>}
                </td>
                <td className={td}>{ORG_TYPE_LABEL[o.orgType]}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {o.serviceTypes.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      o.serviceTypes.map((s) => (
                        <Badge key={s} tone={s === 'CATERING' ? 'blue' : 'gray'}>
                          {ORG_SERVICE_LABEL[s]}
                        </Badge>
                      ))
                    )}
                  </div>
                </td>
                <td className={`${td} text-gray-600`}>{[o.contactName, o.phone, o.email].filter(Boolean).join(' · ') || '—'}</td>
                <td className={td}>
                  <ActiveBadge active={o.isActive} />
                </td>
                <td className={`${td} text-right`}>
                  {canEdit && (
                    <Button variant="ghost" onClick={() => setEditing(o)}>
                      Засах
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <OrgModal org={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function OrgModal({ org, onClose }: { org: Organization | null; onClose: () => void }) {
  const [f, setF] = useState<OrganizationInput & { isActive: boolean }>({
    name: org?.name ?? '',
    regNumber: org?.regNumber ?? '',
    orgType: org?.orgType ?? 'CONTRACTOR',
    serviceTypes: org?.serviceTypes ?? [],
    contactName: org?.contactName ?? '',
    phone: org?.phone ?? '',
    email: org?.email ?? '',
    isActive: org?.isActive ?? true,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const toggleService = (s: OrgServiceType) =>
    set('serviceTypes', f.serviceTypes?.includes(s) ? f.serviceTypes.filter((x) => x !== s) : [...(f.serviceTypes ?? []), s])

  const body = () => ({
    name: f.name.trim(),
    regNumber: f.regNumber?.trim() || null,
    orgType: f.orgType,
    serviceTypes: f.serviceTypes,
    contactName: f.contactName?.trim() || null,
    phone: f.phone?.trim() || null,
    email: f.email?.trim() || null,
  })
  const m = useCampMutation(
    () => (org ? campApi.updateOrganization(org.id, { ...body(), isActive: f.isActive }) : campApi.createOrganization(body())),
    [campKeys.organizations],
    onClose,
  )

  return (
    <Modal
      title={org ? 'Байгууллага засах' : 'Байгууллага нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.name.trim()}>
            Хадгалах
          </Button>
        </>
      }
    >
      <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Регистрийн дугаар">
          {(id) => <input id={id} className={inputCls} value={f.regNumber ?? ''} onChange={(e) => set('regNumber', e.target.value)} maxLength={30} />}
        </Field>
        <Field label="Төрөл">
          {(id) => (
            <select id={id} className={inputCls} value={f.orgType} onChange={(e) => set('orgType', e.target.value as OrgType)}>
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORG_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="block text-xs font-medium text-gray-600 mb-1">Үйлчилгээний төрөл (олныг сонгож болно)</legend>
        <div className="grid grid-cols-2 gap-1">
          {SERVICES.map((s) => (
            <label key={s} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.serviceTypes?.includes(s) ?? false} onChange={() => toggleService(s)} /> {ORG_SERVICE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Холбоо барих хүн">
          {(id) => <input id={id} className={inputCls} value={f.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} maxLength={200} />}
        </Field>
        <Field label="Утас">{(id) => <input id={id} className={inputCls} value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} maxLength={50} />}</Field>
        <Field label="И-мэйл">
          {(id) => <input id={id} type="email" className={inputCls} value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} maxLength={200} />}
        </Field>
      </div>
      {org && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Идэвхтэй
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
