import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import {
  contractApi,
  type AmendmentInput,
  type ContractInput,
  type ContractItemInput,
  type ContractItemPatch,
  type ContractPatch,
  type PriceInput,
  type TerminateInput,
} from '../api/contract-api'
import type { ContractItemView, ContractView, ManualAmendmentType } from '../api/contract-types'
import ContractForm from '../components/contracts/ContractForm'
import ContractItemEditor from '../components/contracts/ContractItemEditor'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, NoAccess, PageHeader, Table, inputCls, td } from '../components/ui'
import { useCampMutation } from '../hooks/useCampMutation'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { contractCatalogName, contractStatusTone } from '../lib/contract'
import { todayUb } from '../lib/dates'
import { formatMoney } from '../lib/money'

const catalogKey = ['camp', 'contract-catalog'] as const
const contractListKey = (campId: string) => ['camp', campId, 'contracts'] as const
const contractDetailKey = (campId: string, contractId: string) => ['camp', campId, 'contracts', contractId] as const

function toContractInput(contract: ContractView): ContractInput {
  return {
    contractNo: contract.contractNo,
    title: contract.title,
    organizationId: contract.organizationId,
    customerOrganizationId: contract.customerOrganizationId,
    startDate: contract.startDate,
    endDate: contract.endDate,
    currency: contract.currency,
    paymentCurrency: contract.paymentCurrency,
    vatRate: contract.vatRate,
    ratePolicy: contract.ratePolicy,
    fixedRate: contract.fixedRate,
    paymentTerms: contract.paymentTerms,
    note: contract.note,
  }
}

