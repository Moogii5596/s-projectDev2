/**
 * v0.2.3 Блок R4.4–R4.6 — PREVIEW хүснэгт: шүүлт, засварын payload
 */
import { describe, expect, it } from 'vitest'
import type { ImportPreview, ImportRow } from '../../../camp/api/types'
import { buildEdits, defaultFilter, deleteErrorRowsEdits, fileName, filterCounts, filterRows, pickerQuery, rowPlace } from '../import-rows'

const src = { sheet: '2026.11.04 A ирэх', row: 7, idRaw: 'NEW', idType: 'NEW' as const, lastName: 'Бат', firstName: 'Дорж', crew: 'A', extendDays: null }
const r = (row: number, p: Partial<ImportRow> = {}): ImportRow => ({
  row, employeeCode: `E${row}`, employeeId: `id${row}`, date: '2026-11-04', direction: 'ARRIVAL', kind: 'ROSTER', meals: ['DINNER'], shift: null, errors: [], ...p,
})
const rows = [r(1), r(2, { errors: ['x'] }), r(3, { warnings: ['w'] }), r(4, { errors: ['y'], deleted: true }), r(5, { errors: ['z'], warnings: ['w'] })]

describe('filterRows / filterCounts', () => {
  it('алдаатай / анхааруулгатай — устгасан мөрийг тооцохгүй; бүгд — бүгд', () => {
    expect(filterRows(rows, 'errors').map((x) => x.row)).toEqual([2, 5])
    expect(filterRows(rows, 'warnings').map((x) => x.row)).toEqual([3, 5])
    expect(filterRows(rows, 'all')).toHaveLength(5)
    expect(filterCounts(rows)).toEqual({ errors: 2, warnings: 2, all: 5 })
  })

  it('defaultFilter: алдаа → анхааруулга → бүгд', () => {
    const p = (rs: ImportRow[]) => ({ rows: rs }) as unknown as ImportPreview
    expect(defaultFilter(p(rows))).toBe('errors')
    expect(defaultFilter(p([r(1), r(3, { warnings: ['w'] })]))).toBe('warnings')
    expect(defaultFilter(p([r(1), r(4, { errors: ['y'], deleted: true })]))).toBe('all')
  })
})

describe('эх мөр', () => {
  it('ShiftChange → хуудас · мөр, файлын нэр, хайлт = нэр; «Ирц» загвар → мөр, код', () => {
    expect(rowPlace(r(1, { source: src }))).toBe('2026.11.04 A ирэх · 7')
    expect(fileName(r(1, { source: src }))).toBe('Бат Дорж')
    expect(pickerQuery(r(1, { source: src }))).toBe('Дорж')
    expect(pickerQuery(r(1, { source: { ...src, firstName: '' } }))).toBe('Бат')
    expect([rowPlace(r(9)), fileName(r(9)), pickerQuery(r(9))]).toEqual(['9', '', 'E9'])
  })
})

describe('buildEdits / deleteErrorRowsEdits', () => {
  it('өөрчлөгдсөн мөр л; устгах давуу; ижил ажилтан → алгасна; сэргээх', () => {
    expect(
      buildEdits(rows, {
        1: { employeeId: 'id1' },               // ижил → алгасна
        2: { employeeId: 'idX' },
        3: { employeeId: 'idY', deleted: true }, // устгах давуу
        4: { deleted: false },                  // сэргээх
        5: { deleted: false },                  // устгаагүй → өөрчлөлтгүй
      }),
    ).toEqual([{ row: 2, employeeId: 'idX' }, { row: 3, deleted: true }, { row: 4, deleted: false }])
  })

  it('алдаатай (устгаагүй) бүх мөр', () => {
    expect(deleteErrorRowsEdits(rows)).toEqual([{ row: 2, deleted: true }, { row: 5, deleted: true }])
  })
})
