import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { campApi, type AssetQuery } from '../api/camp-api'
import type { Asset, AssetCondition, Room } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { CONDITION_LABEL } from '../lib/labels'
import { formatMoney } from '../lib/money'
import { todayUb } from '../lib/dates'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const COND_TONE: Record<AssetCondition, 'green' | 'yellow' | 'gray'> = { GOOD: 'green', DAMAGED: 'yellow', WRITTEN_OFF: 'gray' }
const roomLabel = (a: { room: { roomNo: string; building: { code: string } } | null }) => (a.room ? `${a.room.building.code}-${a.room.roomNo}` : 'Агуулах')

/** /camp/:campId/assets — үндсэн хөрөнгө: жагсаалт, бүртгэх, засах, шилжүүлэх, актлах, түүх */
export default function AssetsPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.ASSET_MANAGE)
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const cats = useQuery({ queryKey: campKeys.assetCategories, queryFn: () => campApi.assetCategories(false) })
  const [filter, setFilter] = useState<AssetQuery>({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Asset | 'new' | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const q: AssetQuery = { ...filter, q: search.trim() || undefined, limit: 50 }
  const list = useInfiniteQuery({
    queryKey: [...campKeys.assets(campId), q],
    queryFn: ({ pageParam }) => campApi.assets(campId, { ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const setF = (k: keyof AssetQuery, v: string) => setFilter((f) => ({ ...f, [k]: v || undefined }))
  const usableRooms = (rooms.data ?? []).filter((r) => r.status !== 'INACTIVE')

  return (
    <Card title="Үндсэн хөрөнгө" actions={canEdit && <Button size="sm" onClick={() => setEditing('new')}>+ Хөрөнгө</Button>}>
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label="Хөрөнгө хайх" className={`${inputSmCls} w-56 max-w-full`} placeholder="Инвентарь, нэр, сериал" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Байршлаар шүүх" className={`${inputSmCls} w-auto`} value={filter.roomId ?? ''} onChange={(e) => setF('roomId', e.target.value)}>
          <option value="">Бүх байршил</option>
          <option value="warehouse">Агуулах</option>
          {usableRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.building.code}-{r.roomNo}
            </option>
          ))}
        </select>
        <select aria-label="Ангиллаар шүүх" className={`${inputSmCls} w-auto`} value={filter.categoryId ?? ''} onChange={(e) => setF('categoryId', e.target.value)}>
          <option value="">Бүх ангилал</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Төлвөөр шүүх" className={`${inputSmCls} w-auto`} value={filter.condition ?? ''} onChange={(e) => setF('condition', e.target.value)}>
          <option value="">Бүх төлөв</option>
          {(Object.keys(CONDITION_LABEL) as AssetCondition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>Хөрөнгө олдсонгүй</Empty>}
      {rows.length > 0 && (
        <Table head={['Инвентарь', 'Нэр', 'Ангилал', 'Байршил', 'Төлөв', 'Үнэ', '']}>
          {rows.map((a) => (
            <tr key={a.id} className={a.condition === 'WRITTEN_OFF' ? 'text-gray-400' : ''}>
              <td className={`${td} font-mono`}>{a.inventoryNo}</td>
              <td className={`${td} font-medium`}>
                {a.name}
                {a.serialNo && <span className="text-xs text-gray-400 ml-1">SN {a.serialNo}</span>}
              </td>
              <td className={td}>{a.category.name}</td>
              <td className={td}>{roomLabel(a)}</td>
              <td className={td}>
                <Badge tone={COND_TONE[a.condition]}>{CONDITION_LABEL[a.condition]}</Badge>
              </td>
              <td className={`${td} tabular-nums whitespace-nowrap`}>{a.acquiredCost ? formatMoney(a.acquiredCost) : '—'}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                <Button variant="ghost" onClick={() => setDetailId(a.id)}>
                  Дэлгэрэнгүй
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {list.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Цааш ачаалах
          </Button>
        </div>
      )}
      {editing && <AssetModal campId={campId} asset={editing === 'new' ? null : editing} rooms={usableRooms} onClose={() => setEditing(null)} />}
      {detailId && (
        <AssetDetailModal
          campId={campId}
          id={detailId}
          rooms={usableRooms}
          canEdit={canEdit}
          canMaintain={perms.can(P.MAINTENANCE_CREATE)}
          onEdit={(a) => {
            setDetailId(null)
            setEditing(a)
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </Card>
  )
}

function AssetModal({ campId, asset, rooms, onClose }: { campId: string; asset: Asset | null; rooms: Room[]; onClose: () => void }) {
  const cats = useQuery({ queryKey: campKeys.assetCategories, queryFn: () => campApi.assetCategories(false) })
  const [f, setF] = useState({
    inventoryNo: asset?.inventoryNo ?? '',
    name: asset?.name ?? '',
    serialNo: asset?.serialNo ?? '',
    categoryId: asset?.categoryId ?? '',
    roomId: '',
    condition: (asset?.condition ?? 'GOOD') as AssetCondition,
    acquiredDate: asset?.acquiredDate ?? '',
    acquiredCost: asset?.acquiredCost ?? '',
    note: asset?.note ?? '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const base = () => ({
    inventoryNo: f.inventoryNo.trim(),
    name: f.name.trim(),
    serialNo: f.serialNo.trim() || null,
    categoryId: f.categoryId,
    condition: f.condition,
    acquiredDate: f.acquiredDate || null,
    acquiredCost: f.acquiredCost === '' ? null : Number(f.acquiredCost),
    note: f.note.trim() || null,
  })
  const m = useCampMutation(
    () => (asset ? campApi.updateAsset(campId, asset.id, base()) : campApi.createAsset(campId, { ...base(), roomId: f.roomId || null })),
    [campKeys.assets(campId)],
    onClose,
  )
  const usableCats = (cats.data ?? []).filter((c) => c.isActive || c.id === f.categoryId)
  const costInvalid = f.acquiredCost !== '' && !(Number(f.acquiredCost) >= 0)

  return (
    <Modal
      title={asset ? `Хөрөнгө ${asset.inventoryNo} засах` : 'Хөрөнгө бүртгэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.inventoryNo.trim() || !f.name.trim() || !f.categoryId || costInvalid}>
            Хадгалах
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Инвентарийн дугаар">{(id) => <input id={id} className={inputCls} value={f.inventoryNo} onChange={(e) => set('inventoryNo', e.target.value)} maxLength={50} />}</Field>
        <div className="col-span-2">
          <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ангилал" hint={usableCats.length === 0 ? 'Эхлээд "Хөрөнгийн ангилал" хуудсанд ангилал нэмнэ үү' : undefined}>
          {(id) => (
            <select id={id} className={inputCls} value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Сонгох —</option>
              {usableCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Сериал дугаар">{(id) => <input id={id} className={inputCls} value={f.serialNo} onChange={(e) => set('serialNo', e.target.value)} maxLength={100} />}</Field>
      </div>
      {!asset && (
        <Field label="Байршил" hint="Дараа нь 'Шилжүүлэх'-ээр өөрчилнө (түүхэнд бичигдэнэ)">
          {(id) => (
            <select id={id} className={inputCls} value={f.roomId} onChange={(e) => set('roomId', e.target.value)}>
              <option value="">Агуулах</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.building.code}-{r.roomNo}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Төлөв">
          {(id) => (
            <select id={id} className={inputCls} value={f.condition} onChange={(e) => set('condition', e.target.value)}>
              <option value="GOOD">Хэвийн</option>
              <option value="DAMAGED">Гэмтэлтэй</option>
            </select>
          )}
        </Field>
        <Field label="Авсан огноо">{(id) => <input id={id} type="date" max={todayUb()} className={inputCls} value={f.acquiredDate} onChange={(e) => set('acquiredDate', e.target.value)} />}</Field>
        <Field label="Үнэ (₮)" error={costInvalid ? 'Тоо (≥ 0)' : null}>
          {(id) => <input id={id} type="number" min={0} step="0.01" className={inputCls} value={f.acquiredCost} onChange={(e) => set('acquiredCost', e.target.value)} />}
        </Field>
      </div>
      <Field label="Тэмдэглэл">{(id) => <textarea id={id} rows={2} className={inputCls} value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function AssetDetailModal({
  campId,
  id,
  rooms,
  canEdit,
  canMaintain,
  onEdit,
  onClose,
}: {
  campId: string
  id: string
  rooms: Room[]
  canEdit: boolean
  canMaintain: boolean
  onEdit: (a: Asset) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const asset = useQuery({ queryKey: [...campKeys.assets(campId), 'detail', id], queryFn: () => campApi.asset(campId, id) })
  const history = useQuery({ queryKey: [...campKeys.assets(campId), 'movements', id], queryFn: () => campApi.assetMovements(campId, id) })
  const [mode, setMode] = useState<'view' | 'move' | 'writeOff'>('view')
  const [toRoom, setToRoom] = useState('')
  const [reason, setReason] = useState('')
  const reset = () => {
    setMode('view')
    setReason('')
  }
  const move = useCampMutation(() => campApi.moveAsset(campId, id, { toRoomId: toRoom || null, reason: reason.trim() || null }), [campKeys.assets(campId)], reset)
  const writeOff = useCampMutation(() => campApi.writeOffAsset(campId, id, reason.trim()), [campKeys.assets(campId)], reset)
  const a = asset.data
  const locked = a?.condition === 'WRITTEN_OFF'

  return (
    <Modal wide title={a ? `${a.inventoryNo} · ${a.name}` : 'Хөрөнгө'} onClose={onClose}>
      {asset.isLoading && <Loading />}
      <ErrorBox error={asset.error} />
      {a && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Ангилал</dt>
              <dd>{a.category.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Байршил</dt>
              <dd>{roomLabel(a)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Төлөв</dt>
              <dd>
                <Badge tone={COND_TONE[a.condition]}>{CONDITION_LABEL[a.condition]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Нээлттэй засвар</dt>
              <dd>{a.openMaintenance ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Авсан огноо</dt>
              <dd>{a.acquiredDate ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Үнэ</dt>
              <dd className="tabular-nums">{formatMoney(a.acquiredCost)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Тэмдэглэл</dt>
              <dd className="whitespace-pre-line">{a.note ?? '—'}</dd>
            </div>
          </dl>

          {!locked && mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => onEdit(a)}>
                    Засах
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setMode('move')}>
                    Шилжүүлэх
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setMode('writeOff')}>
                    Актлах
                  </Button>
                </>
              )}
              {canMaintain && (
                <Button size="sm" onClick={() => navigate(`../maintenance?new=1&assetId=${a.id}`)}>
                  Засварын хүсэлт
                </Button>
              )}
            </div>
          )}
          {locked && <p className="text-sm text-gray-500">Актлагдсан хөрөнгө — өөрчлөх, шилжүүлэх, засварт оруулах боломжгүй.</p>}

          {mode === 'move' && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Шинэ байршил">
                  {(fid) => (
                    <select id={fid} className={inputCls} value={toRoom} onChange={(e) => setToRoom(e.target.value)}>
                      <option value="">Агуулах</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.building.code}-{r.roomNo}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Шалтгаан">{(fid) => <input id={fid} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
              </div>
              <ErrorBox error={move.error} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => move.mutate(undefined)} loading={move.isPending}>
                  Шилжүүлэх
                </Button>
                <Button size="sm" variant="secondary" onClick={reset}>
                  Болих
                </Button>
              </div>
            </div>
          )}
          {mode === 'writeOff' && (
            <div className="border border-red-200 bg-red-50/40 rounded-lg p-3 space-y-3">
              <p className="text-sm text-red-700">Актласны дараа буцаах боломжгүй. Хөрөнгө агуулах руу шилжиж, түгжигдэнэ.</p>
              <Field label="Актлах шалтгаан">{(fid) => <input id={fid} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
              <ErrorBox error={writeOff.error} />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => writeOff.mutate(undefined)} loading={writeOff.isPending} disabled={!reason.trim()}>
                  Актлах
                </Button>
                <Button size="sm" variant="secondary" onClick={reset}>
                  Болих
                </Button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Шилжилтийн түүх</h3>
            <ErrorBox error={history.error} />
            {history.data && history.data.length === 0 && <Empty>Шилжилт алга</Empty>}
            {history.data && history.data.length > 0 && (
              <Table head={['Огноо', 'Хаанаас', 'Хаашаа', 'Шалтгаан', 'Хэн']}>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td className={`${td} whitespace-nowrap`}>{h.movedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className={td}>{h.fromRoom?.roomNo ?? 'Агуулах'}</td>
                    <td className={td}>{h.toRoom?.roomNo ?? 'Агуулах'}</td>
                    <td className={td}>{h.reason ?? ''}</td>
                    <td className={`${td} text-gray-500`}>{h.movedByUser.fullName ?? h.movedByUser.email}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
