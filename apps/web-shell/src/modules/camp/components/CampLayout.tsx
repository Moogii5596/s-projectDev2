import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import { campKeys } from '../hooks/useCampPermissions'
import { useAuth } from '../../../hooks/useAuth'
import { setLastCamp } from '../lib/last-camp'
import { Badge, ErrorBox, Loading, inputSmCls } from './ui'

/**
 * Кемп тус бүрийн хэсгүүд: өдөр тутмын ажиллагаа эхэнд, тохиргоо сүүлд.
 * FB-05 (v0.2.0): Байр/Хэлтэс/Ростер нь "Тохиргоо" каталог руу шилжсэн (settings/:section).
 * v0.2.2 H2: зөвхөн кемпийнх (өрөө, хоол, засвар, хөрөнгө, тохиргоо); ажилтан/ирц/ээлж → «Хүний нөөц».
 */
export const CAMP_SECTIONS = ['rooms', 'meals', 'maintenance', 'assets', 'settings'] as const
export const CAMP_DEFAULT_SECTION = 'rooms'

export default function CampLayout() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const camp = useQuery({ queryKey: campKeys.camp(campId), queryFn: () => campApi.camp(campId), enabled: !!campId })
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })

  // FB-11: сүүлд орсон кемп (амжилттай ачаалсны дараа)
  useEffect(() => {
    if (camp.data) setLastCamp(user?.id, camp.data.id)
  }, [camp.data, user?.id])

  /** Кемп солиход ижил хэсэгт үлдэнэ (жнь /camp/A/rooms → /camp/B/rooms) */
  const switchTo = (id: string) => {
    const section = pathname.split('/')[3] ?? CAMP_DEFAULT_SECTION
    navigate(`/camp/${id}/${(CAMP_SECTIONS as readonly string[]).includes(section) ? section : CAMP_DEFAULT_SECTION}`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
        <Link to="/camp?list=1" className="hover:text-blue-600">
          {t('camp.layout.all_camps')}
        </Link>
        <span>/</span>
        {camp.data ? (
          <>
            {camps.data && camps.data.length > 1 ? (
              <select
                aria-label={t('camp.layout.switch_camp')}
                className={`${inputSmCls} w-auto font-medium text-gray-900`}
                value={camp.data.id}
                onChange={(e) => switchTo(e.target.value)}
              >
                {camps.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                    {c.isActive ? '' : ` (${t('camp.common.inactive')})`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-gray-900 font-medium">
                {camp.data.code} · {camp.data.name}
              </span>
            )}
            {!camp.data.isActive && <Badge>{t('camp.common.inactive')}</Badge>}
          </>
        ) : (
          <span>…</span>
        )}
      </div>
      {camp.isLoading && <Loading />}
      {camp.isError && <ErrorBox error={camp.error} onRetry={() => camp.refetch()} />}
      {camp.data && (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-5" aria-label={t('camp.layout.sections')}>
            {CAMP_SECTIONS.map((s) => (
              <NavLink
                key={s}
                to={s}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                    isActive ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {t(`camp.section.${s}`)}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </>
      )}
    </div>
  )
}
