import { CampMealType, CampShiftType } from '@prisma/client';

/** CAMP = кемпийн гал тогоо (settings.default_meal_location_id), DEPT = хэлтсийн байршил */
export type MealPlace = 'CAMP' | 'DEPT';
export interface MealSlot {
  meal: CampMealType;
  place: MealPlace;
}

const { BREAKFAST, LUNCH, DINNER, NIGHT } = CampMealType;

/**
 * Бүтэн өдрийн хоол (ERD v4 "Суурь тооцоо"):
 *   ӨДӨР  → Өглөө (кемп), Өдөр (хэлтэс), Орой (кемп)
 *   ШӨНӨ  → Өглөө (кемп), Орой (кемп), Шөнө (хэлтэс) [+ шөнийн эхний өдөр: Өдөр (кемп)]
 *   null  (тодорхойгүй) → Өглөө, Орой (кемп) — ажлын хоолыг таамаглахгүй, анхааруулга гарна
 */
export function fullDayMeals(shift: CampShiftType | null, firstNight: boolean): MealSlot[] {
  if (shift === CampShiftType.DAY) {
    return [{ meal: BREAKFAST, place: 'CAMP' }, { meal: LUNCH, place: 'DEPT' }, { meal: DINNER, place: 'CAMP' }];
  }
  if (shift === CampShiftType.NIGHT) {
    const base: MealSlot[] = [{ meal: BREAKFAST, place: 'CAMP' }, { meal: DINNER, place: 'CAMP' }, { meal: NIGHT, place: 'DEPT' }];
    return firstNight ? [...base, { meal: LUNCH, place: 'CAMP' }] : base;
  }
  return [{ meal: BREAKFAST, place: 'CAMP' }, { meal: DINNER, place: 'CAMP' }];
}

/** Ирэх/явах өдрийн (movement.meals) байршил: ажлын хоол (Өдөр, Шөнө) → хэлтэс, бусад → кемп */
export function movementMealSlots(meals: CampMealType[]): MealSlot[] {
  return meals.map((meal) => ({ meal, place: meal === LUNCH || meal === NIGHT ? 'DEPT' : 'CAMP' }));
}

/** Ростерын ирэх/явах өдрийн анхдагч хоол */
export const ROSTER_ARRIVAL_MEALS: CampMealType[] = [DINNER];
export const ROSTER_DEPARTURE_MEALS: CampMealType[] = [BREAKFAST];
