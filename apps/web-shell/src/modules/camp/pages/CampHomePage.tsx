import { useState } from 'react'
import { accessibleSites, canManageCampSystem } from '../../../lib/access'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { useAuth } from '../../../hooks/useAuth'
import { getLastCamp, resolveLastCamp } from '../lib/last-camp'
import { P } from '../../../core/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, inputCls } from '../../../core/ui'

/**
 * /camp — FB-11 (v0.2.0): сүүлд орсон кемп рүү шууд (идэвхтэй, эрхтэй бол). `?list=1` эсвэл сүүлийнх алга → жагсаалт.
 * Кемпийн тохиргоо (/camp/system); байгууллагын түвшний (роль, эрх, байгууллага, орчуулга) → «Системийн тохиргоо» (/settings).
 */
export default function CampHomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const perms = useAppPermissions()
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })
  const [creating, setCreating] = useState(false)

  if (camps.isLoading || perms.isLoading) return <Loading />
  if (camps.isError) {
    const status = (camps.error as { response?: { status?: number } })?.response?.status
    if (status === 403) {
      return (
        <div>
          <PageHeader title={t('camp.home.title')} />
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">{t('camp.home.no_access')}</div>
        </div>
      )
    }
    return <ErrorBox error={camps.error} onRetry={() => camps.refetch()} />
  }

  // v0.2.3 Блок 3 (PIL-19): зөвхөн хандах эрхтэй кемп
  const list = accessibleSites(perms.data, camps.data ?? [])
  const last = params.get('list') ? null : resolveLastCamp(getLastCamp(user?.id), list)
  if (last) return <Navigate to={`/camp/${last}`} replace />
  // Ганц идэвхтэй кемп → шууд (сонгох алхамгүй)
  const active = list.filter((c) => c.isActive)
  if (!params.get('list') && active.length === 1) return <Navigate to={`/camp/${active[0].id}`} replace />

  const canMaster = perms.can(P.MASTER_MANAGE)
  const canSystem = canManageCampSystem(perms.data)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('camp.home.title')}
        subtitle={t('camp.home.subtitle')}
        actions={
          <>
            {canSystem && (
              <Link to="/camp/system" className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                {t('camp.system.title')}
              </Link>
            )}
            {canMaster && <Button onClick={() => setCreating(true)}>{t('camp.home.add_camp')}</Button>}
          </>
        }
      />

      {list.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link
              key={c.id}
              to={`/camp/${c.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{c.code}</span>
                <ActiveBadge active={c.isActive} />
              </div>
              <div className="mt-1 font-semibold text-gray-900">{c.name}</div>
              {c.location && <div className="text-sm text-gray-500 mt-0.5">{c.location}</div>}
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <Empty>
            {t('camp.home.empty')}
            {canMaster && ` ${t('camp.home.empty_hint')}`}
          </Empty>
        </Card>
      )}

      {creating && <CreateCampModal onClose={() => setCreating(false)} />}
    </div>
  )
}

export function CreateCampModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const m = useAppMutation(
    () => campApi.createCamp({ code: code.trim(), name: name.trim(), location: location.trim() || null }),
    [campKeys.camps],
    onClose,
  )
  return (
    <Modal
      title={t('camp.home.add_camp_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!code.trim() || !name.trim()}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.common.code')} hint={t('camp.home.code_hint')}>
        {(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} />}
      </Field>
      <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
      <Field label={t('camp.common.location')}>
        {(id) => <input id={id} className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />}
      </Field>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
