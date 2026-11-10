import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, inputSmCls, td } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { debugApi, formatBytes, type DebugHealthCheck } from './core-bridge'

const TABS = ['system', 'health', 'permissions', 'logs', 'audit', 'i18n', 'outbox'] as const
type Tab = (typeof TABS)[number]
export const debugMeKey = ['core', 'debug', 'me'] as const

/**
 * v0.2.4 Блок 10 (DBG-01, D-1) — Debug цэс. Хаалт: deploy `DEBUG_MENU_ENABLED` + `core.debug.view` (backend 404).
 * Унтаа модулиуд → `/debug/modules`. Нууц утга API-аас ирэхгүй (зөвхөн «тохируулсан эсэх»).
 */
export default function DebugPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tab: raw } = useParams()
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'system'
  const me = useQuery({ queryKey: debugMeKey, queryFn: debugApi.me, retry: false })
  if (me.isLoading) return <Loading />
  if (me.isError) return <ErrorBox error={me.error} />

  return (
    <div className="space-y-4">
      <PageHeader title={t('debug.title')} subtitle={t('debug.subtitle')} actions={<Link className="text-sm text-blue-600 hover:underline" to="/debug/modules">{t('debug.modules')}</Link>} />
      <div className="flex flex-wrap gap-1">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => navigate(`/debug/${k}`)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t(`debug.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'system' && <SystemTab canManage={!!me.data?.canManage} />}
      {tab === 'health' && <HealthTab />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'i18n' && <I18nTab />}
      {tab === 'outbox' && <OutboxTab canManage={!!me.data?.canManage} />}
    </div>
  )
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex gap-3 border-b border-gray-50 py-1.5 text-sm"><span className="w-40 flex-none text-gray-500">{k}</span><span className="min-w-0 break-all font-mono text-xs text-gray-800">{v}</span></div>
)

function SystemTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['core', 'debug', 'system'], queryFn: debugApi.system })
  const clear = useMutation({ mutationFn: debugApi.clearCaches })
  const locale = INTL_LOCALE[currentLang()]
  if (q.isLoading) return <Loading />
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  const s = q.data
  return (
    <div className="space-y-4">
      <Card title={t('debug.system.title')} actions={canManage && <Button size="sm" variant="secondary" loading={clear.isPending} onClick={() => window.confirm(t('debug.cache_confirm')) && clear.mutate()}>{t('debug.cache_clear')}</Button>}>
        {clear.isSuccess && <p className="mb-2 text-xs text-green-700">{t('debug.done')}</p>}
        {clear.isError && <ErrorBox error={clear.error} />}
        <Row k={t('debug.system.version')} v={`v${s.version}${s.commit ? ` (${s.commit.slice(0, 10)})` : ''}`} />
        <Row k={t('debug.system.build')} v={s.buildDate ?? '—'} />
        <Row k={t('debug.system.started')} v={`${new Date(s.startedAt).toLocaleString(locale)} · ${Math.round(s.uptimeSec / 60)} min`} />
        <Row k="Node / Nest" v={`${s.node} / ${s.nest ?? '—'} · ${s.platform} · pid ${s.pid}`} />
        <Row k={t('debug.system.memory')} v={`RSS ${s.memoryMb.rss} MB · heap ${s.memoryMb.heapUsed} MB`} />
        <Row k={t('debug.system.env')} v={s.environment} />
        <Row k={t('debug.system.tenant')} v={s.tenant ? `${s.tenant.name} (${s.tenant.slug})` : '—'} />
      </Card>
      <Card title={t('debug.system.config')}>
        <Table head={[t('debug.system.key'), t('debug.system.value')]}>
          {s.config.map((c) => (
            <tr key={c.key} className="border-t border-gray-100">
              <td className={`${td} font-mono text-xs`}>{c.key}</td>
              <td className={`${td} font-mono text-xs`}>{!c.set ? <span className="text-gray-400">{t('debug.system.unset')}</span> : c.secret ? <Badge tone="gray">{t('debug.system.secret_set')}</Badge> : c.value}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}

function Check({ name, c, extra }: { name: string; c: DebugHealthCheck; extra?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-50 py-2 text-sm">
      <span className="w-32 font-medium">{name}</span>
      <Badge tone={c.ok ? 'green' : 'red'}>{c.ok ? t('debug.health.ok') : t('debug.health.fail')}</Badge>
      {c.ms !== undefined && <span className="text-xs text-gray-500">{c.ms} ms</span>}
      {c.error && <span className="text-xs text-red-600">{c.error}</span>}
      {extra}
    </div>
  )
}

function HealthTab() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['core', 'debug', 'health'], queryFn: debugApi.health, refetchInterval: 30_000 })
  const locale = INTL_LOCALE[currentLang()]
  if (q.isLoading) return <Loading />
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  const h = q.data
  const kv = (o?: Record<string, number>) => (o && Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—')
  return (
    <div className="space-y-4">
      <Card title={t('debug.health.title')}>
        <Check name="PostgreSQL" c={h.db} extra={<span className="text-xs text-gray-500">{h.db.sizeBytes !== undefined && formatBytes(h.db.sizeBytes, locale)} · {t('debug.health.migration')}: {h.db.lastMigration ?? '—'}</span>} />
        <Check name="Redis" c={h.redis} />
        <Check name="GoTrue" c={h.gotrue} />
        <Check name="SMTP" c={{ ok: h.smtp.configured, error: h.smtp.configured ? null : t('debug.health.smtp_off') }} />
        <Check
          name={t('debug.health.storage')}
          c={{ ok: h.storage.ok, error: h.storage.error }}
          extra={h.storage.ok && <span className="text-xs text-gray-500">{h.storage.files} · {formatBytes(h.storage.bytes ?? 0, locale)} · {t('debug.health.free')} {formatBytes(h.storage.diskFreeBytes ?? 0, locale)} / {formatBytes(h.storage.diskTotalBytes ?? 0, locale)}</span>}
        />
      </Card>
      <Card title={t('debug.health.queues')}>
        {h.queues.error ? <ErrorBox error={h.queues.error} /> : (
          <>
            <Row k="Outbox" v={kv(h.queues.outbox)} />
            <Row k={t('debug.health.mail_queue')} v={kv(h.queues.notificationEmail)} />
          </>
        )}
      </Card>
      <Card title={t('debug.health.cron')}>
        <Table head={[
          t('debug.health.job'),
          t('debug.health.last'),
          t('debug.health.next'),
          t('debug.health.cron_status'),
          t('debug.health.cron_result'),
        ]}>
          {h.cron.map((c) => (
            <tr key={c.name} className="border-t border-gray-100">
              <td className={`${td} font-mono text-xs`}>{c.name}</td>
              <td className={td}>{c.lastRun ? new Date(c.lastRun).toLocaleString(locale) : '—'}</td>
              <td className={td}>{c.nextRun ? new Date(c.nextRun).toLocaleString(locale) : '—'}</td>
              <td className={td}>{c.lastStatus ? t(`debug.health.cron_status.${c.lastStatus.toLowerCase()}`) : '—'}</td>
              <td className={`${td} max-w-xs truncate text-xs`} title={c.lastError ?? (JSON.stringify(c.lastResult) || '')}>
                {c.lastError ?? (JSON.stringify(c.lastResult) || '—')}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}

function PermissionsTab() {
  const { t } = useTranslation()
  const [userId, setUserId] = useState('')
  const users = useQuery({ queryKey: ['core', 'debug', 'users'], queryFn: debugApi.users })
  const q = useQuery({ queryKey: ['core', 'debug', 'perms', userId], queryFn: () => debugApi.permissions(userId), enabled: !!userId })
  return (
    <Card title={t('debug.perms.title')}>
      <select aria-label={t('debug.perms.user')} className={`${inputSmCls} mb-3 w-full sm:w-96`} value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">{t('debug.perms.user')}</option>
        {users.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName ?? u.email} · {u.role}{u.isActive ? '' : ` · ${t('debug.perms.inactive')}`}</option>)}
      </select>
      {q.isLoading && userId && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {q.data && (
        <>
          <p className="mb-2 text-sm">
            {q.data.user.role}
            {q.data.isTenantAdmin && <> · <Badge tone="blue">{t('debug.perms.tenant_admin')}</Badge></>}
            {q.data.debugView && <> · <Badge tone="yellow">Debug</Badge></>}
          </p>
          {q.data.items.length === 0 ? <Empty>{t('debug.perms.none')}</Empty> : (
            <Table head={[t('debug.perms.code'), t('debug.perms.scope'), t('debug.perms.source')]}>
              {q.data.items.map((p, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className={td}>{t(`perm.${p.code}`, { defaultValue: p.code })} <span className="font-mono text-[11px] text-gray-400">{p.code}</span></td>
                  <td className={td}>{p.scope === 'TENANT' ? t('debug.perms.tenant') : p.siteName}</td>
                  <td className={td}>{p.source}{p.roleName && ` · ${p.roleName}`}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Card>
  )
}

function LogsTab() {
  const { t } = useTranslation()
  const [level, setLevel] = useState<'' | 'error' | 'warn'>('error')
  const q = useQuery({ queryKey: ['core', 'debug', 'logs', level], queryFn: () => debugApi.logs(level || undefined), refetchInterval: 15_000 })
  const locale = INTL_LOCALE[currentLang()]
  return (
    <Card title={t('debug.logs.title')} actions={
      <select aria-label={t('debug.logs.level')} className={inputSmCls} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
        <option value="">{t('debug.logs.all')}</option><option value="error">error</option><option value="warn">warn</option>
      </select>
    }>
      <p className="mb-2 text-xs text-gray-500">{t('debug.logs.hint')}</p>
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {q.data && q.data.items.length === 0 && <Empty>{t('debug.logs.empty')}</Empty>}
      <ul className="space-y-2">
        {q.data?.items.map((e, i) => (
          <li key={i} className="rounded-lg bg-gray-50 p-2">
            <div className="flex gap-2 text-xs"><Badge tone={e.level === 'error' ? 'red' : 'yellow'}>{e.level}</Badge><span className="text-gray-500">{new Date(e.at).toLocaleString(locale)}</span>{e.context && <span className="font-mono text-gray-600">{e.context}</span>}</div>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-gray-800">{e.message}</pre>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AuditTab() {
  const { t } = useTranslation()
  const [entityType, setEntityType] = useState('')
  const q = useQuery({ queryKey: ['core', 'debug', 'audit', entityType], queryFn: () => debugApi.audit({ entityType: entityType || undefined, limit: 200 }) })
  const locale = INTL_LOCALE[currentLang()]
  return (
    <Card title={t('debug.audit.title')} actions={<input aria-label={t('debug.audit.entity')} placeholder={t('debug.audit.entity')} className={inputSmCls} value={entityType} onChange={(e) => setEntityType(e.target.value.trim().toLowerCase())} />}>
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {q.data && q.data.items.length === 0 && <Empty>{t('debug.audit.empty')}</Empty>}
      {q.data && q.data.items.length > 0 && (
        <Table head={[t('debug.audit.at'), t('debug.audit.actor'), t('debug.audit.what')]}>
          {q.data.items.map((r) => (
            <tr key={r.id} className="border-t border-gray-100">
              <td className={`${td} whitespace-nowrap text-xs`}>{new Date(r.at).toLocaleString(locale)}</td>
              <td className={td}>{r.actorName ?? '—'}</td>
              <td className={td}>{t(r.summaryKey, { ...(r.summaryParams as Record<string, string>), defaultValue: `${r.entityType} ${r.action}` })}<span className="ml-2 font-mono text-[11px] text-gray-400">{r.entityType}/{r.action}</span></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function I18nTab() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['core', 'debug', 'i18n'], queryFn: debugApi.i18nMissing })
  if (q.isLoading) return <Loading />
  if (q.isError || !q.data) return <ErrorBox error={q.error} />
  return (
    <Card title={t('debug.i18n.title', { n: q.data.items.length, total: q.data.total })} actions={<Link className="text-sm text-blue-600 hover:underline" to="/settings/translations">{t('debug.i18n.edit')}</Link>}>
      {q.data.items.length === 0 ? <Empty>{t('debug.i18n.none')}</Empty> : (
        <Table head={[t('debug.i18n.key'), t('debug.i18n.missing')]}>
          {q.data.items.slice(0, 500).map((x) => (
            <tr key={x.key} className="border-t border-gray-100"><td className={`${td} font-mono text-xs`}>{x.key}</td><td className={td}>{x.missing.join(', ')}</td></tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function OutboxTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['core', 'debug', 'outbox'], queryFn: debugApi.outbox })
  const retry = useMutation({ mutationFn: debugApi.retryOutbox, onSuccess: () => qc.invalidateQueries({ queryKey: ['core', 'debug', 'outbox'] }) })
  const locale = INTL_LOCALE[currentLang()]
  return (
    <Card title={t('debug.outbox.title')}>
      {q.isLoading && <Loading />}
      {(q.error || retry.error) && <ErrorBox error={q.error ?? retry.error} />}
      {q.data && q.data.items.length === 0 && <Empty>{t('debug.outbox.empty')}</Empty>}
      {q.data && q.data.items.length > 0 && (
        <Table head={[t('debug.outbox.event'), t('debug.outbox.status'), t('debug.outbox.error'), '']}>
          {q.data.items.map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className={td}><span className="font-mono text-xs">{e.eventType}</span><div className="text-[11px] text-gray-400">{e.aggregateType} · {new Date(e.createdAt).toLocaleString(locale)}</div></td>
              <td className={td}><Badge tone="red">{e.status}</Badge> <span className="text-xs text-gray-500">×{e.retryCount}</span></td>
              <td className={`${td} max-w-xs break-all text-xs text-red-700`}>{e.lastError ?? '—'}</td>
              <td className={td}>{canManage && <Button size="sm" variant="secondary" loading={retry.isPending && retry.variables === e.id} onClick={() => retry.mutate(e.id)}>{t('debug.outbox.retry')}</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}
