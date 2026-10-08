import { useQuery } from '@tanstack/react-query'
import { getApprovalSla } from '../api/workflow'

export default function ApprovalSlaPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['workflow', 'approval-sla'], queryFn: getApprovalSla })

  if (isLoading) return <p className="text-gray-500">SLA тайлан ачаалж байна...</p>
  if (isError || !data) return <p className="text-red-600">SLA тайлан татахад алдаа гарлаа.</p>

  const metrics = [
    ['Нийт', data.summary.total],
    ['Хугацаандаа дууссан', data.summary.completed_on_time],
    ['Escalated', data.summary.escalated],
    ['Overdue', data.summary.overdue],
    ['Дундаж цаг', `${data.summary.avg_completion_hours}ц`],
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Approval SLA тайлан</h1>
        <p className="text-sm text-gray-500 mt-1">Сүүлийн 30 хоногийн workflow гүйцэтгэл</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr><th className="text-left px-4 py-3">Алхам</th><th className="text-left px-4 py-3">Role</th><th className="text-left px-4 py-3">Дундаж цаг</th><th className="text-left px-4 py-3">Escalation rate</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.by_step.map((step) => <tr key={step.step_order}><td className="px-4 py-3">{step.step_order}</td><td className="px-4 py-3">{step.role}</td><td className="px-4 py-3">{step.avg_hours}ц</td><td className="px-4 py-3">{Math.round(step.escalation_rate * 100)}%</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}