import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { AdjustmentReason, CalendarCell, ShiftType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { REASON_LABEL, SHIFT_LABEL, WEEKDAYS } from '../lib/labels'
import { addDays, isoWeekday, todayUb } from '../lib/dates'
import { CELL_TEXT, CELL_TITLE, type CellKind, cellKind, rangeProblem } from '../lib/calendar'
import EmployeePicker, { type PickedEmployee } from '../components/EmployeePicker'
import { Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const CELL_CLS: Record<CellKind, string> = {
  DAY: 'bg-amber-200 text-amber-900',
  NIGHT: 'bg-indigo-600 text-white',
  UNKNOWN: 'bg-red-100 text-red-700',
  ARRIVE_TRAVEL: 'bg-emerald-50 text-emerald-700',
  LEAVE_TRAVEL: 'bg-sky-50 text-sky-700',
  OFF: 'bg-gray-50 text-gray-300',
}
const PRESENCE_MARK = { ARRIVAL: '▲', DEPARTURE: '▼', FULL_DAY: '' } as const

/** /camp/:campId/shifts — ээлжийн календарь (ажилтан × өдөр, ≤ 31) + ээлжийн зохицуулалт */
export default function ShiftsPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canAdjust = perms.can(P.SHIFT_ADJUST)
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const [from, setFrom] = useState(todayUb())
  const [days, setDays] = useState(14)
  const [departmentId, setDepartmentId] = useState('')
  const [crewId, setCrewId] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const to = from ? addDays(from, days - 1) : ''
  const problem = rangeProblem(from, to, 31)
  const cal = useQuery({
    queryKey: [...campKeys.calendar(campId), from, to, departmentId, crewId],
    queryFn: () => campApi.shiftCalendar(campId, { from, to, departmentId: departmentId || undefined, crewId: crewId || undefined }),
    enabled: !problem,
  })
  const onDays = settings.data?.rosterOnDays ?? 14

  return (
    <div className="space-y-5">
      <Card title="Ээлжийн календарь" actions={canAdjust && <Button size="sm" onClick={() => setAdjusting(true)}>+ Зохицуулалт</Button>}>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <Field label="Эхлэх өдөр">{(id) => <input id={id} type="date" className={inputSmCls} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Хоног">
            {(id) => (
              <select id={id} className={inputSmCls} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 14, 21, 28, 31].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Хэлтэс">
            {(id) => (
              <select id={id} className={inputSmCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Бүгд</option>
                {depts.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Баг">
            {(id) => (
              <select id={id} className={inputSmCls} value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                <option value="">Бүгд</option>
                {crews.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {problem && <span className="text-sm text-red-600 pb-1">{problem}</span>}
        </div>
        <Legend />
        {cal.isLoading && <Loading />}
        <ErrorBox error={cal.error} />
        {cal.data && cal.data.employees.length === 0 && <Empty>Идэвхтэй ажилтан алга</Empty>}
        {cal.data && cal.data.employees.length > 0 && (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left font-medium text-gray-600 px-2 py-1 min-w-[12rem] border-b border-gray-100">Ажилтан</th>
                  {cal.data.days.map((d) => {
                    const wd = isoWeekday(d)
                    return (
                      <th key={d} className={`px-0.5 py-1 font-normal text-center border-b border-gray-100 ${wd === 0 || wd === 6 ? 'text-gray-400' : 'text-gray-600'}`}>
                        <div>{d.slice(8)}</div>
                        <div className="text-[10px]">{WEEKDAYS[wd].slice(0, 2)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {cal.data.employees.map((e) => (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 bg-white px-2 py-0.5 whitespace-nowrap border-b border-gray-50">
                      <span className="font-mono text-gray-500">{e.employeeCode}</span>{' '}
                      <span className="text-gray-900">{e.fullName}</span>{' '}
                      <span className="text-gray-400">
                        {e.departmentCode}
                        {e.crewCode ? `·${e.crewCode}` : ''}
                      </span>
                    </td>
                    {e.cells.map((c) => (
                      <CalendarCellView key={c.date} cell={c} onDays={onDays} employee={e.employeeCode} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AdjustmentsCard campId={campId} canEdit={canAdjust} from={from} to={to} />
      {adjusting && <AdjustmentModal campId={campId} defaultFrom={from} onClose={() => setAdjusting(false)} />}
    </div>
  )
}

function CalendarCellView({ cell, onDays, employee }: { cell: CalendarCell; onDays: number; employee: string }) {
  const kind = cellKind(cell, onDays)
  const adj = cell.source === 'ADJUSTMENT'
  const notHere = cell.presence === null && (kind === 'DAY' || kind === 'NIGHT' || kind === 'UNKNOWN')
  const title = [
    `${employee} · ${cell.date}`,
    CELL_TITLE[kind],
    cell.dayNo !== null ? `ростерын ${cell.dayNo}-р өдөр` : null,
    adj ? 'зохицуулалтаар' : null,
    cell.presence === 'ARRIVAL' ? 'ирсэн' : cell.presence === 'DEPARTURE' ? 'явсан' : cell.presence === 'FULL_DAY' ? 'кемпэд' : 'кемпэд бүртгэлгүй',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <td className="p-0.5 border-b border-gray-50">
      <div
        title={title}
        aria-label={title}
        className={`relative w-7 h-6 rounded flex items-center justify-center font-medium ${CELL_CLS[kind]} ${adj ? 'ring-2 ring-offset-1 ring-fuchsia-500' : ''} ${notHere ? 'opacity-40' : ''}`}
      >
        {CELL_TEXT[kind]}
        {cell.presence && cell.presence !== 'FULL_DAY' && (
          <span className="absolute -top-1 -right-0.5 text-[9px] text-gray-800">{PRESENCE_MARK[cell.presence]}</span>
        )}
      </div>
    </td>
  )
}

function Legend() {
  const items: [CellKind, string][] = [
    ['DAY', 'Өдөр'],
    ['NIGHT', 'Шөнө'],
    ['UNKNOWN', 'Тодорхойгүй'],
    ['ARRIVE_TRAVEL', 'Ирэх өдөр'],
    ['LEAVE_TRAVEL', 'Явах өдөр'],
    ['OFF', 'Амралт'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mb-3">
      {items.map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className={`w-5 h-4 rounded flex items-center justify-center ${CELL_CLS[k]}`}>{CELL_TEXT[k]}</span>
          {l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="w-5 h-4 mx-1 rounded bg-amber-200 ring-2 ring-offset-1 ring-fuchsia-500" /> Зохицуулалт
      </span>
      <span>▲ ирсэн · ▼ явсан · бүдэг = кемпэд бүртгэлгүй</span>
    </div>
  )
}

function AdjustmentsCard({ campId, canEdit, from, to }: { campId: string; canEdit: boolean; from: string; to: string }) {
  const valid = !rangeProblem(from, to, 366)
  const list = useQuery({
    queryKey: [...campKeys.adjustments(campId), from, to],
    queryFn: () => campApi.shiftAdjustments(campId, { from, to }),
    enabled: valid,
  })
  const del = useCampMutation((id: string) => campApi.deleteShiftAdjustment(campId, id), [campKeys.adjustments(campId), campKeys.calendar(campId), campKeys.presence(campId)])
  return (
    <Card title={`Ээлжийн зохицуулалт (${from} – ${to})`}>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error ?? del.error} />
      {list.data && list.data.length === 0 && <Empty>Энэ хугацаанд зохицуулалт алга</Empty>}
      {list.data && list.data.length > 0 && (
        <Table head={['Ажилтан', 'Хугацаа', 'Ээлж', 'Шалтгаан', 'Бүртгэсэн', '']}>
          {list.data.map((a) => (
            <tr key={a.id}>
              <td className={td}>
                <span className="font-mono text-gray-500 mr-1">{a.employee.employeeCode}</span>{' '}
                {a.employee.fullName}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {a.startDate} – {a.endDate}
              </td>
              <td className={td}>{SHIFT_LABEL[a.shift]}</td>
              <td className={td}>
                {REASON_LABEL[a.reasonType]}
                {a.reason ? <span className="text-gray-500"> · {a.reason}</span> : null}
              </td>
              <td className={`${td} text-gray-500`}>{a.createdByUser.fullName ?? a.createdByUser.email}</td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => del.mutate(a.id)} disabled={del.isPending}>
                    Устгах
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function AdjustmentModal({ campId, defaultFrom, onClose }: { campId: string; defaultFrom: string; onClose: () => void }) {
  const [emps, setEmps] = useState<PickedEmployee[]>([])
  const [startDate, setStart] = useState(defaultFrom)
  const [endDate, setEnd] = useState(addDays(defaultFrom, 13))
  const [shift, setShift] = useState<ShiftType>('NIGHT')
  const [reasonType, setReasonType] = useState<AdjustmentReason>('SHIFT_CHANGE')
  const [reason, setReason] = useState('')
  const problem = rangeProblem(startDate, endDate, 366)
  const m = useCampMutation(
    () =>
      campApi.createShiftAdjustments(campId, {
        employeeIds: emps.map((e) => e.id),
        startDate,
        endDate,
        shift,
        reasonType,
        reason: reason.trim() || null,
      }),
    [campKeys.adjustments(campId), campKeys.calendar(campId), campKeys.presence(campId)],
    onClose,
  )
  const needReason = reasonType === 'OTHER' && !reason.trim()
  return (
    <Modal
      title="Ээлжийн зохицуулалт"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={emps.length === 0 || !!problem || needReason}>
            Хадгалах{emps.length > 1 ? ` (${emps.length})` : ''}
          </Button>
        </>
      }
    >
      <EmployeePicker campId={campId} label="Ажилтнууд" value={emps} onChange={setEmps} multiple />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Эхлэх">{(id) => <input id={id} type="date" className={inputCls} value={startDate} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Дуусах">{(id) => <input id={id} type="date" className={inputCls} value={endDate} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <Field label="Ээлж">
          {(id) => (
            <select id={id} className={inputCls} value={shift} onChange={(e) => setShift(e.target.value as ShiftType)}>
              <option value="DAY">Өдөр</option>
              <option value="NIGHT">Шөнө</option>
            </select>
          )}
        </Field>
      </div>
      {problem && <p className="text-xs text-red-600">{problem}</p>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Шалтгааны төрөл">
          {(id) => (
            <select id={id} className={inputCls} value={reasonType} onChange={(e) => setReasonType(e.target.value as AdjustmentReason)}>
              {(Object.keys(REASON_LABEL) as AdjustmentReason[]).map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="col-span-2">
          <Field label="Тайлбар" error={needReason ? '"Бусад" үед тайлбар заавал' : null}>
            {(id) => <input id={id} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </Field>
        </div>
      </div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
