import { describe, expect, it } from 'vitest'
import type { InfiniteData } from '@tanstack/react-query'
import type { FeedListDto } from '../../api'
import type { FeedPostDto } from '../../types'
import { isLongBody, patchPost, prependPost, relativeTime, toggleLike } from '../feed'

const post = (id: string, extra: Partial<FeedPostDto> = {}): FeedPostDto => ({
  id,
  author: { id: 'a', name: 'Бат' },
  body: 'x',
  images: [],
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  reportedByMe: false,
  isMine: false,
  canEdit: false,
  canDelete: false,
  editedAt: null,
  hidden: false,
  createdAt: '2026-11-07T00:00:00.000Z',
  ...extra,
})

const data = (...pages: FeedPostDto[][]): InfiniteData<FeedListDto, string | null> => ({
  pages: pages.map((d) => ({ data: d, nextCursor: null, canModerate: false })),
  pageParams: pages.map(() => null),
})

describe('feed lib — кэш шинэчлэл', () => {
  it('patchPost: аль ч хуудсанд солих / устгах; бусад хэвээр', () => {
    const d = data([post('1'), post('2')], [post('3')])
    const liked = patchPost(d, '3', (p) => ({ ...p, likeCount: 5 }))!
    expect(liked.pages[1]!.data[0]!.likeCount).toBe(5)
    expect(liked.pages[0]).toBe(liked.pages[0])
    const removed = patchPost(d, '1', () => null)!
    expect(removed.pages[0]!.data.map((p) => p.id)).toEqual(['2'])
    expect(patchPost(undefined, '1', () => null)).toBeUndefined()
  })

  it('prependPost: эхний хуудасны эхэнд, давхардалгүй', () => {
    const d = prependPost(data([post('1')]), post('9'))!
    expect(d.pages[0]!.data.map((p) => p.id)).toEqual(['9', '1'])
    expect(prependPost(d, post('9'))!.pages[0]!.data.map((p) => p.id)).toEqual(['9', '1'])
  })

  it('toggleLike: тоо 0-ээс доош орохгүй, ижил төлөвт өөрчлөгдөхгүй', () => {
    expect(toggleLike(post('1'), true)).toMatchObject({ likedByMe: true, likeCount: 1 })
    const p = post('1', { likedByMe: true, likeCount: 1 })
    expect(toggleLike(p, true)).toBe(p)
    expect(toggleLike(post('1', { likedByMe: true }), false).likeCount).toBe(0)
  })
})

describe('feed lib — цаг, урт текст', () => {
  const now = Date.parse('2026-11-07T12:00:00.000Z')
  it('relativeTime', () => {
    expect(relativeTime('2026-11-07T11:59:30.000Z', now)).toEqual({ key: 'feed.time.now' })
    expect(relativeTime('2026-11-07T11:55:00.000Z', now)).toEqual({ key: 'feed.time.min', n: 5 })
    expect(relativeTime('2026-11-07T09:00:00.000Z', now)).toEqual({ key: 'feed.time.hour', n: 3 })
    expect(relativeTime('2026-11-05T12:00:00.000Z', now)).toEqual({ key: 'feed.time.day', n: 2 })
    expect(relativeTime('2026-10-01T12:00:00.000Z', now)).toEqual({ key: 'feed.time.date', date: '2026-10-01' })
  })
  it('isLongBody — тэмдэгт эсвэл мөр', () => {
    expect(isLongBody('a'.repeat(401))).toBe(true)
    expect(isLongBody('a\nb\nc\nd\ne\nf\ng')).toBe(true)
    expect(isLongBody('богино')).toBe(false)
  })
})
