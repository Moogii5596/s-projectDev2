import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { Building, BulkRoomsInput, Room, RoomStatus } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { ROOM_STATUS_LABEL } from '../lib/labels'
import { BULK_ROOMS_MAX, planRooms } from '../lib/room-range'
import { ExportButton } from '../components/ImportDialog'
import { ActiveBadge, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const STATUS_TONE: Record<RoomStatus, 'green' | 'yellow' | 'gray'> = { ACTIVE: 'green', MAINTENANCE: 'yellow', INACTIVE: 'gray' }

/**
 * Тохиргоо › Байр, өрөө — байр (master.manage), өрөө (room.manage эсвэл master.manage).
 * FB-07 (v0.2.0): байрны жагсаалтад өрөө/орны тоо, байр дээр дарахад тухайн байрны өрөө, байр үүсгэхдээ өрөө нэг дор,
 * "+ Олон өрөө", Excel экспорт.
 */
export default function FacilitiesPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const buildings = useQuery({ queryKey: campKeys.buildings(campId), queryFn: () => campApi.buildings(campId) })
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const [buildingFilter, setBuildingFilter] = useState('')
  const [q, setQ] = useState('')
  const [roomModal, setRoomModal] = useState<Room | 'new' | null>(null)
  const [bulkFor, setBulkFor] = useState<Building | null>(null)
  const canBuilding = perms.can(P.MASTER_MANAGE)
  const canRoom = perms.can(P.ROOM_MANAGE, P.MASTER_MANAGE)

  const needle = q.trim().toLowerCase()
  const shown = (rooms.data ?? []).filter((r) => (!buildingFilter || r.buildingId === buildingFilter) && (!needle || r.roomNo.toLowerCase().includes(needle)))
  const activeBuildings = (buildings.data ?? []).filter((b) => b.isActive)
  const totalRooms = (buildings.data ?? []).reduce((s, b) => s + (b._count?.rooms ?? 0), 0)

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card title={t('camp.facilities.buildings')}>
        {buildings.isLoading && <Loading />}
        <ErrorBox error={buildings.error} />
        {buildings.data && (
          <Buildings
            campId={campId}
            rows={buildings.data}
            totalRooms={totalRooms}
            selected={buildingFilter}
            onSelect={setBuildingFilter}
            onBulk={setBulkFor}
            canEdit={canBuilding}
            canRoom={canRoom}
          />
        )}
      </Card>

      <Card
        title={t('camp.facilities.rooms_title', { n: rooms.data ? shown.length : '…' })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={t('camp.facilities.search_room')} placeholder={t('camp.facilities.search_room')} className={`${inputSmCls} w-32`} value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label={t('camp.facilities.filter_building')} className={`${inputSmCls} w-auto`} value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
              <option value="">{t('camp.facilities.all_buildings')}</option>
              {buildings.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
            <ExportButton campId={campId} type="rooms" />
            {canRoom && (
              <Button size="sm" onClick={() => setRoomModal('new')} disabled={activeBuildings.length === 0} title={activeBuildings.length === 0 ? t('camp.facilities.add_building_first') : undefined}>
                {t('camp.facilities.add_room')}
              </Button>
            )}
          </div>
        }
      >
        {rooms.isLoading && <Loading />}
        <ErrorBox error={rooms.error} />
        {rooms.data && shown.length === 0 && <Empty>{t('camp.facilities.no_rooms')}</Empty>}
        {shown.length > 0 && (
          <Table head={[t('camp.facilities.building'), t('camp.facilities.room'), t('camp.facilities.floor'), t('camp.facilities.capacity'), t('camp.common.status'), t('camp.facilities.note'), '']}>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.building.code}</td>
                <td className={`${td} font-medium`}>{r.roomNo}</td>
                <td className={td}>{r.floor ?? '—'}</td>
                <td className={td}>{r.capacity}</td>
                <td className={td}>
                  {r.status === 'MAINTENANCE' ? (
                    <Link to={`/camp/${campId}/maintenance?roomId=${r.id}`} title={t('camp.facilities.room_repairs')}>
                      <Badge tone={STATUS_TONE[r.status]}>{ROOM_STATUS_LABEL[r.status]} →</Badge>
                    </Link>
                  ) : (
                    <Badge tone={STATUS_TONE[r.status]}>{ROOM_STATUS_LABEL[r.status]}</Badge>
                  )}
                </td>
                <td className={`${td} text-gray-500 max-w-[16rem] truncate`}>{r.note ?? ''}</td>
                <td className={`${td} text-right`}>
                  {canRoom && (
                    <Button variant="ghost" onClick={() => setRoomModal(r)}>
                      {t('camp.common.edit')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {roomModal && (
        <RoomModal
          campId={campId}
          room={roomModal === 'new' ? null : roomModal}
          buildings={activeBuildings}
          defaultBuildingId={buildingFilter}
          onClose={() => setRoomModal(null)}
        />
      )}
      {bulkFor && (
        <BulkRoomsModal
          campId={campId}
          building={bulkFor}
          existing={(rooms.data ?? []).filter((r) => r.buildingId === bulkFor.id).map((r) => r.roomNo)}
          onClose={() => setBulkFor(null)}
        />
      )}
    </div>
  )
}

function Buildings({
  campId,
  rows,
  totalRooms,
  selected,
  onSelect,
  onBulk,
  canEdit,
  canRoom,
}: {
  campId: string
  rows: Building[]
  totalRooms: number
  selected: string
  onSelect: (id: string) => void
  onBulk: (b: Building) => void
  canEdit: boolean
  canRoom: boolean
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [withRooms, setWithRooms] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [range, setRange] = useState<RangeForm>(defaultRange())
  // v0.2.1 (Q4): байрны төрөл — байгууллагын каталог (Системийн тохиргоо)
  const types = useQuery({ queryKey: campKeys.catalog('building-types'), queryFn: () => campApi.catalog('building-types') })
  const activeTypes = (types.data ?? []).filter((x) => x.isActive)
  const plan = withRooms ? planRooms(rangeInput(range), []) : null
  const add = useCampMutation(
    () => campApi.createBuilding(campId, { code: code.trim(), name: name.trim(), typeId: typeId || null, ...(withRooms ? { rooms: rangeInput(range) } : {}) }),
    [campKeys.buildings(campId), campKeys.rooms(campId), campKeys.catalog('building-types')],
    () => {
      setCode('')
      setName('')
      setTypeId('')
      setWithRooms(false)
      setRange(defaultRange())
    },
  )
  const toggle = useCampMutation((b: Building) => campApi.updateBuilding(campId, b.id, { isActive: !b.isActive }), [campKeys.buildings(campId)])
  const setType = useCampMutation(
    (v: { b: Building; typeId: string }) => campApi.updateBuilding(campId, v.b.id, { typeId: v.typeId || null }),
    [campKeys.buildings(campId), campKeys.catalog('building-types')],
  )
  const itemCls = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 px-2 py-2 text-left text-sm rounded-lg ${active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <Empty>{t('camp.facilities.no_buildings')}</Empty>
      ) : (
        <ul className="space-y-1">
          <li>
            <button type="button" className={itemCls(selected === '')} onClick={() => onSelect('')} aria-pressed={selected === ''}>
              <span className="font-medium">{t('camp.facilities.all_buildings')}</span>
              <span className="text-gray-500">{t('camp.facilities.n_rooms', { n: totalRooms })}</span>
            </button>
          </li>
          {rows.map((b) => (
            <li key={b.id} className="space-y-1">
              <button type="button" className={itemCls(selected === b.id)} onClick={() => onSelect(b.id)} aria-pressed={selected === b.id}>
                <span>
                  <span className="font-mono text-gray-500 mr-2">{b.code}</span>
                  {b.name}
                  {b.type && !canEdit && <span className="ml-2 text-xs text-gray-500">· {b.type.name}</span>}
                </span>
                <span className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                  {t('camp.facilities.rooms_beds', { rooms: b.activeRooms ?? b._count?.rooms ?? 0, beds: b.capacity ?? 0 })}
                  {!b.isActive && <ActiveBadge active={false} />}
                </span>
              </button>
              {/* v0.2.1: үйлдлүүд тусдаа мөрөнд — нарийн самбарт товч далдлагдахгүй (e2e FB-07) */}
              <div className="flex flex-wrap items-center gap-2 pl-2">
                {canEdit && (
                  <select
                    aria-label={t('camp.facilities.type_of', { code: b.code })}
                    className={`${inputSmCls} w-28`}
                    value={b.typeId ?? ''}
                    disabled={setType.isPending}
                    onChange={(e) => setType.mutate({ b, typeId: e.target.value })}
                  >
                    <option value="">{t('camp.facilities.no_type')}</option>
                    {(types.data ?? [])
                      .filter((x) => x.isActive || x.id === b.typeId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                )}
                {canRoom && b.isActive && (
                  <Button variant="ghost" onClick={() => onBulk(b)} title={t('camp.facilities.bulk_title', { code: b.code })}>
                    {t('camp.facilities.bulk_short')}
                  </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" onClick={() => toggle.mutate(b)}>
                    {b.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="space-y-2 border-t border-gray-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(undefined)
          }}
        >
          <div className="grid grid-cols-[6rem_1fr_auto] gap-2">
            <input aria-label={t('camp.facilities.building_code')} className={inputCls} placeholder={t('camp.common.code')} value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />
            <input aria-label={t('camp.facilities.building_name')} className={inputCls} placeholder={t('camp.common.name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            <Button type="submit" loading={add.isPending} disabled={!code.trim() || !name.trim() || (plan !== null && !plan.ok)}>
              {t('camp.common.add')}
            </Button>
          </div>
          {activeTypes.length > 0 && (
            <select aria-label={t('camp.facilities.building_type')} className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{t('camp.facilities.no_type')}</option>
              {activeTypes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={withRooms} onChange={(e) => setWithRooms(e.target.checked)} /> {t('camp.facilities.with_rooms')}
          </label>
          {withRooms && <RangeFields f={range} set={setRange} plan={plan} />}
        </form>
      )}
      <p className="text-xs text-gray-400">{t('camp.facilities.deactivate_hint')}</p>
      <ErrorBox error={add.error ?? toggle.error ?? setType.error} />
    </div>
  )
}

type RangeForm = { from: string; to: string; prefix: string; pad: boolean; floor: string; capacity: string; skip: boolean }
const defaultRange = (): RangeForm => ({ from: '1', to: '10', prefix: '', pad: true, floor: '', capacity: '2', skip: true })
function rangeInput(f: RangeForm): BulkRoomsInput {
  const to = Number(f.to)
  return {
    from: Number(f.from),
    to,
    prefix: f.prefix.trim() || undefined,
    padTo: f.pad ? Math.max(2, String(Number.isFinite(to) ? to : 0).length) : 0,
    floor: f.floor === '' ? null : Number(f.floor),
    capacity: Number(f.capacity),
    skipExisting: f.skip,
  }
}

function RangeFields({ f, set, plan, showSkip }: { f: RangeForm; set: (f: RangeForm) => void; plan: ReturnType<typeof planRooms> | null; showSkip?: boolean }) {
  const { t } = useTranslation()
  const upd = (k: keyof RangeForm, v: string | boolean) => set({ ...f, [k]: v })
  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label={t('camp.facilities.range_from')}>{(id) => <input id={id} type="number" min={0} className={inputCls} value={f.from} onChange={(e) => upd('from', e.target.value)} />}</Field>
        <Field label={t('camp.facilities.range_to')}>{(id) => <input id={id} type="number" min={0} className={inputCls} value={f.to} onChange={(e) => upd('to', e.target.value)} />}</Field>
        <Field label={t('camp.facilities.prefix')}>{(id) => <input id={id} className={inputCls} value={f.prefix} onChange={(e) => upd('prefix', e.target.value)} maxLength={20} placeholder="7-" />}</Field>
        <Field label={t('camp.facilities.floor')}>{(id) => <input id={id} type="number" min={-5} max={100} className={inputCls} value={f.floor} onChange={(e) => upd('floor', e.target.value)} />}</Field>
        <Field label={t('camp.facilities.capacity')}>{(id) => <input id={id} type="number" min={1} max={50} className={inputCls} value={f.capacity} onChange={(e) => upd('capacity', e.target.value)} />}</Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={f.pad} onChange={(e) => upd('pad', e.target.checked)} /> {t('camp.facilities.pad')}
        </label>
        {showSkip && (
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={f.skip} onChange={(e) => upd('skip', e.target.checked)} /> {t('camp.facilities.skip_existing')}
          </label>
        )}
      </div>
      {plan && (
        <p className={`text-xs ${plan.ok ? 'text-gray-600' : 'text-red-600'}`}>
          {plan.ok
            ? plan.all.length === 0
              ? t('camp.facilities.preview_none')
              : t('camp.facilities.preview', { first: plan.all[0], last: plan.all[plan.all.length - 1], create: plan.create.length, skip: plan.skip.length })
            : plan.reason === 'range'
              ? t('camp.facilities.range_invalid')
              : t('camp.facilities.range_too_many', { max: BULK_ROOMS_MAX, n: plan.n })}
        </p>
      )}
    </div>
  )
}

function BulkRoomsModal({ campId, building, existing, onClose }: { campId: string; building: Building; existing: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState<RangeForm>(defaultRange())
  const plan = planRooms(rangeInput(f), existing)
  const m = useCampMutation(() => campApi.bulkRooms(campId, building.id, rangeInput(f)), [campKeys.buildings(campId), campKeys.rooms(campId)], onClose)
  const n = plan.ok ? (f.skip ? plan.create.length : plan.all.length) : 0
  return (
    <Modal
      title={t('camp.facilities.bulk_title', { code: building.code })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!plan.ok || n === 0 || !(Number(f.capacity) >= 1)}>
            {t('camp.facilities.create_n', { n })}
          </Button>
        </>
      }
    >
      <RangeFields f={f} set={setF} plan={plan} showSkip />
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function RoomModal({
  campId,
  room,
  buildings,
  defaultBuildingId,
  onClose,
}: {
  campId: string
  room: Room | null
  buildings: Building[]
  defaultBuildingId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    buildingId: room?.buildingId ?? (buildings.some((b) => b.id === defaultBuildingId) ? defaultBuildingId : buildings[0]?.id ?? ''),
    roomNo: room?.roomNo ?? '',
    floor: room?.floor == null ? '' : String(room.floor),
    capacity: room ? String(room.capacity) : '2',
    status: room?.status ?? ('ACTIVE' as RoomStatus),
    note: room?.note ?? '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const base = () => ({ roomNo: f.roomNo.trim(), floor: f.floor === '' ? null : Number(f.floor), capacity: Number(f.capacity), note: f.note.trim() || null })
  const m = useCampMutation(
    () => (room ? campApi.updateRoom(campId, room.id, { ...base(), status: f.status }) : campApi.createRoom(campId, { ...base(), buildingId: f.buildingId })),
    [campKeys.rooms(campId), campKeys.buildings(campId)],
    onClose,
  )
  return (
    <Modal
      title={room ? t('camp.facilities.edit_room', { room: `${room.building.code}-${room.roomNo}` }) : t('camp.facilities.add_room_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.roomNo.trim() || !f.buildingId || !(Number(f.capacity) >= 1)}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      {!room && (
        <Field label={t('camp.facilities.building')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.buildingId} onChange={(e) => set('buildingId', e.target.value)}>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.facilities.room_no')}>{(id) => <input id={id} className={inputCls} value={f.roomNo} onChange={(e) => set('roomNo', e.target.value)} maxLength={30} />}</Field>
        <Field label={t('camp.facilities.floor')}>{(id) => <input id={id} type="number" min={-5} max={100} className={inputCls} value={f.floor} onChange={(e) => set('floor', e.target.value)} />}</Field>
        <Field label={t('camp.facilities.capacity')}>{(id) => <input id={id} type="number" min={1} max={50} className={inputCls} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />}</Field>
      </div>
      {room && (
        <Field label={t('camp.common.status')} hint={t('camp.facilities.status_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ROOM_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field label={t('camp.facilities.note')}>{(id) => <input id={id} className={inputCls} value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={500} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
