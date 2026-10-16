import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../../camp/api/camp-api'
import { hrApi } from '../api/hr-api'
import type { Department } from '../../camp/api/types'
import { campKeys, useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { P } from '../../camp/lib/permissions'
import { weekdayName } from '../../camp/lib/labels'
import ImportDialog, { ExportButton } from '../../camp/components/ImportDialog'
import { DEPARTMENT_IMPORT_COLUMNS } from '../lib/import-columns'
import { PatternStrip, ShiftPatternModal } from '../../camp/components/ShiftPattern'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../../camp/components/ui'
import { useTranslation } from 'react-i18next'


/**
 * Тохиргоо › Хэлтэс, ээлж — хэлтэс + ээлжийн загвар (master.manage).
 * v0.2.1 (Q1, Д-4): хэлтэст хоолны байршил БАЙХГҮЙ (ажилтан / албан тушаал дээр); загвар нь албан тушаалд загвар байхгүй үед л.
 * FB-03 (v0.2.0): идэвхтэй ажилтны тоо, албан тушаалын тоо; мөр дээр дарахад ажилтнууд албан тушаалаар.
 */
export default function DepartmentsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => hrApi.departments(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
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
                <td className={td}>
                  <PatternStrip segments={d.shiftPatterns} onDays={onDays} />
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
      {infoModal && <DeptModal campId={campId} dept={infoModal === 'new' ? null : infoModal} onClose={() => setInfoModal(null)} />}
      {patternModal && (
        <ShiftPatternModal
          title={t('camp.dept.pattern_title', { code: patternModal.code, name: patternModal.name })}
          note={t('camp.dept.pattern_fallback_note')}
          initial={patternModal.shiftPatterns}
          onDays={onDays}
          changeover={changeover}
          save={(segments) => hrApi.setShiftPattern(campId, patternModal.id, segments)}
          invalidate={[campKeys.departments(campId)]}
          onClose={() => setPatternModal(null)}
        />
      )}
      {detail && <DeptEmployeesModal campId={campId} dept={detail} onClose={() => setDetail(null)} />}
      {importing && (
        <ImportDialog
          campId={campId}
          type="departments"
          title={t('camp.dept.import_title')}
          columns={DEPARTMENT_IMPORT_COLUMNS}
          invalidate={[campKeys.departments(campId)]}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}

function DeptModal({ campId, dept, onClose }: { campId: string; dept: Department | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState(dept?.code ?? '')
  const [name, setName] = useState(dept?.name ?? '')
  const [isActive, setIsActive] = useState(dept?.isActive ?? true)
  const m = useCampMutation(
    () =>
      dept
        ? hrApi.updateDepartment(campId, dept.id, { name: name.trim(), isActive })
        : hrApi.createDepartment(campId, { code: code.trim(), name: name.trim() }),
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
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim() || (!dept && !code.trim())}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.common.code')}>{(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!dept} maxLength={30} />}</Field>
        <div className="col-span-2">
          <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <p className="text-xs text-gray-500">{t('camp.dept.meal_moved_hint')}</p>
      {dept && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> {t('camp.common.active')}
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}

/** FB-03 — хэлтсийн идэвхтэй ажилтнууд албан тушаалаар бүлэглэсэн (≤100; илүү бол Ажилтан хуудсанд шүүлтээр) */
function DeptEmployeesModal({ campId, dept, onClose }: { campId: string; dept: Department; onClose: () => void }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: [...campKeys.employees(campId), 'dept', dept.id],
    queryFn: () => hrApi.employees(campId, { departmentId: dept.id, status: 'ACTIVE', limit: 100 }),
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
