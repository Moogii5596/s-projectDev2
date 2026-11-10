import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MEAL_LABEL, localizedCatalogName } from '../../../core/labels'
import { campApi, type MealOrderApiAction } from '../api/camp-api'
import type { MealOrderAction } from '../api/meal-order-types'
import type { MealType } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { addDays, todayUb } from '../../../core/dates'
import { gridToLines, gridTotal, linesToGrid, MEAL_TYPES, sameGrid, STATUS_TONE, type Grid } from '../lib/meal-order'
import MealGrid from '../components/MealGrid'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../../../core/ui'

type ReasonKind = 'reject' | 'request-change' | 'reject-change'

/**
 * /camp/:campId/meal-orders — маргаашийн хоолны захиалга (V2-03). Товч бүр `order.actions[]`-аас (backend бодлого) —
 * урсгалын дүрэм (cutoff, хүлээн авах, хүлээн авсны дараах засвар) кемпийн тохиргооноос.
 */
export default function MealOrdersPage() {
  const { t, i18n } = useTranslation()
  const { campId = '' } = useParams()
  const [date, setDate] = useState(() => addDays(todayUb(), 1))
  const perms = useAppPermissions(campId)
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const order = useQuery({ queryKey: campKeys.mealOrder(campId, date), queryFn: () => campApi.mealOrder(campId, date), enabled: !!campId })
  const activeLocations = useMemo(() => (locations.data ?? []).filter((l) => l.isActive || order.data?.lines.some((x) => x.mealLocationId === l.id)), [locations.data, order.data])

  const [grid, setGrid] = useState<Grid>({})
  const [reason, setReason] = useState<ReasonKind | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [extra, setExtra] = useState<{ mealType: MealType; mealLocationId: string; guestCount: string; note: string }>({ mealType: 'LUNCH', mealLocationId: '', guestCount: '', note: '' })

  const o = order.data
  // серверийн төлөв өөрчлөгдөхөд (хадгалсны дараа, өөр өдөр) формыг шинэчилнэ; request-change үед одоогийн мөрөөс эхэлнэ
  useEffect(() => {
    if (o) setGrid(linesToGrid(o.lines))
  }, [o?.id, o?.orderDate, o?.status, o?.revisionNo, JSON.stringify(o?.lines)])

  const can = (a: MealOrderAction) => o?.actions.includes(a) ?? false
  const serverGrid = useMemo(() => linesToGrid(o?.lines ?? []), [o])
  const dirty = !sameGrid(grid, serverGrid)
  const editable = can('edit') || can('requestChange')
  const inv = [campKeys.mealOrderAll(campId)]
  const afterSave = () => { setReason(null); setReasonText('') }

  const save = useAppMutation(() => campApi.saveMealOrder(campId, date, { lines: gridToLines(grid) }), inv)
  const act = useAppMutation(
    async (v: { action: MealOrderApiAction; body?: unknown }) => {
      // илгээхээс өмнө хадгалагдаагүй өөрчлөлтийг хадгална (submit хадгалсан мөрөөр ажиллана)
      if (v.action === 'submit' && dirty && can('edit')) await campApi.saveMealOrder(campId, date, { lines: gridToLines(grid) })
      return campApi.mealOrderAction(campId, date, v.action, v.body)
    },
    inv,
    afterSave,
  )
  const del = useAppMutation(() => campApi.deleteMealOrder(campId, date), inv)
  const addExtra = useAppMutation(
    () => campApi.addMealExtra(campId, date, { mealType: extra.mealType, mealLocationId: extra.mealLocationId, guestCount: Number(extra.guestCount), note: extra.note.trim() }),
    inv,
    () => setExtra((p) => ({ ...p, guestCount: '', note: '' })),
  )
  const delExtra = useAppMutation((id: string) => campApi.removeMealExtra(campId, date, id), inv)
  const busy = save.isPending || act.isPending || del.isPending || addExtra.isPending || delExtra.isPending

  const submitReason = () => {
    const text = reasonText.trim()
    if (!text || !reason) return
    act.mutate({ action: reason, body: reason === 'request-change' ? { reason: text, lines: gridToLines(grid) } : { reason: text } })
  }

  const extrasTotal = o?.extras.reduce((a, e) => a + e.guestCount, 0) ?? 0
  const total = gridTotal(grid) + extrasTotal
  const pendingGrid = o?.pendingLines ? linesToGrid(o.pendingLines) : null

  return (
    <div className="space-y-4">
      <PageHeader title={t('camp.mo.title')} subtitle={t('camp.mo.subtitle')} />
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label={t('camp.mo.prev')}>‹</Button>
          <Field label={t('camp.mo.date')}>{(id) => <input id={id} type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
          <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label={t('camp.mo.next')}>›</Button>
          {o && <Badge tone={STATUS_TONE[o.status]}>{t(`camp.mo.status.${o.status}`)}</Badge>}
          {o?.isLate && <Badge tone="yellow">{t('camp.mo.late')}</Badge>}
          {o && o.revisionNo > 0 && <Badge tone="gray">{t('camp.mo.revision', { n: o.revisionNo })}</Badge>}
        </div>
      </Card>

      {(order.isLoading || locations.isLoading) && <Loading />}
      <ErrorBox error={order.error ?? locations.error} onRetry={() => order.refetch()} />
      {o && locations.data && (
        <>
          {o.id === null && <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">{t('camp.mo.preview_note')}</p>}
          {o.status === 'REJECTED' && o.rejectReason && <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">{t('camp.mo.reject_reason')}: {o.rejectReason}</p>}
          {o.status === 'ACCEPTED' && o.rejectReason && <p className="text-sm text-yellow-800 bg-yellow-50 rounded px-3 py-2">{t('camp.mo.change_rejected')}: {o.rejectReason}</p>}
          {o.status === 'CHANGE_REQUESTED' && <p className="text-sm text-yellow-800 bg-yellow-50 rounded px-3 py-2">{t('camp.mo.change_reason')}: {o.changeReason}</p>}

          <Card title={t('camp.mo.counts')}>
            {activeLocations.length === 0 ? (
              <Empty>{t('camp.mo.no_locations')}</Empty>
            ) : (
              <MealGrid locations={activeLocations} values={grid} onChange={setGrid} disabled={!editable || busy} />
            )}
            {pendingGrid && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-600 mb-1">{t('camp.mo.pending')}</h3>
                <MealGrid locations={activeLocations} values={pendingGrid} onChange={() => undefined} disabled compare={serverGrid} />
              </div>
            )}
            {!editable && o.status !== 'CHANGE_REQUESTED' && <p className="text-xs text-gray-400 mt-2">{t('camp.mo.read_only')}</p>}
          </Card>

          <Card title={t('camp.mo.extras')}>
            {o.extras.length > 0 && (
              <Table head={[t('camp.mo.location'), t('camp.mo.meal'), t('camp.mo.guests'), t('camp.mo.extra_note'), '']}>
                {o.extras.map((e) => {
                  const location = locations.data.find((l) => l.id === e.mealLocationId)
                  return (
                    <tr key={e.id}>
                      <td className={td}>{location ? localizedCatalogName(location, i18n.resolvedLanguage ?? i18n.language) : '—'}</td>
                      <td className={td}>{MEAL_LABEL[e.mealType]}</td>
                      <td className={`${td} text-right`}>{e.guestCount}</td>
                      <td className={td}>{e.note}</td>
                      <td className={td}>{can('edit') && <Button variant="ghost" onClick={() => delExtra.mutate(e.id)} disabled={busy}>{t('camp.mo.delete')}</Button>}</td>
                    </tr>
                  )
                })}
              </Table>
            )}
            {can('edit') && (
              <form
                className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end mt-3"
                noValidate
                onSubmit={(e) => { e.preventDefault(); if (extra.mealLocationId) addExtra.mutate(undefined) }}
              >
                <Field label={t('camp.mo.location')}>{(id) => (
                  <select id={id} className={inputCls} value={extra.mealLocationId} onChange={(e) => setExtra((p) => ({ ...p, mealLocationId: e.target.value }))}>
                    <option value="">{t('camp.common.not_selected')}</option>
                    {activeLocations.map((l) => <option key={l.id} value={l.id}>{localizedCatalogName(l, i18n.resolvedLanguage ?? i18n.language)}</option>)}
                  </select>
                )}</Field>
                <Field label={t('camp.mo.meal')}>{(id) => (
                  <select id={id} className={inputCls} value={extra.mealType} onChange={(e) => setExtra((p) => ({ ...p, mealType: e.target.value as MealType }))}>
                    {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
                  </select>
                )}</Field>
                <Field label={t('camp.mo.guests')}>{(id) => <input id={id} type="number" min={1} className={inputCls} value={extra.guestCount} onChange={(e) => setExtra((p) => ({ ...p, guestCount: e.target.value }))} />}</Field>
                <Field label={t('camp.mo.extra_note')}>{(id) => <input id={id} className={inputCls} maxLength={300} value={extra.note} onChange={(e) => setExtra((p) => ({ ...p, note: e.target.value }))} />}</Field>
                <Button loading={addExtra.isPending} disabled={busy || !extra.mealLocationId || !extra.note.trim() || Number(extra.guestCount) < 1} onClick={() => addExtra.mutate(undefined)}>{t('camp.mo.extra_add')}</Button>
              </form>
            )}
            <ErrorBox error={addExtra.error ?? delExtra.error} />
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              {t('camp.mo.total')}: <b>{total}</b> · {t('camp.mo.person_days')}: <b>{(Math.round((total / 3) * 100) / 100).toFixed(2)}</b>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('delete') && o.id !== null && <Button variant="danger" disabled={busy} onClick={() => window.confirm(t('camp.mo.confirm_delete')) && del.mutate(undefined)}>{t('camp.mo.delete')}</Button>}
              {can('edit') && <Button variant="secondary" loading={save.isPending} disabled={busy || !dirty} onClick={() => save.mutate(undefined)}>{t('camp.mo.save')}</Button>}
              {can('submit') && <Button loading={act.isPending} disabled={busy} onClick={() => act.mutate({ action: 'submit' })}>{t('camp.mo.submit')}</Button>}
              {can('accept') && <Button loading={act.isPending} disabled={busy} onClick={() => act.mutate({ action: 'accept' })}>{t('camp.mo.accept')}</Button>}
              {can('reject') && <Button variant="danger" disabled={busy} onClick={() => setReason('reject')}>{t('camp.mo.reject')}</Button>}
              {can('requestChange') && <Button disabled={busy || !dirty} onClick={() => setReason('request-change')}>{t('camp.mo.request_change')}</Button>}
              {can('withdrawChange') && <Button variant="secondary" loading={act.isPending} disabled={busy} onClick={() => act.mutate({ action: 'withdraw-change' })}>{t('camp.mo.withdraw_change')}</Button>}
              {can('approveChange') && <Button loading={act.isPending} disabled={busy} onClick={() => act.mutate({ action: 'approve-change' })}>{t('camp.mo.approve_change')}</Button>}
              {can('rejectChange') && <Button variant="danger" disabled={busy} onClick={() => setReason('reject-change')}>{t('camp.mo.reject_change')}</Button>}
            </div>
          </div>
          <ErrorBox error={save.error ?? del.error ?? (reason ? null : act.error)} />
          {!perms.can('camp.meal.order', 'camp.meal.accept') && !perms.isLoading && <p className="text-xs text-gray-400">{t('camp.mo.view_only')}</p>}
        </>
      )}

      {reason && (
        <Modal
          title={t(`camp.mo.reason_title.${reason}`)}
          onClose={() => setReason(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReason(null)}>{t('camp.common.cancel')}</Button>
              <Button loading={act.isPending} disabled={!reasonText.trim()} onClick={submitReason}>{t('camp.mo.confirm')}</Button>
            </>
          }
        >
          <Field label={t('camp.mo.reason')}>{(id) => <textarea id={id} className={inputCls} rows={3} maxLength={500} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />}</Field>
          <ErrorBox error={act.error} />
        </Modal>
      )}
    </div>
  )
}
