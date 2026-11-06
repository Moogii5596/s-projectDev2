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

describe('R9 — шинэ ажилтан бүртгэх', () => {
  const org = (id: string, orgType: 'MAIN' | 'CONTRACTOR', isActive = true) => ({ id, name: id, orgType, isActive }) as unknown as import('../../../camp/api/types').Organization
  const dept = (id: string, code: string, name: string, isActive = true) => ({ id, code, name, isActive }) as unknown as import('../../../camp/api/types').Department
  const crew = (id: string, code: string, isActive = true) => ({ id, code, isActive }) as unknown as import('../../../camp/api/types').Crew
  const depts = [dept('d1', 'MINE', 'Уул'), dept('d2', 'ADM', 'Захиргаа'), dept('d3', 'OLD', 'Хуучин', false)]
  const crews = [crew('c1', 'A'), crew('c2', 'B'), crew('c9', 'D', false)]

  it('хэлтэс (код / нэр, жижиг том үсэг, зай), баг (код); идэвхгүй / таарахгүй → хоосон', async () => {
    const { matchDepartment, matchCrew } = await import('../import-rows')
    expect([matchDepartment(' уул ', depts), matchDepartment('adm', depts), matchDepartment('Хуучин', depts), matchDepartment('', depts), matchDepartment(undefined, depts)]).toEqual(['d1', 'd2', '', '', ''])
    expect([matchCrew('a', crews), matchCrew('D', crews), matchCrew(null, crews), matchCrew('TIRE', crews)]).toEqual(['c1', '', '', ''])
  })

  it('анхдагч байгууллага: ганц MAIN → түүнийг; хоёр MAIN → хоосон; ганц байгууллага → түүнийг', async () => {
    const { defaultOrganization } = await import('../import-rows')
    expect(defaultOrganization([org('m', 'MAIN'), org('k', 'CONTRACTOR')])).toBe('m')
    expect(defaultOrganization([org('m1', 'MAIN'), org('m2', 'MAIN')])).toBe('')
    expect(defaultOrganization([org('k', 'CONTRACTOR')])).toBe('k')
    expect(defaultOrganization([org('m', 'MAIN', false), org('k', 'CONTRACTOR'), org('k2', 'CONTRACTOR')])).toBe('')
  })

  it('buildEdits: «шинэ» + бөглөсөн → newEmployee (баг хоосон → null); дутуу → алгасна, incompleteNew тоолно; устгах давуу', async () => {
    const { incompleteNew, canRegisterNew, newEmployeeDefaults } = await import('../import-rows')
    const drafts = {
      2: { mode: 'new' as const, newEmployee: { organizationId: 'o', departmentId: 'd1', crewId: '' } },
      5: { mode: 'new' as const, newEmployee: { organizationId: 'o', departmentId: '', crewId: 'c1' } },
      3: { mode: 'new' as const, deleted: true, newEmployee: { organizationId: 'o', departmentId: 'd1', crewId: '' } },
    }
    expect(buildEdits(rows, drafts)).toEqual([{ row: 2, newEmployee: { organizationId: 'o', departmentId: 'd1', crewId: null } }, { row: 3, deleted: true }])
    expect(incompleteNew(drafts)).toBe(1)
    expect([canRegisterNew(r(1, { source: src })), canRegisterNew(r(1))]).toEqual([true, false])
    expect(newEmployeeDefaults(r(1, { source: { ...src, department: 'Уул', crew: 'A' } }), [org('m', 'MAIN')], depts, crews)).toEqual({ organizationId: 'm', departmentId: 'd1', crewId: 'c1' })
  })
})
