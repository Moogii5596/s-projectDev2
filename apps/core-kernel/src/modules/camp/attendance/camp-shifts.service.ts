import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CampEmployeeStatus, CampShiftAdjustmentReason } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { coversDay, eachDay } from './camp-date';
import { resolveShift } from './shift-resolver';
import { assertRange } from './range';
import { CalendarQueryDto, CreateShiftAdjustmentsDto, RangeQueryDto } from './camp-attendance.dto';

const P = CAMP_PERMISSIONS;
const MAX_ADJ_DAYS = 366;
const MAX_CALENDAR_DAYS = 31;

/** Ээлжийн зохицуулалт (бөөнөөр) + ээлжийн календарь (Шат 3.2) */
@Injectable()
export class CampShiftsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async listAdjustments(tenantId: string, authId: string, campId: string, q: RangeQueryDto) {
    assertRange(q.from, q.to, MAX_ADJ_DAYS);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const rows = await tx.campShiftAdjustment.findMany({
        where: {
          tenantId, employee: { campId }, startDate: { lte: toDbDate(q.to) }, endDate: { gte: toDbDate(q.from) },
          ...(q.employeeId ? { employeeId: q.employeeId } : {}),
        },
        select: {
          id: true, startDate: true, endDate: true, shift: true, reasonType: true, reason: true, createdAt: true,
          employee: { select: { id: true, employeeCode: true, fullName: true } },
          createdByUser: { select: { email: true, fullName: true } },
        },
        orderBy: [{ startDate: 'asc' }, { employee: { employeeCode: 'asc' } }],
      });
      return rows.map((r) => ({ ...r, startDate: fromDbDate(r.startDate), endDate: fromDbDate(r.endDate) }));
    });
  }

  /** Олон ажилтанд нэг дор. Нэг нь ч давхцвал бүгд татгалзана (409, кодуудыг нэрлэнэ) */
  async createAdjustments(tenantId: string, authId: string, campId: string, dto: CreateShiftAdjustmentsDto) {
    assertRange(dto.startDate, dto.endDate, MAX_ADJ_DAYS);
    if (dto.reasonType === CampShiftAdjustmentReason.OTHER && !dto.reason) throw new BadRequestException('reasonType OTHER үед reason заавал');
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorId = await this.access.require(tx, tenantId, authId, campId, P.SHIFT_ADJUST);
        await getCampOr404(tx, tenantId, campId);
        const emps = await tx.campEmployee.findMany({ where: { tenantId, campId, id: { in: dto.employeeIds } }, select: { id: true, employeeCode: true, status: true } });
        if (emps.length !== dto.employeeIds.length) throw new BadRequestException(`${dto.employeeIds.length - emps.length} ажилтан энэ кемпэд олдсонгүй`);
        const inactive = emps.filter((e) => e.status !== CampEmployeeStatus.ACTIVE);
        if (inactive.length > 0) throw new BadRequestException(`Идэвхгүй ажилтан: ${inactive.map((e) => e.employeeCode).join(', ')}`);
        const clashes = await tx.campShiftAdjustment.findMany({
          where: { tenantId, employeeId: { in: dto.employeeIds }, startDate: { lte: toDbDate(dto.endDate) }, endDate: { gte: toDbDate(dto.startDate) } },
          select: { startDate: true, endDate: true, employee: { select: { employeeCode: true } } },
        });
        if (clashes.length > 0) {
          throw new ConflictException(
            `Давхцах зохицуулалт байна: ${clashes.map((c) => `${c.employee.employeeCode} (${fromDbDate(c.startDate)} – ${fromDbDate(c.endDate)})`).join(', ')}`,
          );
        }
        await tx.campShiftAdjustment.createMany({
          data: dto.employeeIds.map((employeeId) => ({
            tenantId, employeeId, startDate: toDbDate(dto.startDate), endDate: toDbDate(dto.endDate), shift: dto.shift,
            reasonType: dto.reasonType, reason: dto.reason ?? null, createdBy: actorId,
          })),
        });
        return { created: dto.employeeIds.length };
      }),
    );
  }

  async deleteAdjustment(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.require(tx, tenantId, authId, campId, P.SHIFT_ADJUST);
      const row = await tx.campShiftAdjustment.findFirst({ where: { id, tenantId, employee: { campId } }, select: { id: true } });
      if (!row) throw new NotFoundException('Зохицуулалт олдсонгүй');
      await tx.campShiftAdjustment.delete({ where: { id } });
      return { deleted: true };
    });
  }

  /** Ажилтан × өдөр: ээлж (эх сурвалжтай), ростерын өдөр, кемпэд байгаа эсэх — frontend-ийн цагийн бүртгэлийн календарь */
  async calendar(tenantId: string, authId: string, campId: string, q: CalendarQueryDto) {
    assertRange(q.from, q.to, MAX_CALENDAR_DAYS);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const settings = await getRosterSettings(tx, tenantId, campId);
      const from = toDbDate(q.from);
      const to = toDbDate(q.to);
      const emps = await tx.campEmployee.findMany({
        where: {
          tenantId, campId, status: CampEmployeeStatus.ACTIVE,
          ...(q.departmentId ? { departmentId: q.departmentId } : {}),
          ...(q.crewId ? { crewId: q.crewId } : {}),
        },
        select: {
          id: true, employeeCode: true, fullName: true,
          department: { select: { code: true, shiftPatterns: { select: { dayFrom: true, dayTo: true, shift: true } } } },
          crew: { select: { code: true, rosterAnchorDate: true } },
          shiftAdjustments: { where: { startDate: { lte: to }, endDate: { gte: from } }, select: { startDate: true, endDate: true, shift: true } },
          stays: { where: { startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] }, select: { startDate: true, endDate: true } },
        },
        orderBy: [{ department: { code: 'asc' } }, { employeeCode: 'asc' }],
      });
      const days = eachDay(q.from, q.to);
      return {
        from: q.from,
        to: q.to,
        days,
        employees: emps.map((e) => {
          const adjustments = e.shiftAdjustments.map((a) => ({ startDate: fromDbDate(a.startDate), endDate: fromDbDate(a.endDate), shift: a.shift }));
          const stays = e.stays.map((s) => ({ start: fromDbDate(s.startDate), end: s.endDate ? fromDbDate(s.endDate) : null }));
          const crewAnchor = e.crew ? fromDbDate(e.crew.rosterAnchorDate) : null;
          return {
            id: e.id, employeeCode: e.employeeCode, fullName: e.fullName, departmentCode: e.department.code, crewCode: e.crew?.code ?? null,
            cells: days.map((date) => {
              const r = resolveShift({ date, adjustments, pattern: e.department.shiftPatterns, crewAnchor, settings });
              const stay = stays.find((s) => coversDay(s.start, s.end, date));
              const presence = !stay ? null : stay.start === date ? 'ARRIVAL' : stay.end === date ? 'DEPARTURE' : 'FULL_DAY';
              return { date, shift: r.shift, source: r.source, dayNo: r.dayNo, presence };
            }),
          };
        }),
      };
    });
  }
}
