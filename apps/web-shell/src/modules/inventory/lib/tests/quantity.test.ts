import { describe, expect, it } from 'vitest'
import { applyDelta, formatQuantity, parseDelta, parseQuantity } from '../quantity'

describe('inventory quantity (numeric(15,3), float-гүй)', () => {
  it('parseQuantity: хоосон → 0; таслал → цэг; илүү тэг арилна', () => {
    expect(parseQuantity('')).toEqual({ ok: true, value: '0' })
    expect(parseQuantity(' 12,50 ')).toEqual({ ok: true, value: '12.5' })
    expect(parseQuantity('007')).toEqual({ ok: true, value: '7' })
    expect(parseQuantity('0.125')).toEqual({ ok: true, value: '0.125' })
  })

  it('parseQuantity: сөрөг, 4 орон бутархай, үсэг → алдаа', () => {
    for (const bad of ['-1', '1.2345', 'abc', '1e3', '1.', '.5']) {
      expect(parseQuantity(bad).ok, bad).toBe(false)
    }
  })

  it('parseDelta: +/− зөвшөөрнө, 0 болон хоосон → алдаа', () => {
    expect(parseDelta('+10')).toEqual({ ok: true, value: '10' })
    expect(parseDelta('-2,5')).toEqual({ ok: true, value: '-2.5' })
    expect(parseDelta('0').ok).toBe(false)
    expect(parseDelta('-0.000').ok).toBe(false)
    expect(parseDelta('').ok).toBe(false)
    expect(parseDelta('1.0001').ok).toBe(false)
  })

  it('applyDelta: бутархай алдаагүй; сөрөг болохыг илрүүлнэ (backend CHECK-тэй ижил)', () => {
    expect(applyDelta('0.1', '0.2')).toEqual({ next: '0.3', negative: false })
    expect(applyDelta('5', '-5')).toEqual({ next: '0', negative: false })
    expect(applyDelta('5', '-5.001')).toEqual({ next: '-0.001', negative: true })
    expect(applyDelta('999999999999.999', '0.001')).toEqual({ next: '1000000000000', negative: false })
  })

  it('formatQuantity: мянгатын зай, буруу утга → —', () => {
    expect(formatQuantity('1234567.5')).toBe('1 234 567.5')
    expect(formatQuantity('1000.000')).toBe('1 000')
    expect(formatQuantity('-1234')).toBe('-1 234')
    expect(formatQuantity('0')).toBe('0')
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity('x')).toBe('—')
  })
})
