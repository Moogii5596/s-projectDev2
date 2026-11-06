import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, ErrorBox, Loading } from '../camp/components/ui'
import { feedApi, feedKeys } from './api'
import PostComposer from './components/PostComposer'
import PostCard from './components/PostCard'
import { useDataSaver } from './lib/data-saver'

/**
 * v0.2.3 Блок 5 (FEED-01) — `/feed`: байгууллагын дотоод feed. Утсанд эхэлж (нэг багана, max-w-xl).
 * «Цааш ачаалах»: доод тэмдэглэгч дэлгэцэнд ойртоход автоматаар (IntersectionObserver) + товч (нөөц).
 */
export default function FeedPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [dataSaver, setDataSaver] = useDataSaver()
  const q = useInfiniteQuery({
    queryKey: feedKeys.list(),
    queryFn: ({ pageParam }) => feedApi.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  })

  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '800px 0px' }, // дэлгэцнээс ~1 дэлгэцийн өмнө — гүйлгэхэд саатахгүй
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const posts = q.data?.pages.flatMap((p) => p.data) ?? []
  const canModerate = q.data?.pages[0]?.canModerate ?? false

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-gray-900">{t('feed.title')}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={dataSaver} onChange={(e) => setDataSaver(e.target.checked)} />
            {t('feed.data_saver')}
          </label>
          {canModerate && (
            <Button variant="secondary" onClick={() => navigate('/feed/reports')}>
              {t('feed.reports.title')}
            </Button>
          )}
        </div>
      </div>

      <PostComposer />

      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => void q.refetch()} />}
      {q.isSuccess && posts.length === 0 && <Empty>{t('feed.empty')}</Empty>}

      {posts.map((p) => (
        <PostCard key={p.id} post={p} dataSaver={dataSaver} />
      ))}

      <div ref={sentinel} />
      {hasNextPage && (
        <div className="flex justify-center py-2">
          <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? t('common.loading') : t('feed.load_more')}
          </Button>
        </div>
      )}
    </div>
  )
}
