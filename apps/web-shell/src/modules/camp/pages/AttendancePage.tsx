import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { campApi, type MovementQuery } from '../api/camp-api'
import type { Direction, ImportPreview, ImportRowError, MealType, ShiftType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { DIRECTION_LABEL, IMPORT_STATUS_LABEL, KIND_LABEL, MEAL_LABEL, MEAL_ORDER, SHIFT_LABEL } from '../lib/labels'
import { addDays, todayUb } from '../lib/dates'
import { rangeProblem } from '../lib/calendar'
import { type MealMode, mealsPayload } from '../lib/meals'
import { downloadBlob } from '../lib/download'
import i18n from '../../../i18n'
import EmployeePicker, { type PickedEmployee } from '../components/EmployeePicker'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'

const MAX_UPLOAD = 2 * 1024 * 1024
const meals = (m: MealType[] | null) => (m === null ? '—' : m.length === 0 ? i18n.t('camp.att.no_meal') : m.map((x) => MEAL_LABEL[x]).join(', '))

/**
 * /camp/:campId/attendance — ирцийн xlsx импорт (PREVIEW → CONFIRM), гараар бүртгэл, ирцийн жагсаалт.
 * FB-14 (v0.2.0): жагсаалтын шүүлт (хэлтэс, ростер, албан тушаал, код/нэр) + олон хүний ирц нэг дор (импортын урсгалаар).
 */
export default function AttendancePage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canImport = perms.can(P.MOVEMENT_IMPORT)
  // xlsx болон "олон хүний ирц" ижил PREVIEW → CONFIRM урсгалтай
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const showPreview = (p: ImportPreview) => {
    setPreview(p)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="space-y-5" ref={topRef}>
      {canImport && <ImportCard campId={campId} preview={preview} setPreview={setPreview} />}
      <MovementsCard campId={campId} canEdit={canImport} onPreview={showPreview} />
    </div>
  )
}

// ── Импорт ───────────────────────────────────────────────────

