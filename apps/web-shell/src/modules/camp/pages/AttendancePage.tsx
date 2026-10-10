import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { campApi } from '../api/camp-api'
import type { Direction, ImportPreview, ImportRowError, MealType, ShiftType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { DIRECTION_LABEL, IMPORT_STATUS_LABEL, KIND_LABEL, MEAL_LABEL, MEAL_ORDER, SHIFT_LABEL } from '../lib/labels'
import { addDays, todayUb } from '../lib/dates'
import { rangeProblem } from '../lib/calendar'
import { type MealMode, mealsPayload } from '../lib/meals'
import EmployeePicker, { type PickedEmployee } from '../components/EmployeePicker'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const MAX_UPLOAD = 2 * 1024 * 1024
const meals = (m: MealType[] | null) => (m === null ? '—' : m.length === 0 ? 'Идэхгүй' : m.map((x) => MEAL_LABEL[x]).join(', '))

/** /camp/:campId/attendance — ирцийн xlsx импорт (PREVIEW → CONFIRM), гараар бүртгэл, ирцийн жагсаалт */
export default function AttendancePage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canImport = perms.can(P.MOVEMENT_IMPORT)
  return (
    <div className="space-y-5">
      {canImport && <ImportCard campId={campId} />}
      <MovementsCard campId={campId} canEdit={canImport} />
    </div>
  )
}

// ── Импорт ───────────────────────────────────────────────────

