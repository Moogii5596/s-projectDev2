// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURNSTILE_SCRIPT_URL, loadTurnstile, turnstileLanguage, turnstileSiteKey } from '../turnstile'

describe('turnstile (v0.2.5 #27)', () => {
  afterEach(() => {
    delete (window as { turnstile?: unknown }).turnstile
    document.head.querySelectorAll('script').forEach((s) => s.remove())
  })

  it('site key: хоосон / зай / байхгүй → null (widget-гүй); утга → trim', () => {
    expect(turnstileSiteKey({})).toBeNull()
    expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: '  ' })).toBeNull()
    expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: ' 0x4AAA ' })).toBe('0x4AAA')
  })

  it('хэл: zh → zh-cn, en → en, mn (Turnstile-д алга) → auto', () => {
    expect(turnstileLanguage('zh')).toBe('zh-cn')
    expect(turnstileLanguage('en')).toBe('en')
    expect(turnstileLanguage('mn')).toBe('auto')
  })

  it('script-ийг нэг л удаа ачаална; ачаалагдсан бол шууд', async () => {
    const p1 = loadTurnstile()
    const p2 = loadTurnstile()
    const scripts = document.head.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
    expect(scripts).toHaveLength(1)
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }
    ;(window as { turnstile?: unknown }).turnstile = api
    ;(scripts[0] as HTMLScriptElement).onload?.(new Event('load'))
    await expect(p1).resolves.toBe(api)
    await expect(p2).resolves.toBe(api)
    await expect(loadTurnstile()).resolves.toBe(api)
  })
})
