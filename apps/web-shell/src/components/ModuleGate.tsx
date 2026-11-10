import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { permissionApi } from '../core/permission-api'
import { campKeys } from '../core/useAppPermissions'
import { canSeeModule, firstVisiblePath } from '../lib/access'
import { FEED_ENABLED, isEnabled } from '../config/enabled-modules'
import { FEED_PATH } from '../lib/home'
import { APP_MODULES, isDebugOnlyModule, moduleHomePath, type TenantModuleId } from '../lib/modules'
import { tenantModulesApi, tenantModulesQueryKey } from '../modules/settings/modules-api'
import { ErrorBox } from '../core/ui'
import LoadingSpinner from './LoadingSpinner'

const useAccess = () =>
  useQuery({ queryKey: campKeys.myPerms(), queryFn: () => permissionApi.myPermissions(), enabled: isEnabled('hr'), staleTime: 60_000 })

function NoModuleAccess() {
  const { t } = useTranslation()
  return <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">{t('access.none')}</div>
}

/**
 * v0.2.3 Блок 3 (PIL-19) — эрхгүй модулийн хаягаар шууд орвол «эрх алга» (backend-ийн 403-ийг хуудас бүрт харуулахын оронд).
 * Дүрэм → `lib/access.ts`.
 */
export function ModuleGate({ mod, children }: { mod: TenantModuleId; children: ReactNode }) {
  const q = useAccess()
  const installed = useQuery({ queryKey: tenantModulesQueryKey, queryFn: tenantModulesApi.getMine, staleTime: 60_000 })
  if (installed.isLoading || ((mod === 'camp' || mod === 'hr') && q.isLoading)) return <LoadingSpinner />
  if (installed.isError) return <ErrorBox error={installed.error} />
  const activeModules = installed.data ?? []
  if (!activeModules.includes(mod)) return <NoModuleAccess />
  if ((mod === 'camp' || mod === 'hr') && q.isError) return <ErrorBox error={q.error} />
  if ((mod === 'camp' || mod === 'hr') && q.data && !canSeeModule(q.data, mod)) return <NoModuleAccess />
  return <>{children}</>
}

/**
 * «/» → Feed эсвэл эрхтэй үндсэн модуль; debug-only модулиуд нүүр болохгүй.
 */
export function HomeRedirect() {
  const installed = useQuery({ queryKey: tenantModulesQueryKey, queryFn: tenantModulesApi.getMine, staleTime: 60_000 })
  if (installed.isLoading) return <LoadingSpinner />
  if (installed.isError) return <ErrorBox error={installed.error} />
  const activeModules = installed.data ?? []
  if (FEED_ENABLED && activeModules.includes('feed')) return <Navigate to={FEED_PATH} replace />
  return <ModuleHomeRedirect installedModules={activeModules} />
}

function ModuleHomeRedirect({ installedModules }: { installedModules: TenantModuleId[] }) {
  const q = useAccess()
  if (isEnabled('hr')) {
    if (q.isLoading) return <LoadingSpinner />
    if (q.isError) return <ErrorBox error={q.error} />
    const path = firstVisiblePath(q.data, {
      camp: isEnabled('camp') && installedModules.includes('camp'),
      hr: installedModules.includes('hr'),
    })
    if (path) return <Navigate to={path} replace />
  }
  const activeBuildModule = APP_MODULES.find((module) =>
    module !== 'camp' && module !== 'hr' && !isDebugOnlyModule(module) && isEnabled(module) && installedModules.includes(module),
  )
  return activeBuildModule ? <Navigate to={moduleHomePath(activeBuildModule)} replace /> : <NoModuleAccess />
}
