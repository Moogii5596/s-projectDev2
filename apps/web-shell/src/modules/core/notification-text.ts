import type { TFunction } from 'i18next'
import type { NotificationParams } from './api'

/**
 * Мэдэгдлийн params: `<name>Key` = i18n түлхүүр → `<name>` болгон орчуулна (backend `resolveKeyParams`-тэй ижил дүрэм).
 * Жнь { entityKey: 'approval.entity.mr' } → {entity}.
 */
export function resolveNotificationParams(t: TFunction, params: NotificationParams): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = { ...params }
  for (const [k, v] of Object.entries(params)) {
    if (k.length > 3 && k.endsWith('Key') && typeof v === 'string' && v) out[k.slice(0, -3)] = t(v)
  }
  return out
}

export function notificationText(t: TFunction, key: string | null, params: NotificationParams): string {
  if (!key) return ''
  return t(key, resolveNotificationParams(t, params))
}

/** «5 мин», «2 цаг», эсвэл огноо — хэрэглэгчийн хэлээр (Intl.RelativeTimeFormat) */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(iso).toLocaleDateString(locale)
}
