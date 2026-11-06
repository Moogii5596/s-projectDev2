import type { InfiniteData } from '@tanstack/react-query'
import type { FeedListDto } from '../api'
import type { FeedPostDto } from '../types'

/**
 * v0.2.3 Блок 5 — Feed-ийн цэвэр функцууд (API импортгүй, FE-005; тест `lib/tests/feed.test.ts`).
 */

/** Infinite query-ийн кэш доторх нэг постыг солих / устгах (refetch-гүй шууд шинэчлэл) */
export function patchPost(
  data: InfiniteData<FeedListDto, string | null> | undefined,
  id: string,
  fn: (p: FeedPostDto) => FeedPostDto | null,
): InfiniteData<FeedListDto, string | null> | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((pg) => ({
      ...pg,
      data: pg.data.flatMap((p) => {
        if (p.id !== id) return [p]
        const next = fn(p)
        return next ? [next] : []
      }),
    })),
  }
}

/** Шинэ постыг эхний хуудасны эхэнд */
export function prependPost(
  data: InfiniteData<FeedListDto, string | null> | undefined,
  post: FeedPostDto,
): InfiniteData<FeedListDto, string | null> | undefined {
  if (!data || data.pages.length === 0) return data
  const [first, ...rest] = data.pages
  return { ...data, pages: [{ ...first!, data: [post, ...first!.data.filter((p) => p.id !== post.id)] }, ...rest] }
}

/** Лайкийн optimistic шинэчлэл */
export const toggleLike = (p: FeedPostDto, on: boolean): FeedPostDto =>
  p.likedByMe === on ? p : { ...p, likedByMe: on, likeCount: Math.max(0, p.likeCount + (on ? 1 : -1)) }

/** «5 мин», «2 цаг», «3 өдөр», эсвэл огноо (7 хоногоос хуучин) — i18n түлхүүр + параметр */
export function relativeTime(iso: string, nowMs = Date.now()): { key: string; n?: number; date?: string } {
  const sec = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000))
  if (sec < 60) return { key: 'feed.time.now' }
  if (sec < 3600) return { key: 'feed.time.min', n: Math.floor(sec / 60) }
  if (sec < 86400) return { key: 'feed.time.hour', n: Math.floor(sec / 3600) }
  if (sec < 7 * 86400) return { key: 'feed.time.day', n: Math.floor(sec / 86400) }
  return { key: 'feed.time.date', date: iso.slice(0, 10) }
}

/** Урт текстийг «Цааш унших» — мөр эсвэл тэмдэгтээр */
export function isLongBody(body: string, maxChars = 400, maxLines = 6): boolean {
  return body.length > maxChars || body.split('\n').length > maxLines
}
