import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { contractApi, type ServiceTypeInput, type UnitInput } from '../api/contract-api'
import { QUANTITY_SOURCES, type QuantitySource, type ServiceTypeView, type UnitView } from '../api/contract-types'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, NoAccess, PageHeader, Table, inputCls, td } from '../../../core/ui'
import { useAppMutation } from '../../../core/useAppMutation'
import { useAppPermissions } from '../../../core/useAppPermissions'
import { contractCatalogName } from '../lib/contract'
import { canInAnyCamp, P } from '../../../core/permissions'

const catalogKey = ['camp', 'contract-catalog'] as const

export default function ContractCatalogPage() {
  const { t, i18n } = useTranslation()
  const permissions = useAppPermissions()
  const canManage = canInAnyCamp(permissions.data, P.CONTRACT_MANAGE)
  const catalog = useQuery({ queryKey: catalogKey, queryFn: contractApi.catalog, enabled: canManage })
  const [unitDialog, setUnitDialog] = useState<UnitView | 'new' | null>(null)
  const [serviceDialog, setServiceDialog] = useState<ServiceTypeView | 'new' | null>(null)

  const saveUnit = useAppMutation(
    (input: { existing: UnitView | null; value: UnitInput }) => {
      if (!input.existing) return contractApi.createUnit(input.value)
      const patch = {
        nameMn: input.value.nameMn,
        nameEn: input.value.nameEn,
        nameZh: input.value.nameZh,
        decimals: input.value.decimals,
        sortOrder: input.value.sortOrder,
      }
      return contractApi.updateUnit(input.existing.id, patch)
    },
    [catalogKey],
    () => setUnitDialog(null),
  )
  const toggleUnit = useAppMutation(
    (unit: UnitView) => contractApi.updateUnit(unit.id, { isActive: !unit.isActive }),
    [catalogKey],
  )
  const saveService = useAppMutation(
    (input: { existing: ServiceTypeView | null; value: ServiceTypeInput }) => {
      if (!input.existing) return contractApi.createServiceType(input.value)
      const patch = {
        nameMn: input.value.nameMn,
        nameEn: input.value.nameEn,
        nameZh: input.value.nameZh,
        quantitySource: input.value.quantitySource,
        defaultUnitId: input.value.defaultUnitId,
        sortOrder: input.value.sortOrder,
      }
      return contractApi.updateServiceType(input.existing.id, patch)
    },
    [catalogKey],
    () => setServiceDialog(null),
  )
  const toggleService = useAppMutation(
    (service: ServiceTypeView) => contractApi.updateServiceType(service.id, { isActive: !service.isActive }),
    [catalogKey],
  )

  if (permissions.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.ct.catalog_title')} />

  return (
    <div className="space-y-4">
      <PageHeader title={t('camp.ct.catalog_title')} />
      <Card title={t('camp.ct.units')} actions={<Button size="sm" onClick={() => setUnitDialog('new')}>{t('camp.ct.add_unit')}</Button>}>
        {catalog.isLoading && <Loading />}
        <ErrorBox error={catalog.error} onRetry={() => catalog.refetch()} />
        {catalog.data && catalog.data.units.length === 0 && <Empty>{t('camp.ct.no_units')}</Empty>}
        {catalog.data && catalog.data.units.length > 0 && (
          <Table head={[t('camp.common.code'), t('camp.common.name'), t('camp.ct.decimals'), t('camp.common.status'), '']}>
            {catalog.data.units.map((unit) => (
              <tr key={unit.id}>
                <td className={td}>{unit.code}</td>
                <td className={td}>{contractCatalogName(unit, i18n.resolvedLanguage ?? i18n.language)}</td>
                <td className={td}>{unit.decimals}</td>
                <td className={td}><ActiveBadge active={unit.isActive} /></td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Button variant="ghost" onClick={() => setUnitDialog(unit)}>{t('camp.common.edit')}</Button>
                  <Button variant="ghost" disabled={toggleUnit.isPending} onClick={() => toggleUnit.mutate(unit)}>
                    {unit.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <ErrorBox error={saveUnit.error ?? toggleUnit.error} />
      </Card>
      <Card title={t('camp.ct.service_types')} actions={<Button size="sm" onClick={() => setServiceDialog('new')}>{t('camp.ct.add_service_type')}</Button>}>
        {catalog.data && catalog.data.serviceTypes.length === 0 && <Empty>{t('camp.ct.no_service_types')}</Empty>}
        {catalog.data && catalog.data.serviceTypes.length > 0 && (
          <Table head={[t('camp.common.code'), t('camp.common.name'), t('camp.ct.quantity_source'), t('camp.ct.default_unit'), t('camp.common.status'), '']}>
            {catalog.data.serviceTypes.map((service) => (
              <tr key={service.id}>
                <td className={td}>{service.code}</td>
                <td className={td}>{contractCatalogName(service, i18n.resolvedLanguage ?? i18n.language)}</td>
                <td className={td}>{t(`camp.ct.quantity_source.${service.quantitySource}`)}</td>
                <td className={td}>{catalog.data?.units.find((unit) => unit.id === service.defaultUnitId)?.code ?? '—'}</td>
                <td className={td}><ActiveBadge active={service.isActive} /></td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  <Button variant="ghost" onClick={() => setServiceDialog(service)}>{t('camp.common.edit')}</Button>
                  <Button variant="ghost" disabled={toggleService.isPending} onClick={() => toggleService.mutate(service)}>
                    {service.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <ErrorBox error={saveService.error ?? toggleService.error} />
      </Card>
      {unitDialog && (
        <UnitModal
          unit={unitDialog === 'new' ? null : unitDialog}
          busy={saveUnit.isPending}
          error={saveUnit.error}
          onClose={() => setUnitDialog(null)}
          onSave={(value) => saveUnit.mutate({ existing: unitDialog === 'new' ? null : unitDialog, value })}
        />
      )}
      {serviceDialog && catalog.data && (
        <ServiceTypeModal
          service={serviceDialog === 'new' ? null : serviceDialog}
          units={catalog.data.units}
          busy={saveService.isPending}
          error={saveService.error}
          onClose={() => setServiceDialog(null)}
          onSave={(value) => saveService.mutate({ existing: serviceDialog === 'new' ? null : serviceDialog, value })}
        />
      )}
    </div>
  )
}

function UnitModal({ unit, busy, error, onClose, onSave }: {
  unit: UnitView | null
  busy: boolean
  error?: unknown
  onClose: () => void
  onSave: (value: UnitInput) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<UnitInput>({
    code: unit?.code ?? '',
    nameMn: unit?.nameMn ?? '',
    nameEn: unit?.nameEn ?? '',
    nameZh: unit?.nameZh ?? '',
    decimals: unit?.decimals ?? 0,
    sortOrder: unit?.sortOrder ?? 0,
  })
  const set = <K extends keyof UnitInput>(key: K, next: UnitInput[K]) => setValue((old) => ({ ...old, [key]: next }))
  return (
    <Modal title={unit ? t('camp.ct.edit_unit') : t('camp.ct.add_unit')} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
        <Button loading={busy} disabled={!value.code.trim() || !value.nameMn.trim()} onClick={() => onSave(value)}>{t('camp.common.save')}</Button></>
    }>
      <Field label={t('camp.common.code')}>{(id) => <input id={id} className={inputCls} value={value.code} disabled={!!unit} onChange={(e) => set('code', e.target.value)} maxLength={50} />}</Field>
      <CatalogNameFields value={value} set={set} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.ct.decimals')}>{(id) => <input id={id} type="number" min={0} max={6} className={inputCls} value={value.decimals ?? 0} onChange={(e) => set('decimals', Number(e.target.value))} />}</Field>
        <Field label={t('camp.ct.sort_order')}>{(id) => <input id={id} type="number" className={inputCls} value={value.sortOrder ?? 0} onChange={(e) => set('sortOrder', Number(e.target.value))} />}</Field>
      </div>
      <ErrorBox error={error} />
    </Modal>
  )
}

function ServiceTypeModal({ service, units, busy, error, onClose, onSave }: {
  service: ServiceTypeView | null
  units: UnitView[]
  busy: boolean
  error?: unknown
  onClose: () => void
  onSave: (value: ServiceTypeInput) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<ServiceTypeInput>({
    code: service?.code ?? '',
    nameMn: service?.nameMn ?? '',
    nameEn: service?.nameEn ?? '',
    nameZh: service?.nameZh ?? '',
    quantitySource: service?.quantitySource ?? 'MANUAL',
    defaultUnitId: service?.defaultUnitId ?? null,
    sortOrder: service?.sortOrder ?? 0,
  })
  const set = <K extends keyof ServiceTypeInput>(key: K, next: ServiceTypeInput[K]) => setValue((old) => ({ ...old, [key]: next }))
  return (
    <Modal title={service ? t('camp.ct.edit_service_type') : t('camp.ct.add_service_type')} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
        <Button loading={busy} disabled={!value.code.trim() || !value.nameMn.trim()} onClick={() => onSave(value)}>{t('camp.common.save')}</Button></>
    }>
      <Field label={t('camp.common.code')}>{(id) => <input id={id} className={inputCls} value={value.code} disabled={!!service} onChange={(e) => set('code', e.target.value)} maxLength={50} />}</Field>
      <CatalogNameFields value={value} set={set} />
      <Field label={t('camp.ct.quantity_source')}>
        {(id) => <select id={id} className={inputCls} value={value.quantitySource} onChange={(e) => set('quantitySource', e.target.value as QuantitySource)}>
          {QUANTITY_SOURCES.map((source) => <option key={source} value={source}>{t(`camp.ct.quantity_source.${source}`)}</option>)}
        </select>}
      </Field>
      <Field label={t('camp.ct.default_unit')}>
        {(id) => <select id={id} className={inputCls} value={value.defaultUnitId ?? ''} onChange={(e) => set('defaultUnitId', e.target.value || null)}>
          <option value="">{t('camp.ct.no_default_unit')}</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.nameMn}</option>)}
        </select>}
      </Field>
      <Field label={t('camp.ct.sort_order')}>{(id) => <input id={id} type="number" className={inputCls} value={value.sortOrder ?? 0} onChange={(e) => set('sortOrder', Number(e.target.value))} />}</Field>
      <ErrorBox error={error} />
    </Modal>
  )
}

function CatalogNameFields<T extends UnitInput | ServiceTypeInput>({ value, set }: {
  value: T
  set: <K extends keyof T>(key: K, next: T[K]) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('camp.ct.name_mn')}>{(id) => <input id={id} className={inputCls} value={value.nameMn} onChange={(e) => set('nameMn', e.target.value)} maxLength={200} />}</Field>
      <Field label={t('camp.ct.name_en')}>{(id) => <input id={id} className={inputCls} value={value.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value || null)} maxLength={200} />}</Field>
      <Field label={t('camp.ct.name_zh')}>{(id) => <input id={id} className={inputCls} value={value.nameZh ?? ''} onChange={(e) => set('nameZh', e.target.value || null)} maxLength={200} />}</Field>
    </>
  )
}
