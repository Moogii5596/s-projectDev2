import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { contractApi, type ExchangeRateInput } from '../api/contract-api'
import { Button, Card, Empty, ErrorBox, Field, Loading, Modal, NoAccess, PageHeader, Table, inputCls, td } from '../../../core/ui'
import { useAppMutation } from '../../../core/useAppMutation'
import { useAppPermissions } from '../../../core/useAppPermissions'
import { todayUb } from '../../../core/dates'
import { canInAnyCamp, P } from '../../../core/permissions'

const exchangeRatesKey = ['camp', 'exchange-rates'] as const

export default function ExchangeRatesPage() {
  const { t } = useTranslation()
  const permissions = useAppPermissions()
  const canManage = canInAnyCamp(permissions.data, P.CONTRACT_MANAGE)
  const [filters, setFilters] = useState({ from: '', to: '', currency: '' })
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ExchangeRateInput>({ rateDate: todayUb(), baseCurrency: '', quoteCurrency: '', rate: '', sourceNote: '' })
  const query = { from: filters.from || undefined, to: filters.to || undefined, currency: filters.currency || undefined }
  const rates = useQuery({
    queryKey: [...exchangeRatesKey, query],
    queryFn: () => contractApi.exchangeRates(query),
    enabled: canManage,
  })
  const save = useAppMutation(
    (input: ExchangeRateInput) => contractApi.upsertExchangeRate({
      ...input,
      baseCurrency: input.baseCurrency.trim().toUpperCase(),
      quoteCurrency: input.quoteCurrency.trim().toUpperCase(),
      rate: input.rate.trim(),
      sourceNote: input.sourceNote?.trim() || null,
    }),
    [exchangeRatesKey],
    () => setAdding(false),
  )
  const remove = useAppMutation((id: string) => contractApi.removeExchangeRate(id), [exchangeRatesKey])
  const set = <K extends keyof ExchangeRateInput>(key: K, value: ExchangeRateInput[K]) => setForm((old) => ({ ...old, [key]: value }))

  if (permissions.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.ct.exchange_rates_title')} />

  return (
    <div className="space-y-4">
      <PageHeader title={t('camp.ct.exchange_rates_title')} actions={<Button onClick={() => setAdding(true)}>{t('camp.ct.add_exchange_rate')}</Button>} />
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Field label={t('camp.ct.from_date')}>{(id) => <input id={id} type="date" className={inputCls} value={filters.from} onChange={(e) => setFilters((old) => ({ ...old, from: e.target.value }))} />}</Field>
          <Field label={t('camp.ct.to_date')}>{(id) => <input id={id} type="date" className={inputCls} value={filters.to} onChange={(e) => setFilters((old) => ({ ...old, to: e.target.value }))} />}</Field>
          <Field label={t('camp.ct.currency_filter')}>{(id) => <input id={id} className={inputCls} value={filters.currency} onChange={(e) => setFilters((old) => ({ ...old, currency: e.target.value.toUpperCase() }))} maxLength={3} />}</Field>
        </div>
        {rates.isLoading && <Loading />}
        <ErrorBox error={rates.error} onRetry={() => rates.refetch()} />
        {rates.data && rates.data.length === 0 && <Empty>{t('camp.ct.no_exchange_rates')}</Empty>}
        {rates.data && rates.data.length > 0 && (
          <Table head={[t('camp.ct.rate_date'), t('camp.ct.base_currency'), t('camp.ct.quote_currency'), t('camp.ct.exchange_rate'), t('camp.ct.source_note'), '']}>
            {rates.data.map((rate) => (
              <tr key={rate.id}>
                <td className={td}>{rate.rateDate}</td>
                <td className={td}>{rate.baseCurrency}</td>
                <td className={td}>{rate.quoteCurrency}</td>
                <td className={td}>{rate.rate}</td>
                <td className={td}>{rate.sourceNote || '—'}</td>
                <td className={`${td} text-right`}>
                  <Button
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(t('camp.ct.confirm_delete_exchange_rate')) && remove.mutate(rate.id)}
                  >
                    {t('camp.ct.remove')}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <ErrorBox error={remove.error} />
      </Card>
      {adding && (
        <Modal title={t('camp.ct.add_exchange_rate')} onClose={() => setAdding(false)} footer={
          <><Button variant="secondary" onClick={() => setAdding(false)}>{t('camp.common.cancel')}</Button>
            <Button
              loading={save.isPending}
              disabled={!form.rateDate || !form.baseCurrency.trim() || !form.quoteCurrency.trim() || !form.rate.trim() || Number(form.rate) <= 0}
              onClick={() => save.mutate(form)}
            >
              {t('camp.common.save')}
            </Button></>
        }>
          <Field label={t('camp.ct.rate_date')}>{(id) => <input id={id} type="date" className={inputCls} value={form.rateDate} onChange={(e) => set('rateDate', e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('camp.ct.base_currency')}>{(id) => <input id={id} className={inputCls} value={form.baseCurrency} onChange={(e) => set('baseCurrency', e.target.value.toUpperCase())} maxLength={3} />}</Field>
            <Field label={t('camp.ct.quote_currency')}>{(id) => <input id={id} className={inputCls} value={form.quoteCurrency} onChange={(e) => set('quoteCurrency', e.target.value.toUpperCase())} maxLength={3} />}</Field>
          </div>
          <Field label={t('camp.ct.exchange_rate')}>{(id) => <input id={id} type="number" min="0.00000001" step="any" className={inputCls} value={form.rate} onChange={(e) => set('rate', e.target.value)} />}</Field>
          <Field label={t('camp.ct.source_note')}>{(id) => <input id={id} className={inputCls} value={form.sourceNote ?? ''} onChange={(e) => set('sourceNote', e.target.value || null)} maxLength={300} />}</Field>
          <p className="text-xs text-gray-500">{t('camp.ct.upsert_hint')}</p>
          <ErrorBox error={save.error} />
        </Modal>
      )}
    </div>
  )
}
