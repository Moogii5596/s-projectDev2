import type { MealLocation, PositionSetting, ValueSource } from '../api/types'

/** Ажилтанд тохируулаагүй үед авах утга (Q1): албан тушаал(кемп) ?? кемпийн анхдагч */
export function inherited(
  positionId: string | null | undefined,
  settings: PositionSetting[] | undefined,
  defaultLocation: MealLocation | undefined,
): { locationName: string | null; mealsIncluded: boolean; from: ValueSource } {
  const p = positionId ? settings?.find((s) => s.positionId === positionId) : undefined
  return {
    locationName: p?.mealLocationName ?? defaultLocation?.name ?? null,
    mealsIncluded: p?.mealsIncluded ?? true,
    from: p && (p.mealLocationId || p.mealsIncluded !== null) ? 'POSITION' : 'DEFAULT',
  }
}

