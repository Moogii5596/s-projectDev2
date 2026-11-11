import * as Sentry from '@sentry/react'

/**
 * v0.2.5 H3 (#18) — Sentry (frontend). `VITE_SENTRY_DSN` хоосон бол ачаалахгүй (main.tsx-д dynamic import → bundle-д нэмэгдэхгүй).
 * PII илгээхгүй: хэрэглэгч = зөвхөн id, URL-ийн query/hash хасна, мессеж дэх имэйл/утас/токеныг нууцална.
 */
export function maskPii(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '***jwt***')
    .replace(/((?:password|token|secret)\s*[=:]\s*)("?)[^\s",;]+/gi, '$1$2***')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `${m[0]}***@${m.split('@')[1]}`)
    .replace(/\b(\d{2})\d{4}(\d{2})\b/g, '$1****$2')
}

const stripUrl = (u: string | undefined) => (u ? u.split(/[?#]/)[0] : u)

export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) event.request = { url: stripUrl(event.request.url) }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined
  if (event.message) event.message = maskPii(event.message)
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = maskPii(ex.value)
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = maskPii(b.message)
    if (b.data) b.data = typeof b.data.url === 'string' ? { url: stripUrl(b.data.url), status_code: b.data.status_code } : undefined
  }
  return event
}

export function initSentry(dsn: string, env: { environment?: string; release?: string }): void {
  Sentry.init({
    dsn,
    environment: env.environment || 'development',
    release: env.release,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend: (event) => scrubEvent(event),
  })
}
