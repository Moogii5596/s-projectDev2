/**
 * v0.2.3 Блок F — санал хүсэлтийн цэвэр функц
 */
import { describe, expect, it } from 'vitest'
import type { FeedbackItemDto } from '../api'
import { groupDoneByVersion, isVersion, sourcePath } from '../lib'

const fb = (id: string, status: FeedbackItemDto['status'], doneVersion: string | null): FeedbackItemDto => ({
  id, status, doneVersion, kind: 'IDEA', title: id, body: '', pagePath: null, appVersion: null, adminReply: null, repliedAt: null,
  voteCount: 0, votedByMe: false, isMine: false, canEdit: false, authorName: 'x', createdAt: '', updatedAt: '',
})

describe('feedback lib', () => {
  it('зөвхөн DONE + хувилбартайг хувилбараар бүлэглэнэ', () => {
    const m = groupDoneByVersion([fb('a', 'DONE', 'v0.2.3'), fb('b', 'PLANNED', null), fb('c', 'DONE', 'v0.2.3'), fb('d', 'DONE', 'v0.2.4')])
    expect([...m.keys()]).toEqual(['v0.2.3', 'v0.2.4'])
    expect(m.get('v0.2.3')!.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('хувилбарын хэлбэр', () => {
    expect(isVersion('0.2.3')).toBe(true)
    expect(isVersion(' v0.2.2.1 ')).toBe(true)
    expect(isVersion('0.2')).toBe(true)
    expect(isVersion('0.2.3-rc')).toBe(false)
    expect(isVersion('')).toBe(false)
  })

  it('эх хуудас: /feedback болон буруу утгыг хадгалахгүй', () => {
    expect(sourcePath('/camp/abc/rooms')).toBe('/camp/abc/rooms')
    expect(sourcePath('/feedback')).toBeNull()
    expect(sourcePath('https://x')).toBeNull()
    expect(sourcePath(undefined)).toBeNull()
  })
})
