import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { Building, Room, RoomStatus } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { ROOM_STATUS_LABEL } from '../lib/labels'
import { ActiveBadge, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const STATUS_TONE: Record<RoomStatus, 'green' | 'yellow' | 'gray'> = { ACTIVE: 'green', MAINTENANCE: 'yellow', INACTIVE: 'gray' }

/** /camp/:campId/facilities — байр (master.manage), өрөө (room.manage эсвэл master.manage) */
export default function FacilitiesPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const buildings = useQuery({ queryKey: campKeys.buildings(campId), queryFn: () => campApi.buildings(campId) })
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const [buildingFilter, setBuildingFilter] = useState('')
  const [roomModal, setRoomModal] = useState<Room | 'new' | null>(null)
  const canBuilding = perms.can(P.MASTER_MANAGE)
  const canRoom = perms.can(P.ROOM_MANAGE, P.MASTER_MANAGE)

  const shown = (rooms.data ?? []).filter((r) => !buildingFilter || r.buildingId === buildingFilter)
  const activeBuildings = (buildings.data ?? []).filter((b) => b.isActive)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card title="Байр">
        {buildings.isLoading && <Loading />}
        <ErrorBox error={buildings.error} />
        {buildings.data && <Buildings campId={campId} rows={buildings.data} canEdit={canBuilding} />}
      </Card>

      <Card
        title={`Өрөө${rooms.data ? ` (${shown.length})` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <select aria-label="Байраар шүүх" className={`${inputSmCls} w-auto`} value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
              <option value="">Бүх байр</option>
              {buildings.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
            {canRoom && (
              <Button size="sm" onClick={() => setRoomModal('new')} disabled={activeBuildings.length === 0} title={activeBuildings.length === 0 ? 'Эхлээд байр нэмнэ үү' : undefined}>
                + Өрөө
              </Button>
            )}
          </div>
        }
      >
        {rooms.isLoading && <Loading />}
        <ErrorBox error={rooms.error} />
        {rooms.data && shown.length === 0 && <Empty>Өрөө бүртгэгдээгүй</Empty>}
        {shown.length > 0 && (
          <Table head={['Байр', 'Өрөө', 'Давхар', 'Багтаамж', 'Төлөв', 'Тэмдэглэл', '']}>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.building.code}</td>
                <td className={`${td} font-medium`}>{r.roomNo}</td>
                <td className={td}>{r.floor ?? '—'}</td>
                <td className={td}>{r.capacity}</td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[r.status]}>{ROOM_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className={`${td} text-gray-500 max-w-[16rem] truncate`}>{r.note ?? ''}</td>
                <td className={`${td} text-right`}>
                  {canRoom && (
                    <Button variant="ghost" onClick={() => setRoomModal(r)}>
                      Засах
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {roomModal && <RoomModal campId={campId} room={roomModal === 'new' ? null : roomModal} buildings={activeBuildings} onClose={() => setRoomModal(null)} />}
    </div>
  )
}

function Buildings({ campId, rows, canEdit }: { campId: string; rows: Building[]; canEdit: boolean }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const add = useCampMutation(
    () => campApi.createBuilding(campId, { code: code.trim(), name: name.trim() }),
    [campKeys.buildings(campId)],
    () => {
      setCode('')
      setName('')
    },
  )
  const toggle = useCampMutation((b: Building) => campApi.updateBuilding(campId, b.id, { isActive: !b.isActive }), [campKeys.buildings(campId)])
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <Empty>Байр бүртгэгдээгүй</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-mono text-gray-500 mr-2">{b.code}</span>
                {b.name}
              </span>
              <span className="flex items-center gap-2">
                <ActiveBadge active={b.isActive} />
                {canEdit && (
                  <Button variant="ghost" onClick={() => toggle.mutate(b)}>
                    {b.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="grid grid-cols-[6rem_1fr_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(undefined)
          }}
        >
          <input aria-label="Байрны код" className={inputCls} placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />
          <input aria-label="Байрны нэр" className={inputCls} placeholder="Нэр" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          <Button type="submit" loading={add.isPending} disabled={!code.trim() || !name.trim()}>
            Нэмэх
          </Button>
        </form>
      )}
      <p className="text-xs text-gray-400">Идэвхгүй болгохын өмнө байрны бүх өрөөг идэвхгүй болгоно.</p>
      <ErrorBox error={add.error ?? toggle.error} />
    </div>
  )
}

function RoomModal({ campId, room, buildings, onClose }: { campId: string; room: Room | null; buildings: Building[]; onClose: () => void }) {
  const [f, setF] = useState({
    buildingId: room?.buildingId ?? buildings[0]?.id ?? '',
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
    [campKeys.rooms(campId)],
    onClose,
  )
  return (
    <Modal
      title={room ? `Өрөө ${room.building.code}-${room.roomNo} засах` : 'Өрөө нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!f.roomNo.trim() || !f.buildingId || !(Number(f.capacity) >= 1)}>
            Хадгалах
          </Button>
        </>
      }
    >
      {!room && (
        <Field label="Байр">
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
        <Field label="Өрөөний дугаар">{(id) => <input id={id} className={inputCls} value={f.roomNo} onChange={(e) => set('roomNo', e.target.value)} maxLength={30} />}</Field>
        <Field label="Давхар">{(id) => <input id={id} type="number" min={-5} max={100} className={inputCls} value={f.floor} onChange={(e) => set('floor', e.target.value)} />}</Field>
        <Field label="Багтаамж">{(id) => <input id={id} type="number" min={1} max={50} className={inputCls} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />}</Field>
      </div>
      {room && (
        <Field label="Төлөв" hint="Засварын хүсэлтээр түгжигдсэн өрөөг гараар идэвхжүүлэх боломжгүй — засвар дуусахад автоматаар идэвхжинэ">
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
      <Field label="Тэмдэглэл">{(id) => <input id={id} className={inputCls} value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={500} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
