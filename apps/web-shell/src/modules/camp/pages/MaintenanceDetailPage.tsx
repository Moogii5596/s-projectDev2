import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi, type PartInput } from '../api/camp-api'
import type { MaintenanceAction, MaintenanceDetail, MaintenancePart, MaintenancePriority, PartSource } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { MAINT_STATUS_LABEL, PART_SOURCE_LABEL, PRIORITY_LABEL } from '../../../core/labels'
import { formatMoney } from '../../../core/money'
import { ACTION_LABEL, type MaintenanceActor, STATUS_TONE, availableActions, canEditDetails, canEditParts } from '../lib/maintenance'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../../../core/ui'
import { Attachments } from '../api/core-bridge'
import { useTranslation } from 'react-i18next'

const FLOW: { status: MaintenanceDetail['status'] }[] = [{ status: 'OPEN' }, { status: 'IN_PROGRESS' }, { status: 'DONE' }, { status: 'CLOSED' }]
const ts = (v: string | null) => (v ? v.slice(0, 16).replace('T', ' ') : '—')

/** /camp/:campId/maintenance/:id — засварын дэлгэрэнгүй: төлөв, сэлбэг, зардлын урьдчилсан тооцоо */
export default function MaintenanceDetailPage() {
  const { t } = useTranslation()
  const { campId = '', id = '' } = useParams()
  const perms = useAppPermissions(campId)
  const q = useQuery({ queryKey: [...campKeys.maintenance(campId), 'detail', id], queryFn: () => campApi.maintenance(campId, id) })
  const [confirm, setConfirm] = useState<MaintenanceAction | null>(null)
  const [notice, setNotice] = useState<string[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [partModal, setPartModal] = useState<MaintenancePart | 'new' | null>(null)
  const m = q.data
  const actor: MaintenanceActor = {
    canParts: perms.can(P.MAINTENANCE_PARTS),
    canClose: perms.can(P.MAINTENANCE_CLOSE),
    canCreate: perms.can(P.MAINTENANCE_CREATE),
    isReporter: !!m && perms.data?.userId === m.reportedBy,
  }
  const removePart = useAppMutation((partId: string) => campApi.removePart(campId, id, partId), [campKeys.maintenance(campId)])

  if (q.isLoading) return <Loading />
  if (q.isError || !m) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />

  const actions = availableActions(m.status, actor)
  const partsEditable = canEditParts(m.status, actor)
  const costCount = m.cost.lines.length

  return (
    <div className="space-y-5">
      <div className="text-sm text-gray-500">
        <Link to=".." relative="path" className="hover:text-blue-600">
          {t('camp.section.maintenance')}
        </Link>{' '}
        / <span className="font-mono">{m.requestNo}</span>
      </div>

      <Card
        title={`${m.requestNo} · ${m.title}`}
        actions={
          canEditDetails(m.status, actor) && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {t('camp.common.edit')}
            </Button>
          )
        }
      >
        <ol className="flex flex-wrap items-center gap-2 text-xs mb-4" aria-label={t('camp.maint.flow')}>
          {m.status === 'CANCELLED' ? (
            <li>
              <Badge tone="red">{MAINT_STATUS_LABEL.CANCELLED}</Badge>
            </li>
          ) : (
            FLOW.map((f, i) => {
              const idx = FLOW.findIndex((x) => x.status === m.status)
              return (
                <li key={f.status} className="flex items-center gap-2">
                  <span
                    aria-current={f.status === m.status ? 'step' : undefined}
                    className={`rounded-full px-2.5 py-1 ${i < idx ? 'bg-green-50 text-green-700' : i === idx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                  >
                    {MAINT_STATUS_LABEL[f.status]}
                  </span>
                  {i < FLOW.length - 1 && <span className="text-gray-300">→</span>}
                </li>
              )
            })
          )}
        </ol>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">{t('camp.facilities.room')}</dt>
            <dd>
              {m.room ? `${m.room.building.code}-${m.room.roomNo}` : '—'}
              {m.blocksRoom && m.room && <span className="block text-xs text-yellow-700">{m.room.status === 'MAINTENANCE' ? t('camp.maint.room_locked') : t('camp.maint.room_released')}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.asset.asset')}</dt>
            <dd>{m.asset ? `${m.asset.inventoryNo} · ${m.asset.name}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.maint.priority')}</dt>
            <dd>{PRIORITY_LABEL[m.priority]}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.common.status')}</dt>
            <dd>
              <Badge tone={STATUS_TONE[m.status]}>{MAINT_STATUS_LABEL[m.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.maint.created')}</dt>
            <dd>
              {m.reportedByUser?.fullName ?? m.reportedByUser?.email ?? '—'} · {ts(m.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.maint.started_done')}</dt>
            <dd>
              {ts(m.startedAt)} / {ts(m.completedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{MAINT_STATUS_LABEL.CLOSED}</dt>
            <dd>{ts(m.closedAt)}</dd>
          </div>
          {m.cancelReason && (
            <div>
              <dt className="text-xs text-gray-500">{t('camp.maint.cancel_reason_shown')}</dt>
              <dd>{m.cancelReason}</dd>
            </div>
          )}
          {m.description && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-gray-500">{t('camp.roles.description')}</dt>
              <dd className="whitespace-pre-line">{m.description}</dd>
            </div>
          )}
        </dl>
        {notice && (
          <div role="status" className="mt-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2 space-y-1">
            {notice.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        )}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {actions.map((a) => (
              <Button key={a} variant={a === 'cancel' ? 'danger' : a === 'reopen' ? 'secondary' : 'primary'} size="sm" onClick={() => setConfirm(a)}>
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {/* v0.2.4 FILE-01: хавсралт (зураг, акт) — кемпийн эрхээр */}
      <Attachments entityType="CAMP_MAINTENANCE" entityId={m.id} />

      <Card
        title={t('camp.part.title')}
        actions={
          partsEditable && (
            <Button size="sm" onClick={() => setPartModal('new')}>
              {t('camp.part.add')}
            </Button>
          )
        }
      >
        {!partsEditable && (m.status === 'CLOSED' || m.status === 'CANCELLED') && <p className="text-xs text-gray-500 mb-2">{t('camp.part.locked')}</p>}
        <ErrorBox error={removePart.error} />
        {m.parts.length === 0 ? (
          <Empty>{t('camp.part.empty')}</Empty>
        ) : (
          <Table head={[t('camp.common.name'), t('camp.part.qty'), t('camp.part.unit_price'), t('camp.part.vat'), t('camp.part.source'), '']}>
            {m.parts.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.partName}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>
                  {p.quantity} {p.unit}
                </td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>{formatMoney(p.unitPrice)}</td>
                <td className={td}>{p.vatIncluded ? t('camp.part.vat_included') : t('camp.part.vat_added')}</td>
                <td className={td}>
                  <Badge tone={p.source === 'CATERING_PURCHASED' ? 'blue' : 'gray'}>{PART_SOURCE_LABEL[p.source]}</Badge>
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {partsEditable && (
                    <>
                      <Button variant="ghost" onClick={() => setPartModal(p)}>
                        {t('camp.common.edit')}
                      </Button>
                      <Button variant="ghost" onClick={() => removePart.mutate(p.id)} disabled={removePart.isPending}>
                        {t('camp.att.delete')}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={m.status === 'CLOSED' ? t('camp.cost.recorded') : t('camp.cost.estimate')}>
        <p className="text-xs text-gray-500 mb-3">
          {t('camp.cost.note', { vat: m.cost.vatRate })}
        </p>
        <dl className="grid grid-cols-3 gap-3 text-sm max-w-xl">
          <div>
            <dt className="text-xs text-gray-500">{t('camp.cost.net')}</dt>
            <dd className="tabular-nums font-medium">{formatMoney(m.cost.total.net)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.part.vat')}</dt>
            <dd className="tabular-nums font-medium">{formatMoney(m.cost.total.vat)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('camp.meals.total')}</dt>
            <dd className="tabular-nums font-semibold">{formatMoney(m.cost.total.gross)}</dd>
          </div>
        </dl>
      </Card>

      {confirm && (
        <TransitionModal
          campId={campId}
          detail={m}
          action={confirm}
          costCount={costCount}
          onDone={(msgs) => {
            setConfirm(null)
            setNotice(msgs.length > 0 ? msgs : null)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {editing && <EditModal campId={campId} detail={m} onClose={() => setEditing(false)} />}
      {partModal && <PartModal campId={campId} requestId={id} part={partModal === 'new' ? null : partModal} onClose={() => setPartModal(null)} />}
    </div>
  )
}

function TransitionModal({
  campId,
  detail,
  action,
  costCount,
  onDone,
  onClose,
}: {
  campId: string
  detail: MaintenanceDetail
  action: MaintenanceAction
  costCount: number
  onDone: (messages: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const m = useAppMutation(
    () => campApi.transitionMaintenance(campId, detail.id, action, action === 'cancel' ? reason.trim() : undefined),
    [campKeys.maintenance(campId), campKeys.rooms(campId), campKeys.roomBoard(campId), campKeys.assets(campId)],
    (res) => {
      const msgs: string[] = [...(res.warnings ?? [])]
      if (res.roomReleased) msgs.push(t('camp.maint.room_reactivated'))
      if (action === 'close') msgs.push(t('camp.maint.closed_costs', { n: res.costEntries ?? 0 }))
      onDone(msgs)
    },
  )
  const body: Record<MaintenanceAction, string> = {
    start: t('camp.maint.confirm.start'),
    complete: t('camp.maint.confirm.complete') + (detail.blocksRoom ? ` ${t('camp.maint.confirm.complete_room')}` : ''),
    reopen: t('camp.maint.confirm.reopen') + (detail.blocksRoom ? ` ${t('camp.maint.confirm.reopen_room')}` : ''),
    close:
      costCount > 0
        ? t('camp.maint.confirm.close_costs', { n: costCount, total: formatMoney(detail.cost.total.gross) })
        : t('camp.maint.confirm.close_none'),
    cancel: t('camp.maint.confirm.cancel'),
  }
  return (
    <Modal
      title={ACTION_LABEL[action]}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button variant={action === 'cancel' ? 'danger' : 'primary'} onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={action === 'cancel' && !reason.trim()}>
            {ACTION_LABEL[action]}
          </Button>
        </>
      }
    >
      <p className="text-sm">{body[action]}</p>
      {action === 'cancel' && (
        <Field label={t('camp.maint.cancel_reason')}>{(id) => <input id={id} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function EditModal({ campId, detail, onClose }: { campId: string; detail: MaintenanceDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(detail.title)
  const [description, setDescription] = useState(detail.description ?? '')
  const [priority, setPriority] = useState<MaintenancePriority>(detail.priority)
  const m = useAppMutation(
    () => campApi.updateMaintenance(campId, detail.id, { title: title.trim(), description: description.trim() || null, priority }),
    [campKeys.maintenance(campId)],
    onClose,
  )
  return (
    <Modal
      title={t('camp.maint.edit_title', { no: detail.requestNo })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!title.trim()}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.maint.title_col')}>{(id) => <input id={id} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
      <Field label={t('camp.roles.description')}>{(id) => <textarea id={id} rows={3} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}</Field>
      <Field label={t('camp.maint.priority')}>
        {(id) => (
          <select id={id} className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
            {(Object.keys(PRIORITY_LABEL) as MaintenancePriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function PartModal({ campId, requestId, part, onClose }: { campId: string; requestId: string; part: MaintenancePart | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    partName: part?.partName ?? '',
    quantity: part?.quantity ?? '1',
    unit: part?.unit ?? t('camp.part.unit_default'),
    unitPrice: part?.unitPrice ?? '',
    vatIncluded: part?.vatIncluded ?? true,
    source: (part?.source ?? 'CATERING_PURCHASED') as PartSource,
  })
  const qty = Number(f.quantity)
  const price = f.unitPrice === '' ? null : Number(f.unitPrice)
  const qtyBad = !(qty > 0)
  const priceBad = price !== null && !(price >= 0)
  const needPrice = f.source === 'CATERING_PURCHASED' && price === null
  const body = (): PartInput => ({ partName: f.partName.trim(), quantity: qty, unit: f.unit.trim() || t('camp.part.unit_default'), unitPrice: price, vatIncluded: f.vatIncluded, source: f.source })
  const m = useAppMutation(
    () => (part ? campApi.updatePart(campId, requestId, part.id, body()) : campApi.addPart(campId, requestId, body())),
    [campKeys.maintenance(campId)],
    onClose,
  )
  return (
    <Modal
      title={part ? t('camp.part.edit_title') : t('camp.part.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.partName.trim() || qtyBad || priceBad || needPrice}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.part.name')}>{(id) => <input id={id} className={inputCls} value={f.partName} onChange={(e) => setF({ ...f, partName: e.target.value })} maxLength={200} />}</Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.part.quantity')} error={qtyBad ? '> 0' : null}>
          {(id) => <input id={id} type="number" min={0.001} step="0.001" className={inputCls} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />}
        </Field>
        <Field label={t('camp.part.unit')}>{(id) => <input id={id} className={inputCls} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} maxLength={20} />}</Field>
        <Field label={t('camp.part.unit_price_mnt')} error={needPrice ? t('camp.part.price_required') : priceBad ? '≥ 0' : null}>
          {(id) => <input id={id} type="number" min={0} step="0.01" className={inputCls} value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />}
        </Field>
      </div>
      <Field label={t('camp.part.source')} hint={t('camp.part.source_hint')}>
        {(id) => (
          <select id={id} className={inputCls} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as PartSource })}>
            {(Object.keys(PART_SOURCE_LABEL) as PartSource[]).map((s) => (
              <option key={s} value={s}>
                {PART_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.vatIncluded} onChange={(e) => setF({ ...f, vatIncluded: e.target.checked })} /> {t('camp.part.vat_in_price')}
      </label>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
