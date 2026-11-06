import { Outlet, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { isEnabled } from '../config/enabled-modules'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18nSync } from '../hooks/useI18nSync'
import { useMe } from '../hooks/useMe'
import { CHANGE_PASSWORD_PATH, displayLogin } from '../lib/password-change'
import PageSuspense from './PageSuspense'
import { useEffect, useState } from 'react'
import { hasUnseen, readSeen } from '../release-notes/release-notes'
import { campApi } from '../modules/camp/api/camp-api'
import { campKeys } from '../modules/camp/hooks/useCampPermissions'
import { canSeeModule, visibleSettingsSections } from '../lib/access'

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
    queryFn: () => campApi.myPermissions(),
    enabled: isEnabled('hr'),
    staleTime: 60_000,
  }).data
  const showSettings = isEnabled('hr') && visibleSettingsSections(access).length > 0
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
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-lg font-bold text-gray-900 cursor-pointer"
          onClick={() => navigate('/')}
        >
          S Project
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {isEnabled('hr') && canSeeModule(access, 'hr') && <button onClick={() => navigate('/hr')} className={navCls('/hr')}>{t('nav.hr')}</button>}
          {isEnabled('camp') && canSeeModule(access, 'camp') && <button onClick={() => navigate('/camp')} className={navCls('/camp')}>{t('nav.camp')}</button>}
          {showSettings && <button onClick={() => navigate('/settings')} className={navCls('/settings')}>{t('nav.settings')}</button>}
          {isEnabled('inventory') && <button onClick={() => navigate('/inventory')} className={navCls('/inventory')}>{t('nav.inventory')}</button>}
          {isEnabled('vendors') && <button onClick={() => navigate('/vendors')} className={navCls('/vendors')}>{t('nav.vendors')}</button>}
          {isEnabled('reports') && <button onClick={() => navigate('/reports')} className={navCls('/reports')}>{t('nav.reports')}</button>}
          {isEnabled('mr') && (
            <>
              <button onClick={() => navigate('/admin/approval-sla')} className="text-sm text-gray-600 hover:text-blue-600">SLA</button>
              <button onClick={() => navigate('/admin/workflow-definitions')} className="text-sm text-gray-600 hover:text-blue-600">Workflow</button>
              <button onClick={() => navigate('/admin/delegations')} className="text-sm text-gray-600 hover:text-blue-600">Delegation</button>
            </>
          )}
          {/* v0.2.3 Блок F — модулиас үл хамаарна (бүх хэрэглэгч) */}
          <button onClick={() => navigate('/feedback')} className={navCls('/feedback')}>{t('nav.feedback')}</button>
          <button onClick={() => navigate('/whats-new')} className={`relative ${navCls('/whats-new')}`}>
            {t('nav.whats_new')}
            {unseen && (
              <span className="ml-1 inline-block rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white align-middle">
                {t('nav.whats_new_badge')}
              </span>
            )}
          </button>
          <LanguageSwitcher persist />
          {/* v0.2.2: нэвтрэх нэр (дотоод .login.invalid имэйлийг харуулахгүй) + нууц үг солих */}
          <button
            onClick={() => navigate(CHANGE_PASSWORD_PATH)}
            className="text-sm text-gray-500 hover:text-blue-600"
            title={t('auth.change.link')}
          >
            {displayLogin(me, user?.email)}
          </button>
          <button onClick={() => navigate('/account/devices')} className={navCls('/account')}>{t('devices.nav')}</button>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            {t('nav.sign_out')}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 sm:px-6 pt-8 pb-20`}>
        <PageSuspense><Outlet /></PageSuspense>
      </main>

      {/* v0.2.3 Блок F — хуудас бүрээс «Санал илгээх» (тухайн хуудсыг автоматаар тэмдэглэнэ) */}
      {!pathname.startsWith('/feedback') && (
        <button
          type="button"
          onClick={() => navigate('/feedback', { state: { compose: true, from: pathname } })}
          className="fixed bottom-4 right-4 z-30 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-700"
        >
          {t('feedback.fab')}
        </button>
      )}
    </div>
  )
}
