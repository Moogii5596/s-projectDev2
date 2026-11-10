import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useNavigate } from 'react-router-dom'
import { useMRList } from '../hooks/useMR'
import { useMRListRealtime } from '../hooks/useMRRealtime'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'

export default function MRListPage() {
  const { data: mrList, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useMRList()
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: mrList?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 56,
    overscan: 5,
  })

  // Realtime subscription — жагсаалт автоматаар шинэчлэгдэнэ
  useMRListRealtime()

  if (isLoading) return <LoadingSpinner />
  if (isError) return <ErrorMessage message="MR жагсаалт татахад алдаа гарлаа" onRetry={refetch} />

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Материал хүсэх хуудас</h1>
        <button
          onClick={() => navigate('/debug/modules/mr/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Шинэ MR үүсгэх
        </button>
      </div>

      {/* Empty state */}
      {(!mrList || mrList.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">Одоогоор MR байхгүй байна</p>
          <button
            onClick={() => navigate('/debug/modules/mr/new')}
            className="mt-4 text-blue-600 text-sm hover:underline"
          >
            Эхний MR-аа үүсгэх
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Гарчиг</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Статус</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Огноо</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
          </table>
          <div ref={listRef} className="max-h-[32rem] overflow-auto">
            <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const mr = mrList[virtualRow.index]
                return (
                  <div
                    key={mr.id}
                    className="absolute left-0 right-0 grid grid-cols-[2fr_1fr_1fr_auto] items-center border-b border-gray-100 hover:bg-gray-50 text-sm"
                    style={{ transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px` }}
                  >
                    <div className="px-4 text-gray-900 font-medium">{mr.title}</div>
                    <div className="px-4"><StatusBadge status={mr.status} /></div>
                    <div className="px-4 text-gray-500">{new Date(mr.createdAt).toLocaleDateString('mn-MN')}</div>
                    <div className="px-4 text-right">
                      <button onClick={() => navigate(`/debug/modules/mr/${mr.id}`)} className="text-blue-600 hover:underline text-sm">
                        Дэлгэрэнгүй →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {hasNextPage && (
            <div className="border-t border-gray-200 p-4 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-blue-600 text-sm hover:underline disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Уншиж байна...' : 'Дараагийн хуудас'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
