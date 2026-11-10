import { isAxiosError } from 'axios'
import i18n from '../i18n'

/**
 * API алдааг хэрэглэгчид харуулах мессеж болгоно.
 * NestJS: { statusCode, message: string | string[], error }. v0.2.0 §0.7: backend `Accept-Language`-аар орчуулсан
 * `message` (+ `code`) буцаадаг тул шууд харуулна; сервергүй/хоосон үед frontend-ийн орчуулга.
 */
export function apiErrorMessage(err: unknown, fallback = i18n.t('common.error')): string {
  if (isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const msg = data?.message
    if (Array.isArray(msg) && msg.length > 0) return msg.map(String).join('; ')
    if (typeof msg === 'string' && msg.trim() !== '') return msg
    if (status === 403) return i18n.t('common.error.forbidden')
    if (status === 404) return i18n.t('common.error.not_found')
    if (!err.response) return i18n.t('common.error.network')
    return `${fallback} (${status})`
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
