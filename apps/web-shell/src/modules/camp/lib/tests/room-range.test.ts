import { describe, expect, it } from 'vitest'
import { planRooms, roomNumbers } from '../room-range'

describe('room-range (FB-07)', () => {
  it('дугаар: угтвар + тэгээр дүүргэх', () => {
    expect(roomNumbers({ from: 1, to: 3, prefix: '7-', padTo: 2 })).toEqual(['7-01', '7-02', '7-03'])
    expect(roomNumbers({ from: 9, to: 10 })).toEqual(['9', '10'])
  })
  it('planRooms: байгааг алгасна, муж/хязгаар', () => {
    expect(planRooms({ from: 1, to: 3, prefix: 'A' }, ['A2'])).toMatchObject({ ok: true, create: ['A1', 'A3'], skip: ['A2'] })
    expect(planRooms({ from: 5, to: 1 }, [])).toEqual({ ok: false, reason: 'range' })
    expect(planRooms({ from: 1, to: 501 }, [])).toEqual({ ok: false, reason: 'too_many', n: 501 })
  })
})
