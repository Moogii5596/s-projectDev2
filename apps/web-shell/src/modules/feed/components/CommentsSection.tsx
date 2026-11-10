import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, Button, ErrorBox, Loading } from '../../../core/ui'
import { feedApi, feedKeys } from '../api'
import type { FeedCommentDto, FeedReportReason } from '../types'
import { EditedLink, TimeAgo } from './PostCard'
import ReportDialog from './ReportDialog'

function CommentItem({ c, onChanged, onRemoved }: { c: FeedCommentDto; onChanged: () => void; onRemoved: () => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.body)
  const [reporting, setReporting] = useState(false)
  const save = useMutation({
    mutationFn: () => feedApi.updateComment(c.id, draft.trim()),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const remove = useMutation({ mutationFn: () => feedApi.removeComment(c.id), onSuccess: onRemoved })
  const report = useMutation({
    mutationFn: (v: { reason: FeedReportReason; note?: string | null }) => feedApi.report({ commentId: c.id, ...v }),
    onSuccess: () => {
      setReporting(false)
      onChanged()
    },
  })

  return (
    <li data-testid="feed-comment" className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
        <span className="font-semibold text-gray-800">{c.author.name}</span>
        <span>·</span>
        <TimeAgo iso={c.createdAt} />
        {c.editedAt && <EditedLink kind="comment" id={c.id} />}
        {c.hidden && <Badge tone="yellow">{t('feed.hidden')}</Badge>}
      </div>
      {editing ? (
        <div className="mt-1 space-y-1">
          <textarea value={draft} maxLength={2000} rows={2} onChange={(e) => setDraft(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>{t('feed.cancel')}</Button>
            <Button size="sm" disabled={!draft.trim()} loading={save.isPending} onClick={() => save.mutate()}>{t('feed.save')}</Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">{c.body}</p>
      )}
      <div className="mt-1 flex gap-3 text-xs">
        {c.canEdit && !editing && <button type="button" className="text-gray-500 hover:underline" onClick={() => { setDraft(c.body); setEditing(true) }}>{t('feed.edit')}</button>}
        {c.canDelete && (
          <button type="button" className="text-red-600 hover:underline" onClick={() => { if (window.confirm(t('feed.confirm_delete_comment'))) remove.mutate() }}>
            {t('feed.delete')}
          </button>
        )}
        {!c.isMine && (
          <button type="button" disabled={c.reportedByMe} className="text-gray-500 hover:underline disabled:no-underline disabled:text-gray-300" onClick={() => setReporting(true)}>
            {c.reportedByMe ? t('feed.report.done') : t('feed.report.action')}
          </button>
        )}
      </div>
      {(save.error ?? remove.error ?? report.error) && <ErrorBox error={save.error ?? remove.error ?? report.error} />}
      {reporting && <ReportDialog onCancel={() => setReporting(false)} onSubmit={(v) => report.mutate(v)} isLoading={report.isPending} />}
    </li>
  )
}

/** Постын сэтгэгдэл: хуучнаас шинэ рүү, «цааш», шинэ сэтгэгдэл бичих */
export default function CommentsSection({ postId, onCountChange }: { postId: string; onCountChange: (delta: number) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const key = feedKeys.comments(postId)
  const [body, setBody] = useState('')
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => feedApi.comments(postId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const add = useMutation({
    mutationFn: () => feedApi.addComment(postId, body.trim()),
    onSuccess: async () => {
      setBody('')
      onCountChange(1)
      await refresh()
    },
  })
  const comments = q.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <section className="space-y-2 border-t border-gray-100 px-4 py-3">
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} onRetry={() => void q.refetch()} />}
      <ul className="space-y-2">
        {comments.map((c) => (
          <CommentItem key={c.id} c={c} onChanged={() => void refresh()} onRemoved={() => { onCountChange(-1); void refresh() }} />
        ))}
      </ul>
      {q.hasNextPage && (
        <button type="button" className="text-xs text-blue-600 hover:underline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {t('feed.more_comments')}
        </button>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim()) add.mutate()
        }}
      >
        <input
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('feed.comment_placeholder')}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" disabled={!body.trim()} loading={add.isPending}>{t('feed.send')}</Button>
      </form>
      {add.isError && <ErrorBox error={add.error} />}
    </section>
  )
}
