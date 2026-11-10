import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, inputCls, inputSmCls } from '../../core/ui'
import { useAppMutation } from '../../core/useAppMutation'
import { downloadBlob } from '../../core/download'
import { currentLang, INTL_LOCALE } from '../../i18n'
import { FeedImageGrid, useDataSaver } from './feed-bridge'
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  feedbackApi,
  feedbackKeys,
  type FeedbackItemDto,
  type FeedbackKind,
  type FeedbackStatus,
  type QueryFeedbackDto,
} from './api'
import { filesWithinAttachmentLimit, KIND_TONE, STATUS_TONE, isVersion, sourcePath } from './lib'
import FeedbackAttachments from './FeedbackAttachments'

/**
 * v0.2.3 Блок F (FB-SYS-01a) — «Санал хүсэлт»: бүгд харна, «+1»; зохиогч «Шинэ» үед засна; OWNER/ADMIN төлөв, хариу.
 * Хуудас бүрийн «Санал илгээх» товч → `/feedback` (state: { compose: true, from: <хуудас> }).
 */
export default function FeedbackPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [q, setQ] = useState<QueryFeedbackDto>({ sort: 'new' })
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<FeedbackItemDto | 'new' | null>(null)
  const [managing, setManaging] = useState<FeedbackItemDto | null>(null)
  const [deleting, setDeleting] = useState<FeedbackItemDto | null>(null)
  const [from, setFrom] = useState<string | null>(null)

  // «Санал илгээх» товчоор ирсэн бол маягтыг шууд нээнэ (state-ийг цэвэрлэж, буцаахад дахин нээгдэхгүй)
  useEffect(() => {
    const st = location.state as { compose?: boolean; from?: string } | null
    if (st?.compose) {
      setFrom(sourcePath(st.from))
      setEditing('new')
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  // Хайлтыг 300мс хойшлуулна
  useEffect(() => {
    const h = setTimeout(() => setQ((p) => ({ ...p, q: search.trim() || undefined })), 300)
    return () => clearTimeout(h)
  }, [search])

  const list = useQuery({ queryKey: feedbackKeys.list(q), queryFn: () => feedbackApi.list(q) })
  const vote = useAppMutation((it: FeedbackItemDto) => feedbackApi.vote(it.id, !it.votedByMe), [feedbackKeys.all])
  const remove = useAppMutation((id: string) => feedbackApi.remove(id), [feedbackKeys.all], () => setDeleting(null))
  const exportX = useAppMutation(() => feedbackApi.exportXlsx(), [], (blob) => downloadBlob(blob, 'feedback.xlsx'))

  const canManage = list.data?.canManage ?? false
  const items = list.data?.data ?? []
  const set = <K extends keyof QueryFeedbackDto>(k: K, v: QueryFeedbackDto[K]) => setQ((p) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('feedback.title')}
        subtitle={t('feedback.subtitle')}
        actions={
          <>
            {canManage && (
              <Button variant="secondary" onClick={() => exportX.mutate(undefined)} loading={exportX.isPending}>
                {t('feedback.export')}
              </Button>
            )}
            <Button onClick={() => { setFrom(null); setEditing('new') }}>{t('feedback.new')}</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('camp.common.status')}>
          {([undefined, ...FEEDBACK_STATUSES] as (FeedbackStatus | undefined)[]).map((s) => (
            <button
              key={s ?? 'all'}
              type="button"
              role="tab"
              aria-selected={q.status === s}
              onClick={() => set('status', s)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${q.status === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              {s ? t(`feedback.status.${s}`) : t('camp.common.all')}
            </button>
          ))}
        </div>
        <select
          aria-label={t('feedback.kind')}
          className={`${inputSmCls} w-44`}
          value={q.kind ?? ''}
          onChange={(e) => set('kind', (e.target.value || undefined) as FeedbackKind | undefined)}
        >
          <option value="">{t('feedback.kind_all')}</option>
          {FEEDBACK_KINDS.map((k) => (
            <option key={k} value={k}>{t(`feedback.kind.${k}`)}</option>
          ))}
        </select>
        <select aria-label={t('feedback.sort')} className={`${inputSmCls} w-44`} value={q.sort ?? 'new'} onChange={(e) => set('sort', e.target.value as 'new' | 'votes')}>
          <option value="new">{t('feedback.sort.new')}</option>
          <option value="votes">{t('feedback.sort.votes')}</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={!!q.mine} onChange={(e) => set('mine', e.target.checked || undefined)} />
          {t('feedback.mine')}
        </label>
        <input
          type="search"
          aria-label={t('camp.common.search')}
          placeholder={t('camp.common.search')}
          className={`${inputSmCls} w-48`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ErrorBox error={list.error ?? vote.error ?? exportX.error} onRetry={list.error ? () => void list.refetch() : undefined} />
      {list.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Card>
          <Empty>{t('feedback.empty')}</Empty>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label={t('feedback.title')}>
          {items.map((it) => (
            <FeedbackRow
              key={it.id}
              it={it}
              canManage={canManage}
              voting={vote.isPending && vote.variables?.id === it.id}
              onVote={() => vote.mutate(it)}
              onEdit={() => setEditing(it)}
              onDelete={() => setDeleting(it)}
              onManage={() => setManaging(it)}
            />
          ))}
        </ul>
      )}
      {list.data && list.data.total > items.length && (
        <p className="text-xs text-gray-400">{t('feedback.shown', { shown: items.length, total: list.data.total })}</p>
      )}

      {editing && <FeedbackForm item={editing === 'new' ? null : editing} pagePath={from} onClose={() => setEditing(null)} />}
      {managing && <ManageForm item={managing} onClose={() => setManaging(null)} />}
      {deleting && (
        <Modal
          title={t('feedback.delete_title')}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>{t('camp.common.cancel')}</Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(deleting.id)}>{t('feedback.delete')}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-700">{t('feedback.delete_confirm', { title: deleting.title })}</p>
          <ErrorBox error={remove.error} />
        </Modal>
      )}
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(INTL_LOCALE[currentLang()], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function FeedbackRow({
  it,
  canManage,
  voting,
  onVote,
  onEdit,
  onDelete,
  onManage,
}: {
  it: FeedbackItemDto
  canManage: boolean
  voting: boolean
  onVote: () => void
  onEdit: () => void
  onDelete: () => void
  onManage: () => void
}) {
  const { t } = useTranslation()
  const [dataSaver] = useDataSaver()
  return (
    <li className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4" data-testid="feedback-item">
      <div className="flex flex-col items-center shrink-0">
        <button
          type="button"
          onClick={onVote}
          disabled={voting}
          aria-pressed={it.votedByMe}
          aria-label={t('feedback.vote', { count: it.voteCount })}
          className={`w-12 rounded-lg border py-1 text-sm font-semibold ${it.votedByMe ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
        >
          +1
          <span className="block text-xs font-normal">{it.voteCount}</span>
        </button>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONE[it.kind]}>{t(`feedback.kind.${it.kind}`)}</Badge>
          <Badge tone={STATUS_TONE[it.status]}>{t(`feedback.status.${it.status}`)}</Badge>
          {it.status === 'DONE' && it.doneVersion && (
            <Link to="/whats-new" className="text-xs text-green-700 hover:underline">
              {t('feedback.done_in', { version: it.doneVersion })}
            </Link>
          )}
        </div>
        <h3 className="font-medium text-gray-900 break-words">{it.title}</h3>
        {it.body && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{it.body}</p>}
        {!!it.attachments?.length && <FeedImageGrid images={it.attachments} dataSaver={dataSaver} />}
        <p className="text-xs text-gray-400">
          {it.authorName}
          {it.isMine && ` (${t('feedback.me')})`} · {fmtDate(it.createdAt)}
          {it.pagePath && <> · {t('feedback.page')}: <span className="font-mono">{it.pagePath}</span></>}
          {it.appVersion && <> · {it.appVersion}</>}
        </p>
        {it.adminReply && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900">
            <span className="font-medium">{t('feedback.reply')}:</span> <span className="whitespace-pre-wrap">{it.adminReply}</span>
          </div>
        )}
        {(it.canEdit || canManage) && (
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            {canManage && <Button variant="ghost" className="text-sm" onClick={onManage}>{t('feedback.manage')}</Button>}
            {it.canEdit && <Button variant="ghost" className="text-sm" onClick={onEdit}>{t('camp.common.edit')}</Button>}
            {it.canEdit && <Button variant="ghost" className="text-sm !text-red-600" onClick={onDelete}>{t('feedback.delete')}</Button>}
          </div>
        )}
      </div>
    </li>
  )
}

function FeedbackForm({ item, pagePath, onClose }: { item: FeedbackItemDto | null; pagePath: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FeedbackKind>(item?.kind ?? 'IDEA')
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [attachments, setAttachments] = useState(item?.attachments ?? [])
  const [files, setFiles] = useState<File[]>([])
  const [createdItem, setCreatedItem] = useState<FeedbackItemDto | null>(null)
  const upload = useAppMutation(
    ({ id, selected }: { id: string; selected: File[] }) => feedbackApi.addAttachments(id, selected),
    [feedbackKeys.all],
    (result) => {
      setAttachments(result)
      setFiles([])
    },
  )
  const removeAttachment = useAppMutation(
    async (attId: string) => {
      await feedbackApi.removeAttachment(attId)
      return attId
    },
    [feedbackKeys.all],
    (attId) => setAttachments((current) => current.filter((attachment) => attachment.id !== attId)),
  )
  const saveText = useAppMutation(
    ({ id, dto }: { id: string; dto: { kind: FeedbackKind; title: string; body: string } }) =>
      feedbackApi.update(id, dto),
    [feedbackKeys.all],
    (result) => setCreatedItem(result),
  )
  const create = useAppMutation(
    (dto: { kind: FeedbackKind; title: string; body: string; pagePath: string | null }) => feedbackApi.create(dto),
    [feedbackKeys.all],
    (result) => setCreatedItem(result),
  )
  const dto = { kind, title: title.trim(), body: body.trim() }
  const busy = upload.isPending || removeAttachment.isPending || saveText.isPending || create.isPending
  const submit = () => {
    const saveAttachments = (id: string) => {
      if (files.length > 0) upload.mutate({ id, selected: files }, { onSuccess: onClose })
      else onClose()
    }

    if (item) {
      saveText.mutate({ id: item.id, dto }, { onSuccess: (result) => saveAttachments(result.id) })
    } else if (createdItem) {
      if (createdItem.title !== dto.title || createdItem.body !== dto.body || createdItem.kind !== dto.kind) {
        saveText.mutate({ id: createdItem.id, dto }, { onSuccess: (result) => saveAttachments(result.id) })
      } else {
        saveAttachments(createdItem.id)
      }
    } else {
      create.mutate({ ...dto, pagePath }, { onSuccess: (result) => saveAttachments(result.id) })
    }
  }
  const valid = title.trim().length > 0
  const error = create.error ?? saveText.error ?? upload.error ?? removeAttachment.error
  return (
    <Modal
      title={item ? t('feedback.edit_title') : t('feedback.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
          <Button disabled={!valid || !filesWithinAttachmentLimit(files) || busy} loading={busy} onClick={submit}>
            {item ? t('camp.common.save') : t('feedback.send')}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-1">
        <legend className="block text-xs font-medium text-gray-600">{t('feedback.kind')}</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_KINDS.map((k) => (
            <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${kind === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'}`}>
              <input type="radio" name="fb-kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
              {t(`feedback.kind.${k}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400">{t(`feedback.kind_hint.${kind}`)}</p>
      </fieldset>
      <Field label={t('feedback.f_title')}>
        {(id) => <input id={id} className={inputCls} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />}
      </Field>
      <Field label={t('feedback.f_body')} hint={t('feedback.f_body_hint')}>
        {(id) => <textarea id={id} className={`${inputCls} min-h-[120px]`} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      {!item && pagePath && (
        <p className="text-xs text-gray-500">
          {t('feedback.page')}: <span className="font-mono">{pagePath}</span>
        </p>
      )}
      <FeedbackAttachments
        attachments={attachments}
        files={files}
        disabled={busy}
        onFilesChange={setFiles}
        onRemove={(id) => removeAttachment.mutate(id)}
      />
      <ErrorBox error={error} />
    </Modal>
  )
}

function ManageForm({ item, onClose }: { item: FeedbackItemDto; onClose: () => void }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<FeedbackStatus>(item.status)
  const [reply, setReply] = useState(item.adminReply ?? '')
  const [version, setVersion] = useState(item.doneVersion ?? '')
  const save = useAppMutation(
    () => feedbackApi.setStatus(item.id, { status, adminReply: reply.trim() || null, doneVersion: status === 'DONE' ? version.trim() : null }),
    [feedbackKeys.all],
    onClose,
  )
  const versionError = status === 'DONE' && !isVersion(version) ? t('feedback.version_required') : null
  return (
    <Modal
      title={t('feedback.manage')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
          <Button disabled={!!versionError} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('camp.common.save')}</Button>
        </>
      }
    >
      <p className="text-sm font-medium text-gray-900 break-words">{item.title}</p>
      <Field label={t('camp.common.status')}>
        {(id) => (
          <select id={id} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`feedback.status.${s}`)}</option>
            ))}
          </select>
        )}
      </Field>
      {status === 'DONE' && (
        <Field label={t('feedback.f_version')} hint={t('feedback.f_version_hint')} error={version ? versionError : null}>
          {(id) => <input id={id} className={inputCls} placeholder="v0.2.3" value={version} onChange={(e) => setVersion(e.target.value)} />}
        </Field>
      )}
      <Field label={t('feedback.reply')}>
        {(id) => <textarea id={id} className={`${inputCls} min-h-[100px]`} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} />}
      </Field>
      <ErrorBox error={save.error} />
    </Modal>
  )
}
