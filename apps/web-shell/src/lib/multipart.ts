/**
 * v0.2.3 Блок 5 — TEST-009 давтагдсан (Feed-ийн зураг, 2026-11-07): client-ийн анхдагч `Content-Type: application/json`
 * үлдвэл axios 1.x `FormData`-г JSON болгож файлыг хаядаг. Request interceptor бүх FormData хүсэлтэд
 * `multipart/form-data` тавина (boundary-г browser нэмнэ) — дуудлага бүрт header заах шаардлагагүй.
 * Цэвэр функц (тест `lib/tests/multipart.test.ts`).
 */
export const isFormData = (data: unknown): data is FormData => typeof FormData !== 'undefined' && data instanceof FormData

/** FormData бол 'multipart/form-data', эс бөгөөс одоогийн Content-Type хэвээр */
export function contentTypeFor(data: unknown, current: string | undefined): string | undefined {
  return isFormData(data) ? 'multipart/form-data' : current
}
