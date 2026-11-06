/**
 * v0.2.3 Блок 5 — M-0 «Нэвтрэхэд эхлээд Feed» ([[11_v0.2_completion_master_plan]] §3).
 * Цэвэр функц (тест `lib/tests/home.test.ts`).
 */

export const FEED_PATH = '/feed'

/** Feed асаалттай эсэх: `VITE_FEED=off` бол унтраана (анхдагч — асаалттай; модулиас үл хамаарна, санал хүсэлт шиг) */
export const feedEnabledFrom = (v: string | undefined): boolean => (v ?? '').trim().toLowerCase() !== 'off'

/**
 * Нэвтэрсний дараа: хамгаалагдсан хуудаснаас /login руу ирсэн бол тэр зам руу, эс бөгөөс Feed (асаалттай бол), эс бөгөөс модулийн нүүр.
 * Open redirect-ээс хамгаалж зөвхөн дотоод зам (`/…`, `//…` биш, /login биш).
 */
export function postLoginPath(from: unknown, opts: { feedEnabled: boolean; homePath: string }): string {
  if (typeof from === 'string' && /^\/(?![/\\])/.test(from) && !/^\/(login|forgot|reset|invite)\b/.test(from)) return from
  return opts.feedEnabled ? FEED_PATH : opts.homePath
}
