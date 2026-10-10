import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { Department, MealLocation, ShiftType } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { SHIFT_LABEL, WEEKDAYS } from '../lib/labels'
import { type DayShifts, daysToSegments, patternProblem, segmentsToDays } from '../lib/shift-pattern'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../components/ui'

const CELL: Record<ShiftType | 'NONE', string> = {
  DAY: 'bg-amber-200 text-amber-900',
  NIGHT: 'bg-indigo-600 text-white',
  NONE: 'bg-gray-100 text-gray-400',
}

/** /camp/:campId/departments — хэлтэс (хоол идэх байршил) + ээлжийн загвар (master.manage) */
export default function DepartmentsPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const [infoModal, setInfoModal] = useState<Department | 'new' | null>(null)
  const [patternModal, setPatternModal] = useState<Department | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const onDays = settings.data?.rosterOnDays ?? 14
  const changeover = settings.data?.changeoverWeekday ?? 3

  return (
    <div className="space-y-4">
      <Card
        title="Хэлтэс ба ээлжийн загвар"
        actions={canEdit && <Button size="sm" onClick={() => setInfoModal('new')}>+ Хэлтэс</Button>}
      >
        <p className="text-xs text-gray-500 mb-3">
          Ээлжийн загвар нь ажлын {onDays} хоногийн өдөр бүрт өдөр/шөнийн ээлж заана (1-р өдөр = ирсний маргааш,{' '}
          {WEEKDAYS[(changeover + 1) % 7]}). Загваргүй хэлтсийн ажилтны ээлж зохицуулалтгүй бол "тодорхойгүй" болно.
        </p>
        {(depts.isLoading || settings.isLoading) && <Loading />}
        <ErrorBox error={depts.error ?? settings.error} />
        {depts.data && depts.data.length === 0 && <Empty>Хэлтэс бүртгэгдээгүй</Empty>}
        {depts.data && depts.data.length > 0 && (
          <Table head={['Код', 'Нэр', 'Хоол идэх байршил', `Ээлж (1–${onDays})`, 'Төлөв', '']}>
            {depts.data.map((d) => (
              <tr key={d.id}>
                <td className={`${td} font-mono text-gray-600`}>{d.code}</td>
                <td className={td}>{d.name}</td>
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
                        Ээлж
                      </Button>
                      <Button variant="ghost" onClick={() => setInfoModal(d)}>
                        Засах
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
    </div>
  )
}

/** Жижиг харагдац: өдөр бүр нэг нүд */
function PatternStrip({ days, empty }: { days: DayShifts; empty: boolean }) {
  if (empty) return <span className="text-xs text-gray-400">Загваргүй</span>
  return (
    <div className="flex gap-px" role="img" aria-label={daysToSegments(days).map((s) => `${s.dayFrom}–${s.dayTo} ${SHIFT_LABEL[s.shift]}`).join(', ')}>
      {days.map((s, i) => (
        <span key={i} className={`w-3 h-4 rounded-sm ${CELL[s ?? 'NONE']}`} title={`${i + 1}-р өдөр: ${s ? SHIFT_LABEL[s] : '—'}`} />
      ))}
    </div>
  )
}

function DeptModal({ campId, dept, locations, onClose }: { campId: string; dept: Department | null; locations: MealLocation[]; onClose: () => void }) {
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
      title={dept ? `Хэлтэс ${dept.code} засах` : 'Хэлтэс нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim() || !mealLocationId || (!dept && !code.trim())}>
            Хадгалах
          </Button>
        </>
      }
    >
      {usable.length === 0 && <p className="text-sm text-yellow-700">Эхлээд "Тохиргоо" хэсэгт хоол идэх байршил нэмнэ үү.</p>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Код">{(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!dept} maxLength={30} />}</Field>
        <div className="col-span-2">
          <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <Field label="Хоол идэх байршил" hint="Өдрийн ээлжийн өдрийн хоол, шөнийн ээлжийн шөнийн хоол энд">
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
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Идэвхтэй
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

const NEXT: Record<ShiftType | 'NONE', ShiftType | null> = { NONE: 'DAY', DAY: 'NIGHT', NIGHT: null }

function PatternModal({ campId, dept, onDays, changeover, onClose }: { campId: string; dept: Department; onDays: number; changeover: number; onClose: () => void }) {
  const [days, setDays] = useState<DayShifts>(() => segmentsToDays(dept.shiftPatterns, onDays))
  const problem = patternProblem(days)
  const m = useCampMutation(() => campApi.setShiftPattern(campId, dept.id, daysToSegments(days)), [campKeys.departments(campId)], onClose)
  const fill = (fn: (i: number) => ShiftType | null) => setDays(Array.from({ length: onDays }, (_, i) => fn(i)))
  const half = Math.ceil(onDays / 2)

  return (
    <Modal
      wide
      title={`Ээлжийн загвар — ${dept.code} ${dept.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!!problem}>
            Хадгалах
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">Нүдэн дээр дарж солино: хоосон → Өдөр → Шөнө → хоосон.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => fill(() => 'DAY')}>
          Бүгд өдөр
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill((i) => (i < half ? 'DAY' : 'NIGHT'))}>
          1–{half} өдөр, {half + 1}–{onDays} шөнө
        </Button>
        <Button size="sm" variant="secondary" onClick={() => fill(() => null)}>
          Цэвэрлэх (загваргүй)
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${onDays}, 2.5rem)` }}>
          {days.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}-р өдөр: ${s ? SHIFT_LABEL[s] : 'хоосон'}`}
              onClick={() => setDays((p) => p.map((v, j) => (j === i ? NEXT[v ?? 'NONE'] : v)))}
              className={`h-14 rounded-md text-xs font-medium flex flex-col items-center justify-center ${CELL[s ?? 'NONE']}`}
            >
              <span>{i + 1}</span>
              <span className="opacity-80">{s ? SHIFT_LABEL[s] : '—'}</span>
            </button>
          ))}
          {days.map((_, i) => (
            <span key={`w${i}`} className="text-[10px] text-center text-gray-400">
              {WEEKDAYS[(changeover + i + 1) % 7].slice(0, 2)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-sm">
        {problem ? (
          <span className="text-red-600">{problem}</span>
        ) : daysToSegments(days).length === 0 ? (
          <span className="text-gray-500">Загваргүй болно (ээлж зохицуулалтаар л тодорхойлогдоно)</span>
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
