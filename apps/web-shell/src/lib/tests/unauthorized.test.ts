/**
 * [FE-007] 401 → локал session устгаад /login (давталтгүй)
 */
import { describe, expect, it, vi } from 'vitest'
import { handleUnauthorized, isSessionRevoked } from '../unauthorized'

function deps(path: string, signOutFails = false) {
  const order: string[] = []
  return {
    order,
    d: {
      signOutLocal: vi.fn(async () => {
        order.push('signOut')
        if (signOutFails) throw new Error('storage')
      }),
      currentPath: () => path,
      redirect: vi.fn((p: string) => { order.push(`redirect:${p}`) }),
    },
  }
}

describe('handleUnauthorized [FE-007]', () => {
  it('эхлээд локал session устгаад дараа нь /login (давталтын шалтгаан: session үлддэг байсан)', async () => {
    const { d, order } = deps('/camp/abc/attendance')
    await handleUnauthorized(d)
    expect(order).toEqual(['signOut', 'redirect:/login'])
  })

  it('аль хэдийн /login дээр бол дахин шилжихгүй', async () => {
    const { d } = deps('/login')
    await handleUnauthorized(d)
    expect(d.signOutLocal).toHaveBeenCalledTimes(1)
    expect(d.redirect).not.toHaveBeenCalled()
  })

  it('signOut алдаа өгсөн ч /login руу явна', async () => {
    const { d } = deps('/camp', true)
    await handleUnauthorized(d)
    expect(d.redirect).toHaveBeenCalledWith('/login')
  })
})

describe('isSessionRevoked (v0.2.2 Блок 6б, №3)', () => {
  const err = (status: number, code?: string) => ({ response: { status, data: code ? { code } : {} } })
  it('403 auth.not_member / camp.err.access.1 → true; бусад 403, 401, алдаагүй → false', () => {
    expect(isSessionRevoked(err(403, 'auth.not_member'))).toBe(true)
    expect(isSessionRevoked(err(403, 'camp.err.access.1'))).toBe(true)
    expect(isSessionRevoked(err(403, 'camp.err.access.2'))).toBe(false)
    expect(isSessionRevoked(err(403))).toBe(false)
    expect(isSessionRevoked(err(401, 'auth.not_member'))).toBe(false)
    expect(isSessionRevoked(null)).toBe(false)
  })
})
