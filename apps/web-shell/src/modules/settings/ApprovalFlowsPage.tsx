import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, inputCls, inputSmCls } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { approvalKeys, approvalsApi, type ApprovalStepInput } from './core-bridge'

const emptyStep = (permission: string): ApprovalStepInput => ({ name: '', permission, quorum: 1 })

/**
 * v0.2.4 WF-06 — Системийн тохиргоо → Батлах урсгал. Объектын төрөл бүрт урсгал; хадгалах бүрт ШИНЭ ХУВИЛБАР
 * (ажиллаж буй хүсэлтүүд хуучин хувилбараараа дуусна). Алхам = эрх (ADR-007) + батлах тоо + дүнгийн нөхцөл.
 */
export default function ApprovalFlowsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const types = useQuery({ queryKey: approvalKeys.types, queryFn: approvalsApi.entityTypes })
  const [entityType, setEntityType] = useState('')
  useEffect(() => {
    if (!entityType && types.data?.items[0]) setEntityType(types.data.items[0].entityType)
  }, [types.data, entityType])
  const type = types.data?.items.find((x) => x.entityType === entityType)
  const defs = useQuery({ queryKey: approvalKeys.definitions(entityType), queryFn: () => approvalsApi.definitions(entityType), enabled: !!entityType })
  const active = defs.data?.items.find((d) => d.isActive)

  const [name, setName] = useState('')
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [slaHours, setSlaHours] = useState(48)
  const [escalation, setEscalation] = useState(false)
  const [delegation, setDelegation] = useState(true)
  useEffect(() => {
    if (!type) return
    setName(active?.name ?? t(type.labelKey))
    setSteps(active ? active.steps.filter((s) => !!s.permission).map(({ name: n, permission, quorum, minAmount, maxAmount }) => ({ name: n ?? '', permission, quorum, minAmount, maxAmount })) : [emptyStep(type.approvePermissions[0] ?? '')])
    setSlaHours(active?.slaHours ?? 48)
    setEscalation(active?.escalationEnabled ?? false)
    setDelegation(active?.delegationEnabled ?? true)
  }, [active, type, t])

  const save = useMutation({
    mutationFn: () => approvalsApi.saveDefinition({
      entityType, name: name.trim(), slaHours, escalationEnabled: escalation, delegationEnabled: delegation,
      steps: steps.map((s) => ({ ...s, name: s.name?.trim() || undefined })),
    }),
    onSuccess: (data) => qc.setQueryData(approvalKeys.definitions(entityType), data),
  })
  const valid = useMemo(() => name.trim() && steps.length > 0 && steps.every((s) => s.permission && s.quorum >= 1 && (s.minAmount === undefined || s.maxAmount === undefined || s.minAmount <= s.maxAmount)), [name, steps])
  const patch = (i: number, p: Partial<ApprovalStepInput>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)))
  const locale = INTL_LOCALE[currentLang()]

  if (types.isLoading) return <Loading />
  if (types.isError) return <ErrorBox error={types.error} onRetry={() => types.refetch()} />
  if (!types.data?.items.length) return <Empty>{t('approval.flows.no_types')}</Empty>

  return (
    <div className="space-y-4">
      <PageHeader title={t('settings.section.approval-flows')} subtitle={t('approval.flows.hint')} />
      <Field label={t('approval.flows.entity')}>
        {(id) => (
          <select id={id} className={inputCls} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {types.data.items.map((x) => <option key={x.entityType} value={x.entityType}>{t(x.labelKey)}</option>)}
          </select>
        )}
      </Field>
      {defs.isError && <ErrorBox error={defs.error} />}
      <Card title={active ? t('approval.flows.edit_version', { v: active.version + 1 }) : t('approval.flows.new')}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('approval.flows.name')}>{(id) => <input id={id} className={inputCls} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t('approval.flows.sla')} hint={t('approval.flows.sla_hint')}>{(id) => <input id={id} type="number" min={0} max={720} className={inputCls} value={slaHours} onChange={(e) => setSlaHours(Math.min(720, Math.max(0, Number(e.target.value) || 0)))} />}</Field>
            <div className="flex flex-col justify-end gap-1 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={escalation} onChange={(e) => setEscalation(e.target.checked)} />{t('approval.flows.escalation')}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={delegation} onChange={(e) => setDelegation(e.target.checked)} />{t('approval.flows.delegation')}</label>
            </div>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="grid items-end gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-[2rem_1fr_1fr_5rem_7rem_7rem_auto]">
                <span className="text-sm font-semibold text-gray-500">{i + 1}</span>
                <input aria-label={t('approval.flows.step_name')} placeholder={t('approval.flows.step_name')} className={inputSmCls} maxLength={100} value={s.name ?? ''} onChange={(e) => patch(i, { name: e.target.value })} />
                <select aria-label={t('approval.flows.permission')} className={inputSmCls} value={s.permission} onChange={(e) => patch(i, { permission: e.target.value })}>
                  {type?.approvePermissions.map((p) => <option key={p} value={p}>{t(`perm.${p}`, { defaultValue: p })}</option>)}
                </select>
                <input aria-label={t('approval.flows.quorum')} title={t('approval.flows.quorum')} type="number" min={1} max={20} className={inputSmCls} value={s.quorum} onChange={(e) => patch(i, { quorum: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
                <input aria-label={t('approval.flows.min_amount')} placeholder={t('approval.flows.min_amount')} type="number" min={0} className={inputSmCls} value={s.minAmount ?? ''} onChange={(e) => patch(i, { minAmount: num(e.target.value) })} />
                <input aria-label={t('approval.flows.max_amount')} placeholder={t('approval.flows.max_amount')} type="number" min={0} className={inputSmCls} value={s.maxAmount ?? ''} onChange={(e) => patch(i, { maxAmount: num(e.target.value) })} />
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setSteps((x) => { const y = [...x]; [y[i - 1], y[i]] = [y[i], y[i - 1]]; return y })} aria-label={t('approval.flows.up')}>↑</Button>
                  <Button size="sm" variant="ghost" disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>{t('approval.flows.remove')}</Button>
                </div>
              </div>
            ))}
            {steps.length < 10 && <Button size="sm" variant="secondary" onClick={() => setSteps((x) => [...x, emptyStep(type?.approvePermissions[0] ?? '')])}>{t('approval.flows.add_step')}</Button>}
          </div>
          {save.isError && <ErrorBox error={save.error} />}
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>{t('approval.flows.save')}</Button>
        </div>
      </Card>
      <Card title={t('approval.flows.versions')}>
        {defs.isLoading && <Loading />}
        {defs.data && defs.data.items.length === 0 && <p className="text-sm text-gray-400">{t('approval.flows.none')}</p>}
        <ul className="space-y-1 text-sm">
          {defs.data?.items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">v{d.version}</span> {d.name}
              {d.isActive && <Badge tone="green">{t('approval.flows.active')}</Badge>}
              {d.pendingCount > 0 && <Badge tone="yellow">{t('approval.flows.pending', { n: d.pendingCount })}</Badge>}
              <span className="text-xs text-gray-500">{t('approval.flows.steps_n', { n: d.steps.length })} · {new Date(d.createdAt).toLocaleString(locale)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