function ImportCard({ campId }: { campId: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmErrors, setConfirmErrors] = useState<ImportRowError[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const history = useQuery({ queryKey: campKeys.imports(campId), queryFn: () => campApi.imports(campId) })

  const upload = useCampMutation((file: File) => campApi.uploadImport(campId, file), [campKeys.imports(campId)], (res) => {
    setPreview(res)
    setErrorsOnly(res.summary.errorRows > 0)
    setConfirmErrors(null)
    setDone(null)
  })
  const confirm = useCampMutation((id: string) => campApi.confirmImport(campId, id), [...campKeys.operational(campId)], (r) => {
    setPreview(null)
    setDone(`Баталгаажлаа: ${r.movements} бүртгэл, шинэ байх хугацаа ${r.newStays}, хаагдсан ${r.closedStays}, ээлжийн зохицуулалт ${r.adjustments}`)
  })
  const cancel = useCampMutation((id: string) => campApi.cancelImport(campId, id), [campKeys.imports(campId)], () => setPreview(null))

  const onFile = (file: File | undefined) => {
    setLocalError(null)
    setDone(null)
    if (!file) return
    if (file.size > MAX_UPLOAD) {
      setLocalError('Файл 2 MB-ээс их байна')
      return
    }
    upload.mutate(file)
    if (fileRef.current) fileRef.current.value = ''
  }
  const download = async () => {
    try {
      const blob = await campApi.importTemplate(campId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'camp-attendance-template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setLocalError('Загвар татахад алдаа гарлаа')
    }
  }
  // CONFIRM 409: { message, errors: [...] } — мөрийн алдааг харуулна
  const onConfirm = (id: string) =>
    confirm.mutate(id, {
      onError: (err) => {
        const data = isAxiosError(err) ? (err.response?.data as { errors?: ImportRowError[] } | undefined) : undefined
        if (data?.errors) setConfirmErrors(data.errors)
      },
    })

  const rows = preview ? (errorsOnly ? preview.rows.filter((r) => r.errors.length > 0) : preview.rows) : []

  return (
    <Card
      title="Ирцийн xlsx импорт"
      actions={
        <Button size="sm" variant="secondary" onClick={download}>
          Загвар татах
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Баганууд: employee_code · date · direction (ARRIVAL/DEPARTURE) · meals (BREAKFAST,LUNCH,DINNER,NIGHT эсвэл NONE) · shift (DAY/NIGHT). Ээлжийн бус
          ирэлт/явалтад meals заавал. Бүх мөр зөв үед л бүртгэгдэнэ.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="sr-only">Ирцийн xlsx файл</span>
            <input
              ref={fileRef}
              type="file"
              aria-label="Ирцийн xlsx файл"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => onFile(e.target.files?.[0])}
              disabled={upload.isPending}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700"
            />
          </label>
          {upload.isPending && <span className="text-sm text-gray-500">Шалгаж байна…</span>}
        </div>
        {localError && <ErrorBox error={new Error(localError)} />}
        <ErrorBox error={upload.error} />
        {done && <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{done}</div>}

        {preview && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{preview.import.fileName}</span>
              <Badge>{preview.import.totalRows} мөр</Badge>
              <Badge tone="green">Ирэх {preview.summary.arrivals}</Badge>
              <Badge tone="blue">Явах {preview.summary.departures}</Badge>
              <Badge tone="yellow">Ээлжийн бус {preview.summary.offRoster}</Badge>
              <Badge>Зохицуулалт {preview.summary.shiftAdjustments}</Badge>
              {preview.summary.errorRows > 0 ? <Badge tone="red">Алдаатай {preview.summary.errorRows}</Badge> : <Badge tone="green">Алдаагүй</Badge>}
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Зөвхөн алдаатай мөр
            </label>
            {rows.length === 0 ? (
              <Empty>{errorsOnly ? 'Алдаатай мөр алга' : 'Мөр алга'}</Empty>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table head={['Мөр', 'Код', 'Огноо', 'Чиглэл', 'Төрөл', 'Хоол', 'Ээлж', 'Алдаа']}>
                  {rows.map((r) => (
                    <tr key={r.row} className={r.errors.length > 0 ? 'bg-red-50/60' : ''}>
                      <td className={`${td} text-gray-400`}>{r.row}</td>
                      <td className={`${td} font-mono`}>{r.employeeCode || '—'}</td>
                      <td className={td}>{r.date ?? '—'}</td>
                      <td className={td}>{r.direction ? DIRECTION_LABEL[r.direction] : '—'}</td>
                      <td className={td}>{r.kind ? KIND_LABEL[r.kind] : '—'}</td>
                      <td className={td}>{meals(r.meals)}</td>
                      <td className={td}>{r.shift ? SHIFT_LABEL[r.shift] : ''}</td>
                      <td className={`${td} text-red-700`}>{r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            {confirmErrors && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 space-y-1">
                <div className="font-medium">Баталгаажуулах үед {confirmErrors.length} мөр алдаатай болсон (файлаас хойш өгөгдөл өөрчлөгдсөн):</div>
                {confirmErrors.slice(0, 20).map((e) => (
                  <div key={e.row}>
                    Мөр {e.row} ({e.employeeCode}): {e.messages.join('; ')}
                  </div>
                ))}
              </div>
            )}
            {!confirmErrors && <ErrorBox error={confirm.error} />}
            <ErrorBox error={cancel.error} />
            <div className="flex gap-2">
              {/* 409-ийн дараа дахин батлахад мөн л татгалзана — цуцлаад засварласан файлаа оруулна */}
              <Button onClick={() => onConfirm(preview.import.id)} loading={confirm.isPending} disabled={preview.summary.errorRows > 0 || !!confirmErrors}>
                Батлах
              </Button>
              <Button variant="secondary" onClick={() => cancel.mutate(preview.import.id)} loading={cancel.isPending}>
                Цуцлах
              </Button>
              {(preview.summary.errorRows > 0 || confirmErrors) && <span className="text-sm text-red-600 self-center">Алдааг файлд засаад дахин оруулна уу.</span>}
            </div>
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">Сүүлийн импортууд</summary>
          {history.isLoading && <Loading />}
          <ErrorBox error={history.error} />
          {history.data && history.data.length === 0 && <Empty>Импорт хийгдээгүй</Empty>}
          {history.data && history.data.length > 0 && (
            <Table head={['Файл', 'Төлөв', 'Мөр', 'Алдаатай', 'Огноо', '']}>
              {history.data.map((h) => (
                <tr key={h.id}>
                  <td className={td}>{h.fileName}</td>
                  <td className={td}>
                    <Badge tone={h.status === 'CONFIRMED' ? 'green' : h.status === 'PREVIEW' ? 'yellow' : 'gray'}>{IMPORT_STATUS_LABEL[h.status]}</Badge>
                  </td>
                  <td className={td}>{h.totalRows}</td>
                  <td className={td}>{h.errorRows}</td>
                  <td className={`${td} text-gray-500`}>{h.createdAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className={`${td} text-right`}>
                    {h.status === 'PREVIEW' && preview?.import.id !== h.id && (
                      <Button variant="ghost" onClick={() => cancel.mutate(h.id)}>
                        Цуцлах
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </details>
      </div>
    </Card>
  )
}

// ── Ирцийн жагсаалт + гараар бүртгэл ──────────────────────────

function MovementsCard({ campId, canEdit }: { campId: string; canEdit: boolean }) {
  const today = todayUb()
  const [from, setFrom] = useState(addDays(today, -7))
  const [to, setTo] = useState(addDays(today, 7))
  const [adding, setAdding] = useState(false)
  const problem = rangeProblem(from, to, 93)
  const list = useQuery({
    queryKey: [...campKeys.movements(campId), from, to],
    queryFn: () => campApi.movements(campId, { from, to }),
    enabled: !problem,
  })
  const del = useCampMutation((id: string) => campApi.deleteMovement(campId, id), [...campKeys.operational(campId)])

  return (
    <Card title="Ирэлт / явалт" actions={canEdit && <Button size="sm" onClick={() => setAdding(true)}>+ Ирц бүртгэх</Button>}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <Field label="Эхлэх">{(id) => <input id={id} type="date" className={inputSmCls} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Дуусах">{(id) => <input id={id} type="date" className={inputSmCls} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        {problem && <span className="text-sm text-red-600 pb-1">{problem}</span>}
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error ?? del.error} />
      {list.data && list.data.length === 0 && <Empty>Энэ хугацаанд ирц бүртгэгдээгүй</Empty>}
      {list.data && list.data.length > 0 && (
        <Table head={['Огноо', 'Ажилтан', 'Хэлтэс / баг', 'Чиглэл', 'Төрөл', 'Хоол', 'Эх сурвалж', '']}>
          {list.data.map((m) => (
            <tr key={m.id}>
              <td className={`${td} whitespace-nowrap`}>{m.movementDate}</td>
              <td className={td}>
                <span className="font-mono text-gray-500 mr-1">{m.employee.employeeCode}</span>{' '}
                {m.employee.fullName}
              </td>
              <td className={td}>
                {m.employee.department.code}
                {m.employee.crew ? ` · ${m.employee.crew.code}` : ''}
              </td>
              <td className={td}>
                <Badge tone={m.direction === 'ARRIVAL' ? 'green' : 'blue'}>{DIRECTION_LABEL[m.direction]}</Badge>
              </td>
              <td className={td}>{KIND_LABEL[m.kind]}</td>
              <td className={td}>{meals(m.meals)}</td>
              <td className={`${td} text-gray-500`}>{m.importId ? 'Импорт' : 'Гараар'}</td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => del.mutate(m.id)} disabled={del.isPending} title="Зөвхөн ажилтны хамгийн сүүлийн бүртгэлийг устгана">
                    Устгах
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <MovementModal campId={campId} onClose={() => setAdding(false)} />}
    </Card>
  )
}

function MovementModal({ campId, onClose }: { campId: string; onClose: () => void }) {
  const [emp, setEmp] = useState<PickedEmployee[]>([])
  const [date, setDate] = useState(todayUb())
  const [direction, setDirection] = useState<Direction>('ARRIVAL')
  const [mode, setMode] = useState<MealMode>('DEFAULT')
  const [picked, setPicked] = useState<MealType[]>([])
  const [shift, setShift] = useState<ShiftType | ''>('')
  const payload = mealsPayload(mode, picked)
  const m = useCampMutation(
    () =>
      campApi.createMovement(campId, {
        employeeId: emp[0].id,
        date,
        direction,
        ...(payload !== undefined && payload !== null ? { meals: payload } : {}),
        ...(direction === 'ARRIVAL' && shift ? { shift } : {}),
      }),
    [...campKeys.operational(campId)],
    onClose,
  )
  const toggle = (meal: MealType) => setPicked((p) => (p.includes(meal) ? p.filter((x) => x !== meal) : [...p, meal]))

  return (
    <Modal
      title="Ирц бүртгэх"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={emp.length === 0 || !date || payload === null}>
            Хадгалах
          </Button>
        </>
      }
    >
      <EmployeePicker campId={campId} label="Ажилтан" value={emp} onChange={setEmp} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Огноо">{(id) => <input id={id} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Чиглэл">
          {(id) => (
            <select id={id} className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="ARRIVAL">Ирэх</option>
              <option value="DEPARTURE">Явах</option>
            </select>
          )}
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="block text-xs font-medium text-gray-600">Хоол</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="meal-mode" checked={mode === 'DEFAULT'} onChange={() => setMode('DEFAULT')} /> Ростерын анхдагч
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="meal-mode" checked={mode === 'PICK'} onChange={() => setMode('PICK')} /> Сонгох
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="meal-mode" checked={mode === 'NONE'} onChange={() => setMode('NONE')} /> Идэхгүй
          </label>
        </div>
        {mode === 'PICK' && (
          <div className="flex flex-wrap gap-3 text-sm pl-1">
            {MEAL_ORDER.map((meal) => (
              <label key={meal} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={picked.includes(meal)} onChange={() => toggle(meal)} /> {MEAL_LABEL[meal]}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400">
          Ростерын ирэлт → оройн хоол, явалт → өглөөний хоол (анхдагч). Ээлжийн бус ирэлт/явалтад "Сонгох" эсвэл "Идэхгүй" заавал.
        </p>
      </fieldset>
      {direction === 'ARRIVAL' && (
        <Field label="Ээлж (заавал биш)" hint="Сонговол явах хүртэл ээлжийн зохицуулалт үүснэ">
          {(id) => (
            <select id={id} className={inputCls} value={shift} onChange={(e) => setShift(e.target.value as ShiftType | '')}>
              <option value="">Хэлтсийн загвараар</option>
              <option value="DAY">Өдөр</option>
              <option value="NIGHT">Шөнө</option>
            </select>
          )}
        </Field>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
