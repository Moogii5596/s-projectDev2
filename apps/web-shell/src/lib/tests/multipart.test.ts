import { describe, expect, it } from 'vitest'
import { contentTypeFor, isFormData } from '../multipart'

describe('multipart (TEST-009)', () => {
  it('FormData → multipart/form-data; бусад → хэвээр', () => {
    const fd = new FormData()
    fd.append('images', new Blob(['x'], { type: 'image/png' }), 'a.png')
    expect(isFormData(fd)).toBe(true)
    expect(contentTypeFor(fd, 'application/json')).toBe('multipart/form-data')
    expect(contentTypeFor({ body: 'x' }, 'application/json')).toBe('application/json')
    expect(contentTypeFor(undefined, undefined)).toBeUndefined()
    expect(isFormData({ append: () => undefined })).toBe(false)
  })
})
