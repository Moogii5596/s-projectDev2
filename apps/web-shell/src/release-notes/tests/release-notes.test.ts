/**
 * v0.2.3 Блок F — «Шинэчлэлийн түүх»: цэвэр функц + өгөгдлийн бүрэн бүтэн байдал
 */
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES, type ReleaseNote } from '../notes'
import { compareVersions, hasUnseen, latestVersion, noteLang, releasedNotes } from '../release-notes'

const n = (version: string, date: string | null): ReleaseNote => ({ version, date, title: { mn: 'a', zh: 'a' }, items: [] })

describe('release notes — функц', () => {
  it('хувилбар харьцуулах (4 хэсэгтэй ч)', () => {
    expect(compareVersions('v0.2.2.1', 'v0.2.2')).toBeGreaterThan(0)
    expect(compareVersions('v0.2.10', 'v0.2.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.3', 'v0.2.3')).toBe(0)
    expect(compareVersions('v0.1.6', 'v0.2.0')).toBeLessThan(0)
  })

  it('огноогүй (бэлтгэгдэж буй) хувилбарыг харуулахгүй, шинээс нь эрэмбэлнэ', () => {
    const list = [n('v0.2.0', '2026-10-11'), n('v0.2.3', null), n('v0.2.2.1', '2026-10-19')]
    expect(releasedNotes(list).map((x) => x.version)).toEqual(['v0.2.2.1', 'v0.2.0'])
    expect(latestVersion(list)).toBe('v0.2.2.1')
    expect(latestVersion([n('v0.2.3', null)])).toBeNull()
  })

  it('«Шинэ» тэмдэг: огт үзээгүй эсвэл хуучин хувилбар үзсэн бол', () => {
    const list = [n('v0.2.2', '2026-10-19'), n('v0.2.0', '2026-10-11')]
    expect(hasUnseen(null, list)).toBe(true)
    expect(hasUnseen('v0.2.0', list)).toBe(true)
    expect(hasUnseen('v0.2.2', list)).toBe(false)
    expect(hasUnseen(null, [])).toBe(false)
  })

  it('хэл: 中文 → zh, бусад → mn', () => {
    expect(noteLang('zh')).toBe('zh')
    expect(noteLang('en')).toBe('mn')
    expect(noteLang('mn')).toBe('mn')
  })
})

describe('release notes — өгөгдөл (notes.ts)', () => {
  it('хувилбар давтагдахгүй, хэлбэр зөв, файлд шинээс хуучин руу', () => {
    const versions = RELEASE_NOTES.map((x) => x.version)
    expect(new Set(versions).size).toBe(versions.length)
    for (const v of versions) expect(v).toMatch(/^v\d+(\.\d+){1,3}$/)
    const sorted = [...versions].sort((a, b) => compareVersions(b, a))
    expect(versions).toEqual(sorted)
  })

  it('огноо YYYY-MM-DD; огноогүй нь зөвхөн хамгийн шинэ хувилбар', () => {
    RELEASE_NOTES.forEach((x, i) => {
      if (x.date === null) expect(i).toBe(0)
      else expect(x.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('мөр бүр монгол, хятад тексттэй', () => {
    for (const x of RELEASE_NOTES) {
      expect(x.title.mn.trim()).not.toBe('')
      expect(x.title.zh.trim()).not.toBe('')
      expect(x.items.length).toBeGreaterThan(0)
      for (const it of x.items) {
        expect(it.mn.trim()).not.toBe('')
        expect(it.zh.trim()).not.toBe('')
      }
    }
  })
})
