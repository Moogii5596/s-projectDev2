import { isAxiosError } from 'axios'

/**
 * API алдааг хэрэглэгчид харуулах монгол мессеж болгоно.
 * NestJS: { statusCode, message: string | string[], error }. Backend-ийн мессеж монгол тул шууд харуулна.
 */
export function apiErrorMessage(err: unknown, fallback = 'Алдаа гарлаа'): string {
  if (isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const msg = data?.message
    if (Array.isArray(msg) && msg.length > 0) return msg.map(String).join('; ')
    if (typeof msg === 'string' && msg.trim() !== '') return msg
    if (status === 403) return 'Энэ үйлдэлд эрх алга'
    if (status === 404) return 'Олдсонгүй'
    if (!err.response) return 'Сервертэй холбогдож чадсангүй'
    return `${fallback} (${status})`
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
