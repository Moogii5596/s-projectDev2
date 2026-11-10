import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErrorBox, Loading } from '../../core/ui'
import { feedApi, feedKeys } from './api'
import PostCard from './components/PostCard'
import { useDataSaver } from './lib/data-saver'

/** v0.2.4 FEED-03/05, NTF-01 — нэг пост (мэдэгдлийн линк `/feed/:id`) */
export default function FeedPostPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const [dataSaver] = useDataSaver()
  const q = useQuery({ queryKey: [...feedKeys.all, 'post', id], queryFn: () => feedApi.get(id), enabled: !!id })
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link to="/feed" className="text-sm text-blue-600 hover:underline">← {t('nav.feed')}</Link>
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.data && <PostCard post={q.data} dataSaver={dataSaver} />}
    </div>
  )
}