export default function ContractDetailPage() {
  const { t, i18n } = useTranslation()
  const { campId = '', contractId = '' } = useParams()
  const navigate = useNavigate()
  const permissions = useCampPermissions(campId)
  const canManage = permissions.can('camp.contract.manage')
  const contract = useQuery({
    queryKey: contractDetailKey(campId, contractId),
    queryFn: () => contractApi.get(campId, contractId),
    enabled: !!campId && !!contractId && canManage,
  })
  const catalog = useQuery({ queryKey: catalogKey, queryFn: contractApi.catalog, enabled: canManage })
  const organizations = useQuery({
    queryKey: [...campKeys.organizations, 'all'],
    queryFn: () => campApi.organizations({ activeOnly: false }),
    enabled: canManage,
  })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContractInput | null>(null)
  const [itemDialog, setItemDialog] = useState<ContractItemView | 'new' | null>(null)
  const [priceItem, setPriceItem] = useState<ContractItemView | null>(null)
  const [amending, setAmending] = useState(false)
  const [terminating, setTerminating] = useState(false)
  const [quoteForm, setQuoteForm] = useState({ itemId: '', date: todayUb(), quantity: '1' })
  const [quoteRequest, setQuoteRequest] = useState<{ itemId: string; date: string; quantity: string } | null>(null)

  useEffect(() => {
    if (contract.data) setForm(toContractInput(contract.data))
  }, [contract.data])

  const detailKey = contractDetailKey(campId, contractId)
  const invalidates = [detailKey, contractListKey(campId)]
  const update = useCampMutation(
    (input: ContractPatch) => contractApi.update(campId, contractId, input),
    invalidates,
    () => setEditing(false),
  )
  const activate = useCampMutation(() => contractApi.activate(campId, contractId), invalidates)
  const remove = useCampMutation(
    () => contractApi.remove(campId, contractId),
    [contractListKey(campId)],
    () => navigate(`/camp/${campId}/contracts`),
  )
  const addOrUpdateItem = useCampMutation(
    (input: { existing: ContractItemView | null; value: ContractItemInput }) => {
      if (!input.existing) return contractApi.addItem(campId, contractId, input.value)
      const patch: ContractItemPatch = {
        unitId: input.value.unitId,
        quantityRule: input.value.quantityRule,
        quantityDivisor: input.value.quantityDivisor,
        mealType: input.value.mealType,
        description: input.value.description,
      }
      return contractApi.updateItem(campId, contractId, input.existing.id, patch)
    },
    invalidates,
    () => setItemDialog(null),
  )
  const removeItem = useCampMutation((itemId: string) => contractApi.removeItem(campId, contractId, itemId), invalidates)
  const quote = useQuery({
    queryKey: [...detailKey, 'quote', quoteRequest],
    queryFn: () => contractApi.quote(campId, contractId, quoteRequest!),
    enabled: !!quoteRequest,
  })

  if (permissions.isLoading) return <Loading />
  if (!canManage) return <NoAccess what={t('camp.ct.title')} />
  if (contract.isLoading || catalog.isLoading || organizations.isLoading) return <Loading />
  if (!contract.data) return <ErrorBox error={contract.error ?? catalog.error ?? organizations.error} onRetry={() => contract.refetch()} />

  const current = contract.data
  const isDraft = current.status === 'DRAFT'
  const isActive = current.status === 'ACTIVE'
  const saveHeader = () => {
    if (!form) return
    const body: ContractPatch = {
      title: form.title.trim(),
      customerOrganizationId: form.customerOrganizationId ?? null,
      paymentCurrency: form.paymentCurrency.trim(),
      vatRate: form.vatRate,
      ratePolicy: form.ratePolicy,
      fixedRate: form.ratePolicy === 'FIXED' ? form.fixedRate ?? null : null,
      paymentTerms: form.paymentTerms ?? [],
      note: form.note?.trim() || null,
    }
    if (isDraft) {
      body.contractNo = form.contractNo.trim()
      body.organizationId = form.organizationId
      body.currency = form.currency.trim()
      body.startDate = form.startDate
      body.endDate = form.endDate ?? null
    }
    update.mutate(body)
  }
  const submitQuote = () => {
    if (!quoteForm.itemId || !quoteForm.date || !quoteForm.quantity || Number(quoteForm.quantity) <= 0) return
    setQuoteRequest({ itemId: quoteForm.itemId, date: quoteForm.date, quantity: quoteForm.quantity })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${current.contractNo} · ${current.title}`}
        subtitle={<Badge tone={contractStatusTone(current.status)}>{t(`camp.ct.status.${current.status}`)}</Badge>}
        actions={
          <>
            <Link to={`/camp/${campId}/contracts`} className="self-center text-sm text-blue-700 hover:underline">{t('camp.ct.back_to_contracts')}</Link>
            <Button variant="secondary" onClick={() => setEditing((old) => !old)}>{editing ? t('camp.common.cancel') : t('camp.common.edit')}</Button>
            {isDraft && <Button onClick={() => activate.mutate(undefined)} loading={activate.isPending}>{t('camp.ct.activate')}</Button>}
            {isActive && <Button variant="danger" onClick={() => setTerminating(true)}>{t('camp.ct.terminate')}</Button>}
            {isDraft && (
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => window.confirm(t('camp.ct.confirm_delete_contract')) && remove.mutate(undefined)}
              >
                {t('camp.ct.delete_contract')}
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={contract.error ?? catalog.error ?? organizations.error ?? update.error ?? activate.error ?? remove.error} onRetry={() => contract.refetch()} />
      {editing && form && organizations.data && (
        <Card title={t('camp.ct.edit_contract')}>
          <ContractForm
            value={form}
            onChange={setForm}
            organizations={organizations.data}
            locks={isActive ? { contractNo: true, organizationId: true, currency: true, dates: true } : {}}
            saving={update.isPending}
            error={update.error}
            onSave={saveHeader}
            onCancel={() => {
              setForm(toContractInput(current))
              setEditing(false)
            }}
          />
        </Card>
      )}
      <Card title={t('camp.ct.contract_details')}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Detail label={t('camp.ct.organization')} value={current.organizationName} />
          <Detail label={t('camp.ct.customer_organization')} value={current.customerOrganizationName ?? '—'} />
          <Detail label={t('camp.ct.date_range')} value={`${current.startDate} – ${current.endDate ?? t('camp.ct.no_end_date')}`} />
          <Detail label={t('camp.ct.currency')} value={`${current.currency} → ${current.paymentCurrency}`} />
          <Detail label={t('camp.ct.vat_rate')} value={`${current.vatRate}%`} />
          <Detail label={t('camp.ct.rate_policy')} value={t(`camp.ct.rate_policy.${current.ratePolicy}`)} />
          {current.fixedRate && <Detail label={t('camp.ct.fixed_rate')} value={current.fixedRate} />}
          <Detail label={t('camp.ct.note')} value={current.note || '—'} />
        </dl>
        {current.paymentTerms.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-gray-600 mb-2">{t('camp.ct.payment_terms')}</h3>
            <ul className="space-y-1 text-sm">
              {current.paymentTerms.map((term, index) => (
                <li key={index}>{term.percent}% · {t(`camp.ct.term_rule.${term.rule}`, { n: term.n })}{term.note ? ` · ${term.note}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card
        title={t('camp.ct.items')}
        actions={isDraft && <Button size="sm" onClick={() => setItemDialog('new')}>{t('camp.ct.add_item')}</Button>}
      >
        {current.items.length === 0 && <Empty>{t('camp.ct.no_items')}</Empty>}
        <div className="space-y-4">
          {current.items.map((item) => {
            const service = catalog.data?.serviceTypes.find((entry) => entry.id === item.serviceTypeId)
            const unit = catalog.data?.units.find((entry) => entry.id === item.unitId)
            return (
              <section key={item.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{service?.code ?? item.serviceTypeCode} · {service ? contractCatalogName(service, i18n.resolvedLanguage ?? i18n.language) : item.serviceTypeCode}</h3>
                    <p className="text-xs text-gray-500">{unit ? `${unit.code} · ${contractCatalogName(unit, i18n.resolvedLanguage ?? i18n.language)}` : item.unitCode}{item.description ? ` · ${item.description}` : ''}</p>
                    {item.quantityRule && <p className="text-xs text-gray-500">{t(`camp.ct.quantity_rule.${item.quantityRule}`)}{item.quantityDivisor ? ` · ${t('camp.ct.quantity_divisor')}: ${item.quantityDivisor}` : ''}{item.mealType ? ` · ${t(`camp.ct.meal_type.${item.mealType}`)}` : ''}</p>}
                    {item.currentPrice && <p className="mt-1 text-sm">{t('camp.ct.current_price')}: <b>{formatMoney(item.currentPrice.unitPrice, item.currentPrice.currency)}</b></p>}
                  </div>
                  {isDraft && (
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => setItemDialog(item)}>{t('camp.common.edit')}</Button>
                      <Button
                        variant="ghost"
                        disabled={removeItem.isPending}
                        onClick={() => window.confirm(t('camp.ct.confirm_delete_item')) && removeItem.mutate(item.id)}
                      >
                        {t('camp.ct.remove')}
                      </Button>
                    </div>
                  )}
                  {current.status !== 'TERMINATED' && <Button size="sm" variant="secondary" onClick={() => setPriceItem(item)}>{t('camp.ct.add_price')}</Button>}
                </div>
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-1">{t('camp.ct.price_history')}</h4>
                  {item.prices.length === 0 ? <p className="text-xs text-gray-400">{t('camp.ct.no_prices')}</p> : (
                    <Table head={[t('camp.ct.effective_from'), t('camp.ct.unit_price'), t('camp.ct.vat_included'), t('camp.ct.price_note')]}>
                      {item.prices.map((price) => (
                        <tr key={price.id}>
                          <td className={td}>{price.effectiveFrom}</td>
                          <td className={td}>{formatMoney(price.unitPrice, price.currency)}</td>
                          <td className={td}>{t(price.vatIncluded ? 'camp.ct.yes' : 'camp.ct.no')}</td>
                          <td className={td}>{price.note || '—'}</td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </div>
              </section>
            )
          })}
        </div>
        <ErrorBox error={addOrUpdateItem.error ?? removeItem.error} />
      </Card>
      <Card title={t('camp.ct.amendments')} actions={isActive && <Button size="sm" onClick={() => setAmending(true)}>{t('camp.ct.add_amendment')}</Button>}>
        {current.amendments.length === 0 ? <Empty>{t('camp.ct.no_amendments')}</Empty> : (
          <Table head={[t('camp.ct.amendment_type'), t('camp.ct.effective_date'), t('camp.ct.amendment_range'), t('camp.ct.document_no'), t('camp.ct.note')]}>
            {current.amendments.map((amendment) => (
              <tr key={amendment.id}>
                <td className={td}>{t(`camp.ct.amendment_type.${amendment.amendmentType}`)}</td>
                <td className={td}>{amendment.effectiveDate}</td>
                <td className={td}>{amendment.previousEndDate ?? '—'} → {amendment.newEndDate ?? '—'}</td>
                <td className={td}>{amendment.documentNo || '—'}</td>
                <td className={td}>{amendment.note || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {isActive && (
        <Card title={t('camp.ct.price_quote')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <Field label={t('camp.ct.item')}>
              {(id) => <select id={id} className={inputCls} value={quoteForm.itemId} onChange={(e) => { setQuoteRequest(null); setQuoteForm((old) => ({ ...old, itemId: e.target.value })) }}>
                <option value="">{t('camp.ct.select_item')}</option>
                {current.items.map((item) => <option key={item.id} value={item.id}>{item.serviceTypeCode} · {item.unitCode}</option>)}
              </select>}
            </Field>
            <Field label={t('camp.ct.quote_date')}>{(id) => <input id={id} type="date" className={inputCls} value={quoteForm.date} onChange={(e) => { setQuoteRequest(null); setQuoteForm((old) => ({ ...old, date: e.target.value })) }} />}</Field>
            <Field label={t('camp.ct.quantity')}>{(id) => <input id={id} type="number" min="0.000001" step="any" className={inputCls} value={quoteForm.quantity} onChange={(e) => { setQuoteRequest(null); setQuoteForm((old) => ({ ...old, quantity: e.target.value })) }} />}</Field>
          </div>
          <Button className="mt-3" disabled={!quoteForm.itemId || !quoteForm.date || Number(quoteForm.quantity) <= 0} onClick={submitQuote}>{t('camp.ct.calculate_price')}</Button>
          <ErrorBox error={quote.error} onRetry={() => quote.refetch()} />
          {quote.data && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuoteAmounts title={t('camp.ct.contract_currency', { currency: quote.data.currency })} net={quote.data.net} vat={quote.data.vat} gross={quote.data.gross} currency={quote.data.currency} />
              <QuoteAmounts title={t('camp.ct.payment_currency', { currency: quote.data.paymentCurrency })} net={quote.data.paymentNet} vat={quote.data.paymentVat} gross={quote.data.paymentGross} currency={quote.data.paymentCurrency} />
              <p className="text-xs text-gray-500 sm:col-span-2">{t('camp.ct.quote_rate', { rate: quote.data.rate, date: quote.data.rateDate ?? '—' })}</p>
            </div>
          )}
        </Card>
      )}
      <ErrorBox error={activate.error ?? removeItem.error ?? addOrUpdateItem.error} />
      {itemDialog && catalog.data && (
        <ContractItemEditor
          catalog={catalog.data}
          item={itemDialog === 'new' ? null : itemDialog}
          saving={addOrUpdateItem.isPending}
          error={addOrUpdateItem.error}
          onClose={() => setItemDialog(null)}
          onSave={(value) => addOrUpdateItem.mutate({ existing: itemDialog === 'new' ? null : itemDialog, value })}
        />
      )}
      {priceItem && <PriceModal campId={campId} contract={current} item={priceItem} onClose={() => setPriceItem(null)} />}
      {amending && <AmendmentModal campId={campId} contractId={contractId} onClose={() => setAmending(false)} invalidate={invalidates} />}
      {terminating && <TerminateModal campId={campId} contractId={contractId} onClose={() => setTerminating(false)} invalidate={invalidates} />}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-gray-500">{label}</dt><dd className="font-medium text-gray-900">{value}</dd></div>
}

function QuoteAmounts({ title, net, vat, gross, currency }: { title: string; net: string; vat: string; gross: string; currency: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-sm">
      <h3 className="font-semibold mb-2">{title}</h3>
      <dl className="grid grid-cols-2 gap-y-1">
        <dt>{t('camp.ct.net')}</dt><dd className="text-right">{formatMoney(net, currency)}</dd>
        <dt>{t('camp.ct.vat')}</dt><dd className="text-right">{formatMoney(vat, currency)}</dd>
        <dt className="font-semibold">{t('camp.ct.gross')}</dt><dd className="text-right font-semibold">{formatMoney(gross, currency)}</dd>
      </dl>
    </div>
  )
}

function PriceModal({ campId, contract, item, onClose }: { campId: string; contract: ContractView; item: ContractItemView; onClose: () => void }) {
  const { t } = useTranslation()
  const active = contract.status === 'ACTIVE'
  const [form, setForm] = useState<PriceInput>({ effectiveFrom: todayUb(), unitPrice: '', vatIncluded: false, note: null, documentNo: '' })
  const save = useCampMutation(
    () => contractApi.addPrice(campId, contract.id, item.id, {
      ...form,
      unitPrice: form.unitPrice.trim(),
      note: form.note?.trim() || null,
      documentNo: active ? form.documentNo?.trim() || null : undefined,
    }),
    [contractDetailKey(campId, contract.id), contractListKey(campId)],
    onClose,
  )
  const set = <K extends keyof PriceInput>(key: K, value: PriceInput[K]) => setForm((old) => ({ ...old, [key]: value }))
  return (
    <Modal title={t('camp.ct.add_price')} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
        <Button loading={save.isPending} disabled={!form.effectiveFrom || !form.unitPrice.trim() || Number(form.unitPrice) < 0 || (active && !form.documentNo?.trim())} onClick={() => save.mutate(undefined)}>{t('camp.common.save')}</Button></>
    }>
      <Field label={t('camp.ct.effective_from')}>{(id) => <input id={id} type="date" className={inputCls} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />}</Field>
      <Field label={t('camp.ct.unit_price')}>{(id) => <input id={id} type="number" min="0" step="any" className={inputCls} value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />}</Field>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.vatIncluded} onChange={(e) => set('vatIncluded', e.target.checked)} /> {t('camp.ct.vat_included')}
      </label>
      {active && <Field label={t('camp.ct.document_no')}>{(id) => <input id={id} className={inputCls} value={form.documentNo ?? ''} onChange={(e) => set('documentNo', e.target.value)} maxLength={100} />}</Field>}
      <Field label={t('camp.ct.price_note')}>{(id) => <input id={id} className={inputCls} value={form.note ?? ''} onChange={(e) => set('note', e.target.value || null)} maxLength={500} />}</Field>
      <ErrorBox error={save.error} />
    </Modal>
  )
}

function AmendmentModal({ campId, contractId, onClose, invalidate }: { campId: string; contractId: string; onClose: () => void; invalidate: readonly (readonly unknown[])[] }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AmendmentInput>({ amendmentType: 'EXTENSION', effectiveDate: todayUb(), newEndDate: null, documentNo: '', note: '' })
  const save = useCampMutation((input: AmendmentInput) => contractApi.addAmendment(campId, contractId, {
    ...input,
    newEndDate: input.amendmentType === 'EXTENSION' ? input.newEndDate : undefined,
    documentNo: input.documentNo?.trim() || null,
    note: input.note?.trim() || null,
  }), [...invalidate], onClose)
  const set = <K extends keyof AmendmentInput>(key: K, value: AmendmentInput[K]) => setForm((old) => ({ ...old, [key]: value }))
  const isExtension = form.amendmentType === 'EXTENSION'
  return (
    <Modal title={t('camp.ct.add_amendment')} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
        <Button loading={save.isPending} disabled={!form.effectiveDate || (isExtension && !form.newEndDate)} onClick={() => save.mutate(form)}>{t('camp.common.save')}</Button></>
    }>
      <Field label={t('camp.ct.amendment_type')}>
        {(id) => <select id={id} className={inputCls} value={form.amendmentType} onChange={(e) => set('amendmentType', e.target.value as ManualAmendmentType)}>
          {(['EXTENSION', 'TERMS', 'OTHER'] as const).map((type) => <option key={type} value={type}>{t(`camp.ct.amendment_type.${type}`)}</option>)}
        </select>}
      </Field>
      <Field label={t('camp.ct.effective_date')}>{(id) => <input id={id} type="date" className={inputCls} value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} />}</Field>
      {isExtension && <Field label={t('camp.ct.new_end_date')}>{(id) => <input id={id} type="date" className={inputCls} value={form.newEndDate ?? ''} onChange={(e) => set('newEndDate', e.target.value || null)} />}</Field>}
      <Field label={t('camp.ct.document_no')}>{(id) => <input id={id} className={inputCls} value={form.documentNo ?? ''} onChange={(e) => set('documentNo', e.target.value)} maxLength={100} />}</Field>
      <Field label={t('camp.ct.note')}>{(id) => <textarea id={id} className={inputCls} rows={3} value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} maxLength={1000} />}</Field>
      <ErrorBox error={save.error} />
    </Modal>
  )
}

function TerminateModal({ campId, contractId, onClose, invalidate }: { campId: string; contractId: string; onClose: () => void; invalidate: readonly (readonly unknown[])[] }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<TerminateInput>({ terminatedAt: todayUb(), note: '', documentNo: '' })
  const save = useCampMutation((input: TerminateInput) => contractApi.terminate(campId, contractId, {
    ...input,
    note: input.note.trim(),
    documentNo: input.documentNo?.trim() || null,
  }), [...invalidate], onClose)
  const set = <K extends keyof TerminateInput>(key: K, value: TerminateInput[K]) => setForm((old) => ({ ...old, [key]: value }))
  return (
    <Modal title={t('camp.ct.terminate_contract')} onClose={onClose} footer={
      <><Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
        <Button variant="danger" loading={save.isPending} disabled={!form.terminatedAt || !form.note.trim()} onClick={() => save.mutate(form)}>{t('camp.ct.terminate')}</Button></>
    }>
      <Field label={t('camp.ct.terminated_at')}>{(id) => <input id={id} type="date" className={inputCls} value={form.terminatedAt} onChange={(e) => set('terminatedAt', e.target.value)} />}</Field>
      <Field label={t('camp.ct.document_no')}>{(id) => <input id={id} className={inputCls} value={form.documentNo ?? ''} onChange={(e) => set('documentNo', e.target.value)} maxLength={100} />}</Field>
      <Field label={t('camp.ct.termination_note')}>{(id) => <textarea id={id} className={inputCls} rows={3} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />}</Field>
      <ErrorBox error={save.error} />
    </Modal>
  )
}
