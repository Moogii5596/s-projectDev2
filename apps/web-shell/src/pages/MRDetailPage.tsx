import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMRDetail, useSubmitMR, useApproveMR, useRejectMR } from '../hooks/useMR'
import { useMRRealtime } from '../hooks/useMRRealtime'
import { MrStatus } from '../types/mr.types'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'
import RejectModal from '../components/RejectModal'
import { useMe } from '../hooks/useMe'
import { approvalState, roleLabel, stepViews } from '../lib/mr-approval'
import { apiErrorMessage } from '../core/errors'

const STEP_CLS = {
  done: 'bg-green-50 border-green-200 text-green-700',
  current: 'bg-blue-50 border-blue-300 text-blue-700',
  waiting: 'bg-gray-50 border-gray-200 text-gray-500',
  rejected: 'bg-red-50 border-red-200 text-red-700',
} as const

export default function MRDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mrId = id ?? ''

  const { data: mr, isLoading, isError, refetch } = useMRDetail(mrId)
  const submitMutation = useSubmitMR(mrId)
  const approveMutation = useApproveMR(mrId)
  const rejectMutation = useRejectMR(mrId)
  const { me } = useMe() // Phase 6.0b [SEC-004]: батлах товч зөвхөн эрхтэй хүнд

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Realtime subscription
  useMRRealtime(mrId)

  if (isLoading) return <LoadingSpinner />
  if (isError || !mr) return <ErrorMessage message="MR олдсонгүй" onRetry={refetch} />

  const handleSubmit = async () => {
    setActionError(null)
    try {
      await submitMutation.mutateAsync({})
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Илгээхэд алдаа гарлаа'))
    }
  }

  const handleApprove = async () => {
    setActionError(null)
    try {
      await approveMutation.mutateAsync({})
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Батлахад алдаа гарлаа'))
    }
  }

  const handleReject = async (reason: string, notes?: string) => {
    setActionError(null)
    try {
      await rejectMutation.mutateAsync({ reason, notes })
      setShowRejectModal(false)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Татгалзахад алдаа гарлаа'))
    }
  }

  const isActing = submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending
  const approval = approvalState(mr, me)
  const wf = mr.workflow

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <button
        onClick={() => navigate('/debug/modules/mr')}
        className="text-gray-400 hover:text-gray-600 text-sm mb-4 block"
      >
        ← Жагсаалт руу буцах
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">{mr.title}</h1>
            <p className="text-gray-500 text-xs">
              Огноо: {new Date(mr.createdAt).toLocaleDateString('mn-MN')}
            </p>
          </div>
          <StatusBadge status={mr.status} />
        </div>

        {mr.notes && (
          <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg mb-4">{mr.notes}</p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {mr.status === MrStatus.DRAFT && (
            <button
              onClick={handleSubmit}
              disabled={isActing}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitMutation.isPending ? 'Илгээж байна...' : '📤 Батлуулахаар илгээх'}
            </button>
          )}

          {mr.status === MrStatus.PENDING_APPROVAL && !approval.canAct && approval.reason && (
            <p className="text-sm text-gray-500 py-2">{approval.reason}</p>
          )}

          {mr.status === MrStatus.PENDING_APPROVAL && approval.canAct && (
            <>
              <button
                onClick={handleApprove}
                disabled={isActing}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {approveMutation.isPending ? 'Баталж байна...' : '✅ Батлах'}
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={isActing}
                className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                ❌ Татгалзах
              </button>
            </>
          )}

          {mr.status === MrStatus.APPROVED && (
            <div className="text-green-600 text-sm font-medium py-2">
              ✅ Энэ MR батлагдсан байна
              {mr.approvedAt && (
                <span className="text-gray-400 ml-2">
                  ({new Date(mr.approvedAt).toLocaleDateString('mn-MN')})
                </span>
              )}
            </div>
          )}

          {mr.status === MrStatus.REJECTED && (
            <div className="text-red-600 text-sm font-medium py-2">
              ❌ Энэ MR татгалзагдсан байна
            </div>
          )}
        </div>

        {actionError && (
          <div className="mt-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
            {actionError}
          </div>
        )}
      </div>

      {/* Phase 6.0b: батлалтын алхмууд */}
      {wf && mr.status !== MrStatus.DRAFT && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Батлалт
            {mr.status === MrStatus.PENDING_APPROVAL && wf.currentStep < wf.totalSteps && (
              <span className="ml-2 font-normal text-gray-500">
                Алхам {wf.currentStep + 1}/{wf.totalSteps}
              </span>
            )}
          </h2>
          <ol className="flex flex-wrap gap-2" aria-label="Батлалтын алхмууд">
            {stepViews(wf, mr.status).map((s) => (
              <li key={s.index} className={`border rounded-lg px-3 py-2 text-xs ${STEP_CLS[s.state]}`} data-testid={`mr-step-${s.index}`} data-state={s.state}>
                <span className="font-medium">
                  {s.index + 1}. {roleLabel(s.role)}
                </span>
                {s.quorum > 1 && <span className="ml-1">({s.approved}/{s.quorum})</span>}
                <span className="ml-1">{s.state === 'done' ? '✓' : s.state === 'rejected' ? '✕' : s.state === 'current' ? '…' : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Items table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            Материалын жагсаалт ({mr.items?.length ?? 0} мөр)
          </h2>
        </div>

        {!mr.items || mr.items.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            Материал байхгүй байна
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">#</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Нэр</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Тоо</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Нэгж</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Тайлбар</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mr.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{item.description}</td>
                  <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-gray-700">{item.unitOfMeasure}</td>
                  <td className="px-4 py-3 text-gray-500">{item.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <RejectModal
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
          isLoading={rejectMutation.isPending}
        />
      )}
    </div>
  )
}
