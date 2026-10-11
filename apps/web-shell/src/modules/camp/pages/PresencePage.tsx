import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { campKeys } from '../hooks/useCampPermissions'
import { MEAL_LABEL, PRESENCE_GROUP_LABEL } from '../lib/labels'
import { addDays, todayUb } from '../lib/dates'
import { pivotPresence } from '../lib/presence'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Table, inputSmCls, td } from '../components/ui'
import { useTranslation } from 'react-i18next'

/** /camp/:campId/meals — D өдрийн хоолны суурь тоо (хоол × байршил), задаргаа, анхааруулга. Зөвхөн харах */
export default function PresencePage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const [date, setDate] = useState(todayUb())
  const q = useQuery({ queryKey: [...campKeys.presence(campId), date], queryFn: () => campApi.presence(campId, date), enabled: !!date })
  const pivot = q.data ? pivotPresence(q.data.lines) : null
  const [showBreakdown, setShowBreakdown] = useState(false)
  // v0.2.1: задаргаа хэлтэс × ээлж эсвэл албан тушаалаар
  const [by, setBy] = useState<'department' | 'position'>('department')
  const locName = (id: string | null) => q.data?.lines.find((l) => l.mealLocationId === id)?.mealLocationName ?? t('camp.presence.no_location')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('camp.att.col.date')}>{(id) => <input id={id} type="date" className={inputSmCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
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
        {q.data && (
          <div className="flex gap-2 pb-1">
            <Badge tone="blue">{t('camp.meals.present', { n: q.data.presentCount })}</Badge>
            <Badge>{t('camp.meals.person_days', { n: q.data.personDays })}</Badge>
            {(q.data.noMealCount ?? 0) > 0 && <Badge tone="yellow">{t('camp.meals.no_meal_n', { n: q.data.noMealCount ?? 0 })}</Badge>}
          </div>
        )}
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} onRetry={() => q.refetch()} />

      {q.data && (q.data.warnings.unknownShift.length > 0 || q.data.warnings.noDefaultMealLocation) && (
        <div role="alert" className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 space-y-1">
          {q.data.warnings.noDefaultMealLocation && <div>{t('camp.meals.no_default_location')}</div>}
          {q.data.warnings.unknownShift.length > 0 && (
            <div>
              {t('camp.meals.unknown_shift', { n: q.data.warnings.unknownShift.length })}{' '}
              {q.data.warnings.unknownShift.map((u) => `${u.employeeCode} ${u.fullName} (${u.departmentCode})`).join(', ')}
            </div>
          )}
        </div>
      )}

      {pivot && (
        <Card title={t('camp.meals.base_count', { date })}>
          {pivot.rows.length === 0 ? (
            <Empty>{t('camp.meals.nobody')}</Empty>
          ) : (
            <Table head={[t('camp.att.col.meals'), ...pivot.columns.map((c) => c.name), t('camp.meals.total')]}>
              {pivot.rows.map((r) => (
                <tr key={r.meal}>
                  <td className={`${td} font-medium`}>{MEAL_LABEL[r.meal]}</td>
                  {r.counts.map((n, i) => (
                    <td key={i} className={`${td} tabular-nums ${n === 0 ? 'text-gray-300' : ''}`}>
                      {n}
                    </td>
                  ))}
                  <td className={`${td} tabular-nums font-semibold`}>{r.total}</td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className={`${td} font-medium`}>{t('camp.meals.total')}</td>
                {pivot.columnTotals.map((n, i) => (
                  <td key={i} className={`${td} tabular-nums font-semibold`}>
                    {n}
                  </td>
                ))}
                <td className={`${td} tabular-nums font-bold`}>{pivot.grandTotal}</td>
              </tr>
            </Table>
          )}
        </Card>
      )}

      {q.data && q.data.breakdown.length > 0 && (
        <Card
          title={t('camp.meals.breakdown')}
          actions={
            <div className="flex gap-2">
              {showBreakdown && (
                <select aria-label={t('camp.meals.breakdown_by')} className={`${inputSmCls} w-auto`} value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
                  <option value="department">{t('camp.meals.by_department')}</option>
                  <option value="position">{t('camp.meals.by_position')}</option>
                </select>
              )}
              <Button size="sm" variant="secondary" onClick={() => setShowBreakdown((v) => !v)}>
                {showBreakdown ? t('camp.meals.hide') : t('camp.meals.show')}
              </Button>
            </div>
          }
        >
          {showBreakdown && by === 'position' ? (
            <Table head={[t('camp.emp.col.position'), t('camp.att.col.meals'), t('camp.common.location'), t('camp.meals.count')]}>
              {(q.data.byPosition ?? []).map((b, i) => (
                <tr key={i}>
                  <td className={td}>{b.positionName ?? t('camp.emp.no_position')}</td>
                  <td className={td}>{MEAL_LABEL[b.mealType]}</td>
                  <td className={td}>{locName(b.mealLocationId)}</td>
                  <td className={`${td} tabular-nums`}>{b.count}</td>
                </tr>
              ))}
            </Table>
          ) : showBreakdown ? (
            <Table head={[t('camp.emp.department'), t('camp.meals.group'), t('camp.att.col.meals'), t('camp.common.location'), t('camp.meals.count')]}>
              {q.data.breakdown.map((b, i) => (
                <tr key={i}>
                  <td className={td}>{b.departmentCode}</td>
                  <td className={td}>{PRESENCE_GROUP_LABEL[b.group] ?? b.group}</td>
                  <td className={td}>{MEAL_LABEL[b.mealType]}</td>
                  <td className={td}>{locName(b.mealLocationId)}</td>
                  <td className={`${td} tabular-nums`}>{b.count}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-gray-500">{t('camp.meals.breakdown_rows', { n: q.data.breakdown.length })}</p>
          )}
        </Card>
      )}
    </div>
  )
}
