import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../modules/camp/api/camp-api'
import { campKeys } from '../modules/camp/hooks/useCampPermissions'
import { canSeeModule, firstVisiblePath, type AppModuleKey } from '../lib/access'
import { FEED_ENABLED, HOME_PATH, isEnabled } from '../config/enabled-modules'
import { FEED_PATH } from '../lib/home'
import LoadingSpinner from './LoadingSpinner'

const useAccess = () =>
  useQuery({ queryKey: campKeys.myPerms(), queryFn: () => campApi.myPermissions(), enabled: isEnabled('hr'), staleTime: 60_000 })

function NoModuleAccess() {
  const { t } = useTranslation()
  return <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">{t('access.none')}</div>
}

/**
 * v0.2.3 Блок 3 (PIL-19) — эрхгүй модулийн хаягаар шууд орвол «эрх алга» (backend-ийн 403-ийг хуудас бүрт харуулахын оронд).
 * Дүрэм → `lib/access.ts`.
 */
export function ModuleGate({ mod, children }: { mod: AppModuleKey; children: ReactNode }) {
  const q = useAccess()
  if (q.isLoading) return <LoadingSpinner />
  if (q.data && !canSeeModule(q.data, mod)) return <NoModuleAccess />
  return <>{children}</>
}

/**
 * «/» → v0.2.3 Блок 5 (M-0): Feed (асаалттай бол — идэвхтэй бүх хэрэглэгч уншина);
 * эс бөгөөс эрхтэй эхний модуль (пилот: Кемп; зөвхөн HR эрхтэй → Хүний нөөц). Модуль биш нүүр (MR г.м.) → HOME_PATH
 */
export function HomeRedirect() {
  if (FEED_ENABLED) return <Navigate to={FEED_PATH} replace />
  return <ModuleHomeRedirect />
}

function ModuleHomeRedirect() {
  const moduleHome = HOME_PATH === '/camp' || HOME_PATH === '/hr'
  const q = useAccess()
  if (!moduleHome || !isEnabled('hr')) return <Navigate to={HOME_PATH} replace />
  if (q.isLoading) return <LoadingSpinner />
  if (q.isError) return <Navigate to={HOME_PATH} replace />
  const path = firstVisiblePath(q.data, { camp: isEnabled('camp'), hr: isEnabled('hr') })
  return path ? <Navigate to={path} replace /> : <NoModuleAccess />
}
