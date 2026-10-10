import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi, type PartInput } from '../api/camp-api'
import type { MaintenanceAction, MaintenanceDetail, MaintenancePart, MaintenancePriority, PartSource } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { MAINT_STATUS_LABEL, PART_SOURCE_LABEL, PRIORITY_LABEL } from '../lib/labels'
import { formatMoney } from '../lib/money'
import { ACTION_LABEL, type MaintenanceActor, STATUS_TONE, availableActions, canEditDetails, canEditParts } from '../lib/maintenance'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../components/ui'

const FLOW: { status: MaintenanceDetail['status']; label: string }[] = [
  { status: 'OPEN', label: 'Нээлттэй' },
  { status: 'IN_PROGRESS', label: 'Хийгдэж буй' },
  { status: 'DONE', label: 'Дууссан' },
  { status: 'CLOSED', label: 'Хаагдсан' },
]
const ts = (v: string | null) => (v ? v.slice(0, 16).replace('T', ' ') : '—')

/** /camp/:campId/maintenance/:id — засварын дэлгэрэнгүй: төлөв, сэлбэг, зардлын урьдчилсан тооцоо */
export default function MaintenanceDetailPage() {
  const { campId = '', id = '' } = useParams()
  const perms = useCampPermissions(campId)
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
  const removePart = useCampMutation((partId: string) => campApi.removePart(campId, id, partId), [campKeys.maintenance(campId)])

  if (q.isLoading) return <Loading />
  if (q.isError || !m) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />

  const actions = availableActions(m.status, actor)
  const partsEditable = canEditParts(m.status, actor)
  const costCount = m.cost.lines.length

  return (
    <div className="space-y-5">
      <div className="text-sm text-gray-500">
        <Link to=".." relative="path" className="hover:text-blue-600">
          Засвар
        </Link>{' '}
        / <span className="font-mono">{m.requestNo}</span>
      </div>

      <Card
        title={`${m.requestNo} · ${m.title}`}
        actions={
          canEditDetails(m.status, actor) && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Засах
            </Button>
          )
        }
      >
        <ol className="flex flex-wrap items-center gap-2 text-xs mb-4" aria-label="Төлвийн дараалал">
          {m.status === 'CANCELLED' ? (
            <li>
              <Badge tone="red">Цуцлагдсан</Badge>
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
                    {f.label}
                  </span>
                  {i < FLOW.length - 1 && <span className="text-gray-300">→</span>}
                </li>
              )
            })
          )}
        </ol>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Өрөө</dt>
            <dd>
              {m.room ? `${m.room.building.code}-${m.room.roomNo}` : '—'}
              {m.blocksRoom && m.room && <span className="block text-xs text-yellow-700">Өрөөг түгжинэ ({m.room.status === 'MAINTENANCE' ? 'засварт' : 'сулласан'})</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Хөрөнгө</dt>
            <dd>{m.asset ? `${m.asset.inventoryNo} · ${m.asset.name}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Зэрэглэл</dt>
            <dd>{PRIORITY_LABEL[m.priority]}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Төлөв</dt>
            <dd>
              <Badge tone={STATUS_TONE[m.status]}>{MAINT_STATUS_LABEL[m.status]}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Үүсгэсэн</dt>
            <dd>
              {m.reportedByUser?.fullName ?? m.reportedByUser?.email ?? '—'} · {ts(m.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Эхэлсэн / дууссан</dt>
            <dd>
              {ts(m.startedAt)} / {ts(m.completedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Хаагдсан</dt>
            <dd>{ts(m.closedAt)}</dd>
          </div>
          {m.cancelReason && (
            <div>
              <dt className="text-xs text-gray-500">Цуцалсан шалтгаан</dt>
              <dd>{m.cancelReason}</dd>
            </div>
          )}
          {m.description && (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-gray-500">Тайлбар</dt>
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

      <Card title="Сэлбэг" actions={partsEditable && <Button size="sm" onClick={() => setPartModal('new')}>+ Сэлбэг</Button>}>
        {!partsEditable && (m.status === 'CLOSED' || m.status === 'CANCELLED') && <p className="text-xs text-gray-500 mb-2">Хаагдсан/цуцлагдсан засварын сэлбэг түгжигдсэн.</p>}
        <ErrorBox error={removePart.error} />
        {m.parts.length === 0 ? (
          <Empty>Сэлбэг бүртгэгдээгүй</Empty>
        ) : (
          <Table head={['Нэр', 'Тоо', 'Нэгж үнэ', 'НӨАТ', 'Эх сурвалж', '']}>
            {m.parts.map((p) => (
              <tr key={p.id}>
                <td className={td}>{p.partName}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>
                  {p.quantity} {p.unit}
                </td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>{formatMoney(p.unitPrice)}</td>
                <td className={td}>{p.vatIncluded ? 'Үнэд орсон' : 'Нэмж тооцно'}</td>
                <td className={td}>
                  <Badge tone={p.source === 'CATERING_PURCHASED' ? 'blue' : 'gray'}>{PART_SOURCE_LABEL[p.source]}</Badge>
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {partsEditable && (
                    <>
                      <Button variant="ghost" onClick={() => setPartModal(p)}>
                        Засах
                      </Button>
                      <Button variant="ghost" onClick={() => removePart.mutate(p.id)} disabled={removePart.isPending}>
                        Устгах
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={m.status === 'CLOSED' ? 'Бүртгэгдсэн зардал (катерингийн сэлбэг)' : 'Зардлын урьдчилсан тооцоо (катерингийн сэлбэг)'}>
        <p className="text-xs text-gray-500 mb-3">
          Зөвхөн "Катерингийн авсан" сэлбэг зардалд орно (кемпийн катеринг байгууллага, НӨАТ {m.cost.vatRate}%). Уурхайн нийлүүлсэн сэлбэг орохгүй.
        </p>
        <dl className="grid grid-cols-3 gap-3 text-sm max-w-xl">
          <div>
            <dt className="text-xs text-gray-500">НӨАТ-гүй дүн</dt>
            <dd className="tabular-nums font-medium">{formatMoney(m.cost.total.net)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">НӨАТ</dt>
            <dd className="tabular-nums font-medium">{formatMoney(m.cost.total.vat)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Нийт</dt>
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
  const [reason, setReason] = useState('')
  const m = useCampMutation(
    () => campApi.transitionMaintenance(campId, detail.id, action, action === 'cancel' ? reason.trim() : undefined),
    [campKeys.maintenance(campId), campKeys.rooms(campId), campKeys.roomBoard(campId), campKeys.assets(campId)],
    (res) => {
      const msgs: string[] = [...(res.warnings ?? [])]
      if (res.roomReleased) msgs.push('Өрөө засвараас гарч идэвхжлээ.')
      if (action === 'close') msgs.push(`Хаагдлаа: ${res.costEntries ?? 0} сэлбэгийн зардал бүртгэгдлээ.`)
      onDone(msgs)
    },
  )
  const body: Record<MaintenanceAction, string> = {
    start: 'Засварын ажлыг эхлүүлэх үү?',
    complete: `Засварыг дууссан гэж тэмдэглэх үү?${detail.blocksRoom ? ' Өөр түгжих засвар байхгүй бол өрөө идэвхжинэ.' : ''}`,
    reopen: `Засварыг дахин нээх үү?${detail.blocksRoom ? ' Өрөө дахин засварт орно.' : ''}`,
    close:
      costCount > 0
        ? `Катерингийн ${costCount} сэлбэгийн зардал (нийт ${formatMoney(detail.cost.total.gross)}) зардлын бүртгэлд орж, дахин засах боломжгүй болно. Хаах уу?`
        : 'Катерингийн сэлбэг алга — зардал бүртгэгдэхгүй. Хаах уу? Хаасны дараа засах боломжгүй.',
    cancel: 'Засварын хүсэлтийг цуцлах уу?',
  }
  return (
    <Modal
      title={ACTION_LABEL[action]}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button variant={action === 'cancel' ? 'danger' : 'primary'} onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={action === 'cancel' && !reason.trim()}>
            {ACTION_LABEL[action]}
          </Button>
        </>
      }
    >
      <p className="text-sm">{body[action]}</p>
      {action === 'cancel' && (
        <Field label="Цуцлах шалтгаан">{(id) => <input id={id} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function EditModal({ campId, detail, onClose }: { campId: string; detail: MaintenanceDetail; onClose: () => void }) {
  const [title, setTitle] = useState(detail.title)
  const [description, setDescription] = useState(detail.description ?? '')
  const [priority, setPriority] = useState<MaintenancePriority>(detail.priority)
  const m = useCampMutation(
    () => campApi.updateMaintenance(campId, detail.id, { title: title.trim(), description: description.trim() || null, priority }),
    [campKeys.maintenance(campId)],
    onClose,
  )
  return (
    <Modal
      title={`${detail.requestNo} засах`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!title.trim()}>
            Хадгалах
          </Button>
        </>
      }
    >
      <Field label="Гарчиг">{(id) => <input id={id} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
      <Field label="Тайлбар">{(id) => <textarea id={id} rows={3} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}</Field>
      <Field label="Зэрэглэл">
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
  const [f, setF] = useState({
    partName: part?.partName ?? '',
    quantity: part?.quantity ?? '1',
    unit: part?.unit ?? 'ш',
    unitPrice: part?.unitPrice ?? '',
    vatIncluded: part?.vatIncluded ?? true,
    source: (part?.source ?? 'CATERING_PURCHASED') as PartSource,
  })
  const qty = Number(f.quantity)
  const price = f.unitPrice === '' ? null : Number(f.unitPrice)
  const qtyBad = !(qty > 0)
  const priceBad = price !== null && !(price >= 0)
  const needPrice = f.source === 'CATERING_PURCHASED' && price === null
  const body = (): PartInput => ({ partName: f.partName.trim(), quantity: qty, unit: f.unit.trim() || 'ш', unitPrice: price, vatIncluded: f.vatIncluded, source: f.source })
  const m = useCampMutation(
    () => (part ? campApi.updatePart(campId, requestId, part.id, body()) : campApi.addPart(campId, requestId, body())),
    [campKeys.maintenance(campId)],
    onClose,
  )
  return (
    <Modal
      title={part ? 'Сэлбэг засах' : 'Сэлбэг нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.partName.trim() || qtyBad || priceBad || needPrice}>
            Хадгалах
          </Button>
        </>
      }
    >
      <Field label="Сэлбэгийн нэр">{(id) => <input id={id} className={inputCls} value={f.partName} onChange={(e) => setF({ ...f, partName: e.target.value })} maxLength={200} />}</Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Тоо хэмжээ" error={qtyBad ? '> 0' : null}>
          {(id) => <input id={id} type="number" min={0.001} step="0.001" className={inputCls} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />}
        </Field>
        <Field label="Нэгж">{(id) => <input id={id} className={inputCls} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} maxLength={20} />}</Field>
        <Field label="Нэгж үнэ (₮)" error={needPrice ? 'Катерингийн сэлбэгт заавал' : priceBad ? '≥ 0' : null}>
          {(id) => <input id={id} type="number" min={0} step="0.01" className={inputCls} value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} />}
        </Field>
      </div>
      <Field label="Эх сурвалж" hint="Катерингийн авсан сэлбэг засвар хаагдахад катеринг байгууллагын зардалд бүртгэгдэнэ">
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
        <input type="checkbox" checked={f.vatIncluded} onChange={(e) => setF({ ...f, vatIncluded: e.target.checked })} /> Үнэд НӨАТ орсон
      </label>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
