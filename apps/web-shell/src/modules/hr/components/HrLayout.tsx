import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../../camp/api/camp-api'
import { campKeys } from '../../camp/hooks/useCampPermissions'
import { useAuth } from '../../../hooks/useAuth'
import { setLastCamp } from '../../camp/lib/last-camp'
import { Badge, ErrorBox, Loading, inputSmCls } from '../../camp/components/ui'
import { HR_SECTIONS, hrPath, sectionFromPath } from '../lib/hr-sections'
import PageSuspense from '../../../components/PageSuspense'

/**
 * v0.2.2 H2 — «Хүний нөөц»: «үндсэн ажлын байр» сонгогч + хэсгүүд.
 * Ажлын байрны жагсаалт = кемпүүд (v0.3-т site ерөнхий болно). Сүүлийн сонголт Кемптэй нэг (`last-camp`).
 */
export default function HrLayout() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const site = useQuery({ queryKey: campKeys.camp(campId), queryFn: () => campApi.camp(campId), enabled: !!campId })
  const sites = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })

  useEffect(() => {
    if (site.data) setLastCamp(user?.id, site.data.id)
  }, [site.data, user?.id])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
        <span className="font-medium text-gray-700">{t('hr.title')}</span>
        <span>/</span>
        <span>{t('hr.layout.site')}:</span>
        {site.data ? (
          <>
            {sites.data && sites.data.length > 1 ? (
              <select
                aria-label={t('hr.layout.switch_site')}
                className={`${inputSmCls} w-auto font-medium text-gray-900`}
                value={site.data.id}
                onChange={(e) => navigate(hrPath(e.target.value, sectionFromPath(pathname)))}
              >
                {sites.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                    {c.isActive ? '' : ` (${t('camp.common.inactive')})`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-gray-900 font-medium">
                {site.data.code} · {site.data.name}
              </span>
            )}
            {!site.data.isActive && <Badge>{t('camp.common.inactive')}</Badge>}
            <Link to={`/camp/${site.data.id}`} className="ml-auto text-xs hover:text-blue-600">
              {t('hr.layout.to_camp')}
            </Link>
          </>
        ) : (
          <span>…</span>
        )}
      </div>
      {site.isLoading && <Loading />}
      {site.isError && <ErrorBox error={site.error} onRetry={() => site.refetch()} />}
      {site.data && (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-5" aria-label={t('hr.layout.sections')}>
            {HR_SECTIONS.map((s) => (
              <NavLink
                key={s}
                to={s}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                    isActive ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {t(`hr.section.${s}`)}
              </NavLink>
            ))}
          </nav>
          <PageSuspense><Outlet /></PageSuspense>
        </>
      )}
    </div>
  )
}
