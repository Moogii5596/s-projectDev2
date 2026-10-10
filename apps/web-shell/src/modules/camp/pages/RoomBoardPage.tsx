import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { BoardRoom } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { addDays, todayUb } from '../lib/dates'
import EmployeePicker, { type PickedEmployee } from '../components/EmployeePicker'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, inputCls, inputSmCls } from '../components/ui'

const OCC_CLS = { VACANT: 'border-gray-200', PARTIAL: 'border-blue-300', FULL: 'border-green-400' } as const

type AllocTarget = { room?: BoardRoom; employee?: PickedEmployee }

/** /camp/:campId/rooms — өрөөний самбар (D өдрийн шөнө), хуваарилах / шилжүүлэх / дуусгах, "өрөөгүй" */
export default function RoomBoardPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.ROOM_MANAGE)
  const [date, setDate] = useState(todayUb())
  const board = useQuery({ queryKey: [...campKeys.roomBoard(campId), date], queryFn: () => campApi.roomBoard(campId, date), enabled: !!date })
  // самбарт хуваарилалтын id ирдэггүй — дуусгах/шилжүүлэхэд хэрэгтэй
  const allocs = useQuery({ queryKey: [...campKeys.allocations(campId), date], queryFn: () => campApi.roomAllocations(campId, { date }), enabled: !!date && canEdit })
  const [allocTarget, setAllocTarget] = useState<AllocTarget | null>(null)
  const [ending, setEnding] = useState<{ allocationId: string; label: string } | null>(null)
  const allocationOf = (employeeId: string) => allocs.data?.find((a) => a.employee.id === employeeId && a.endDate === null)

  const byBuilding = new Map<string, BoardRoom[]>()
  for (const r of board.data?.rooms ?? []) byBuilding.set(`${r.building.code} · ${r.building.name}`, [...(byBuilding.get(`${r.building.code} · ${r.building.name}`) ?? []), r])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Огноо (тухайн өдрийн шөнө)">{(id) => <input id={id} type="date" className={inputSmCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="flex gap-1 pb-0.5">
          <Button size="sm" variant="secondary" onClick={() => setDate(addDays(date, -1))} aria-label="Өмнөх өдөр">
            ‹
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDate(todayUb())}>
            Өнөөдөр
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDate(addDays(date, 1))} aria-label="Дараагийн өдөр">
            ›
          </Button>
        </div>
        {board.data && (
          <div className="flex flex-wrap gap-2 text-sm pb-1">
            <Badge>{board.data.totals.rooms} өрөө</Badge>
            <Badge tone="blue">
              Хонож буй {board.data.totals.present} / {board.data.totals.capacity}
            </Badge>
            <Badge>Сул {board.data.totals.vacant}</Badge>
            <Badge tone="green">Дүүрсэн {board.data.totals.full}</Badge>
            {board.data.unassigned.length > 0 && <Badge tone="red">Өрөөгүй {board.data.unassigned.length}</Badge>}
          </div>
        )}
      </div>
      {board.isLoading && <Loading />}
      <ErrorBox error={board.error ?? allocs.error} />

      {board.data && board.data.unassigned.length > 0 && (
        <Card title={`Өрөөгүй — ${date}-ний шөнө кемпэд хонож буй ч хуваарилалтгүй`}>
          <div className="flex flex-wrap gap-2">
            {board.data.unassigned.map((u) => (
              <span key={u.id} role="group" aria-label={`Өрөөгүй ${u.employeeCode}`} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-sm">
                <span className="font-mono text-gray-500">{u.employeeCode}</span>
                {u.fullName}
                <span className="text-xs text-gray-500">
                  {u.departmentCode}
                  {u.crewCode ? ` · ${u.crewCode}` : ''}
                </span>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setAllocTarget({ employee: { id: u.id, employeeCode: u.employeeCode, fullName: u.fullName } })}>
                    Өрөө өгөх
                  </Button>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}

      {board.data && board.data.rooms.length === 0 && (
        <Card>
          <Empty>Идэвхтэй өрөө алга — "Байр, өрөө" хэсэгт нэмнэ үү</Empty>
        </Card>
      )}
      {[...byBuilding.entries()].map(([building, rooms]) => (
        <Card key={building} title={building}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((r) => (
              <div key={r.id} className={`rounded-lg border-2 p-3 ${OCC_CLS[r.occupancy]} ${r.roomStatus === 'MAINTENANCE' ? 'bg-yellow-50' : 'bg-white'}`} aria-label={`Өрөө ${r.roomNo}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{r.roomNo}</span>
                  <span className={`text-sm ${r.overCapacity ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {r.presentCount} / {r.capacity}
                  </span>
                </div>
                {r.roomStatus === 'MAINTENANCE' && (
                  <div className="mt-1">
                    <Badge tone="yellow">Засварт</Badge>
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-sm">
                  {r.occupants.length === 0 && <li className="text-gray-400">Хуваарилалтгүй</li>}
                  {r.occupants.map((o) => {
                    const a = canEdit ? allocationOf(o.id) : undefined
                    return (
                      <li key={o.id} className={`flex items-center justify-between gap-2 ${o.presentTonight ? '' : 'text-gray-400'}`}>
                        <span title={o.presentTonight ? 'Энэ шөнө кемпэд' : 'Энэ шөнө кемпэд байхгүй (амралт)'}>
                          {o.fullName}
                          <span className="text-xs ml-1">
                            {o.employeeCode}
                            {o.crewCode ? ` · ${o.crewCode}` : ''}
                          </span>
                        </span>
                        {canEdit && a && (
                          <span className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => setAllocTarget({ employee: { id: o.id, employeeCode: o.employeeCode, fullName: o.fullName } })}
                            >
                              Шилжүүлэх
                            </button>
                            <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setEnding({ allocationId: a.id, label: `${o.fullName} — өрөө ${r.roomNo}` })}>
                              Дуусгах
                            </button>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {canEdit && r.roomStatus === 'ACTIVE' && (
                  <div className="mt-2">
                    <Button variant="ghost" onClick={() => setAllocTarget({ room: r })}>
                      + Хуваарилах
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {allocTarget && board.data && (
        <AllocateModal
          campId={campId}
          date={date}
          rooms={board.data.rooms.filter((r) => r.roomStatus === 'ACTIVE')}
          target={allocTarget}
          hasCurrent={(employeeId) => !!allocationOf(employeeId)}
          onClose={() => setAllocTarget(null)}
        />
      )}
      {ending && <EndModal campId={campId} date={date} {...ending} onClose={() => setEnding(null)} />}
    </div>
  )
}

function AllocateModal({
  campId,
  date,
  rooms,
  target,
  hasCurrent,
  onClose,
}: {
  campId: string
  date: string
  rooms: BoardRoom[]
  target: AllocTarget
  hasCurrent: (employeeId: string) => boolean
  onClose: () => void
}) {
  const [emp, setEmp] = useState<PickedEmployee[]>(target.employee ? [target.employee] : [])
  const [roomId, setRoomId] = useState(target.room?.id ?? '')
  const [startDate, setStartDate] = useState(date)
  const current = emp[0] ? hasCurrent(emp[0].id) : false
  const [replace, setReplace] = useState(true)
  const m = useCampMutation(
    () => campApi.allocateRoom(campId, { employeeId: emp[0].id, roomId, startDate, ...(current && replace ? { replaceCurrent: true } : {}) }),
    [campKeys.roomBoard(campId), campKeys.allocations(campId)],
    onClose,
  )
  return (
    <Modal
      title={current ? 'Өрөө шилжүүлэх' : 'Өрөө хуваарилах'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={emp.length === 0 || !roomId || !startDate}>
            Хадгалах
          </Button>
        </>
      }
    >
      <EmployeePicker campId={campId} label="Ажилтан" value={emp} onChange={setEmp} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Өрөө">
          {(id) => (
            <select id={id} className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.building.code}-{r.roomNo} ({r.presentCount}/{r.capacity})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Эхлэх огноо">{(id) => <input id={id} type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
      </div>
      {current && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Одоогийн өрөөг эхлэх огнооны өмнөх өдрөөр дуусгаж шилжүүлэх
        </label>
      )}
      <p className="text-xs text-gray-400">Багтаамжийг ирэх 28 шөнөөр (багуудын ростерыг тооцож) шалгана.</p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function EndModal({ campId, date, allocationId, label, onClose }: { campId: string; date: string; allocationId: string; label: string; onClose: () => void }) {
  const [endDate, setEndDate] = useState(date)
  const m = useCampMutation(() => campApi.endAllocation(campId, allocationId, endDate), [campKeys.roomBoard(campId), campKeys.allocations(campId)], onClose)
  return (
    <Modal
      title="Хуваарилалт дуусгах"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button variant="danger" onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!endDate}>
            Дуусгах
          </Button>
        </>
      }
    >
      <p className="text-sm">{label}</p>
      <Field label="Дуусах огноо (энэ өдрийн шөнө хүртэл)">{(id) => <input id={id} type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
