import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../../camp/api/camp-api'
import { campKeys } from '../../camp/hooks/useCampPermissions'
import { useAuth } from '../../../hooks/useAuth'
import { getLastCamp, resolveLastCamp } from '../../camp/lib/last-camp'
import { ActiveBadge, Card, Empty, ErrorBox, Loading, PageHeader } from '../../camp/components/ui'
import { HR_DEFAULT_SECTION, type HrSection, hrPath } from '../lib/hr-sections'

/**
 * /hr — v0.2.2 H2: сүүлийн (эсвэл ганц идэвхтэй) ажлын байр руу шууд; бусад үед жагсаалтаас сонгоно.
 * `/hr/positions` → `section="positions"` (хуучин «Системийн тохиргоо › Албан тушаал»-ын шинэ хаяг).
 */
export default function HrHomePage({ section = HR_DEFAULT_SECTION }: { section?: HrSection }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const sites = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })

  if (sites.isLoading) return <Loading />
  if (sites.isError) {
    const status = (sites.error as { response?: { status?: number } })?.response?.status
    if (status === 403) {
      return (
        <div>
          <PageHeader title={t('hr.title')} />
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">{t('hr.home.no_access')}</div>
        </div>
      )
    }
    return <ErrorBox error={sites.error} onRetry={() => sites.refetch()} />
  }

  const list = sites.data ?? []
  const last = resolveLastCamp(getLastCamp(user?.id), list)
  if (last) return <Navigate to={hrPath(last, section)} replace />
  const active = list.filter((c) => c.isActive)
  if (active.length === 1) return <Navigate to={hrPath(active[0].id, section)} replace />

  return (
    <div className="space-y-6">
      <PageHeader title={t('hr.title')} subtitle={t('hr.home.subtitle')} />
      {list.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link
              key={c.id}
              to={hrPath(c.id, section)}
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
          <Empty>{t('hr.home.empty')}</Empty>
        </Card>
      )}
    </div>
  )
}
