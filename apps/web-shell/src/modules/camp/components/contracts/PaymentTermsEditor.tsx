import { useTranslation } from 'react-i18next'
import type { PaymentTerm, PaymentTermRule } from '../../api/contract-types'
import { paymentTermsPercentTotal } from '../../lib/contract'
import { Button, Field, inputCls } from '../ui'

const RULES: PaymentTermRule[] = ['AFTER_INVOICE_WORKDAYS', 'AFTER_INVOICE_DAYS', 'AFTER_MONTHS']

export default function PaymentTermsEditor({ value, onChange }: { value: PaymentTerm[]; onChange: (terms: PaymentTerm[]) => void }) {
  const { t } = useTranslation()
  const total = paymentTermsPercentTotal(value)

  const update = (index: number, patch: Partial<PaymentTerm>) => {
    onChange(value.map((term, i) => (i === index ? { ...term, ...patch } : term)))
  }

  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-xs font-medium text-gray-600">{t('camp.ct.payment_terms')}</legend>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${total === 100 ? 'text-green-700' : 'text-amber-700'}`}>
            {t('camp.ct.payment_terms_total', { total: total.toFixed(2) })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange([...value, { percent: 0, rule: 'AFTER_INVOICE_DAYS', n: 0, note: null }])}
          >
            {t('camp.ct.add_term')}
          </Button>
        </div>
      </div>
      {value.length === 0 && <p className="text-xs text-gray-400">{t('camp.ct.no_payment_terms')}</p>}
      {value.map((term, index) => (
        <div key={index} className="grid grid-cols-2 md:grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] items-end gap-2 rounded-lg border border-gray-100 p-2">
          <Field label={t('camp.ct.percent')}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={inputCls}
                value={term.percent}
                onChange={(e) => update(index, { percent: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t('camp.ct.term_rule')}>
            {(id) => (
              <select id={id} className={inputCls} value={term.rule} onChange={(e) => update(index, { rule: e.target.value as PaymentTermRule })}>
                {RULES.map((rule) => <option key={rule} value={rule}>{t(`camp.ct.term_rule.${rule}`, { n: 'N' })}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('camp.ct.term_n')}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                className={inputCls}
                value={term.n || ''}
                onChange={(e) => update(index, { n: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label={t('camp.ct.term_note')}>
            {(id) => (
              <input
                id={id}
                className={inputCls}
                value={term.note ?? ''}
                onChange={(e) => update(index, { note: e.target.value || null })}
                maxLength={300}
              />
            )}
          </Field>
          <Button variant="ghost" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t('camp.ct.remove_term')}>
            {t('camp.ct.remove')}
          </Button>
        </div>
      ))}
    </fieldset>
  )
}
