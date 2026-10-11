import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLastCamp, resolveLastCamp, setLastCamp } from '../last-camp'

describe('last-camp (FB-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('хэрэглэгч бүрт тусдаа хадгална; хэрэглэгчгүй → null', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    setLastCamp('u1', 'c1')
    setLastCamp('u2', 'c2')
    expect(getLastCamp('u1')).toBe('c1')
    expect(getLastCamp('u2')).toBe('c2')
    expect(getLastCamp(null)).toBeNull()
  })

  it('localStorage алдаа (хувийн цонх) → унахгүй, null', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(() => setLastCamp('u1', 'c1')).not.toThrow()
    expect(getLastCamp('u1')).toBeNull()
  })

  it('resolveLastCamp: жагсаалтад идэвхтэй бол л', () => {
    const camps = [{ id: 'c1', isActive: true }, { id: 'c2', isActive: false }]
    expect(resolveLastCamp('c1', camps)).toBe('c1')
    expect(resolveLastCamp('c2', camps)).toBeNull()
    expect(resolveLastCamp('c9', camps)).toBeNull()
    expect(resolveLastCamp(null, camps)).toBeNull()
  })
})
