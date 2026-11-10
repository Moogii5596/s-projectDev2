import { Outlet, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { FEED_ENABLED, isEnabled } from '../config/enabled-modules'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18nSync } from '../hooks/useI18nSync'
import { useMe } from '../hooks/useMe'
import { displayLogin } from '../lib/password-change'
import PageSuspense from './PageSuspense'
import { useEffect, useState } from 'react'
import { hasUnseen, readSeen } from '../release-notes/release-notes'
import { permissionApi } from '../core/permission-api'
import { campKeys } from '../core/useAppPermissions'
import { canSeeModule, visibleSettingsSections } from '../lib/access'
import { tenantModulesApi, tenantModulesQueryKey } from '../modules/settings/modules-api'
import { ErrorBox } from '../core/ui'
import { APP_MODULES, DEBUG_MODULES, filterModuleNavigation, isBuildModule } from '../lib/modules'
import NotificationBell from '../modules/core/NotificationBell'
import { approvalKeys, approvalsApi, debugApi } from '../modules/core/api'
import { debugMeKey } from '../modules/debug/DebugPage'

export default function Layout() {
  const { user, signOut } = useAuth()
  const { me } = useMe()
  const { t } = useTranslation()
  useI18nSync()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Кемпийн хуудсууд (эрхийн матриц, календарь) өргөн хүснэгттэй
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/camp') || pathname.startsWith('/hr') || pathname.startsWith('/settings')
  // v0.2.3 Блок 3 (PIL-19): эрхгүй модулийн цэс нуух (ачаалж байх үед ч нуусан — «эрх алга» анивчихгүй)
  const access = useQuery({
    queryKey: campKeys.myPerms(),
    queryFn: () => permissionApi.myPermissions(),
    enabled: true,
    staleTime: 60_000,
  }).data
  const installedModulesQuery = useQuery({
    queryKey: tenantModulesQueryKey,
    queryFn: tenantModulesApi.getMine,
    staleTime: 60_000,
  })
  const installedModules = installedModulesQuery.data ?? []
  const showSettings = visibleSettingsSections(access).length > 0
  const showDebug = DEBUG_MODULES.some((module) =>
    installedModules.includes(module) &&
    (module === 'workflow' ? isEnabled('mr') : isBuildModule(module) && isEnabled(module)),
  )
  // v0.2.4 D-1: Debug цэс (флаг + core.debug.view) — backend 404 бол нууна
  const debugMe = useQuery({ queryKey: debugMeKey, queryFn: debugApi.me, retry: false, staleTime: 300_000 })
  const showDebugMenu = showDebug || debugMe.isSuccess
  const moduleNavigation = filterModuleNavigation({
    enabledModules: new Set(APP_MODULES.filter(isEnabled)),
    installedModules: new Set(installedModules),
    permissionVisibleModules: new Set(APP_MODULES.filter((module) =>
      module === 'hr' || module === 'camp' ? canSeeModule(access, module) : true,
    )),
    feedEnabled: FEED_ENABLED,
    settingsVisible: showSettings,
    debugVisible: showDebugMenu,
  })
  // v0.2.4 WF-06: «Миний батлах» тоо
  const inbox = useQuery({ queryKey: approvalKeys.inbox, queryFn: approvalsApi.inbox, refetchInterval: 60_000, staleTime: 30_000 })
  const pending = inbox.data?.items.length ?? 0
  // v0.2.4 UX-01: утсанд доод таб — «Модулиуд» цэс
  const [modulesOpen, setModulesOpen] = useState(false)
  useEffect(() => setModulesOpen(false), [pathname])

  // Phase 6.0: идэвхтэй цэсийг тодруулна
  const navCls = (prefix: string) =>
    `text-sm hover:text-blue-600 ${pathname.startsWith(prefix) ? 'text-blue-600 font-medium' : 'text-gray-600'}`

  // v0.2.3 Блок F: шинэ хувилбар суусны дараа «Шинэчлэлийн түүх»-ийг үзээгүй бол «Шинэ» тэмдэг
  const [unseen, setUnseen] = useState(() => hasUnseen(readSeen()))
  useEffect(() => {
    const onSeen = () => setUnseen(hasUnseen(readSeen()))
    window.addEventListener('whats-new-seen', onSeen)
    return () => window.removeEventListener('whats-new-seen', onSeen)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    // Өөр хэрэглэгч нэвтрэхэд өмнөхийн эрх/өгөгдөл cache-д үлдэхгүй
    queryClient.clear()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar — v0.2.4 UX-01: том дэлгэцэд бүрэн цэс; утсанд лого + хонх (бусад нь доод табд) */}
      <nav className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <span
          className="text-lg font-bold text-gray-900 cursor-pointer"
          onClick={() => navigate('/')}
        >
          S Project
        </span>
        <div className="hidden md:flex flex-wrap items-center gap-x-4 gap-y-1">
          {moduleNavigation.map((item) => {
            const path = item.key === 'debug' && !debugMe.isSuccess ? '/debug/modules' : item.path
            return (
              <button key={item.key} onClick={() => navigate(path)} className={`relative ${navCls(item.path)}`}>
                {t(item.labelKey)}
                {item.key === 'approvals' && pending > 0 && <span className="ml-1 inline-block rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold leading-4 text-white align-middle">{pending}</span>}
                {item.key === 'whats-new' && unseen && <span className="ml-1 inline-block rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white align-middle">{t('nav.whats_new_badge')}</span>}
              </button>
            )
          })}
          <LanguageSwitcher persist />
          <NotificationBell />
          {/* v0.2.4 UX-01: профайл (хэл, нууц үг, төхөөрөмж, мэдэгдэл, орлон гүйцэтгэгч) */}
          <button onClick={() => navigate('/profile')} className={navCls('/profile')} title={t('profile.title')}>
            {displayLogin(me, user?.email)}
          </button>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            {t('nav.sign_out')}
          </button>
        </div>
        <div className="flex md:hidden items-center gap-2">
          <NotificationBell />
        </div>
      </nav>

      {/* Content */}
      {installedModulesQuery.isError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <ErrorBox error={installedModulesQuery.error} />
        </div>
      )}
      <main className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-32 md:pb-20`}>
        <PageSuspense><Outlet /></PageSuspense>
      </main>

      {/* v0.2.3 Блок F — хуудас бүрээс «Санал илгээх» (тухайн хуудсыг автоматаар тэмдэглэнэ) */}
      {!pathname.startsWith('/feedback') && (
        <button
          type="button"
          onClick={() => navigate('/feedback', { state: { compose: true, from: pathname } })}
          className="fixed bottom-20 md:bottom-4 right-4 z-30 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-700"
        >
          {t('feedback.fab')}
        </button>
      )}

      {/* v0.2.4 UX-01 — утасны доод таб: Feed · Модулиуд · Мэдэгдэл · Профайл */}
      {modulesOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setModulesOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {moduleNavigation.filter((item) => item.mobileModules).map((item) => {
                const path = item.key === 'debug' && !debugMe.isSuccess ? '/debug/modules' : item.path
                return (
                  <button key={item.key} className="relative rounded-lg border p-3" onClick={() => navigate(path)}>
                    {t(item.labelKey)}
                    {item.key === 'approvals' && pending > 0 && <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{pending}</span>}
                    {item.key === 'whats-new' && unseen && ' •'}
                  </button>
                )
              })}
            </div>
            <button className="mt-3 w-full rounded-lg py-2 text-sm text-red-600" onClick={handleSignOut}>{t('nav.sign_out')}</button>
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t('nav.tabs')}>
        {[
          ...(moduleNavigation.some((item) => item.module === 'feed') ? [{ key: 'feed', label: t('nav.feed'), to: '/feed' }] : [{ key: 'home', label: t('nav.home'), to: '/' }]),
          { key: 'modules', label: t('nav.modules'), to: null },
          { key: 'notifications', label: t('notify.bell.title'), to: '/notifications' },
          { key: 'profile', label: t('profile.title'), to: '/profile' },
        ].map((tab) => {
          const active = tab.to ? pathname.startsWith(tab.to) && (tab.to !== '/' || pathname === '/') : modulesOpen
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => (tab.to ? navigate(tab.to) : setModulesOpen((v) => !v))}
              className={`py-3 text-xs font-medium ${active ? 'text-blue-600' : 'text-gray-600'}`}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
