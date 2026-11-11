/**
 * v0.2.5 #27 (H1b, ADR-011 §3) — Cloudflare Turnstile.
 * Supabase Cloud Free-д `/auth/v1/token?grant_type=password` anon key-ээр шууд нээлттэй → NestJS-ийн бүртгэлийн түгжээг
 * тойрохгүйн тулд Supabase «Bot protection» (Turnstile) асаана. Token-ийг NestJS `sign-in` / `change-password` руу дамжуулна.
 * `VITE_TURNSTILE_SITE_KEY` хоосон (dev, local, CI) → widget-гүй, token-гүй ажиллана.
 */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function turnstileSiteKey(env: Record<string, unknown> = import.meta.env): string | null {
  const v = env['VITE_TURNSTILE_SITE_KEY']
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Turnstile монгол хэлгүй → 'auto' (browser-ийн хэл); бусад нь шууд */
export function turnstileLanguage(lang: string): string {
  if (lang === 'zh') return 'zh-cn'
  if (lang === 'en') return 'en'
  return 'auto'
}

export interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  reset(id?: string): void
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

/** Script-ийг нэг удаа ачаална (хуудас хооронд дахин ачаалахгүй). Алдаа → дараагийн оролдлогод дахин ачаална. */
export function loadTurnstile(doc: Document = document): Promise<TurnstileApi> {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const s = doc.createElement('script')
    s.src = TURNSTILE_SCRIPT_URL
    s.async = true
    s.defer = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
    s.onerror = () => reject(new Error('turnstile load failed'))
    doc.head.appendChild(s)
  }).catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}
