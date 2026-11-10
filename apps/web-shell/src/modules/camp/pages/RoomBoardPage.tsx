import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { BoardRoom } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { addDays, todayUb } from '../../../core/dates'
import { ROOM_STATUS_LABEL } from '../../../core/labels'
import { EmployeePicker, type PickedEmployee } from '../api/camp-hr.bridge'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, inputCls, inputSmCls } from '../../../core/ui'
import { useTranslation } from 'react-i18next'

const OCC_CLS = { VACANT: 'border-gray-200', PARTIAL: 'border-blue-300', FULL: 'border-green-400' } as const

type AllocTarget = { room?: BoardRoom; employee?: PickedEmployee }

/** FB-12 (v0.2.0): самбарын шүүлт */
const BOARD_FILTERS = ['all', 'vacant', 'partial', 'full', 'over', 'inactive'] as const
type BoardFilter = (typeof BOARD_FILTERS)[number]
const matches = (r: BoardRoom, f: BoardFilter) =>
  f === 'all' ||
  (f === 'vacant' && r.occupancy === 'VACANT') ||
  (f === 'partial' && r.occupancy === 'PARTIAL') ||
  (f === 'full' && r.occupancy === 'FULL' && !r.overCapacity) ||
  (f === 'over' && r.overCapacity) ||
  (f === 'inactive' && (r.inactiveOccupants ?? 0) > 0)

