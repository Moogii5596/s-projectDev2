import { describe, expect, it } from 'vitest'
import { emptyGrid, gridToRows, parseTsv, pasteInto } from '../grid'

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
