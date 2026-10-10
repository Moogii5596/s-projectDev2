import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import { campKeys } from '../hooks/useCampPermissions'
import { Badge, ErrorBox, Loading } from './ui'

/** Кемп тус бүрийн хэсгүүд (Шат 8 V1). Багц 2–3-т ирц, өрөө, хоол, хөрөнгө, засвар нэмэгдэнэ */
export const CAMP_SECTIONS: { to: string; label: string }[] = [
  { to: 'settings', label: 'Тохиргоо' },
  { to: 'facilities', label: 'Байр, өрөө' },
  { to: 'departments', label: 'Хэлтэс, ээлж' },
  { to: 'crews', label: 'Баг (ростер)' },
]

export default function CampLayout() {
  const { campId = '' } = useParams()
  const camp = useQuery({ queryKey: campKeys.camp(campId), queryFn: () => campApi.camp(campId), enabled: !!campId })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-2">
        <Link to="/camp" className="hover:text-blue-600">
          Кемпүүд
        </Link>
        <span>/</span>
        {camp.data ? (
          <span className="text-gray-900 font-medium">
            {camp.data.code} · {camp.data.name} {!camp.data.isActive && <Badge>Идэвхгүй</Badge>}
          </span>
        ) : (
          <span>…</span>
        )}
      </div>
      {camp.isLoading && <Loading />}
      {camp.isError && <ErrorBox error={camp.error} onRetry={() => camp.refetch()} />}
      {camp.data && (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-5" aria-label="Кемпийн хэсгүүд">
            {CAMP_SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                    isActive ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`
                }
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </>
      )}
    </div>
  )
}
