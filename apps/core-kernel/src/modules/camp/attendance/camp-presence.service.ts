import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { addDays } from './camp-date';
import { computePresence, PresenceEmployee, PresenceResult } from './presence';
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
  async compute(tx: Tx, tenantId: string, campId: string, date: string): Promise<PresenceResult> {
    const settings = await getRosterSettings(tx, tenantId, campId);
    const d = toDbDate(date);
    const prev = toDbDate(addDays(date, -1));
    const emps = await tx.campEmployee.findMany({
      where: { tenantId, campId, stays: { some: { startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: prev } }] } } },
      select: {
        id: true, employeeCode: true, fullName: true,
        department: { select: { code: true, mealLocationId: true, shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true } } } },
        crew: { select: { rosterAnchorDate: true } },
        shiftAdjustments: { where: { startDate: { lte: d }, endDate: { gte: prev } }, select: { startDate: true, endDate: true, shift: true } },
        stays: {
          where: { startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: prev } }] },
          select: { startDate: true, endDate: true, arrivalMovement: { select: { meals: true } }, departureMovement: { select: { meals: true } } },
        },
      },
    });
    const employees: PresenceEmployee[] = emps.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      departmentCode: e.department.code,
      departmentLocationId: e.department.mealLocationId,
      crewAnchor: e.crew ? fromDbDate(e.crew.rosterAnchorDate) : null,
      pattern: e.department.shiftPatterns,
      adjustments: e.shiftAdjustments.map((a) => ({ startDate: fromDbDate(a.startDate), endDate: fromDbDate(a.endDate), shift: a.shift })),
      stays: e.stays.map((s) => ({
        startDate: fromDbDate(s.startDate),
        endDate: s.endDate ? fromDbDate(s.endDate) : null,
        arrivalMeals: s.arrivalMovement.meals,
        departureMeals: s.departureMovement?.meals ?? null,
      })),
    }));
    return computePresence(employees, date, settings, settings.defaultMealLocationId);
  }
}
