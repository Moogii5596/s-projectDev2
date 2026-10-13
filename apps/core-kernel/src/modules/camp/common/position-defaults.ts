import type { Tx } from './camp-tx';
import type { PatternSegment } from '../../hr/attendance/shift-resolver';

/** v0.2.2 H1: camp-presence-оос салгав — HR (ажилтны эффектив утга) ба Кемп (хоолны тоо) хоёулаа ашиглана. v0.3-т ажилтан ↔ кемпийн тохиргоо салахад дахин харна. */
/** Кемп × албан тушаалын анхдагч (v0.2.1) — positionId → {байршил, хоол, ээлжийн загвар} */
export type PositionDefaults = Map<string, { mealLocationId: string | null; mealsIncluded: boolean | null; pattern: PatternSegment[] }>;

export async function loadPositionDefaults(tx: Tx, tenantId: string, campId: string): Promise<PositionDefaults> {
  const rows = await tx.campPositionSetting.findMany({
    where: { tenantId, campId },
    select: { positionId: true, mealLocationId: true, mealsIncluded: true, shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true }, orderBy: { dayFrom: 'asc' } } },
  });
  return new Map(rows.map((r) => [r.positionId, { mealLocationId: r.mealLocationId, mealsIncluded: r.mealsIncluded, pattern: r.shiftPatterns }]));
}

/**
 * Ажилтны ЭФФЕКТИВ утга (Q1, Д-1, Д-2): ажилтан ?? албан тушаал(кемп) ?? анхдагч.
 *   хоолны байршил → null (= кемпийн анхдагч) · хоол авах → тийм · ээлжийн загвар → хэлтсийнх
 */
export function effectiveEmployee(
  e: { positionId: string | null; mealLocationId: string | null; mealsIncluded: boolean | null },
  defaults: PositionDefaults,
  departmentPattern: PatternSegment[],
): { workMealLocationId: string | null; mealsIncluded: boolean; pattern: PatternSegment[] } {
  const p = e.positionId ? defaults.get(e.positionId) : undefined;
  return {
    workMealLocationId: e.mealLocationId ?? p?.mealLocationId ?? null,
    mealsIncluded: e.mealsIncluded ?? p?.mealsIncluded ?? true,
    pattern: p && p.pattern.length > 0 ? p.pattern : departmentPattern,
  };
}
