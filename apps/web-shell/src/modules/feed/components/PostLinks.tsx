import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, ErrorBox, Field, Modal, inputCls } from '../../../core/ui'
import { permissionApi } from '../../../core/permission-api'
import { campApi, feedbackApi, FEEDBACK_KINDS, tenantModulesApi, tenantModulesQueryKey, type FeedbackKind } from '../module-links.bridge'
import { campKeys } from '../../../core/useAppPermissions'
import type { FeedPostDto } from '../types'
import { feedKeys } from '../api'

const MAINTENANCE = 'CAMP_MAINTENANCE'
const FEEDBACK = 'CORE_FEEDBACK'
const MAINT_CREATE = 'camp.maintenance.create'

/** v0.2.4 FEED-03/05 — пост дээрх холбоосын төлөв (зөвхөн төлөв + дугаар; линк — объектын эрхтэй хүнд) */
export function PostLinkChips({ post }: { post: FeedPostDto }) {
  const { t } = useTranslation()
  if (!post.links?.length) return null
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {post.links.map((l) => {
        const body = (
          <>
            <span className="text-gray-600">{t(l.labelKey)}{l.ref && ` ${l.ref}`}:</span>{' '}
            <Badge tone={l.closed ? 'green' : 'blue'}>{l.closed && '✓ '}{t(l.statusKey)}</Badge>
          </>
        )
        return l.link ? (
          <Link key={l.objectType} to={l.link} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs hover:border-blue-300">{body}</Link>
        ) : (
          <span key={l.objectType} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs">{body}</span>
        )
      })}
    </div>
  )
}

/** Постын цэсний үйлдлүүд — эрх ба модулиар; ижил төрлийн холбоос аль хэдийн байвал нуух */
export function usePostLinkActions(post: FeedPostDto) {
  const access = useQuery({ queryKey: campKeys.myPerms(), queryFn: () => permissionApi.myPermissions(), staleTime: 60_000 }).data
  const modules = useQuery({ queryKey: tenantModulesQueryKey, queryFn: tenantModulesApi.getMine, staleTime: 60_000 }).data ?? []
  const has = (type: string) => post.links?.some((l) => l.objectType === type)
  const maintenanceCamps = useMemo(() => {
    if (!access) return null
    if (access.isTenantAdmin || access.permissions.includes(MAINT_CREATE)) return 'all' as const
    return Object.entries(access.byCamp).filter(([, codes]) => codes.includes(MAINT_CREATE)).map(([id]) => id)
  }, [access])
  return {
    canMaintenance: modules.includes('camp') && !has(MAINTENANCE) && (maintenanceCamps === 'all' || (maintenanceCamps?.length ?? 0) > 0),
    maintenanceCamps,
    canFeedback: !has(FEEDBACK),
  }
}

const firstLine = (body: string) => body.split('\n').map((x) => x.trim()).find(Boolean)?.slice(0, 200) ?? ''

export function MaintenanceFromPostDialog({ post, camps: allowed, onClose, onDone }: { post: FeedPostDto; camps: 'all' | string[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [campId, setCampId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [title, setTitle] = useState(firstLine(post.body))
  const [description, setDescription] = useState(post.body.slice(0, 2000))
  const camps = useQuery({ queryKey: ['camp', 'camps', 'active'], queryFn: () => campApi.camps(true) })
  const rooms = useQuery({ queryKey: ['camp', 'rooms', campId], queryFn: () => campApi.rooms(campId), enabled: !!campId })
  const list = (camps.data ?? []).filter((c) => allowed === 'all' || allowed.includes(c.id))
  const create = useMutation({
    mutationFn: () => campApi.createMaintenanceFromPost(campId, post.id, { roomId, title: title.trim(), description: description.trim() || null }),
    onSuccess: onDone,
  })
  return (
    <Modal
      title={t('feed.link.to_maintenance')}
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('feed.link.dialog.cancel')}</Button>
        <Button disabled={!campId || !roomId || !title.trim()} loading={create.isPending} onClick={() => create.mutate()}>{t('feed.link.dialog.create')}</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label={t('feed.link.dialog.camp')}>
          {(id) => (
            <select id={id} className={inputCls} value={campId} onChange={(e) => { setCampId(e.target.value); setRoomId('') }}>
              <option value="">—</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('feed.link.dialog.room')}>
          {(id) => (
            <select id={id} className={inputCls} value={roomId} disabled={!campId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">—</option>
              {rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.building.code}-{r.roomNo}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('feed.link.dialog.title')}>{(id) => <input id={id} className={inputCls} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label={t('feed.link.dialog.description')}>{(id) => <textarea id={id} className={inputCls} rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        {(camps.error || rooms.error || create.error) && <ErrorBox error={camps.error ?? rooms.error ?? create.error} />}
      </div>
    </Modal>
  )
}

export function FeedbackFromPostDialog({ post, onClose, onDone }: { post: FeedPostDto; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FeedbackKind>('REQUEST')
  const [title, setTitle] = useState(firstLine(post.body))
  const create = useMutation({
    mutationFn: () => feedbackApi.createFromPost(post.id, { kind, title: title.trim(), body: post.body.slice(0, 5000), pagePath: `/feed/${post.id}` }),
    onSuccess: onDone,
  })
  return (
    <Modal
      title={t('feed.link.to_feedback')}
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('feed.link.dialog.cancel')}</Button>
        <Button disabled={!title.trim()} loading={create.isPending} onClick={() => create.mutate()}>{t('feed.link.dialog.create')}</Button>
      </>}
    >
      <div className="space-y-3">
        <Field label={t('feed.link.dialog.kind')}>
          {(id) => (
            <select id={id} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
              {FEEDBACK_KINDS.map((k) => <option key={k} value={k}>{t(`feedback.kind.${k}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('feed.link.dialog.title')}>{(id) => <input id={id} className={inputCls} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        {create.error && <ErrorBox error={create.error} />}
      </div>
    </Modal>
  )
}

/** Холбоос үүсгэсний дараа постуудыг дахин ачаалах */
export function useRefreshFeed() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: feedKeys.all })
}
