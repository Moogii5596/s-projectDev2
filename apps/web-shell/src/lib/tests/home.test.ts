import { describe, expect, it } from 'vitest'
import { FEED_PATH, feedEnabledFrom, postLoginPath } from '../home'

describe('M-0 — нэвтэрсний дараах зам (v0.2.3 Блок 5)', () => {
  const on = { feedEnabled: true, homePath: '/camp' }
  const off = { feedEnabled: false, homePath: '/camp' }

  it('өмнөх дотоод зам руу буцна (query-тэй)', () => {
    expect(postLoginPath('/hr/x/employees?q=1', on)).toBe('/hr/x/employees?q=1')
    expect(postLoginPath('/feed', off)).toBe('/feed')
  })

  it('байхгүй / гадаад / нэвтрэх хуудас → Feed (асаалттай) эсвэл модулийн нүүр', () => {
    for (const bad of [undefined, null, 42, '', 'https://evil.example', '//evil.example', '/\\evil', '/login', '/reset/abc', '/invite/x']) {
      expect(postLoginPath(bad, on)).toBe(FEED_PATH)
      expect(postLoginPath(bad, off)).toBe('/camp')
    }
  })

  it('VITE_FEED: зөвхөн "off" унтраана', () => {
    expect(feedEnabledFrom(undefined)).toBe(true)
    expect(feedEnabledFrom('')).toBe(true)
    expect(feedEnabledFrom(' OFF ')).toBe(false)
    expect(feedEnabledFrom('on')).toBe(true)
  })
})
