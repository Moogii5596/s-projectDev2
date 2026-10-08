import { useState } from 'react'

interface Props {
  onConfirm: (reason: string, notes?: string) => void
  onCancel: () => void
  isLoading: boolean
}

export default function RejectModal({ onConfirm, onCancel, isLoading }: Props) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  const handleConfirm = () => {
    if (!reason.trim()) return
    onConfirm(reason.trim(), notes.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">MR татгалзах</h2>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Татгалзах шалтгаан *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Татгалзах шалтгааныг оруулна уу"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Нэмэлт тайлбар
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Нэмэлт тайлбар (заавал биш)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={!reason.trim() || isLoading}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Татгалзаж байна...' : 'Татгалзах'}
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Цуцлах
          </button>
        </div>
      </div>
    </div>
  )
}
