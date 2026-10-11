import { describe, expect, it } from 'vitest'
import { emptyGrid, gridToRows, parseTsv, pasteInto } from '../grid'
import { planRooms, roomNumbers } from '../room-range'

describe('grid (хүснэгтээр оруулах)', () => {
  it('parseTsv: Excel-ийн хуулбар (\\r\\n, tab, хашилттай мөр шилжилт, "" escape)', () => {
    expect(parseTsv('E1\tБат\r\nE2\t"Дорж\nДоржийн"\r\n')).toEqual([['E1', 'Бат'], ['E2', 'Дорж\nДоржийн']])
    expect(parseTsv('a\t"b ""c"""')).toEqual([['a', 'b "c"']])
  })

  it('pasteInto: сонгосон нүднээс, мөр нэмнэ, илүү баганыг хаяна, толгой мөрийг алгасна', () => {
    const g = emptyGrid(2, 3)
    const out = pasteInto(g, [['Код', 'Нэр'], ['E1', 'Бат'], ['E2', 'Дорж'], ['E3', 'Сараа']], 0, 0, ['Код', 'Нэр', 'Утас'])
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual(['E3', 'Сараа', ''])
    const mid = pasteInto(g, [['x', 'y', 'z', 'w']], 1, 1, ['a', 'b', 'c'])
    expect(mid[1]).toEqual(['', 'x', 'y'])
    expect(g[1]).toEqual(['', '', '']) // эх массив өөрчлөгдөхгүй
  })

  it('gridToRows: хоосон мөр хасна, trim', () => {
    expect(gridToRows([[' E1 ', 'Бат'], ['', ' '], ['E2', '']], ['employeeCode', 'fullName'])).toEqual([
      { employeeCode: 'E1', fullName: 'Бат' },
      { employeeCode: 'E2', fullName: '' },
    ])
  })
})


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
