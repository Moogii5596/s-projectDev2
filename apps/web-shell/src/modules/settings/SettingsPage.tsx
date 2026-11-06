import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCampPermissions } from '../camp/hooks/useCampPermissions'
import { ErrorBox, Loading, NoAccess } from '../camp/components/ui'
import { canSeeSettingsSection, visibleSettingsSections } from '../../lib/access'
import OrganizationsPage from '../camp/pages/OrganizationsPage'
import RolesPage from '../camp/pages/RolesPage'
import UserRolesPage from '../camp/pages/UserRolesPage'
import TranslationsPage from '../camp/pages/TranslationsPage'

/**
 * /settings/:section — «Системийн тохиргоо» (v0.2.3 Блок 3, ADR-007 B3-2): роль ба эрх, хэрэглэгчийн роль, байгууллага, орчуулга.
 * Хэсэг бүрийн харагдах дүрэм → `lib/access.ts` (PIL-19). Кемптэй холбоотой тохиргоо → «Кемпийн тохиргоо» (`/camp/system`).
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const { section } = useParams()
  const perms = useCampPermissions()
  if (perms.isLoading) return <Loading />
  if (perms.isError) return <ErrorBox error={perms.error} onRetry={() => perms.refetch()} />
  const visible = visibleSettingsSections(perms.data)
  if (visible.length === 0) return <NoAccess what={t('settings.title')} />
  if (!section || !canSeeSettingsSection(perms.data, section)) return <Navigate to={`/settings/${visible[0]}`} replace />

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">{t('settings.title')}</h1>
      <div className="flex flex-col gap-5 md:flex-row">
        <nav aria-label={t('settings.title')} className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
          {visible.map((s) => (
            <NavLink
              key={s}
              to={`/settings/${s}`}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
              }
            >
              {t(`settings.section.${s}`)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {section === 'roles' && <RolesPage />}
          {section === 'user-roles' && <UserRolesPage />}
          {section === 'organizations' && <OrganizationsPage />}
          {section === 'translations' && <TranslationsPage />}
        </div>
      </div>
    </div>
  )
}
