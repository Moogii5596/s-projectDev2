import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { useMe } from '../hooks/useMe'
import { changePasswordRequest } from '../api/auth'
import { MIN_PASSWORD_LENGTH, apiErrorMessage } from '../lib/password-change'
import { HOME_PATH } from '../config/enabled-modules'
import LanguageSwitcher from '../components/LanguageSwitcher'

/**
 * v0.2.2 D-06 — нууц үг солих. `mustChangePassword` үед бусад хуудас хаалттай (backend 403) → энд л үлдэнэ.
 * Layout-гүй (шаардлагатай үед цэс харуулахгүй).
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { signOut } = useAuth()
  const { me } = useMe()
  const required = me?.mustChangePassword === true
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next.length < MIN_PASSWORD_LENGTH) return setError(t('auth.change.min', { n: MIN_PASSWORD_LENGTH }))
    if (next !== confirm) return setError(t('auth.change.mismatch'))
    setSubmitting(true)
    try {
      await changePasswordRequest(current, next)
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      setDone(true)
    } catch (err) {
      const body = (err as { response?: { data?: unknown } }).response?.data
      setError(apiErrorMessage(body, t('auth.error')))
    } finally {
      setSubmitting(false)
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">{t('auth.change.title')}</h1>
        {required && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">{t('auth.change.required')}</p>}
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{t('auth.change.success')}</p>
            <button type="button" onClick={() => navigate(HOME_PATH, { replace: true })} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
              {t('auth.change.continue')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.change.current')}</label>
              <input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.change.new')}</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={next} onChange={(e) => setNext(e.target.value)} className={input} />
              <p className="mt-1 text-xs text-gray-500">{t('auth.change.min', { n: MIN_PASSWORD_LENGTH })}</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.change.confirm')}</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? t('auth.submitting') : t('auth.change.submit')}
            </button>
            <div className="flex justify-between text-sm">
              {!required && (
                <button type="button" onClick={() => navigate(-1)} className="text-gray-600 hover:underline">{t('auth.change.back')}</button>
              )}
              <button type="button" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))} className="text-red-600 hover:underline ml-auto">
                {t('nav.sign_out')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
