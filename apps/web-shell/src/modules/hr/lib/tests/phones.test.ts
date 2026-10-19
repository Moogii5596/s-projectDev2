import { describe, expect, it } from 'vitest'
import { invalidPhones, joinPhones, splitPhones } from '../phones'

describe('phones (v0.2.3 Блок D)', () => {
  it('таслал, мөр шилжилт, олон зай → жагсаалт; буруу дугаар', () => {
    expect(splitPhones('88123354, 99435600\n80788684')).toEqual(['88123354', '99435600', '80788684'])
    expect(splitPhones('9911 2233')).toEqual(['99112233'])
    expect(splitPhones('')).toEqual([])
    expect(invalidPhones(['99112233', '123', '+8613800138000'])).toEqual(['123'])
    expect(joinPhones(['1', '2'])).toBe('1, 2')
    expect(joinPhones(undefined)).toBe('')
  })
})
