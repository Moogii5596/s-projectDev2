import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { campKeys } from '../hooks/useCampPermissions'
import { MEAL_LABEL, PRESENCE_GROUP_LABEL } from '../lib/labels'
import { addDays, todayUb } from '../lib/dates'
import { pivotPresence } from '../lib/presence'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Table, inputSmCls, td } from '../components/ui'

/** /camp/:campId/meals — D өдрийн хоолны суурь тоо (хоол × байршил), задаргаа, анхааруулга. Зөвхөн харах */
export default function PresencePage() {
  const { campId = '' } = useParams()
  const [date, setDate] = useState(todayUb())
  const q = useQuery({ queryKey: [...campKeys.presence(campId), date], queryFn: () => campApi.presence(campId, date), enabled: !!date })
  const pivot = q.data ? pivotPresence(q.data.lines) : null
  const [showBreakdown, setShowBreakdown] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Огноо">{(id) => <input id={id} type="date" className={inputSmCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
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
        {q.data && (
          <div className="flex gap-2 pb-1">
            <Badge tone="blue">Кемпэд {q.data.presentCount} хүн</Badge>
            <Badge>Хүн-өдөр {q.data.personDays}</Badge>
          </div>
        )}
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} onRetry={() => q.refetch()} />

      {q.data && (q.data.warnings.unknownShift.length > 0 || q.data.warnings.noDefaultMealLocation) && (
        <div role="alert" className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 space-y-1">
          {q.data.warnings.noDefaultMealLocation && <div>Кемпийн тохиргоонд анхдагч хоол идэх байршил сонгоогүй — өглөө/оройн хоолны байршил тодорхойгүй.</div>}
          {q.data.warnings.unknownShift.length > 0 && (
            <div>
              Ээлж тодорхойгүй {q.data.warnings.unknownShift.length} ажилтан (өглөө, оройн хоолоор тоолсон; "Ээлж" хэсэгт зохицуулалт хийнэ үү):{' '}
              {q.data.warnings.unknownShift.map((u) => `${u.employeeCode} ${u.fullName} (${u.departmentCode})`).join(', ')}
            </div>
          )}
        </div>
      )}

      {pivot && (
        <Card title={`Хоолны суурь тоо — ${date}`}>
          {pivot.rows.length === 0 ? (
            <Empty>Энэ өдөр кемпэд хүн алга</Empty>
          ) : (
            <Table head={['Хоол', ...pivot.columns.map((c) => c.name), 'Нийт']}>
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
                <td className={`${td} font-medium`}>Нийт</td>
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
          title="Задаргаа (хэлтэс × бүлэг)"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setShowBreakdown((v) => !v)}>
              {showBreakdown ? 'Нуух' : 'Харуулах'}
            </Button>
          }
        >
          {showBreakdown ? (
            <Table head={['Хэлтэс', 'Бүлэг', 'Хоол', 'Байршил', 'Тоо']}>
              {q.data.breakdown.map((b, i) => (
                <tr key={i}>
                  <td className={td}>{b.departmentCode}</td>
                  <td className={td}>{PRESENCE_GROUP_LABEL[b.group] ?? b.group}</td>
                  <td className={td}>{MEAL_LABEL[b.mealType]}</td>
                  <td className={td}>{q.data.lines.find((l) => l.mealLocationId === b.mealLocationId)?.mealLocationName ?? 'Байршилгүй'}</td>
                  <td className={`${td} tabular-nums`}>{b.count}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-gray-500">{q.data.breakdown.length} мөр — хэлтэс, ээлж (өдөр/шөнө/тодорхойгүй/ирэх-явах) тус бүрээр.</p>
          )}
        </Card>
      )}
    </div>
  )
}
