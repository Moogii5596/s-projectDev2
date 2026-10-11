import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { campApi, type AssetQuery } from '../api/camp-api'
import type { Asset, AssetCondition, Building, Room } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { CONDITION_LABEL } from '../lib/labels'
import { formatMoney } from '../lib/money'
import { todayUb } from '../lib/dates'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'
import { decodeLocation, movementFrom, movementTo, roomLabel } from '../lib/asset-location'
import { useTranslation } from 'react-i18next'

const COND_TONE: Record<AssetCondition, 'green' | 'yellow' | 'gray'> = { GOOD: 'green', DAMAGED: 'yellow', WRITTEN_OFF: 'gray' }
function LocationSelect({ id, value, onChange, rooms, buildings }: { id: string; value: string; onChange: (v: string) => void; rooms: Room[]; buildings: Building[] }) {
  const { t } = useTranslation()
  return (
    <select id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('camp.asset.warehouse')}</option>
      {buildings.length > 0 && (
        <optgroup label={t('camp.asset.group_buildings')}>
          {buildings.map((b) => (
            <option key={b.id} value={`b:${b.id}`}>
              {t('camp.asset.in_building', { code: b.code })} · {b.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('camp.asset.group_rooms')}>
        {rooms.map((r) => (
          <option key={r.id} value={`r:${r.id}`}>
            {r.building.code}-{r.roomNo}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

/** /camp/:campId/assets — үндсэн хөрөнгө: жагсаалт, бүртгэх, засах, шилжүүлэх, актлах, түүх */
export default function AssetsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.ASSET_MANAGE)
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const buildings = useQuery({ queryKey: campKeys.buildings(campId), queryFn: () => campApi.buildings(campId) })
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
  const activeBuildings = (buildings.data ?? []).filter((b) => b.isActive)

  return (
    <Card
      title={t('camp.asset.title')}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setEditing('new')}>
            {t('camp.asset.add')}
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label={t('camp.asset.search')} className={`${inputSmCls} w-56 max-w-full`} placeholder={t('camp.asset.search_ph')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('camp.asset.filter_location')} className={`${inputSmCls} w-auto`} value={filter.roomId ?? ''} onChange={(e) => setF('roomId', e.target.value)}>
          <option value="">{t('camp.asset.all_locations')}</option>
          <option value="warehouse">{t('camp.asset.warehouse')}</option>
          {usableRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.building.code}-{r.roomNo}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.asset.filter_building')} className={`${inputSmCls} w-auto`} value={filter.buildingId ?? ''} onChange={(e) => setF('buildingId', e.target.value)}>
          <option value="">{t('camp.asset.all_buildings')}</option>
          {activeBuildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.asset.filter_category')} className={`${inputSmCls} w-auto`} value={filter.categoryId ?? ''} onChange={(e) => setF('categoryId', e.target.value)}>
          <option value="">{t('camp.asset.all_categories')}</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.status')} className={`${inputSmCls} w-auto`} value={filter.condition ?? ''} onChange={(e) => setF('condition', e.target.value)}>
          <option value="">{t('camp.filter.all_statuses')}</option>
          {(Object.keys(CONDITION_LABEL) as AssetCondition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>{t('camp.asset.empty')}</Empty>}
      {rows.length > 0 && (
        <Table head={[t('camp.asset.inventory'), t('camp.common.name'), t('camp.asset.category'), t('camp.common.location'), t('camp.common.status'), t('camp.asset.cost'), '']}>
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
                  {t('camp.asset.details')}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {list.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            {t('camp.common.load_more')}
          </Button>
        </div>
      )}
      {editing && <AssetModal campId={campId} asset={editing === 'new' ? null : editing} rooms={usableRooms} buildings={activeBuildings} onClose={() => setEditing(null)} />}
      {detailId && (
        <AssetDetailModal
          campId={campId}
          id={detailId}
          rooms={usableRooms}
          buildings={activeBuildings}
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

function AssetModal({ campId, asset, rooms, buildings, onClose }: { campId: string; asset: Asset | null; rooms: Room[]; buildings: Building[]; onClose: () => void }) {
  const { t } = useTranslation()
  const cats = useQuery({ queryKey: campKeys.assetCategories, queryFn: () => campApi.assetCategories(false) })
  const [f, setF] = useState({
    inventoryNo: asset?.inventoryNo ?? '',
    name: asset?.name ?? '',
    serialNo: asset?.serialNo ?? '',
    categoryId: asset?.categoryId ?? '',
    location: '',
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
    () => (asset ? campApi.updateAsset(campId, asset.id, base()) : campApi.createAsset(campId, { ...base(), ...decodeLocation(f.location) })),
    [campKeys.assets(campId)],
    onClose,
  )
  const usableCats = (cats.data ?? []).filter((c) => c.isActive || c.id === f.categoryId)
  const costInvalid = f.acquiredCost !== '' && !(Number(f.acquiredCost) >= 0)

  return (
    <Modal
      title={asset ? t('camp.asset.edit_title', { no: asset.inventoryNo }) : t('camp.asset.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.inventoryNo.trim() || !f.name.trim() || !f.categoryId || costInvalid}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.asset.inventory_no')}>{(id) => <input id={id} className={inputCls} value={f.inventoryNo} onChange={(e) => set('inventoryNo', e.target.value)} maxLength={50} />}</Field>
        <div className="col-span-2">
          <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.asset.category')} hint={usableCats.length === 0 ? t('camp.asset.need_category') : undefined}>
          {(id) => (
            <select id={id} className={inputCls} value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('camp.common.choose')}</option>
              {usableCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.asset.serial')}>{(id) => <input id={id} className={inputCls} value={f.serialNo} onChange={(e) => set('serialNo', e.target.value)} maxLength={100} />}</Field>
      </div>
      {!asset && (
        <Field label={t('camp.common.location')} hint={t('camp.asset.location_hint')}>
          {(id) => <LocationSelect id={id} value={f.location} onChange={(v) => set('location', v)} rooms={rooms} buildings={buildings} />}
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.common.status')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.condition} onChange={(e) => set('condition', e.target.value)}>
              <option value="GOOD">{CONDITION_LABEL.GOOD}</option>
              <option value="DAMAGED">{CONDITION_LABEL.DAMAGED}</option>
            </select>
          )}
        </Field>
        <Field label={t('camp.asset.acquired_date')}>{(id) => <input id={id} type="date" max={todayUb()} className={inputCls} value={f.acquiredDate} onChange={(e) => set('acquiredDate', e.target.value)} />}</Field>
        <Field label={t('camp.asset.cost_mnt')} error={costInvalid ? t('camp.asset.cost_invalid') : null}>
          {(id) => <input id={id} type="number" min={0} step="0.01" className={inputCls} value={f.acquiredCost} onChange={(e) => set('acquiredCost', e.target.value)} />}
        </Field>
      </div>
      <Field label={t('camp.facilities.note')}>{(id) => <textarea id={id} rows={2} className={inputCls} value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function AssetDetailModal({
  campId,
  id,
  rooms,
  buildings,
  canEdit,
  canMaintain,
  onEdit,
  onClose,
}: {
  campId: string
  id: string
  rooms: Room[]
  buildings: Building[]
  canEdit: boolean
  canMaintain: boolean
  onEdit: (a: Asset) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
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
  const move = useCampMutation(
    () => {
      const to = decodeLocation(toRoom)
      return campApi.moveAsset(campId, id, { toRoomId: to.roomId, toBuildingId: to.buildingId, reason: reason.trim() || null })
    },
    [campKeys.assets(campId), campKeys.roomBoard(campId)],
    reset,
  )
  const writeOff = useCampMutation(() => campApi.writeOffAsset(campId, id, reason.trim()), [campKeys.assets(campId)], reset)
  const a = asset.data
  const locked = a?.condition === 'WRITTEN_OFF'

  return (
    <Modal wide title={a ? `${a.inventoryNo} · ${a.name}` : t('camp.asset.asset')} onClose={onClose}>
      {asset.isLoading && <Loading />}
      <ErrorBox error={asset.error} />
      {a && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">{t('camp.asset.category')}</dt>
              <dd>{a.category.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t('camp.common.location')}</dt>
              <dd>{roomLabel(a)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t('camp.common.status')}</dt>
              <dd>
                <Badge tone={COND_TONE[a.condition]}>{CONDITION_LABEL[a.condition]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t('camp.asset.open_repairs')}</dt>
              <dd>{a.openMaintenance ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t('camp.asset.acquired_date')}</dt>
              <dd>{a.acquiredDate ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{t('camp.asset.cost')}</dt>
              <dd className="tabular-nums">{formatMoney(a.acquiredCost)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">{t('camp.facilities.note')}</dt>
              <dd className="whitespace-pre-line">{a.note ?? '—'}</dd>
            </div>
          </dl>

          {!locked && mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => onEdit(a)}>
                    {t('camp.common.edit')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setMode('move')}>
                    {t('camp.asset.move')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setMode('writeOff')}>
                    {t('camp.asset.write_off')}
                  </Button>
                </>
              )}
              {canMaintain && (
                <Button size="sm" onClick={() => navigate(`../maintenance?new=1&assetId=${a.id}`)}>
                  {t('camp.asset.repair_request')}
                </Button>
              )}
            </div>
          )}
          {locked && <p className="text-sm text-gray-500">{t('camp.asset.locked')}</p>}

          {mode === 'move' && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('camp.asset.new_location')}>
                  {(fid) => <LocationSelect id={fid} value={toRoom} onChange={setToRoom} rooms={rooms} buildings={buildings} />}
                </Field>
                <Field label={t('camp.shifts.reason')}>{(fid) => <input id={fid} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
              </div>
              <ErrorBox error={move.error} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => move.mutate(undefined)} loading={move.isPending}>
                  {t('camp.asset.move')}
                </Button>
                <Button size="sm" variant="secondary" onClick={reset}>
                  {t('camp.common.cancel')}
                </Button>
              </div>
            </div>
          )}
          {mode === 'writeOff' && (
            <div className="border border-red-200 bg-red-50/40 rounded-lg p-3 space-y-3">
              <p className="text-sm text-red-700">{t('camp.asset.write_off_warning')}</p>
              <Field label={t('camp.asset.write_off_reason')}>{(fid) => <input id={fid} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
              <ErrorBox error={writeOff.error} />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => writeOff.mutate(undefined)} loading={writeOff.isPending} disabled={!reason.trim()}>
                  {t('camp.asset.write_off')}
                </Button>
                <Button size="sm" variant="secondary" onClick={reset}>
                  {t('camp.common.cancel')}
                </Button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">{t('camp.asset.history')}</h3>
            <ErrorBox error={history.error} />
            {history.data && history.data.length === 0 && <Empty>{t('camp.asset.no_history')}</Empty>}
            {history.data && history.data.length > 0 && (
              <Table head={[t('camp.att.col.date'), t('camp.asset.from'), t('camp.asset.to'), t('camp.shifts.reason'), t('camp.i18n.who')]}>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td className={`${td} whitespace-nowrap`}>{h.movedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className={td}>{movementFrom(h)}</td>
                    <td className={td}>{movementTo(h)}</td>
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
