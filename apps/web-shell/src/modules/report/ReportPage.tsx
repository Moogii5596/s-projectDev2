import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, td } from '../camp/components/ui'
import { formatMoney } from '../camp/lib/money'
import { downloadReportCsv, getReportSummary } from './api'
import { barWidth, csvFileName, sortStatuses, statusLabel, utilizationTone } from './lib/report'

const BAR = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' } as const

/** Phase 6.0.4 — Нэгдсэн тайлан (Report-lite): MR, төсөв, бараа, нийлүүлэгч + CSV */
export default function ReportPage() {
  const summary = useQuery({ queryKey: ['reports', 'summary'], queryFn: getReportSummary })

  const csv = useMutation({
    mutationFn: downloadReportCsv,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = csvFileName()
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })

  const s = summary.data

  return (
    <div className="space-y-4">
      <PageHeader
        title="Тайлан"
        subtitle={s ? `Үүсгэсэн: ${new Date(s.generatedAt).toLocaleString('mn-MN')}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => summary.refetch()} disabled={summary.isFetching}>
              Шинэчлэх
            </Button>
            <Button onClick={() => csv.mutate()} loading={csv.isPending} disabled={!s}>
              CSV татах
            </Button>
          </>
        }
      />
      <ErrorBox error={csv.error} />

      {summary.isLoading ? (
        <Loading />
      ) : summary.isError || !s ? (
        <ErrorBox error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Нийт MR" value={String(s.requisitions.total)} />
            <Stat label="MR нийт дүн" value={formatMoney(s.requisitions.totalAmount)} />
            <Stat label="Бараа (бага үлдэгдэл)" value={`${s.inventory.items} (${s.inventory.lowStock})`} warn={s.inventory.lowStock > 0} testId="stat-inventory" />
            <Stat label="Нийлүүлэгч (идэвхтэй)" value={`${s.vendors.total} (${s.vendors.active})`} testId="stat-vendors" />
          </div>

          <Card title="MR — статусаар">
            {s.requisitions.total === 0 ? (
              <Empty>MR алга</Empty>
            ) : (
              <Table head={['Статус', 'Тоо', 'Дүн']}>
                {sortStatuses(s.requisitions.byStatus).map(([status, v]) => (
                  <tr key={status}>
                    <td className={td}>{statusLabel(status)}</td>
                    <td className={`${td} tabular-nums`}>{v.count}</td>
                    <td className={`${td} tabular-nums`}>{formatMoney(v.amount)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Төсвийн ашиглалт (идэвхтэй үе)" actions={<Badge tone={s.budget.enforced ? 'blue' : 'gray'}>{s.budget.enforced ? 'Төсөв хянагдаж байна' : 'Төсвийн хяналтгүй'}</Badge>}>
            {s.budget.allocations.length === 0 ? (
              <Empty>Идэвхтэй төсвийн хуваарилалт алга</Empty>
            ) : (
              <Table head={['Хэлтэс', 'Үе', 'Төсөв', 'Захиалсан', 'Зарцуулсан', 'Ашиглалт']}>
                {s.budget.allocations.map((a) => {
                  const tone = utilizationTone(a.utilizationPct)
                  return (
                    <tr key={`${a.period}-${a.department}`}>
                      <td className={td}>{a.department}</td>
                      <td className={`${td} text-gray-500`}>{a.period}</td>
                      <td className={`${td} tabular-nums`}>{formatMoney(a.total)}</td>
                      <td className={`${td} tabular-nums`}>{formatMoney(a.committed)}</td>
                      <td className={`${td} tabular-nums`}>{formatMoney(a.spent)}</td>
                      <td className={`${td} min-w-[9rem]`}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded bg-gray-100 overflow-hidden">
                            <div className={`h-2 ${BAR[tone]}`} style={{ width: `${barWidth(a.utilizationPct)}%` }} />
                          </div>
                          <span className="tabular-nums text-xs text-gray-600 w-12 text-right">{a.utilizationPct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, warn, testId }: { label: string; value: string; warn?: boolean; testId?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3" data-testid={testId}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${warn ? 'text-yellow-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
