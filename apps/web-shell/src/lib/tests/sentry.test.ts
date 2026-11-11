import { describe, expect, it } from 'vitest'
import { maskPii, scrubEvent } from '../sentry'

describe('Sentry scrub (v0.2.5 H3 #18)', () => {
  it('имэйл, утас, токен нууцална', () => {
    expect(maskPii('bat@sino.mn 99112233 Bearer abc password=x')).toBe('b***@sino.mn 99****33 Bearer *** password=***')
  })

  it('хэрэглэгч = id, URL query/hash, breadcrumb data хасна', () => {
    const e = scrubEvent({
      type: undefined,
      request: { url: 'https://s/x?token=1#a', headers: { a: 'b' } },
      user: { id: 'u1', email: 'a@b.mn', ip_address: '1.1.1.1' },
      exception: { values: [{ value: 'fail for a@b.mn' }] },
      breadcrumbs: [{ message: 'm', data: { url: 'https://api/x?q=1', status_code: 500, body: 'secret' } }, { data: { foo: 1 } }],
    })
    expect(e.request).toEqual({ url: 'https://s/x' })
    expect(e.user).toEqual({ id: 'u1' })
    expect(e.exception?.values?.[0].value).toBe('fail for a***@b.mn')
    expect(e.breadcrumbs?.[0].data).toEqual({ url: 'https://api/x', status_code: 500 })
    expect(e.breadcrumbs?.[1].data).toBeUndefined()
  })
})
