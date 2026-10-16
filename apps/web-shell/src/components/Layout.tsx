import { Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { HOME_PATH, isEnabled } from '../config/enabled-modules'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import { useI18nSync } from '../hooks/useI18nSync'
import { useMe } from '../hooks/useMe'
import { CHANGE_PASSWORD_PATH, displayLogin } from '../lib/password-change'

export default function Layout() {
  const { user, signOut } = useAuth()
  const { me } = useMe()
  const { t } = useTranslation()
  useI18nSync()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Кемпийн хуудсууд (эрхийн матриц, календарь) өргөн хүснэгттэй
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/camp') || pathname.startsWith('/hr')
  // Phase 6.0: идэвхтэй цэсийг тодруулна
  const navCls = (prefix: string) =>
    `text-sm hover:text-blue-600 ${pathname.startsWith(prefix) ? 'text-blue-600 font-medium' : 'text-gray-600'}`

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
          onClick={() => navigate(HOME_PATH)}
        >
          S Project
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {isEnabled('hr') && <button onClick={() => navigate('/hr')} className={navCls('/hr')}>{t('nav.hr')}</button>}
          {isEnabled('camp') && <button onClick={() => navigate('/camp')} className={navCls('/camp')}>{t('nav.camp')}</button>}
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
          <LanguageSwitcher persist />
          {/* v0.2.2: нэвтрэх нэр (дотоод .login.invalid имэйлийг харуулахгүй) + нууц үг солих */}
          <button
            onClick={() => navigate(CHANGE_PASSWORD_PATH)}
            className="text-sm text-gray-500 hover:text-blue-600"
            title={t('auth.change.link')}
          >
            {displayLogin(me, user?.email)}
          </button>
          <button
            onClick={handleSignOut}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            {t('nav.sign_out')}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 sm:px-6 py-8`}>
        <Outlet />
      </main>
    </div>
  )
}
