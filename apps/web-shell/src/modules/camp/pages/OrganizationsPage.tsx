import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campApi, type OrganizationInput } from '../api/camp-api'
import type { Organization, OrganizationServiceType, OrgServiceType, OrgType } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { ORG_SERVICE_LABEL, ORG_TYPE_LABEL } from '../../../core/labels'
import { ActiveBadge, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../../../core/ui'
import { useTranslation } from 'react-i18next'

const ORG_TYPES = Object.keys(ORG_TYPE_LABEL) as OrgType[]

/** /camp/admin/organizations — tenant түвшин (бүх кемпэд үйлчилнэ). Бичих: бүх кемпийн master.manage */
export default function OrganizationsPage() {
  const { t, i18n } = useTranslation()
  const perms = useAppPermissions()
  const [showInactive, setShowInactive] = useState(false)
  const orgs = useQuery({ queryKey: [...campKeys.organizations, showInactive], queryFn: () => campApi.organizations({ activeOnly: !showInactive }) })
  const serviceTypes = useQuery({ queryKey: [...campKeys.organizations, 'service-types'], queryFn: campApi.organizationServiceTypes })
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const serviceLabel = (code: OrgServiceType) => organizationServiceLabel(serviceTypes.data ?? [], code, i18n.resolvedLanguage ?? i18n.language)

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('camp.org.title')}
        subtitle={t('camp.org.subtitle')}
        actions={canEdit && <Button onClick={() => setEditing('new')}>{t('camp.org.add')}</Button>}
      />
      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('camp.org.show_inactive')}
      </label>
      <Card>
        {orgs.isLoading && <Loading />}
        <ErrorBox error={orgs.error} onRetry={() => orgs.refetch()} />
        {orgs.data && orgs.data.length === 0 && <Empty>{t('camp.org.empty')}</Empty>}
        {orgs.data && orgs.data.length > 0 && (
          <Table head={[t('camp.common.name'), t('camp.org.type'), t('camp.org.services'), t('camp.org.contact'), t('camp.common.status'), '']}>
            {orgs.data.map((o) => (
              <tr key={o.id}>
                <td className={td}>
                  <div className="font-medium text-gray-900">{o.name}</div>
                  {o.regNumber && <div className="text-xs text-gray-400">{t('camp.org.reg_short', { reg: o.regNumber })}</div>}
                </td>
                <td className={td}>{ORG_TYPE_LABEL[o.orgType]}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {o.serviceTypes.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      o.serviceTypes.map((s) => (
                        <Badge key={s} tone={s === 'CATERING' ? 'blue' : 'gray'}>
                          {serviceLabel(s)}
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
                      {t('camp.common.edit')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <ErrorBox error={serviceTypes.error} onRetry={() => serviceTypes.refetch()} />
      {editing && <OrgModal org={editing === 'new' ? null : editing} serviceTypes={serviceTypes.data ?? []} language={i18n.resolvedLanguage ?? i18n.language} onClose={() => setEditing(null)} />}
    </div>
  )
}

function organizationServiceLabel(catalog: OrganizationServiceType[], code: OrgServiceType, language: string) {
  const item = catalog.find((service) => service.code === code)
  if (!item) return ORG_SERVICE_LABEL[code] ?? code
  const lang = language.split('-')[0]
  return (lang === 'en' ? item.nameEn : lang === 'zh' ? item.nameZh : null) || item.nameMn || code
}

function OrgModal({ org, serviceTypes, language, onClose }: {
  org: Organization | null
  serviceTypes: OrganizationServiceType[]
  language: string
  onClose: () => void
}) {
  const { t } = useTranslation()
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
  const m = useAppMutation(
    () => (org ? campApi.updateOrganization(org.id, { ...body(), isActive: f.isActive }) : campApi.createOrganization(body())),
    [campKeys.organizations],
    onClose,
  )

  return (
    <Modal
      title={org ? t('camp.org.edit_title') : t('camp.org.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.name.trim()}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.org.reg')}>
          {(id) => <input id={id} className={inputCls} value={f.regNumber ?? ''} onChange={(e) => set('regNumber', e.target.value)} maxLength={30} />}
        </Field>
        <Field label={t('camp.org.type')}>
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
        <legend className="block text-xs font-medium text-gray-600 mb-1">{t('camp.org.service_types')}</legend>
        <div className="grid grid-cols-2 gap-1">
          {serviceTypes.map((service) => (
            <label key={service.code} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.serviceTypes?.includes(service.code) ?? false}
                disabled={!service.isActive && !(f.serviceTypes?.includes(service.code) ?? false)}
                onChange={() => toggleService(service.code)}
              />
              {organizationServiceLabel(serviceTypes, service.code, language)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.org.contact_name')}>
          {(id) => <input id={id} className={inputCls} value={f.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} maxLength={200} />}
        </Field>
        <Field label={t('camp.emp.col.phone')}>{(id) => <input id={id} className={inputCls} value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} maxLength={50} />}</Field>
        <Field label={t('auth.email')}>
          {(id) => <input id={id} type="email" className={inputCls} value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} maxLength={200} />}
        </Field>
      </div>
      {org && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> {t('camp.common.active')}
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
