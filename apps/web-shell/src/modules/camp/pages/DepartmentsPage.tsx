import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { Department, MealLocation, ShiftType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { SHIFT_LABEL, weekdayName, weekdayShort } from '../lib/labels'
import ImportDialog, { ExportButton, type GridColumn } from '../components/ImportDialog'
import { type DayShifts, daysToSegments, patternProblem, segmentsToDays } from '../lib/shift-pattern'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../components/ui'
import { useTranslation } from 'react-i18next'

const CELL: Record<ShiftType | 'NONE', string> = {
  DAY: 'bg-amber-200 text-amber-900',
  NIGHT: 'bg-indigo-600 text-white',
  NONE: 'bg-gray-100 text-gray-400',
}

/** FB-02 (v0.2.0): Excel / хүснэгтээр оруулах — баганын түлхүүр backend DEPARTMENTS_SPEC-тэй ижил */
const IMPORT_COLUMNS: GridColumn[] = [
  { key: 'code', label: 'camp.dept.col.code', required: true },
  { key: 'name', label: 'camp.dept.col.name', required: true },
  { key: 'mealLocation', label: 'camp.dept.col.meal_location' },
  { key: 'active', label: 'camp.dept.col.active' },
]

/**
 * Тохиргоо › Хэлтэс, ээлж — хэлтэс (хоол идэх байршил) + ээлжийн загвар (master.manage).
 * FB-03 (v0.2.0): идэвхтэй ажилтны тоо, албан тушаалын тоо; мөр дээр дарахад ажилтнууд албан тушаалаар.
 */
export default function DepartmentsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const [infoModal, setInfoModal] = useState<Department | 'new' | null>(null)
  const [patternModal, setPatternModal] = useState<Department | null>(null)
  const [detail, setDetail] = useState<Department | null>(null)
  const [importing, setImporting] = useState(false)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const onDays = settings.data?.rosterOnDays ?? 14
  const changeover = settings.data?.changeoverWeekday ?? 3

  return (
    <div className="space-y-4">
      <Card
        title={t('camp.dept.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton campId={campId} type="departments" />
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
                {t('camp.import.import')}
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setInfoModal('new')}>
                {t('camp.dept.add')}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {t('camp.dept.pattern_help', { days: onDays, weekday: weekdayName(changeover + 1) })}
        </p>
        {(depts.isLoading || settings.isLoading) && <Loading />}
        <ErrorBox error={depts.error ?? settings.error} />
        {depts.data && depts.data.length === 0 && <Empty>{t('camp.dept.empty')}</Empty>}
        {depts.data && depts.data.length > 0 && (
          <Table
            head={[
              t('camp.common.code'),
              t('camp.common.name'),
              t('camp.dept.employees'),
              t('camp.dept.positions'),
              t('camp.dept.col.meal_location'),
              t('camp.dept.shift_cols', { days: onDays }),
              t('camp.common.status'),
              '',
            ]}
          >
            {depts.data.map((d) => (
              <tr key={d.id}>
                <td className={`${td} font-mono text-gray-600`}>{d.code}</td>
                <td className={td}>
                  <button type="button" className="text-blue-600 hover:underline text-left" onClick={() => setDetail(d)}>
                    {d.name}
                  </button>
                </td>
                <td className={td}>{d.activeEmployees ?? '—'}</td>
                <td className={td}>{d.positions ?? '—'}</td>
                <td className={td}>{d.mealLocation.name}</td>
                <td className={td}>
                  <PatternStrip days={segmentsToDays(d.shiftPatterns, onDays)} empty={d.shiftPatterns.length === 0} />
                </td>
                <td className={td}>
                  <ActiveBadge active={d.isActive} />
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {canEdit && (
                    <>
                      <Button variant="ghost" onClick={() => setPatternModal(d)}>
                        {t('camp.dept.shift')}
                      </Button>
                      <Button variant="ghost" onClick={() => setInfoModal(d)}>
                        {t('camp.common.edit')}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {infoModal && locations.data && (
        <DeptModal campId={campId} dept={infoModal === 'new' ? null : infoModal} locations={locations.data} onClose={() => setInfoModal(null)} />
      )}
      {patternModal && (
        <PatternModal campId={campId} dept={patternModal} onDays={onDays} changeover={changeover} onClose={() => setPatternModal(null)} />
      )}
      {detail && <DeptEmployeesModal campId={campId} dept={detail} onClose={() => setDetail(null)} />}
      {importing && (
        <ImportDialog
          campId={campId}
          type="departments"
          title={t('camp.dept.import_title')}
          columns={IMPORT_COLUMNS}
          invalidate={[campKeys.departments(campId)]}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}

/** Жижиг харагдац: өдөр бүр нэг нүд */
function PatternStrip({ days, empty }: { days: DayShifts; empty: boolean }) {
  const { t } = useTranslation()
  if (empty) return <span className="text-xs text-gray-400">{t('camp.dept.no_pattern')}</span>
  return (
    <div className="flex gap-px" role="img" aria-label={daysToSegments(days).map((s) => `${s.dayFrom}–${s.dayTo} ${SHIFT_LABEL[s.shift]}`).join(', ')}>
      {days.map((s, i) => (
        <span key={i} className={`w-3 h-4 rounded-sm ${CELL[s ?? 'NONE']}`} title={t('camp.dept.day_n', { n: i + 1, shift: s ? SHIFT_LABEL[s] : '—' })} />
      ))}
    </div>
  )
}

function DeptModal({ campId, dept, locations, onClose }: { campId: string; dept: Department | null; locations: MealLocation[]; onClose: () => void }) {
  const { t } = useTranslation()
  const usable = locations.filter((l) => l.isActive || l.id === dept?.mealLocationId)
  const [code, setCode] = useState(dept?.code ?? '')
  const [name, setName] = useState(dept?.name ?? '')
  const [mealLocationId, setMealLocationId] = useState(dept?.mealLocationId ?? usable[0]?.id ?? '')
  const [isActive, setIsActive] = useState(dept?.isActive ?? true)
  const m = useCampMutation(
    () =>
      dept
        ? campApi.updateDepartment(campId, dept.id, { name: name.trim(), mealLocationId, isActive })
        : campApi.createDepartment(campId, { code: code.trim(), name: name.trim(), mealLocationId }),
    [campKeys.departments(campId)],
    onClose,
  )
  return (
    <Modal
      title={dept ? t('camp.dept.edit_title', { code: dept.code }) : t('camp.dept.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim() || !mealLocationId || (!dept && !code.trim())}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      {usable.length === 0 && <p className="text-sm text-yellow-700">{t('camp.dept.need_location')}</p>}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.common.code')}>{(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!dept} maxLength={30} />}</Field>
        <div className="col-span-2">
          <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <Field label={t('camp.dept.col.meal_location')} hint={t('camp.dept.location_hint')}>
        {(id) => (
          <select id={id} className={inputCls} value={mealLocationId} onChange={(e) => setMealLocationId(e.target.value)}>
            {usable.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {dept && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> {t('camp.common.active')}
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

const NEXT: Record<ShiftType | 'NONE', ShiftType | null> = { NONE: 'DAY', DAY: 'NIGHT', NIGHT: null }

function PatternModal({ campId, dept, onDays, changeover, onClose }: { campId: string; dept: Department; onDays: number; changeover: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [days, setDays] = useState<DayShifts>(() => segmentsToDays(dept.shiftPatterns, onDays))
  const problem = patternProblem(days)
  const m = useCampMutation(() => campApi.setShiftPattern(campId, dept.id, daysToSegments(days)), [campKeys.departments(campId)], onClose)
  const fill = (fn: (i: number) => ShiftType | null) => setDays(Array.from({ length: onDays }, (_, i) => fn(i)))
  const half = Math.ceil(onDays / 2)

  return (
    <Modal
      wide
      title={t('camp.dept.pattern_title', { code: dept.code, name: dept.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!!problem}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{t('camp.dept.pattern_click')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => fill(() => 'DAY')}>
          {t('camp.dept.all_day')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill((i) => (i < half ? 'DAY' : 'NIGHT'))}>
          {t('camp.dept.half', { half, next: half + 1, days: onDays })}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill(() => null)}>
          {t('camp.dept.clear')}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${onDays}, 2.5rem)` }}>
          {days.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={t('camp.dept.day_n', { n: i + 1, shift: s ? SHIFT_LABEL[s] : t('camp.dept.empty_cell') })}
              onClick={() => setDays((p) => p.map((v, j) => (j === i ? NEXT[v ?? 'NONE'] : v)))}
              className={`h-14 rounded-md text-xs font-medium flex flex-col items-center justify-center ${CELL[s ?? 'NONE']}`}
            >
              <span>{i + 1}</span>
              <span className="opacity-80">{s ? SHIFT_LABEL[s] : '—'}</span>
            </button>
          ))}
          {days.map((_, i) => (
            <span key={`w${i}`} className="text-[10px] text-center text-gray-400">
              {weekdayShort(changeover + i + 1)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-sm">
        {problem ? (
          <span className="text-red-600">{problem}</span>
        ) : daysToSegments(days).length === 0 ? (
          <span className="text-gray-500">{t('camp.dept.will_be_empty')}</span>
        ) : (
          <span className="text-gray-600">
            {daysToSegments(days)
              .map((s) => `${s.dayFrom}–${s.dayTo}: ${SHIFT_LABEL[s.shift]}`)
              .join(' · ')}
          </span>
        )}
      </div>
      <ErrorBox error={m.error} />
    </Modal>
  )
}

/** FB-03 — хэлтсийн идэвхтэй ажилтнууд албан тушаалаар бүлэглэсэн (≤100; илүү бол Ажилтан хуудсанд шүүлтээр) */
function DeptEmployeesModal({ campId, dept, onClose }: { campId: string; dept: Department; onClose: () => void }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: [...campKeys.employees(campId), 'dept', dept.id],
    queryFn: () => campApi.employees(campId, { departmentId: dept.id, status: 'ACTIVE', limit: 100 }),
  })
  const groups = new Map<string, { code: string; name: string; crew: string | null }[]>()
  for (const e of q.data?.data ?? []) {
    const k = e.position?.trim() || '—'
    groups.set(k, [...(groups.get(k) ?? []), { code: e.employeeCode, name: e.fullName, crew: e.crew?.code ?? null }])
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  return (
    <Modal title={`${dept.code} · ${dept.name}`} onClose={onClose} wide>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && q.data.data.length === 0 && <Empty>{t('camp.dept.no_employees')}</Empty>}
      {sorted.map(([pos, list]) => (
        <div key={pos} className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-800">
            {pos} <span className="font-normal text-gray-500">({list.length})</span>
          </h3>
          <ul className="grid gap-x-4 sm:grid-cols-2 text-sm text-gray-700">
            {list.map((e) => (
              <li key={e.code}>
                <span className="font-mono text-gray-500 mr-2">{e.code}</span>
                {e.name}
                {e.crew && <span className="text-gray-400"> · {e.crew}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {q.data?.hasMore && <p className="text-xs text-gray-500">{t('camp.dept.more_employees')}</p>}
    </Modal>
  )
}
