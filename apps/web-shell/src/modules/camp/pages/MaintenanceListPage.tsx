import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { campApi, type MaintenanceQuery } from '../api/camp-api'
import type { MaintenancePriority, MaintenanceStatus } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { MAINT_STATUS_LABEL, PRIORITY_LABEL } from '../lib/labels'
import { STATUS_TONE } from '../lib/maintenance'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'
import { useTranslation } from 'react-i18next'

const PRIORITY_TONE: Record<MaintenancePriority, 'gray' | 'blue' | 'yellow' | 'red'> = { LOW: 'gray', MEDIUM: 'blue', HIGH: 'yellow', URGENT: 'red' }

/**
 * /camp/:campId/maintenance — засварын хүсэлтүүд. `?roomId=` (өрөөний самбар/байр-өрөөнөөс) шүүнэ;
 * `?new=1&assetId=|roomId=` (хөрөнгийн дэлгэрэнгүйгээс) үүсгэх цонхыг урьдчилан бөглөж нээнэ.
 */
export default function MaintenanceListPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const perms = useCampPermissions(campId)
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const [filter, setFilter] = useState<MaintenanceQuery>({ roomId: params.get('roomId') ?? undefined })
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<{ assetId?: string; roomId?: string } | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating({ assetId: params.get('assetId') ?? undefined, roomId: params.get('roomId') ?? undefined })
      const next = new URLSearchParams(params)
      next.delete('new')
      next.delete('assetId')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const q: MaintenanceQuery = { ...filter, q: search.trim() || undefined, limit: 50 }
  const list = useInfiniteQuery({
    queryKey: [...campKeys.maintenance(campId), q],
    queryFn: ({ pageParam }) => campApi.maintenanceList(campId, { ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const setF = (k: keyof MaintenanceQuery, v: string) => setFilter((f) => ({ ...f, [k]: v || undefined }))

  return (
    <Card
      title={t('camp.section.maintenance')}
      actions={
        perms.can(P.MAINTENANCE_CREATE) && (
          <Button size="sm" onClick={() => setCreating({ roomId: filter.roomId })}>
            {t('camp.maint.add')}
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label={t('camp.maint.search')} className={`${inputSmCls} w-56 max-w-full`} placeholder={t('camp.maint.search_ph')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('camp.filter.status')} className={`${inputSmCls} w-auto`} value={filter.status ?? ''} onChange={(e) => setF('status', e.target.value)}>
          <option value="">{t('camp.filter.all_statuses')}</option>
          {(Object.keys(MAINT_STATUS_LABEL) as MaintenanceStatus[]).map((s) => (
            <option key={s} value={s}>
              {MAINT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.maint.filter_priority')} className={`${inputSmCls} w-auto`} value={filter.priority ?? ''} onChange={(e) => setF('priority', e.target.value)}>
          <option value="">{t('camp.maint.all_priorities')}</option>
          {(Object.keys(PRIORITY_LABEL) as MaintenancePriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.maint.filter_room')} className={`${inputSmCls} w-auto`} value={filter.roomId ?? ''} onChange={(e) => setF('roomId', e.target.value)}>
          <option value="">{t('camp.maint.all_rooms')}</option>
          {rooms.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.building.code}-{r.roomNo}
            </option>
          ))}
        </select>
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>{t('camp.maint.empty')}</Empty>}
      {rows.length > 0 && (
        <Table head={[t('camp.maint.no'), t('camp.maint.title_col'), t('camp.maint.room_asset'), t('camp.maint.priority'), t('camp.common.status'), t('camp.maint.created')]}>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className={`${td} font-mono whitespace-nowrap`}>
                <Link to={m.id} className="text-blue-600 hover:underline">
                  {m.requestNo}
                </Link>
              </td>
              <td className={td}>
                {m.title}
                {m.blocksRoom && m.room && <span className="ml-1 text-xs text-yellow-700">· {t('camp.maint.locks_room')}</span>}
              </td>
              <td className={td}>
                {m.room ? `${m.room.building.code}-${m.room.roomNo}` : '—'}
                {m.asset && <span className="text-gray-500"> · {m.asset.inventoryNo}</span>}
              </td>
              <td className={td}>
                <Badge tone={PRIORITY_TONE[m.priority]}>{PRIORITY_LABEL[m.priority]}</Badge>
              </td>
              <td className={td}>
                <Badge tone={STATUS_TONE[m.status]}>{MAINT_STATUS_LABEL[m.status]}</Badge>
              </td>
              <td className={`${td} text-gray-500 whitespace-nowrap`}>{m.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
        </Table>
      )}
      {list.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            {t('camp.common.load_more')}
          </Button>
        </div>
      )}
      {creating && <CreateMaintenanceModal campId={campId} preset={creating} onClose={() => setCreating(null)} />}
    </Card>
  )
}

function CreateMaintenanceModal({ campId, preset, onClose }: { campId: string; preset: { assetId?: string; roomId?: string }; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rooms = useQuery({ queryKey: campKeys.rooms(campId), queryFn: () => campApi.rooms(campId) })
  const asset = useQuery({ queryKey: [...campKeys.assets(campId), 'detail', preset.assetId], queryFn: () => campApi.asset(campId, preset.assetId!), enabled: !!preset.assetId })
  const [roomId, setRoomId] = useState(preset.roomId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<MaintenancePriority>('MEDIUM')
  const [blocksRoom, setBlocksRoom] = useState(false)
  const [warnings, setWarnings] = useState<{ id: string; list: string[] } | null>(null)
  // зөвхөн хөрөнгө өгвөл backend түүний одоогийн өрөөг авна
  const effectiveRoom = roomId || asset.data?.roomId || ''
  const m = useCampMutation(
    () =>
      campApi.createMaintenance(campId, {
        ...(roomId ? { roomId } : {}),
        ...(preset.assetId ? { assetId: preset.assetId } : {}),
        title: title.trim(),
        description: description.trim() || null,
        priority,
        blocksRoom,
      }),
    [campKeys.maintenance(campId), campKeys.rooms(campId), campKeys.roomBoard(campId), campKeys.assets(campId)],
    (res) => {
      if (res.warnings && res.warnings.length > 0) setWarnings({ id: res.id, list: res.warnings })
      else navigate(res.id)
    },
  )

  if (warnings) {
    return (
      <Modal
        title={t('camp.maint.created_title')}
        onClose={() => navigate(warnings.id)}
        footer={<Button onClick={() => navigate(warnings.id)}>{t('camp.maint.continue')}</Button>}
      >
        <div role="alert" className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-3 py-2 space-y-1">
          {warnings.list.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={t('camp.asset.repair_request')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!title.trim() || (!roomId && !preset.assetId) || (blocksRoom && !effectiveRoom)}>
            {t('camp.maint.create')}
          </Button>
        </>
      }
    >
      {preset.assetId && (
        <div className="text-sm bg-gray-50 rounded-lg px-3 py-2">
          {t('camp.asset.asset')}: {asset.data ? `${asset.data.inventoryNo} · ${asset.data.name} (${asset.data.room ? `${asset.data.room.building.code}-${asset.data.room.roomNo}` : t('camp.asset.warehouse')})` : '…'}
        </div>
      )}
      <Field label={t('camp.facilities.room')} hint={preset.assetId ? t('camp.maint.asset_room_hint') : undefined}>
        {(id) => (
          <select id={id} className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{preset.assetId ? t('camp.maint.asset_room') : t('camp.common.choose')}</option>
            {rooms.data
              ?.filter((r) => r.status !== 'INACTIVE' || r.id === roomId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.building.code}-{r.roomNo}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label={t('camp.maint.title_col')}>{(id) => <input id={id} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
      <Field label={t('camp.roles.description')}>{(id) => <textarea id={id} rows={3} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}</Field>
      <Field label={t('camp.maint.priority')}>
        {(id) => (
          <select id={id} className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as MaintenancePriority)}>
            {(Object.keys(PRIORITY_LABEL) as MaintenancePriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={blocksRoom} onChange={(e) => setBlocksRoom(e.target.checked)} />
        <span>
          {t('camp.maint.block_room')}
          <span className="block text-xs text-gray-500">{t('camp.maint.block_room_hint')}</span>
        </span>
      </label>
      {blocksRoom && !effectiveRoom && <p className="text-xs text-red-600">{t('camp.maint.block_needs_room')}</p>}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
