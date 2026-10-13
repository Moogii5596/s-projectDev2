import { Injectable } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { assertDate } from '../../hr/attendance/range';
import type { AttendanceStayStore, NewStay, StayRow } from '../../hr/attendance/stay-store';
import { StayShiftGroup } from './camp-attendance.dto';
import { loadPresenceEmployees } from './camp-presence.service';
import { employeeDay } from './presence';

/**
 * v0.2.2 H1 (ADR-006 §5, H-Q2) — `camp_stays` (кемпэд байх хугацаа)-ийн хадгалалт. HR-ийн ирц энэ портоор
 * (`AttendanceStayStore`) нэг transaction дотор бичнэ — `CampHrBridge` бүртгэнэ.
 */
@Injectable()
export class CampStayStore implements AttendanceStayStore {
  findForPlanner(tx: Tx, tenantId: string, employeeIds: string[], since: Date): Promise<StayRow[]> {
    return tx.campStay.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, OR: [{ endDate: null }, { endDate: { gte: since } }] },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    });
  }

  async createMany(tx: Tx, rows: NewStay[]): Promise<void> {
    await tx.campStay.createMany({ data: rows });
  }

  async close(tx: Tx, tenantId: string, stayId: string, endDate: Date, departureMovementId: string): Promise<number> {
    const res = await tx.campStay.updateMany({ where: { id: stayId, tenantId, endDate: null }, data: { endDate, departureMovementId } });
    return res.count;
  }

  async undoArrival(tx: Tx, tenantId: string, arrivalMovementId: string): Promise<void> {
    await tx.campStay.deleteMany({ where: { tenantId, arrivalMovementId, departureMovementId: null } });
  }

  async undoDeparture(tx: Tx, tenantId: string, departureMovementId: string): Promise<void> {
    await tx.campStay.updateMany({ where: { tenantId, departureMovementId }, data: { endDate: null, departureMovementId: null } });
  }
}

/** D өдөр кемпэд байгаа (D-г хамарсан stay) ажилтнууд — ирсэн/явсан/бүтэн өдөр (`GET /camp/camps/:campId/stays`) */
@Injectable()
export class CampStaysService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  /**
   * D өдрийн ирцийн жагсаалт. v0.2.1 (C-14): мөр бүрт тооцоолсон ээлж `shiftGroup` (DAY | NIGHT | UNKNOWN | MOVEMENT —
   * хоолны тооцоотой ИЖИЛ `employeeDay`), албан тушаал, хоол авах эсэх (эффектив); `shift` өгвөл шүүнэ.
   */
  async listStays(tenantId: string, authId: string, campId: string, date: string, shift?: StayShiftGroup) {
    assertDate(date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const d = toDbDate(date);
      const rows = await tx.campStay.findMany({
        where: { tenantId, campId, startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] },
        select: {
          id: true, startDate: true, endDate: true,
          employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { code: true, name: true } }, crew: { select: { code: true } } } },
        },
        orderBy: { employee: { employeeCode: 'asc' } },
      });
      const { settings, employees } = await loadPresenceEmployees(tx, tenantId, campId, date);
      const info = new Map(
        employees.map((e) => {
          const day = employeeDay(e, date, settings);
          const shiftGroup: StayShiftGroup = !day ? 'UNKNOWN' : day.kind === 'MOVEMENT' ? 'MOVEMENT' : (day.shift ?? 'UNKNOWN');
          return [e.id, { shiftGroup, positionName: e.positionName ?? null, mealsIncluded: e.mealsIncluded !== false }] as const;
        }),
      );
      const out = rows.map((r) => {
        const start = fromDbDate(r.startDate);
        const end = r.endDate ? fromDbDate(r.endDate) : null;
        const i = info.get(r.employee.id);
        return {
          ...r,
          startDate: start,
          endDate: end,
          dayType: start === date ? 'ARRIVAL' : end === date ? 'DEPARTURE' : 'FULL_DAY',
          shiftGroup: i?.shiftGroup ?? ('UNKNOWN' as StayShiftGroup),
          positionName: i?.positionName ?? null,
          mealsIncluded: i?.mealsIncluded ?? true,
        };
      });
      return shift ? out.filter((r) => r.shiftGroup === shift) : out;
    });
  }
}
