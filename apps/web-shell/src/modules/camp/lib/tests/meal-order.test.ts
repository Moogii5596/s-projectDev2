import { describe, expect, it } from 'vitest'
import { cellKey, gridToLines, gridTotal, linesToGrid, sameGrid } from '../meal-order'

describe('meal-order grid', () => {
  const lines = [
    { mealType: 'LUNCH' as const, mealLocationId: 'b', baseCount: 20 },
    { mealType: 'BREAKFAST' as const, mealLocationId: 'a', baseCount: 10 },
  ]
  it('linesToGrid ↔ gridToLines (эрэмбэтэй, 0 алгасна)', () => {
    const g = linesToGrid(lines)
    expect(g[cellKey('LUNCH', 'b')]).toBe(20)
    expect(gridToLines({ ...g, [cellKey('DINNER', 'a')]: 0 })).toEqual([lines[1], lines[0]])
  })
  it('gridTotal буруу утгыг тооцохгүй', () => {
    expect(gridTotal({ x: 5, y: -1, z: 2.5, w: 3 })).toBe(8)
  })
  it('sameGrid: 0 ба хоосон нүд ижил', () => {
    expect(sameGrid({ [cellKey('LUNCH', 'b')]: 20, q: 0 }, { [cellKey('LUNCH', 'b')]: 20 })).toBe(true)
    expect(sameGrid({ [cellKey('LUNCH', 'b')]: 20 }, { [cellKey('LUNCH', 'b')]: 21 })).toBe(false)
  })
})
