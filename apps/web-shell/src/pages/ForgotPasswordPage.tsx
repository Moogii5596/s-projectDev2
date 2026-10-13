import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { forgotPassword } from '../api/auth'

/**
 * v0.2.2 Блок 3 — "нууц үг мартсан". Хариу үргэлж ижил (хэрэглэгч байгаа эсэхийг задруулахгүй):
 * имэйлтэй бол reset линк очно, үгүй бол админаас шинэ холбоос авна.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await forgotPassword(identifier, t('auth.error'))
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">{t('auth.forgot.title')}</h1>
        {sent ? (
          <p className="text-sm text-gray-700 bg-blue-50 rounded-lg px-3 py-2">{t('auth.forgot.sent')}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.identifier')}</label>
              <input id="identifier" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? t('auth.submitting') : t('auth.forgot.submit')}
            </button>
          </form>
        )}
        <p className="mt-4 text-xs text-gray-500">{t('auth.forgot.no_email')}</p>
        <Link to="/login" className="mt-3 inline-block text-sm text-blue-600 hover:underline">{t('auth.invite.to_login')}</Link>
      </div>
    </div>
  )
}