function ImportCard({ campId, preview, setPreview }: { campId: string; preview: ImportPreview | null; setPreview: (p: ImportPreview | null) => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
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
    setDone(t('camp.att.confirmed', { movements: r.movements, newStays: r.newStays, closedStays: r.closedStays, adjustments: r.adjustments }))
  })
  const cancel = useCampMutation((id: string) => campApi.cancelImport(campId, id), [campKeys.imports(campId)], () => setPreview(null))

  const onFile = (file: File | undefined) => {
    setLocalError(null)
    setDone(null)
    if (!file) return
    if (file.size > MAX_UPLOAD) {
      setLocalError(t('camp.att.too_large'))
      return
    }
    upload.mutate(file)
    if (fileRef.current) fileRef.current.value = ''
  }
  const download = async () => {
    try {
      downloadBlob(await campApi.importTemplate(campId), 'camp-attendance-template.xlsx')
    } catch {
      setLocalError(t('camp.att.template_error'))
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
      title={t('camp.att.import_title')}
      actions={
        <Button size="sm" variant="secondary" onClick={download}>
          {t('camp.import.template')}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">{t('camp.att.import_help')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="sr-only">{t('camp.att.file')}</span>
            <input
              ref={fileRef}
              type="file"
              aria-label={t('camp.att.file')}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => onFile(e.target.files?.[0])}
              disabled={upload.isPending}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700"
            />
          </label>
          {upload.isPending && <span className="text-sm text-gray-500">{t('camp.att.checking')}</span>}
        </div>
        {localError && <ErrorBox error={new Error(localError)} />}
        <ErrorBox error={upload.error} />
        {done && <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{done}</div>}

        {preview && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{preview.import.fileName}</span>
              <Badge>{t('camp.att.rows', { n: preview.import.totalRows })}</Badge>
              <Badge tone="green">{t('camp.att.arrivals', { n: preview.summary.arrivals })}</Badge>
              <Badge tone="blue">{t('camp.att.departures', { n: preview.summary.departures })}</Badge>
              <Badge tone="yellow">{t('camp.att.off_roster', { n: preview.summary.offRoster })}</Badge>
              <Badge>{t('camp.att.adjustments', { n: preview.summary.shiftAdjustments })}</Badge>
              {preview.summary.errorRows > 0 ? (
                <Badge tone="red">{t('camp.att.error_rows', { n: preview.summary.errorRows })}</Badge>
              ) : (
                <Badge tone="green">{t('camp.att.no_errors')}</Badge>
              )}
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> {t('camp.import.only_errors')}
            </label>
            {rows.length === 0 ? (
              <Empty>{errorsOnly ? t('camp.att.no_error_rows') : t('camp.att.no_rows')}</Empty>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table
                  head={[
                    t('camp.att.col.row'),
                    t('camp.common.code'),
                    t('camp.att.col.date'),
                    t('camp.att.col.direction'),
                    t('camp.att.col.kind'),
                    t('camp.att.col.meals'),
                    t('camp.att.col.shift'),
                    t('camp.att.col.error'),
                  ]}
                >
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
                <div className="font-medium">{t('camp.att.confirm_errors', { n: confirmErrors.length })}</div>
                {confirmErrors.slice(0, 20).map((e) => (
                  <div key={e.row}>
                    {t('camp.att.confirm_error_row', { row: e.row, code: e.employeeCode })}: {e.messages.join('; ')}
                  </div>
                ))}
              </div>
            )}
            {!confirmErrors && <ErrorBox error={confirm.error} />}
            <ErrorBox error={cancel.error} />
            <div className="flex gap-2">
              {/* 409-ийн дараа дахин батлахад мөн л татгалзана — цуцлаад засварласан файлаа оруулна */}
              <Button onClick={() => onConfirm(preview.import.id)} loading={confirm.isPending} disabled={preview.summary.errorRows > 0 || !!confirmErrors}>
                {t('camp.att.confirm')}
              </Button>
              <Button variant="secondary" onClick={() => cancel.mutate(preview.import.id)} loading={cancel.isPending}>
                {t('camp.maint.action.cancel')}
              </Button>
              {(preview.summary.errorRows > 0 || confirmErrors) && <span className="text-sm text-red-600 self-center">{t('camp.att.fix_file')}</span>}
            </div>
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">{t('camp.att.recent')}</summary>
          {history.isLoading && <Loading />}
          <ErrorBox error={history.error} />
          {history.data && history.data.length === 0 && <Empty>{t('camp.att.no_imports')}</Empty>}
          {history.data && history.data.length > 0 && (
            <Table head={[t('camp.att.col.file'), t('camp.common.status'), t('camp.att.col.rows'), t('camp.att.col.error_rows'), t('camp.att.col.date'), '']}>
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
                        {t('camp.maint.action.cancel')}
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

type MovementFilter = Pick<MovementQuery, 'departmentId' | 'crewId' | 'position' | 'q'>

function MovementsCard({ campId, canEdit, onPreview }: { campId: string; canEdit: boolean; onPreview: (p: ImportPreview) => void }) {
  const { t } = useTranslation()
  const today = todayUb()
  const [from, setFrom] = useState(addDays(today, -7))
  const [to, setTo] = useState(addDays(today, 7))
  const [filter, setFilter] = useState<MovementFilter>({})
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const problem = rangeProblem(from, to, 93)
  const q: MovementQuery = {
    from,
    to,
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.crewId ? { crewId: filter.crewId } : {}),
    ...(filter.position?.trim() ? { position: filter.position.trim() } : {}),
    ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
  }
  const list = useQuery({
    queryKey: [...campKeys.movements(campId), q],
    queryFn: () => campApi.movements(campId, q),
    enabled: !problem,
  })
  const del = useCampMutation((id: string) => campApi.deleteMovement(campId, id), [...campKeys.operational(campId)])
  const setF = (k: keyof MovementFilter, v: string) => setFilter((f) => ({ ...f, [k]: v || undefined }))

  return (
    <Card
      title={t('camp.att.list_title')}
      actions={
        canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setBulk(true)}>
              {t('camp.att.bulk')}
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              {t('camp.att.add')}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <Field label={t('camp.att.from')}>{(id) => <input id={id} type="date" className={inputSmCls} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t('camp.att.to')}>{(id) => <input id={id} type="date" className={inputSmCls} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <select aria-label={t('camp.filter.department')} className={`${inputSmCls} w-auto`} value={filter.departmentId ?? ''} onChange={(e) => setF('departmentId', e.target.value)}>
          <option value="">{t('camp.filter.all_departments')}</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.crew')} className={`${inputSmCls} w-auto`} value={filter.crewId ?? ''} onChange={(e) => setF('crewId', e.target.value)}>
          <option value="">{t('camp.filter.all_crews')}</option>
          <option value="none">{t('camp.emp.no_crew')}</option>
          {crews.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <input aria-label={t('camp.att.position')} placeholder={t('camp.att.position')} className={`${inputSmCls} w-32`} value={filter.position ?? ''} onChange={(e) => setF('position', e.target.value)} />
        <input aria-label={t('camp.emp.search')} placeholder={t('camp.picker.search')} className={`${inputSmCls} w-44`} value={filter.q ?? ''} onChange={(e) => setF('q', e.target.value)} />
        {problem && <span className="text-sm text-red-600 pb-1">{problem}</span>}
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error ?? del.error} />
      {list.data && list.data.length === 0 && <Empty>{t('camp.att.empty')}</Empty>}
      {list.data && list.data.length > 0 && (
        <Table
          head={[
            t('camp.att.col.date'),
            t('camp.att.col.employee'),
            t('camp.att.col.dept_crew'),
            t('camp.att.col.direction'),
            t('camp.att.col.kind'),
            t('camp.att.col.meals'),
            t('camp.att.col.source'),
            '',
          ]}
        >
          {list.data.map((m) => (
            <tr key={m.id}>
              <td className={`${td} whitespace-nowrap`}>{m.movementDate}</td>
              <td className={td}>
                <span className="font-mono text-gray-500 mr-1">{m.employee.employeeCode}</span> {m.employee.fullName}
                {m.employee.position && <span className="text-gray-400"> · {m.employee.position}</span>}
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
              <td className={`${td} text-gray-500`}>{m.importId ? t('camp.att.src_import') : t('camp.att.src_manual')}</td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => del.mutate(m.id)} disabled={del.isPending} title={t('camp.att.delete_hint')}>
                    {t('camp.att.delete')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <MovementModal campId={campId} onClose={() => setAdding(false)} />}
      {bulk && (
        <BulkMovementModal
          campId={campId}
          onClose={() => setBulk(false)}
          onPreview={(p) => {
            setBulk(false)
            onPreview(p)
          }}
        />
      )}
    </Card>
  )
}

/** Хоолны сонголт (гараар ба олон хүний ирцэд нийтлэг) */
function MealPicker({ mode, setMode, picked, setPicked, name }: { mode: MealMode; setMode: (m: MealMode) => void; picked: MealType[]; setPicked: (m: MealType[]) => void; name: string }) {
  const { t } = useTranslation()
  const toggle = (meal: MealType) => setPicked(picked.includes(meal) ? picked.filter((x) => x !== meal) : [...picked, meal])
  return (
    <fieldset className="space-y-1">
      <legend className="block text-xs font-medium text-gray-600">{t('camp.att.col.meals')}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-1">
          <input type="radio" name={name} checked={mode === 'DEFAULT'} onChange={() => setMode('DEFAULT')} /> {t('camp.att.meal_default')}
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="radio" name={name} checked={mode === 'PICK'} onChange={() => setMode('PICK')} /> {t('camp.att.meal_pick')}
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="radio" name={name} checked={mode === 'NONE'} onChange={() => setMode('NONE')} /> {t('camp.att.no_meal')}
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
      <p className="text-xs text-gray-400">{t('camp.att.meal_help')}</p>
    </fieldset>
  )
}

function DirectionShiftFields({
  date,
  setDate,
  direction,
  setDirection,
  shift,
  setShift,
}: {
  date: string
  setDate: (v: string) => void
  direction: Direction
  setDirection: (v: Direction) => void
  shift: ShiftType | ''
  setShift: (v: ShiftType | '') => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.att.col.date')}>{(id) => <input id={id} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label={t('camp.att.col.direction')}>
          {(id) => (
            <select id={id} className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="ARRIVAL">{DIRECTION_LABEL.ARRIVAL}</option>
              <option value="DEPARTURE">{DIRECTION_LABEL.DEPARTURE}</option>
            </select>
          )}
        </Field>
      </div>
      {direction === 'ARRIVAL' && (
        <Field label={t('camp.att.shift_optional')} hint={t('camp.att.shift_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={shift} onChange={(e) => setShift(e.target.value as ShiftType | '')}>
              <option value="">{t('camp.att.shift_by_dept')}</option>
              <option value="DAY">{SHIFT_LABEL.DAY}</option>
              <option value="NIGHT">{SHIFT_LABEL.NIGHT}</option>
            </select>
          )}
        </Field>
      )}
    </>
  )
}

function MovementModal({ campId, onClose }: { campId: string; onClose: () => void }) {
  const { t } = useTranslation()
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

  return (
    <Modal
      title={t('camp.att.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={emp.length === 0 || !date || payload === null}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <EmployeePicker campId={campId} label={t('camp.att.col.employee')} value={emp} onChange={setEmp} />
      <DirectionShiftFields date={date} setDate={setDate} direction={direction} setDirection={setDirection} shift={shift} setShift={setShift} />
      <MealPicker mode={mode} setMode={setMode} picked={picked} setPicked={setPicked} name="meal-mode" />
      <ErrorBox error={m.error} />
    </Modal>
  )
}

/**
 * FB-14 — олон хүний ирц нэг дор: огноо + чиглэл + хоол → ажилтнуудыг хэлтэс/ростероор шүүж чагтлах →
 * ирцийн импортын урсгал (PREVIEW → баталгаажуулах). Нэг удаад ≤ 500.
 */
function BulkMovementModal({ campId, onClose, onPreview }: { campId: string; onClose: () => void; onPreview: (p: ImportPreview) => void }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayUb())
  const [direction, setDirection] = useState<Direction>('ARRIVAL')
  const [mode, setMode] = useState<MealMode>('DEFAULT')
  const [picked, setPicked] = useState<MealType[]>([])
  const [shift, setShift] = useState<ShiftType | ''>('')
  const [departmentId, setDepartmentId] = useState('')
  const [crewId, setCrewId] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const emps = useQuery({
    queryKey: [...campKeys.employees(campId), 'bulk', departmentId, crewId, search.trim()],
    queryFn: () =>
      campApi.employees(campId, {
        status: 'ACTIVE',
        limit: 100,
        ...(departmentId ? { departmentId } : {}),
        ...(crewId ? { crewId } : {}),
        ...(search.trim() ? { q: search.trim() } : {}),
      }),
  })
  const shown = useMemo(() => emps.data?.data ?? [], [emps.data])
  const payload = mealsPayload(mode, picked)
  const m = useCampMutation(
    () =>
      campApi.manualMovements(campId, {
        date,
        direction,
        employeeIds: [...selected],
        ...(payload !== undefined && payload !== null ? { meals: payload } : {}),
        ...(direction === 'ARRIVAL' && shift ? { shift } : {}),
      }),
    [campKeys.imports(campId)],
    onPreview,
  )
  const allShown = shown.length > 0 && shown.every((e) => selected.has(e.id))
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      for (const e of shown) allShown ? n.delete(e.id) : n.add(e.id)
      return n
    })
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <Modal
      wide
      title={t('camp.att.bulk_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={selected.size === 0 || selected.size > 500 || !date || payload === null}>
            {t('camp.att.bulk_check', { n: selected.size })}
          </Button>
        </>
      }
    >
      <DirectionShiftFields date={date} setDate={setDate} direction={direction} setDirection={setDirection} shift={shift} setShift={setShift} />
      <MealPicker mode={mode} setMode={setMode} picked={picked} setPicked={setPicked} name="bulk-meal-mode" />
      <div className="flex flex-wrap gap-2">
        <select aria-label={t('camp.filter.department')} className={`${inputSmCls} w-auto`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">{t('camp.filter.all_departments')}</option>
          {depts.data?.filter((d) => d.isActive).map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.crew')} className={`${inputSmCls} w-auto`} value={crewId} onChange={(e) => setCrewId(e.target.value)}>
          <option value="">{t('camp.filter.all_crews')}</option>
          <option value="none">{t('camp.emp.no_crew')}</option>
          {crews.data?.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <input aria-label={t('camp.emp.search')} placeholder={t('camp.picker.search')} className={`${inputSmCls} w-44`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-sm text-gray-500 self-center ml-auto">{t('camp.att.selected', { n: selected.size })}</span>
      </div>
      {emps.isLoading && <Loading />}
      <ErrorBox error={emps.error} />
      {emps.data && shown.length === 0 && <Empty>{t('camp.emp.empty')}</Empty>}
      {shown.length > 0 && (
        <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input type="checkbox" aria-label={t('camp.att.select_all')} checked={allShown} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">{t('camp.common.code')}</th>
                <th className="px-3 py-2 text-left">{t('camp.common.name')}</th>
                <th className="px-3 py-2 text-left">{t('camp.emp.col.position')}</th>
                <th className="px-3 py-2 text-left">{t('camp.att.col.dept_crew')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((e) => (
                <tr key={e.id} className={selected.has(e.id) ? 'bg-blue-50/50' : ''}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" aria-label={`${e.employeeCode} ${e.fullName}`} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  </td>
                  <td className="px-3 py-1.5 font-mono">{e.employeeCode}</td>
                  <td className="px-3 py-1.5">{e.fullName}</td>
                  <td className="px-3 py-1.5 text-gray-600">{e.position ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {e.department.code}
                    {e.crew ? ` · ${e.crew.code}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {emps.data?.hasMore && <p className="text-xs text-gray-500">{t('camp.att.narrow')}</p>}
      <p className="text-xs text-gray-500">{t('camp.att.bulk_help')}</p>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
