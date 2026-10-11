import { describe, expect, it, vi } from 'vitest'
import { apiErrorMessage, displayLogin, handlePasswordChangeRequired, isPasswordChangeRequired } from '../password-change'

describe('password-change (v0.2.2 D-06)', () => {
  it('isPasswordChangeRequired: зөвхөн 403 + code', () => {
    expect(isPasswordChangeRequired({ response: { status: 403, data: { code: 'auth.password_change_required' } } })).toBe(true)
    expect(isPasswordChangeRequired({ response: { status: 403, data: { code: 'error.forbidden' } } })).toBe(false)
    expect(isPasswordChangeRequired({ response: { status: 401, data: { code: 'auth.password_change_required' } } })).toBe(false)
    expect(isPasswordChangeRequired(null)).toBe(false)
  })

  it('handlePasswordChangeRequired: аль хэдийн тэнд бол шилжихгүй (давталтгүй)', () => {
    const redirect = vi.fn()
    handlePasswordChangeRequired({ currentPath: () => '/camp', redirect })
    expect(redirect).toHaveBeenCalledWith('/change-password')
    redirect.mockClear()
    handlePasswordChangeRequired({ currentPath: () => '/change-password', redirect })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('apiErrorMessage: string / массив / хоосон → fallback', () => {
    expect(apiErrorMessage({ message: 'Буруу' }, 'x')).toBe('Буруу')
    expect(apiErrorMessage({ message: ['a', 'b'] }, 'x')).toBe('a, b')
    expect(apiErrorMessage({}, 'x')).toBe('x')
    expect(apiErrorMessage(null, 'x')).toBe('x')
  })
})

describe('displayLogin', () => {
  it('нэр → username → утас → жинхэнэ имэйл; .login.invalid хэзээ ч үгүй', () => {
    expect(displayLogin({ fullName: 'Бат', email: 'b@x' })).toBe('Бат')
    expect(displayLogin({ username: 'sh1023', email: 'p1@t.login.invalid' })).toBe('sh1023')
    expect(displayLogin({ phone: '99112233', email: 'p1@t.login.invalid' })).toBe('99112233')
    expect(displayLogin({ email: 'p1@t.login.invalid' })).toBe('')
    expect(displayLogin(null, 'a@x')).toBe('a@x')
  })
})
