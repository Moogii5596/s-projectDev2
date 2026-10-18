import { useEffect, useState, FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { acceptInvite, inspectInvite, type InviteInfo } from '../api/auth'
import { MIN_PASSWORD_LENGTH } from '../lib/password-change'

/**
 * v0.2.2 Блок 3 (ADR-003 §2.3) — `/invite/:token` (шинэ хэрэглэгч) ба `/reset/:token` (нууц үг мартсан).
 * Нэвтрэлтгүй. Амжилттай бол нэвтрэх нэрийг харуулж /login руу.
 */
export default function SetPasswordPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ login: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    inspectInvite(token, t('auth.error'))
      .then((r) => alive && setInfo(r))
      .catch((e: Error) => alive && setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [token, t])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('auth.change.min', { n: MIN_PASSWORD_LENGTH }))
    if (password !== confirm) return setError(t('auth.change.mismatch'))
    setSubmitting(true)
    try {
      setDone(await acceptInvite(token, password, t('auth.error')))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const isReset = info?.valid && info.purpose === 'RESET'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">{isReset ? t('auth.invite.reset_title') : t('auth.invite.title')}</h1>
        {!info && !loadError && <p className="text-sm text-gray-500">{t('common.loading')}</p>}
        {loadError && <p className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{loadError}</p>}
        {info && !info.valid && (
          <div className="space-y-3">
            <p className="bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-lg">{t(`auth.invite.invalid_${info.reason}`)}</p>
            <Link to="/login" className="text-sm text-blue-600 hover:underline">{t('auth.invite.to_login')}</Link>
          </div>
        )}
        {done && (
          <div className="space-y-4">
            <p className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">{t('auth.invite.done')}</p>
            {done.login && (
              <p className="text-sm text-gray-700">
                {t('auth.invite.your_login')} <span className="font-mono font-semibold">{done.login}</span>
              </p>
            )}
            <Link to="/login" className="block text-center w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
              {t('auth.submit')}
            </Link>
          </div>
        )}
        {info?.valid && !done && (
          <form onSubmit={submit} className="space-y-4 mt-3">
            {info.name && <p className="text-sm text-gray-700">{t('auth.invite.hello', { name: info.name })}</p>}
            {info.login && (
              <p className="text-sm text-gray-700">
                {t('auth.invite.your_login')} <span className="font-mono font-semibold">{info.login}</span>
              </p>
            )}
            {/* Хөтөч нууц үгийг зөв хэрэглэгчид хадгалах (autocomplete="username") */}
            <input type="text" name="username" autoComplete="username" value={info.login ?? ''} readOnly hidden />
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.change.new')}</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
              <p className="mt-1 text-xs text-gray-500">{t('auth.change.min', { n: MIN_PASSWORD_LENGTH })}</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.change.confirm')}</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? t('auth.submitting') : t('auth.invite.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
