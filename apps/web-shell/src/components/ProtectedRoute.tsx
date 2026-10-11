import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useMe } from '../hooks/useMe'
import { CHANGE_PASSWORD_PATH } from '../lib/password-change'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from 'react-i18next'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  // v0.2.2 D-06: me.mustChangePassword → /change-password (backend бусад API-г 403-аар хаадаг)
  const { me } = useMe({ enabled: !!user })
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">{t('common.loading')}</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (me?.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }

  return <Outlet />
}