/** /camp/:campId/rooms — өрөөний самбар (D өдрийн шөнө), хуваарилах / өрөө солих / дуусгах, "өрөөгүй"; FB-12 шүүлт */
export default function RoomBoardPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useAppPermissions(campId)
  const canEdit = perms.can(P.ROOM_MANAGE)
  const canRepair = perms.can(P.MAINTENANCE_CREATE)
  const [date, setDate] = useState(todayUb())
  const board = useQuery({ queryKey: [...campKeys.roomBoard(campId), date], queryFn: () => campApi.roomBoard(campId, date), enabled: !!date })
  // самбарт хуваарилалтын id ирдэггүй — дуусгах/шилжүүлэхэд хэрэгтэй
  const allocs = useQuery({ queryKey: [...campKeys.allocations(campId), date], queryFn: () => campApi.roomAllocations(campId, { date }), enabled: !!date && canEdit })
  const [allocTarget, setAllocTarget] = useState<AllocTarget | null>(null)
  const [ending, setEnding] = useState<{ allocationId: string; label: string } | null>(null)
  const allocationOf = (employeeId: string) => allocs.data?.find((a) => a.employee.id === employeeId && a.endDate === null)
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [building, setBuilding] = useState('')
  const allRooms = board.data?.rooms ?? []
  const count = (f: BoardFilter) => allRooms.filter((r) => matches(r, f) && (!building || r.building.code === building)).length
  const buildingCodes = [...new Set(allRooms.map((r) => r.building.code))]
  const visibleRooms = allRooms.filter((r) => matches(r, filter) && (!building || r.building.code === building))

  const byBuilding = new Map<string, BoardRoom[]>()
  for (const r of visibleRooms) byBuilding.set(`${r.building.code} · ${r.building.name}`, [...(byBuilding.get(`${r.building.code} · ${r.building.name}`) ?? []), r])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('camp.board.date')}>{(id) => <input id={id} type="date" className={inputSmCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="flex gap-1 pb-0.5">
          <Button size="sm" variant="secondary" onClick={() => setDate(addDays(date, -1))} aria-label={t('camp.board.prev')}>
            ‹
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDate(todayUb())}>
            {t('camp.board.today')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDate(addDays(date, 1))} aria-label={t('camp.board.next')}>
            ›
          </Button>
        </div>
        {board.data && (
          <div className="flex flex-wrap gap-2 text-sm pb-1">
            <Badge>{t('camp.facilities.n_rooms', { n: board.data.totals.rooms })}</Badge>
            <Badge tone="blue">{t('camp.board.present', { n: board.data.totals.present, cap: board.data.totals.capacity })}</Badge>
            {board.data.unassigned.length > 0 && <Badge tone="red">{t('camp.board.unassigned_n', { n: board.data.unassigned.length })}</Badge>}
          </div>
        )}
      </div>
      {board.data && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('camp.board.filter')}>
          {BOARD_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm border ${filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              {t(`camp.board.f.${f}`)} · {count(f)}
            </button>
          ))}
          {buildingCodes.length > 1 && (
            <select aria-label={t('camp.facilities.filter_building')} className={`${inputSmCls} w-auto ml-auto`} value={building} onChange={(e) => setBuilding(e.target.value)}>
              <option value="">{t('camp.facilities.all_buildings')}</option>
              {buildingCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {board.isLoading && <Loading />}
      <ErrorBox error={board.error ?? allocs.error} />

      {board.data && board.data.unassigned.length > 0 && (
        <Card title={t('camp.board.unassigned_title', { date })}>
          <div className="flex flex-wrap gap-2">
            {board.data.unassigned.map((u) => (
              <span key={u.id} role="group" aria-label={t('camp.board.unassigned_label', { code: u.employeeCode })} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-sm">
                <span className="font-mono text-gray-500">{u.employeeCode}</span>
                {u.fullName}
                <span className="text-xs text-gray-500">
                  {u.departmentCode}
                  {u.crewCode ? ` · ${u.crewCode}` : ''}
                </span>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setAllocTarget({ employee: { id: u.id, employeeCode: u.employeeCode, fullName: u.fullName } })}>
                    {t('camp.board.assign')}
                  </Button>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}

      {board.data && board.data.rooms.length === 0 && (
        <Card>
          <Empty>{t('camp.board.no_rooms')}</Empty>
        </Card>
      )}
      {board.data && board.data.rooms.length > 0 && visibleRooms.length === 0 && (
        <Card>
          <Empty>{t('camp.board.no_match')}</Empty>
        </Card>
      )}
      {[...byBuilding.entries()].map(([bName, rooms]) => (
        <Card key={bName} title={bName}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((r) => (
              <div key={r.id} className={`rounded-lg border-2 p-3 ${OCC_CLS[r.occupancy]} ${r.roomStatus === 'MAINTENANCE' ? 'bg-yellow-50' : 'bg-white'}`} aria-label={t('camp.board.room_label', { room: r.roomNo })}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{r.roomNo}</span>
                  <span className={`text-sm ${r.overCapacity ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                    {r.presentCount} / {r.capacity}
                  </span>
                </div>
                {r.roomStatus === 'MAINTENANCE' && (
                  <div className="mt-1">
                    <Link to={`../maintenance?roomId=${r.id}`} title={t('camp.facilities.room_repairs')}>
                      <Badge tone="yellow">{ROOM_STATUS_LABEL.MAINTENANCE} →</Badge>
                    </Link>
                  </div>
                )}
                {(r.inactiveOccupants ?? 0) > 0 && (
                  <div className="mt-1">
                    <Badge tone="red">{t('camp.board.inactive_n', { n: r.inactiveOccupants ?? 0 })}</Badge>
                  </div>
                )}
                {/* v0.2.1 (C-12): нээлттэй засвар + өрөөний хөрөнгө */}
                {(r.openMaintenance?.length ?? 0) > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs" aria-label={t('camp.board.open_repairs')}>
                    {r.openMaintenance?.map((m) => (
                      <li key={m.id}>
                        <Link to={`../maintenance/${m.id}`} className="text-amber-800 hover:underline">
                          🔧 {m.requestNo} · {m.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {(r.assets?.length ?? 0) > 0 && (
                  <details className="mt-1 text-xs text-gray-600">
                    <summary className="cursor-pointer select-none">{t('camp.board.assets_n', { n: r.assets?.length ?? 0 })}</summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {r.assets?.map((a) => (
                        <li key={a.id}>
                          <span className="font-mono text-gray-500">{a.inventoryNo}</span> {a.name}
                          {a.condition === 'DAMAGED' && <span className="ml-1 text-amber-700">({t('camp.board.damaged')})</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <ul className="mt-2 space-y-1 text-sm">
                  {r.occupants.length === 0 && <li className="text-gray-400">{t('camp.board.no_alloc')}</li>}
                  {r.occupants.map((o) => {
                    const a = canEdit ? allocationOf(o.id) : undefined
                    return (
                      <li key={o.id} className={`flex items-center justify-between gap-2 ${o.presentTonight ? '' : 'text-gray-400'}`}>
                        <span title={o.presentTonight ? t('camp.board.tonight') : t('camp.board.not_tonight')}>
                          {o.status === 'INACTIVE' && <span className="mr-1 rounded bg-red-100 px-1 text-xs text-red-700">{t('camp.common.inactive')}</span>}
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
                              className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-1.5 hover:bg-blue-100"
                              onClick={() => setAllocTarget({ employee: { id: o.id, employeeCode: o.employeeCode, fullName: o.fullName } })}
                            >
                              {t('camp.board.change_room')}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => setEnding({ allocationId: a.id, label: t('camp.board.end_label', { name: o.fullName, room: r.roomNo }) })}
                            >
                              {t('camp.board.end')}
                            </button>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {((canEdit && r.roomStatus === 'ACTIVE') || canRepair) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {canEdit && r.roomStatus === 'ACTIVE' && (
                      <Button variant="ghost" onClick={() => setAllocTarget({ room: r })}>
                        {t('camp.board.allocate')}
                      </Button>
                    )}
                    {canRepair && (
                      <Link to={`../maintenance?new=1&roomId=${r.id}`} className="text-sm text-gray-600 hover:text-blue-700 hover:underline">
                        {t('camp.board.repair_request')}
                      </Link>
                    )}
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
  const { t } = useTranslation()
  const [emp, setEmp] = useState<PickedEmployee[]>(target.employee ? [target.employee] : [])
  const [roomId, setRoomId] = useState(target.room?.id ?? '')
  const [startDate, setStartDate] = useState(date)
  const current = emp[0] ? hasCurrent(emp[0].id) : false
  const [replace, setReplace] = useState(true)
  const m = useAppMutation(
    () => campApi.allocateRoom(campId, { employeeId: emp[0].id, roomId, startDate, ...(current && replace ? { replaceCurrent: true } : {}) }),
    [campKeys.roomBoard(campId), campKeys.allocations(campId)],
    onClose,
  )
  return (
    <Modal
      title={current ? t('camp.board.change_room_title') : t('camp.board.allocate_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={emp.length === 0 || !roomId || !startDate}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <EmployeePicker campId={campId} label={t('camp.att.col.employee')} value={emp} onChange={setEmp} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.facilities.room')}>
          {(id) => (
            <select id={id} className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">{t('camp.common.choose')}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.building.code}-{r.roomNo} ({r.presentCount}/{r.capacity})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.board.start_date')}>{(id) => <input id={id} type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
      </div>
      {current && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> {t('camp.board.replace')}
        </label>
      )}
      <p className="text-xs text-gray-400">{t('camp.board.capacity_note')}</p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

function EndModal({ campId, date, allocationId, label, onClose }: { campId: string; date: string; allocationId: string; label: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [endDate, setEndDate] = useState(date)
  const m = useAppMutation(() => campApi.endAllocation(campId, allocationId, endDate), [campKeys.roomBoard(campId), campKeys.allocations(campId)], onClose)
  return (
    <Modal
      title={t('camp.board.end_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!endDate}>
            {t('camp.board.end')}
          </Button>
        </>
      }
    >
      <p className="text-sm">{label}</p>
      <Field label={t('camp.board.end_date')}>{(id) => <input id={id} type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />}</Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
