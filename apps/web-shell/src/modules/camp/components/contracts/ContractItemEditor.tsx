import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContractItemInput } from '../../api/contract-api'
import type { ContractItemView, ContractMealType, ContractCatalogView, QuantityRule } from '../../api/contract-types'
import { contractCatalogName } from '../../lib/contract'
import { Button, ErrorBox, Field, Modal, inputCls } from '../ui'

const MEAL_TYPES: ContractMealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT']
const RULES: QuantityRule[] = ['TOTAL_DIV_N', 'MEAL_TYPE']

export default function ContractItemEditor({
  catalog,
  item,
  saving,
  error,
  onSave,
  onClose,
}: {
  catalog: ContractCatalogView
  item: ContractItemView | null
  saving: boolean
  error?: unknown
  onSave: (input: ContractItemInput) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [serviceTypeId, setServiceTypeId] = useState(item?.serviceTypeId ?? catalog.serviceTypes.find((service) => service.isActive)?.id ?? '')
  const [unitId, setUnitId] = useState(item?.unitId ?? catalog.serviceTypes.find((service) => service.id === serviceTypeId)?.defaultUnitId ?? '')
  const [quantityRule, setQuantityRule] = useState<QuantityRule>(item?.quantityRule ?? 'TOTAL_DIV_N')
  const [quantityDivisor, setQuantityDivisor] = useState(item?.quantityDivisor ?? '')
  const [mealType, setMealType] = useState<ContractMealType>(item?.mealType ?? 'LUNCH')
  const [description, setDescription] = useState(item?.description ?? '')
  const selectedService = catalog.serviceTypes.find((service) => service.id === serviceTypeId)
  const isMealService = selectedService?.quantitySource === 'MEAL_ORDER'
  const availableServices = catalog.serviceTypes.filter((service) => service.isActive || service.id === item?.serviceTypeId)
  const availableUnits = catalog.units.filter((unit) => unit.isActive || unit.id === item?.unitId || unit.id === selectedService?.defaultUnitId)

  const submit = () => {
    onSave({
      serviceTypeId,
      ...(unitId ? { unitId } : selectedService?.defaultUnitId ? { unitId: selectedService.defaultUnitId } : {}),
      quantityRule: isMealService ? quantityRule : null,
      quantityDivisor: isMealService && quantityRule === 'TOTAL_DIV_N' ? quantityDivisor : null,
      mealType: isMealService && quantityRule === 'MEAL_TYPE' ? mealType : null,
      description: description.trim() || null,
    })
  }

  return (
    <Modal
      title={item ? t('camp.ct.edit_item') : t('camp.ct.add_item')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
          <Button
            loading={saving}
            disabled={!serviceTypeId || (isMealService && quantityRule === 'TOTAL_DIV_N' && (!quantityDivisor || Number(quantityDivisor) < 1))}
            onClick={submit}
          >
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.ct.service_type')}>
        {(id) => (
          <select
            id={id}
            className={inputCls}
            value={serviceTypeId}
            disabled={!!item}
            onChange={(e) => {
              const next = catalog.serviceTypes.find((service) => service.id === e.target.value)
              setServiceTypeId(e.target.value)
              setUnitId(next?.defaultUnitId ?? '')
            }}
          >
            <option value="">{t('camp.ct.select_service_type')}</option>
            {availableServices.map((service) => <option key={service.id} value={service.id}>{service.code} · {contractCatalogName(service, i18n.resolvedLanguage ?? i18n.language)}</option>)}
          </select>
        )}
      </Field>
      <Field label={t('camp.ct.unit')}>
        {(id) => (
          <select id={id} className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">{t('camp.ct.use_default_unit')}</option>
            {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {contractCatalogName(unit, i18n.resolvedLanguage ?? i18n.language)}</option>)}
          </select>
        )}
      </Field>
      {isMealService && (
        <>
          <Field label={t('camp.ct.quantity_rule')}>
            {(id) => (
              <select id={id} className={inputCls} value={quantityRule} onChange={(e) => setQuantityRule(e.target.value as QuantityRule)}>
                {RULES.map((rule) => <option key={rule} value={rule}>{t(`camp.ct.quantity_rule.${rule}`)}</option>)}
              </select>
            )}
          </Field>
          {quantityRule === 'TOTAL_DIV_N' ? (
            <Field label={t('camp.ct.quantity_divisor')}>
              {(id) => <input id={id} type="number" min={1} step="1" className={inputCls} value={quantityDivisor} onChange={(e) => setQuantityDivisor(e.target.value)} />}
            </Field>
          ) : (
            <Field label={t('camp.ct.meal_type')}>
              {(id) => (
                <select id={id} className={inputCls} value={mealType} onChange={(e) => setMealType(e.target.value as ContractMealType)}>
                  {MEAL_TYPES.map((meal) => <option key={meal} value={meal}>{t(`camp.ct.meal_type.${meal}`)}</option>)}
                </select>
              )}
            </Field>
          )}
        </>
      )}
      <Field label={t('camp.ct.description')}>
        {(id) => <textarea id={id} className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />}
      </Field>
      <ErrorBox error={error} />
    </Modal>
  )
}
