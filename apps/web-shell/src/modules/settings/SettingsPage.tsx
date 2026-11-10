import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppPermissions } from '../../core/useAppPermissions'
import { ErrorBox, Loading, NoAccess } from '../../core/ui'
import { canSeeSettingsSection, visibleSettingsSections } from '../../lib/access'
import { SETTINGS_SECTION_REGISTRY } from './registry'

/**
 * /settings/:section — апп-ын түвшний тохиргоо; registry-д section, эрх, компонент, дарааллыг бүртгэнэ.
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const { section } = useParams()
  const perms = useAppPermissions()
  if (perms.isLoading) return <Loading />
  if (perms.isError) return <ErrorBox error={perms.error} onRetry={() => perms.refetch()} />
  const visible = visibleSettingsSections(perms.data)
  if (visible.length === 0) return <NoAccess what={t('settings.title')} />
  if (!section || !canSeeSettingsSection(perms.data, section)) return <Navigate to={`/settings/${visible[0]}`} replace />
  const SectionComponent = SETTINGS_SECTION_REGISTRY.find((item) => item.key === section)?.component

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">{t('settings.title')}</h1>
      <div className="flex flex-col gap-5 md:flex-row">
        <nav aria-label={t('settings.title')} className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
          {visible.map((s) => {
            const item = SETTINGS_SECTION_REGISTRY.find((entry) => entry.key === s)!
            return (
              <NavLink
                key={s}
                to={`/settings/${s}`}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                {t(item.labelKey)}
              </NavLink>
            )
          })}
        </nav>
        <div className="min-w-0 flex-1">
          {SectionComponent && <SectionComponent />}
        </div>
      </div>
    </div>
  )
}
