import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { addDays } from './camp-date';
import { computePresence, PresenceEmployee, PresenceResult } from './presence';
import type { PatternSegment } from './shift-resolver';
import { assertDate } from './range';

/** D өдрийн хоолны суурь тоо (Шат 3.5) — V2-ийн хоолны захиалга (Шат 6, D8) үүнийг ашиглана */
@Injectable()
export class CampPresenceService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async presence(tenantId: string, authId: string, campId: string, date: string) {
    assertDate(date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const result = await this.compute(tx, tenantId, campId, date);
      const locs = await tx.campMealLocation.findMany({ where: { tenantId, campId }, select: { id: true, name: true } });
      const name = new Map(locs.map((l) => [l.id, l.name]));
      return {
        ...result,
        lines: result.lines.map((l) => ({ ...l, mealLocationName: l.mealLocationId ? (name.get(l.mealLocationId) ?? null) : null })),
      };
    });
  }

  /** Transaction дотроос дуудагдана (V2: Шат 6 захиалга үүсгэхэд дахин ашиглана) */
  compute(tx: Tx, tenantId: string, campId: string, date: string): Promise<PresenceResult> {
    return loadPresence(tx, tenantId, campId, date);
  }
}

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

/**
 * D өдрийн хоолны суурь тоо — DB-ээс ачаалж тооцно (API + `camp:snapshot` CLI, v0.2.0 §0.2).
 * `legacy` — v0.2.0-ийн schema (албан тушаал/ажилтны хоолны багана алга): хэлтсийн байршлаар (staging snapshot A).
 */
export async function loadPresence(tx: Tx, tenantId: string, campId: string, date: string, opts: { legacy?: boolean } = {}): Promise<PresenceResult> {
  const { settings, employees } = await loadPresenceEmployees(tx, tenantId, campId, date, opts);
  return computePresence(employees, date, settings, settings.defaultMealLocationId);
}

/** D (ба D−1) өдөр кемпэд байсан ажилтнууд — эффектив утгатай (хоолны тооцоо + ирцийн жагсаалтын ээлж, C-14) */
export async function loadPresenceEmployees(
  tx: Tx,
  tenantId: string,
  campId: string,
  date: string,
  opts: { legacy?: boolean } = {},
): Promise<{ settings: Awaited<ReturnType<typeof getRosterSettings>>; employees: PresenceEmployee[] }> {
  const settings = await getRosterSettings(tx, tenantId, campId);
  const d = toDbDate(date);
  const prev = toDbDate(addDays(date, -1));
  const stayWhere = { startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: prev } }] };
  const base = {
    id: true, employeeCode: true, fullName: true, position: true,
    department: { select: { code: true, mealLocationId: true, shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true } } } },
    crew: { select: { rosterAnchorDate: true } },
    shiftAdjustments: { where: { startDate: { lte: d }, endDate: { gte: prev } }, select: { startDate: true, endDate: true, shift: true } },
    stays: {
      where: stayWhere,
      select: { startDate: true, endDate: true, arrivalMovement: { select: { meals: true } }, departureMovement: { select: { meals: true } } },
    },
  } as const;
  const emps = opts.legacy
    ? (await tx.campEmployee.findMany({ where: { tenantId, campId, stays: { some: stayWhere } }, select: base })).map((e) => ({
        ...e, positionId: null, mealLocationId: e.department.mealLocationId, mealsIncluded: null, positionRef: null,
      }))
    : await tx.campEmployee.findMany({
        where: { tenantId, campId, stays: { some: stayWhere } },
        select: { ...base, positionId: true, mealLocationId: true, mealsIncluded: true, positionRef: { select: { name: true } } },
      });
  const defaults = opts.legacy ? (new Map() as PositionDefaults) : await loadPositionDefaults(tx, tenantId, campId);
  const employees: PresenceEmployee[] = emps.map((e) => {
    const eff = effectiveEmployee(e, defaults, e.department.shiftPatterns);
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      departmentCode: e.department.code,
      positionName: e.positionRef?.name ?? e.position ?? null,
      workMealLocationId: eff.workMealLocationId,
      mealsIncluded: eff.mealsIncluded,
      crewAnchor: e.crew ? fromDbDate(e.crew.rosterAnchorDate) : null,
      pattern: eff.pattern,
      adjustments: e.shiftAdjustments.map((a) => ({ startDate: fromDbDate(a.startDate), endDate: fromDbDate(a.endDate), shift: a.shift })),
      stays: e.stays.map((s) => ({
        startDate: fromDbDate(s.startDate),
        endDate: s.endDate ? fromDbDate(s.endDate) : null,
        arrivalMeals: s.arrivalMovement.meals,
        departureMeals: s.departureMovement?.meals ?? null,
      })),
    };
  });
  return { settings, employees };
}
