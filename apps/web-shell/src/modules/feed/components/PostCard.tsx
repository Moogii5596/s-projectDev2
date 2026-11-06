import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge, Button, ErrorBox } from '../../camp/components/ui'
import { feedApi, feedKeys, type FeedListDto } from '../api'
import { isLongBody, patchPost, relativeTime, toggleLike } from '../lib/feed'
import type { FeedPostDto, FeedReportReason } from '../types'
import CommentsSection from './CommentsSection'
import FeedImageGrid from './FeedImageGrid'
import ReportDialog from './ReportDialog'
import RevisionsDialog from './RevisionsDialog'

type ListData = InfiniteData<FeedListDto, string | null>

export function TimeAgo({ iso }: { iso: string }) {
  const { t } = useTranslation()
  const r = relativeTime(iso)
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {t(r.key, { n: r.n, date: r.date })}
    </time>
  )
}

/** «засагдсан» → өмнөх хувилбарууд (бүх уншигч) */
export function EditedLink({ kind, id }: { kind: 'post' | 'comment'; id: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: feedKeys.revisions(kind, id), queryFn: () => feedApi.revisions(kind, id), enabled: open })
  return (
    <>
      <button type="button" className="text-xs text-gray-400 hover:underline" onClick={() => setOpen(true)}>
        · {t('feed.edited')}
      </button>
      {open && q.data && <RevisionsDialog data={q.data} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function PostCard({ post, dataSaver }: { post: FeedPostDto; dataSaver: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [showComments, setShowComments] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [menu, setMenu] = useState(false)

  const patch = (fn: (p: FeedPostDto) => FeedPostDto | null) =>
    qc.setQueryData<ListData>(feedKeys.list(), (d) => patchPost(d, post.id, fn))

  const like = useMutation({
    mutationFn: (on: boolean) => feedApi.like(post.id, on),
    onMutate: (on) => patch((p) => toggleLike(p, on)),
    onSuccess: (r) => patch((p) => ({ ...p, likedByMe: r.liked, likeCount: r.likeCount })),
    onError: (_e, on) => patch((p) => toggleLike(p, !on)),
  })
  const save = useMutation({
    mutationFn: () => feedApi.update(post.id, draft.trim()),
    onSuccess: (p) => {
      patch(() => p)
      setEditing(false)
    },
  })
  const remove = useMutation({
    mutationFn: () => feedApi.remove(post.id),
    onSuccess: () => patch(() => null),
  })
  const report = useMutation({
    mutationFn: (v: { reason: FeedReportReason; note?: string | null }) => feedApi.report({ postId: post.id, ...v }),
    onSuccess: () => {
      patch((p) => ({ ...p, reportedByMe: true }))
      setReporting(false)
    },
  })

  const long = isLongBody(post.body)
  const error = like.error ?? save.error ?? remove.error

  return (
    <article data-testid="feed-post" className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{post.author.name}</div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
            <TimeAgo iso={post.createdAt} />
            {post.editedAt && <EditedLink kind="post" id={post.id} />}
            {post.hidden && <Badge tone="yellow">{t('feed.hidden')}</Badge>}
          </div>
        </div>
        <div className="relative">
          <button type="button" aria-label={t('feed.menu')} className="rounded px-2 text-gray-500 hover:bg-gray-100" onClick={() => setMenu((v) => !v)}>
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow" onMouseLeave={() => setMenu(false)}>
              {post.canEdit && (
                <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-gray-50" onClick={() => { setDraft(post.body); setEditing(true); setMenu(false) }}>
                  {t('feed.edit')}
                </button>
              )}
              {post.canDelete && (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-gray-50"
                  onClick={() => { setMenu(false); if (window.confirm(t('feed.confirm_delete'))) remove.mutate() }}
                >
                  {t('feed.delete')}
                </button>
              )}
              {!post.isMine && (
                <button
                  type="button"
                  disabled={post.reportedByMe}
                  className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 disabled:text-gray-400"
                  onClick={() => { setReporting(true); setMenu(false) }}
                >
                  {post.reportedByMe ? t('feed.report.done') : t('feed.report.action')}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="px-4 py-2">
        {editing ? (
          <div className="space-y-2">
            <textarea value={draft} maxLength={5000} rows={4} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>{t('feed.cancel')}</Button>
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{t('feed.save')}</Button>
            </div>
          </div>
        ) : (
          post.body && (
            <p className={`whitespace-pre-wrap break-words text-sm text-gray-800 ${long && !expanded ? 'line-clamp-6' : ''}`}>
              {post.body}
            </p>
          )
        )}
        {!editing && long && (
          <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('feed.less') : t('feed.more')}
          </button>
        )}
      </div>

      {post.images.length > 0 && <FeedImageGrid images={post.images} dataSaver={dataSaver} />}

      <footer className="flex items-center gap-4 border-t border-gray-100 px-4 py-2 text-sm">
        <button
          type="button"
          aria-pressed={post.likedByMe}
          className={post.likedByMe ? 'font-medium text-blue-600' : 'text-gray-600 hover:text-blue-600'}
          onClick={() => like.mutate(!post.likedByMe)}
        >
          {post.likedByMe ? '♥' : '♡'} {t('feed.like')}{post.likeCount > 0 && ` · ${post.likeCount}`}
        </button>
        <button type="button" className="text-gray-600 hover:text-blue-600" onClick={() => setShowComments((v) => !v)}>
          {t('feed.comments')}{post.commentCount > 0 && ` · ${post.commentCount}`}
        </button>
      </footer>

      {error && <div className="px-4 pb-2"><ErrorBox error={error} /></div>}
      {showComments && (
        <CommentsSection
          postId={post.id}
          onCountChange={(d) => patch((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + d) }))}
        />
      )}
      {reporting && (
        <ReportDialog onCancel={() => setReporting(false)} onSubmit={(v) => report.mutate(v)} isLoading={report.isPending} />
      )}
      {report.isError && <div className="px-4 pb-2"><ErrorBox error={report.error} /></div>}
    </article>
  )
}
