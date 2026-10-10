import type { MealType } from '../api/types'

/** Гараар ирц бүртгэхэд хоолны сонголт: анхдагч (ростер) | сонгосон | идэхгүй (NONE) */
export type MealMode = 'DEFAULT' | 'PICK' | 'NONE'

/**
 * API-д илгээх утга: DEFAULT → undefined (ростерын анхдагч; ээлжийн бус бол backend 400),
 * NONE → [] (идэхгүй), PICK → сонгосон (хоосон бол null = илгээх боломжгүй).
 */
export function mealsPayload(mode: MealMode, picked: MealType[]): MealType[] | undefined | null {
  if (mode === 'DEFAULT') return undefined
  if (mode === 'NONE') return []
  return picked.length > 0 ? picked : null
}
