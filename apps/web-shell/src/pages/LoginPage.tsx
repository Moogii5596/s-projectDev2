import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { HOME_PATH } from '../config/enabled-modules'
import { CHANGE_PASSWORD_PATH } from '../lib/password-change'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function LoginPage() {
  const { signIn, user, loading } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  /** v0.2.2 D-10: утас / нэвтрэх нэр / имэйл */
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Нэвтэрсэн хэрэглэгч /login-д ирвэл нүүр (HOME_PATH) руу чиглүүлнэ
  useEffect(() => {
    if (!loading && user) {
      navigate(HOME_PATH, { replace: true })
    }
  }, [user, loading, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const r = await signIn(identifier, password, t('auth.error'))
      navigate(r.mustChangePassword ? CHANGE_PASSWORD_PATH : HOME_PATH)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error'))
    } finally {
      setSubmitting(false)
    }
  }

  // Auth loading үед spinner харуулна
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">S Project</h1>
        <p className="text-gray-500 mb-6 text-sm">{t('auth.subtitle')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
              {t('auth.identifier')}
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('auth.identifier_placeholder')}
            />
            <p className="mt-1 text-xs text-gray-500">{t('auth.identifier_hint')}</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t('auth.submitting') : t('auth.submit')}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/forgot" className="text-sm text-blue-600 hover:underline">{t('auth.forgot.link')}</Link>
        </div>
      </div>
    </div>
  )
}
