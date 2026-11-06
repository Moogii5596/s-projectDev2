import type { MealOrderLineView, MealOrderStatus } from '../api/meal-order-types'
import type { MealType } from '../api/types'

/** Хоолны захиалгын хүснэгтийн (байршил × хоол) цэвэр функцүүд — Блок 6а */
export const MEAL_TYPES: readonly MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT']

export const cellKey = (mealType: MealType, mealLocationId: string): string => `${mealType}|${mealLocationId}`

export type Grid = Record<string, number>

export const linesToGrid = (lines: ReadonlyArray<MealOrderLineView>): Grid => {
  const g: Grid = {}
  for (const l of lines) g[cellKey(l.mealType, l.mealLocationId)] = l.baseCount
  return g
}

/** Зөвхөн 0-ээс их нүд мөр болно (хоосон нүд = мөр алга) */
export const gridToLines = (g: Grid): MealOrderLineView[] =>
  Object.entries(g)
    .filter(([, n]) => Number.isInteger(n) && n > 0)
    .map(([k, baseCount]) => {
      const [mealType, mealLocationId] = k.split('|') as [MealType, string]
      return { mealType, mealLocationId, baseCount }
    })
    .sort((a, b) => cellKey(a.mealType, a.mealLocationId).localeCompare(cellKey(b.mealType, b.mealLocationId)))

export const gridTotal = (g: Grid): number => Object.values(g).reduce((a, n) => a + (Number.isInteger(n) && n > 0 ? n : 0), 0)

/** Хоёр хүснэгт ижил эсэх (0 ба хоосон нүд ижил) */
export const sameGrid = (a: Grid, b: Grid): boolean => {
  const x = gridToLines(a)
  const y = gridToLines(b)
  return x.length === y.length && x.every((l, i) => l.mealType === y[i].mealType && l.mealLocationId === y[i].mealLocationId && l.baseCount === y[i].baseCount)
}

export const STATUS_TONE: Record<MealOrderStatus, 'gray' | 'blue' | 'green' | 'red' | 'yellow'> = {
  DRAFT: 'gray',
  ORDERED: 'blue',
  ACCEPTED: 'green',
  REJECTED: 'red',
  CHANGE_REQUESTED: 'yellow',
}
