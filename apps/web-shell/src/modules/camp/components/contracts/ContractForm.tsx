import type { Organization } from '../../api/types'
import type { ContractInput } from '../../api/contract-api'
import type { RatePolicy } from '../../api/contract-types'
import { Button, ErrorBox, Field, inputCls } from '../ui'
import PaymentTermsEditor from './PaymentTermsEditor'
import { useTranslation } from 'react-i18next'
import { paymentTermsPercentTotal } from '../../lib/contract'

export interface ContractFormLocks {
  contractNo?: boolean
  organizationId?: boolean
  currency?: boolean
  dates?: boolean
}

export default function ContractForm({
  value,
  onChange,
  organizations,
  locks = {},
  saving,
  error,
  onSave,
  onCancel,
}: {
  value: ContractInput
  onChange: (next: ContractInput) => void
  organizations: Organization[]
  locks?: ContractFormLocks
  saving: boolean
  error?: unknown
  onSave: () => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const set = <K extends keyof ContractInput>(key: K, next: ContractInput[K]) => onChange({ ...value, [key]: next })
  const paymentTermsInvalid = value.paymentTerms?.some((term) => term.percent < 0 || term.percent > 100 || term.n < 1) ?? false

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('camp.ct.contract_no')}>
          {(id) => <input id={id} className={inputCls} value={value.contractNo} disabled={locks.contractNo} onChange={(e) => set('contractNo', e.target.value)} maxLength={100} />}
        </Field>
        <Field label={t('camp.ct.contract_title')}>
          {(id) => <input id={id} className={inputCls} value={value.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />}
        </Field>
        <Field label={t('camp.ct.organization')}>
          {(id) => (
            <select id={id} className={inputCls} value={value.organizationId} disabled={locks.organizationId} onChange={(e) => set('organizationId', e.target.value)}>
              <option value="">{t('camp.ct.select_organization')}</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('camp.ct.customer_organization')}>
          {(id) => (
            <select
              id={id}
              className={inputCls}
              value={value.customerOrganizationId ?? ''}
              onChange={(e) => set('customerOrganizationId', e.target.value || null)}
            >
              <option value="">{t('camp.ct.no_customer_organization')}</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('camp.ct.start_date')}>
          {(id) => <input id={id} type="date" className={inputCls} value={value.startDate} disabled={locks.dates} onChange={(e) => set('startDate', e.target.value)} />}
        </Field>
        <Field label={t('camp.ct.end_date')}>
          {(id) => <input id={id} type="date" className={inputCls} value={value.endDate ?? ''} disabled={locks.dates} onChange={(e) => set('endDate', e.target.value || null)} />}
        </Field>
        <Field label={t('camp.ct.currency')}>
          {(id) => <input id={id} className={inputCls} value={value.currency} disabled={locks.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={3} />}
        </Field>
        <Field label={t('camp.ct.payment_currency')}>
          {(id) => <input id={id} className={inputCls} value={value.paymentCurrency} onChange={(e) => set('paymentCurrency', e.target.value.toUpperCase())} maxLength={3} />}
        </Field>
        <Field label={t('camp.ct.vat_rate')}>
          {(id) => <input id={id} type="number" min={0} max={100} step="0.01" className={inputCls} value={value.vatRate} onChange={(e) => set('vatRate', e.target.value)} />}
        </Field>
        <Field label={t('camp.ct.rate_policy')}>
          {(id) => (
            <select id={id} className={inputCls} value={value.ratePolicy} onChange={(e) => set('ratePolicy', e.target.value as RatePolicy)}>
              {(['NONE', 'FIXED', 'MONTHLY_MANUAL'] as const).map((policy) => <option key={policy} value={policy}>{t(`camp.ct.rate_policy.${policy}`)}</option>)}
            </select>
          )}
        </Field>
        {value.ratePolicy === 'FIXED' && (
          <Field label={t('camp.ct.fixed_rate')}>
            {(id) => <input id={id} type="number" min={0} step="0.000001" className={inputCls} value={value.fixedRate ?? ''} onChange={(e) => set('fixedRate', e.target.value || null)} />}
          </Field>
        )}
      </div>
      <Field label={t('camp.ct.note')}>
        {(id) => <textarea id={id} className={inputCls} rows={2} value={value.note ?? ''} onChange={(e) => set('note', e.target.value || null)} maxLength={2000} />}
      </Field>
      <PaymentTermsEditor value={value.paymentTerms ?? []} onChange={(paymentTerms) => set('paymentTerms', paymentTerms)} />
      <ErrorBox error={error} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>{t('camp.common.cancel')}</Button>}
        <Button
          loading={saving}
          disabled={
            !value.contractNo.trim() ||
            !value.title.trim() ||
            !value.organizationId ||
            !value.startDate ||
            !value.currency.trim() ||
            !value.paymentCurrency.trim() ||
            paymentTermsInvalid ||
            ((value.paymentTerms?.length ?? 0) > 0 && paymentTermsPercentTotal(value.paymentTerms ?? []) !== 100)
          }
          onClick={onSave}
        >
          {t('camp.common.save')}
        </Button>
      </div>
    </div>
  )
}
