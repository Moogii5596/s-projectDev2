import { describe, expect, it } from 'vitest'
import { cellKind, daySpan, rangeProblem } from '../calendar'
import { pivotPresence } from '../presence'
import { mealsPayload } from '../meals'
import type { CalendarCell } from '../../api/types'

const cell = (p: Partial<CalendarCell>): CalendarCell => ({ date: '2026-10-10', shift: null, source: 'UNKNOWN', dayNo: null, presence: null, ...p })

describe('calendar.cellKind (ростер 14+14: 0 = ирэх, 15 = явах)', () => {
  it('ээлжтэй нүд → DAY/NIGHT (зохицуулалт ч мөн)', () => {
    expect(cellKind(cell({ shift: 'DAY', source: 'PATTERN', dayNo: 3 }), 14)).toBe('DAY')
    expect(cellKind(cell({ shift: 'NIGHT', source: 'ADJUSTMENT', dayNo: 0 }), 14)).toBe('NIGHT')
  })
  it('ростерын 0 / 15 / амралт / тодорхойгүй', () => {
    expect(cellKind(cell({ dayNo: 0 }), 14)).toBe('ARRIVE_TRAVEL')
    expect(cellKind(cell({ dayNo: 15 }), 14)).toBe('LEAVE_TRAVEL')
    expect(cellKind(cell({ dayNo: 20 }), 14)).toBe('OFF')
    expect(cellKind(cell({ dayNo: 27 }), 14)).toBe('OFF')
    // ажлын өдөр боловч загварт өдөр алга (хэлтэс загваргүй) → тодорхойгүй
    expect(cellKind(cell({ dayNo: 5 }), 14)).toBe('UNKNOWN')
    // багагүй, нэг ээлжгүй загвар
    expect(cellKind(cell({ dayNo: null }), 14)).toBe('UNKNOWN')
  })
  it('ростер 10+18: явах = 11-р өдөр', () => {
    expect(cellKind(cell({ dayNo: 11 }), 10)).toBe('LEAVE_TRAVEL')
    expect(cellKind(cell({ dayNo: 12 }), 10)).toBe('OFF')
  })
})

describe('calendar.rangeProblem', () => {
  it('хоног тоолох (хоёр талыг хамруулна), сар дамнах', () => {
    expect(daySpan('2026-10-01', '2026-10-01')).toBe(1)
    expect(daySpan('2026-10-25', '2026-11-07')).toBe(14)
  })
  it('хоосон / урвуу / хэтэрсэн муж', () => {
    expect(rangeProblem('', '2026-10-01', 31)).toBe('Огноо сонгоно уу')
    expect(rangeProblem('2026-10-05', '2026-10-01', 31)).toContain('өмнө')
    expect(rangeProblem('2026-10-01', '2026-11-01', 31)).toContain('31 хоногоос')
    expect(rangeProblem('2026-10-01', '2026-10-31', 31)).toBeNull()
  })
})

describe('presence.pivotPresence', () => {
  it('хоол × байршил, хоосон нүд 0, мөр/баганын нийлбэр, байршилгүй сүүлд', () => {
    const p = pivotPresence([
      { mealType: 'DINNER', mealLocationId: 'k', mealLocationName: 'Кемпийн гал тогоо', count: 7 },
      { mealType: 'BREAKFAST', mealLocationId: 'k', mealLocationName: 'Кемпийн гал тогоо', count: 6 },
      { mealType: 'LUNCH', mealLocationId: 'u', mealLocationName: 'Уулын хэсэг', count: 4 },
      { mealType: 'LUNCH', mealLocationId: 'k', mealLocationName: 'Кемпийн гал тогоо', count: 2 },
      { mealType: 'BREAKFAST', mealLocationId: null, mealLocationName: null, count: 1 },
    ])
    expect(p.columns.map((c) => c.name)).toEqual(['Кемпийн гал тогоо', 'Уулын хэсэг', 'Байршилгүй'])
    expect(p.rows.map((r) => r.meal)).toEqual(['BREAKFAST', 'LUNCH', 'DINNER'])
    expect(p.rows[0]).toEqual({ meal: 'BREAKFAST', counts: [6, 0, 1], total: 7 })
    expect(p.rows[1].counts).toEqual([2, 4, 0])
    expect(p.columnTotals).toEqual([15, 4, 1])
    expect(p.grandTotal).toBe(20)
  })
  it('хоосон өдөр', () => {
    expect(pivotPresence([])).toEqual({ columns: [], rows: [], columnTotals: [], grandTotal: 0 })
  })
})

describe('meals.mealsPayload', () => {
  it('анхдагч → undefined (илгээхгүй), идэхгүй → [], сонгосон → массив, хоосон сонголт → null (хадгалах хаалттай)', () => {
    expect(mealsPayload('DEFAULT', ['LUNCH'])).toBeUndefined()
    expect(mealsPayload('NONE', ['LUNCH'])).toEqual([])
    expect(mealsPayload('PICK', ['BREAKFAST', 'DINNER'])).toEqual(['BREAKFAST', 'DINNER'])
    expect(mealsPayload('PICK', [])).toBeNull()
  })
})
