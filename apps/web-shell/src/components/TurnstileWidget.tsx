import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLang } from '../i18n'
import { loadTurnstile, turnstileLanguage, turnstileSiteKey } from '../lib/turnstile'

export type TurnstileStatus = 'disabled' | 'loading' | 'ready' | 'verified' | 'error'

/**
 * v0.2.5 #27 — Turnstile-ийн төлөв. `enabled=false` (site key алга) → token хэрэггүй, форм шууд илгээгдэнэ.
 * Token нэг удаагийнх → илгээсний дараа `reset()` заавал.
 */
export function useTurnstile() {
  const siteKey = turnstileSiteKey()
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? 'loading' : 'disabled')
  const [resetSeq, setResetSeq] = useState(0)
  const reset = useCallback(() => {
    setToken(null)
    setResetSeq((n) => n + 1)
  }, [])
  return {
    enabled: siteKey !== null,
    siteKey,
    token,
    status,
    /** Илгээж болох эсэх (widget-гүй орчинд үргэлж true) */
    ready: siteKey === null || token !== null,
    reset,
    widgetProps: { siteKey, resetSeq, onToken: setToken, onStatus: setStatus },
  }
}

interface Props {
  siteKey: string | null
  resetSeq: number
  onToken: (t: string | null) => void
  onStatus: (s: TurnstileStatus) => void
}

export default function TurnstileWidget({ siteKey, resetSeq, onToken, onStatus }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(siteKey ? 'loading' : 'disabled')
  const [attempt, setAttempt] = useState(0)

  const update = useCallback((s: TurnstileStatus) => {
    setStatus(s)
    onStatus(s)
  }, [onStatus])

  useEffect(() => {
    if (!siteKey || !ref.current) return
    let cancelled = false
    update('loading')
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return
        widgetId.current = api.render(ref.current, {
          sitekey: siteKey,
          language: turnstileLanguage(currentLang()),
          appearance: 'interaction-only',
          callback: (tok: string) => { onToken(tok); update('verified') },
          'expired-callback': () => { onToken(null); update('ready') },
          'error-callback': () => { onToken(null); update('error') },
        })
        update('ready')
      })
      .catch(() => { if (!cancelled) update('error') })
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey, attempt, onToken, update])

  // Илгээсний дараа (token нэг удаагийнх) — шинэ challenge
  useEffect(() => {
    if (resetSeq === 0 || !widgetId.current || !window.turnstile) return
    onToken(null)
    window.turnstile.reset(widgetId.current)
  }, [resetSeq, onToken])

  if (!siteKey) return null
  return (
    <div className="space-y-1">
      <div ref={ref} />
      {status === 'loading' && <p className="text-xs text-gray-500">{t('auth.captcha.loading')}</p>}
      {status === 'error' && (
        <p className="text-xs text-red-700">
          {t('auth.captcha.error')}{' '}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>{t('auth.captcha.retry')}</button>
        </p>
      )}
    </div>
  )
}
