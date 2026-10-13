import { Injectable } from '@nestjs/common';
import { CampAssetCondition, CampEmployeeStatus, CampRoomStatus } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { fromDbDate, inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404, getRosterSettings } from '../common/camp-lookup';
import { addDays, coversDay } from '../common/camp-date';
import { expectedNight, RosterSettings } from '../../hr/attendance/roster';
import { assertDate } from '../../hr/attendance/range';
import { OPEN_STATUSES } from '../maintenance/maintenance-flow';
import { CreateRoomAllocationDto, EndRoomAllocationDto, QueryAllocationsDto } from './camp-attendance.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

const P = CAMP_PERMISSIONS;
/** Багтаамжийг шалгах цонх — нэг бүтэн ростерын мөчлөг (28 хоног) */
export const CAPACITY_WINDOW_NIGHTS = 28;

export interface OccupantPlan {
  employeeCode: string;
  crewAnchor: string | null;
  startDate: string;
  endDate: string | null;
}

/**
 * Өрөөний багтаамж — "хоног"-оор (Шат 3.4): d өдрийн ШӨНӨ өрөөнд хонох хүн = хуваарилалт d-г хамарсан ба ростерын дагуу
 * тэр шөнө кемпэд (expectedNight). Багагүй ажилтан шөнө бүр тоологдоно. Хэтэрсэн эхний шөнийг буцаана.
 */
export function firstOverCapacityNight(
  occupants: OccupantPlan[],
  capacity: number,
  from: string,
  nights: number,
  settings: RosterSettings,
): { date: string; count: number; codes: string[] } | null {
  for (let i = 0; i < nights; i++) {
    const d = addDays(from, i);
    const here = occupants.filter((o) => coversDay(o.startDate, o.endDate, d) && expectedNight(o.crewAnchor, d, settings));
    if (here.length > capacity) return { date: d, count: here.length, codes: here.map((o) => o.employeeCode).sort() };
  }
  return null;
}

/** Өрөө хуваарилалт (ажилтны үндсэн өрөө), өрөөний самбар, "өрөөгүй" жагсаалт — Шат 3.4 */
@Injectable()
export class CampRoomsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async allocate(tenantId: string, authId: string, campId: string, dto: CreateRoomAllocationDto) {
    assertDate(dto.startDate, 'startDate');
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.ROOM_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const settings = await getRosterSettings(tx, tenantId, campId);
        const emp = await tx.hrEmployee.findFirst({
          where: { id: dto.employeeId, tenantId, campId },
          select: { id: true, employeeCode: true, status: true, crew: { select: { rosterAnchorDate: true } } },
        });
        if (!emp) throw badRequest('camp.err.attendance.5');
        if (emp.status !== CampEmployeeStatus.ACTIVE) throw badRequest('camp.err.rooms.1');
        const room = await tx.campRoom.findFirst({ where: { id: dto.roomId, tenantId, campId }, select: { id: true, roomNo: true, capacity: true, status: true } });
        if (!room) throw badRequest('camp.err.assets.4');
        if (room.status !== CampRoomStatus.ACTIVE) throw badRequest('camp.err.rooms.2', { roomNo: room.roomNo, status: room.status });

        const start = toDbDate(dto.startDate);
        const current = await tx.campRoomAllocation.findMany({
          where: { tenantId, employeeId: emp.id, OR: [{ endDate: null }, { endDate: { gte: start } }] },
          select: { id: true, startDate: true, endDate: true, room: { select: { roomNo: true } } },
        });
        let replacedId: string | null = null;
        if (current.length > 0) {
          const c = current[0];
          const cStart = fromDbDate(c.startDate);
          if (!dto.replaceCurrent || current.length > 1 || c.endDate !== null || cStart >= dto.startDate) {
            throw conflict('camp.err.rooms.6', { roomNo: c.room.roomNo, date: cStart });
          }
          replacedId = c.id;
        }

        const windowEnd = addDays(dto.startDate, CAPACITY_WINDOW_NIGHTS - 1);
        const others = await tx.campRoomAllocation.findMany({
          where: {
            tenantId, roomId: room.id, startDate: { lte: toDbDate(windowEnd) }, OR: [{ endDate: null }, { endDate: { gte: start } }],
            ...(replacedId ? { NOT: { id: replacedId } } : {}),
          },
          select: { startDate: true, endDate: true, employee: { select: { employeeCode: true, crew: { select: { rosterAnchorDate: true } } } } },
        });
        const occupants: OccupantPlan[] = [
          ...others.map((o) => ({
            employeeCode: o.employee.employeeCode,
            crewAnchor: o.employee.crew ? fromDbDate(o.employee.crew.rosterAnchorDate) : null,
            startDate: fromDbDate(o.startDate),
            endDate: o.endDate ? fromDbDate(o.endDate) : null,
          })),
          { employeeCode: emp.employeeCode, crewAnchor: emp.crew ? fromDbDate(emp.crew.rosterAnchorDate) : null, startDate: dto.startDate, endDate: null },
        ];
        const over = firstOverCapacityNight(occupants, room.capacity, dto.startDate, CAPACITY_WINDOW_NIGHTS, settings);
        if (over) {
          throw conflict('camp.err.rooms.7', { roomNo: room.roomNo, date: over.date, count: over.count, capacity: room.capacity, codes: over.codes.join(', ') });
        }
        if (replacedId) {
          await tx.campRoomAllocation.update({ where: { id: replacedId }, data: { endDate: toDbDate(addDays(dto.startDate, -1)) } });
        }
        const a = await tx.campRoomAllocation.create({
          data: { tenantId, campId, roomId: room.id, employeeId: emp.id, startDate: start },
          select: { id: true, roomId: true, employeeId: true, startDate: true, endDate: true },
        });
        return { ...a, startDate: fromDbDate(a.startDate), endDate: null, replacedAllocationId: replacedId };
      }),
    );
  }

  async end(tenantId: string, authId: string, campId: string, id: string, dto: EndRoomAllocationDto) {
    assertDate(dto.endDate, 'endDate');
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.ROOM_MANAGE);
        const a = await tx.campRoomAllocation.findFirst({ where: { id, tenantId, campId }, select: { id: true, startDate: true, endDate: true } });
        if (!a) throw notFound('camp.err.rooms.3');
        if (a.endDate !== null) throw conflict('camp.err.rooms.4', { date: fromDbDate(a.endDate) });
        if (dto.endDate < fromDbDate(a.startDate)) throw badRequest('camp.err.rooms.5');
        await tx.campRoomAllocation.update({ where: { id }, data: { endDate: toDbDate(dto.endDate) } });
        return { id, endDate: dto.endDate };
      }),
    );
  }

  async list(tenantId: string, authId: string, campId: string, q: QueryAllocationsDto) {
    if (q.date) assertDate(q.date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const d = q.date ? toDbDate(q.date) : null;
      const rows = await tx.campRoomAllocation.findMany({
        where: {
          tenantId, campId,
          ...(q.roomId ? { roomId: q.roomId } : {}),
          ...(q.employeeId ? { employeeId: q.employeeId } : {}),
          ...(d ? { startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] } : {}),
        },
        select: {
          id: true, startDate: true, endDate: true,
          room: { select: { id: true, roomNo: true, building: { select: { code: true } } } },
          employee: { select: { id: true, employeeCode: true, fullName: true, crew: { select: { code: true } } } },
        },
        orderBy: [{ startDate: 'desc' }],
        take: 500,
      });
      return rows.map((r) => ({ ...r, startDate: fromDbDate(r.startDate), endDate: r.endDate ? fromDbDate(r.endDate) : null }));
    });
  }

  /**
   * Өрөөний самбар (D өдрийн шөнө): хуваарилагдсан + кемпэд хонож буй (stay: эхлэх ≤ D < дуусах) → VACANT | PARTIAL | FULL.
   * "Өрөөгүй" = D шөнө кемпэд хонож буй ч хуваарилалтгүй.
   */
  async board(tenantId: string, authId: string, campId: string, date: string) {
    assertDate(date);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return computeRoomBoard(tx, tenantId, campId, date);
    });
  }
}

/** Өрөөний самбар (D шөнө) — transaction дотроос (API + `camp:snapshot` CLI, v0.2.0 §0.2) */
export async function computeRoomBoard(tx: Tx, tenantId: string, campId: string, date: string) {
  const d = toDbDate(date);
  const [rooms, allocations, stays, assets, maint] = await Promise.all([
    tx.campRoom.findMany({
      where: { tenantId, campId, status: { not: CampRoomStatus.INACTIVE } },
      select: { id: true, roomNo: true, floor: true, capacity: true, status: true, building: { select: { code: true, name: true } } },
      orderBy: [{ building: { code: 'asc' } }, { roomNo: 'asc' }],
    }),
    tx.campRoomAllocation.findMany({
      where: { tenantId, campId, startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] },
      select: { roomId: true, employee: { select: { id: true, employeeCode: true, fullName: true, status: true, crew: { select: { code: true } } } } },
    }),
    // D шөнө кемпэд: ирсэн ≤ D ба (яваагүй эсвэл D-ээс хойш явна)
    tx.campStay.findMany({
      where: { tenantId, campId, startDate: { lte: d }, OR: [{ endDate: null }, { endDate: { gt: d } }] },
      select: { employee: { select: { id: true, employeeCode: true, fullName: true, department: { select: { code: true } }, crew: { select: { code: true } } } } },
    }),
    // v0.2.1 (C-12): өрөөний хөрөнгө (актлагдаагүй) + нээлттэй засвар
    tx.campAsset.findMany({
      where: { tenantId, campId, roomId: { not: null }, condition: { not: CampAssetCondition.WRITTEN_OFF } },
      select: { id: true, roomId: true, inventoryNo: true, name: true, condition: true },
      orderBy: [{ inventoryNo: 'asc' }],
    }),
    tx.campMaintenanceRequest.findMany({
      where: { tenantId, campId, roomId: { not: null }, status: { in: [...OPEN_STATUSES] } },
      select: { id: true, roomId: true, requestNo: true, title: true, priority: true, status: true, blocksRoom: true },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ]);
  const group = <T extends { roomId: string | null }>(rows: T[]) => {
    const m = new Map<string, Omit<T, 'roomId'>[]>();
    for (const { roomId, ...rest } of rows) if (roomId) m.set(roomId, [...(m.get(roomId) ?? []), rest]);
    return m;
  };
  const assetsByRoom = group(assets);
  const maintByRoom = group(maint);
  const tonight = new Set(stays.map((s) => s.employee.id));
  const allocated = new Set(allocations.map((a) => a.employee.id));
  const byRoom = new Map<string, typeof allocations>();
  for (const a of allocations) byRoom.set(a.roomId, [...(byRoom.get(a.roomId) ?? []), a]);
  const roomViews = rooms.map((r) => {
    const occ = (byRoom.get(r.id) ?? []).map((a) => ({ ...a.employee, crewCode: a.employee.crew?.code ?? null, presentTonight: tonight.has(a.employee.id) }));
    const present = occ.filter((o) => o.presentTonight).length;
    return {
      id: r.id, roomNo: r.roomNo, floor: r.floor, capacity: r.capacity, roomStatus: r.status, building: r.building,
      allocatedCount: occ.length, presentCount: present,
      occupancy: present === 0 ? 'VACANT' : present >= r.capacity ? 'FULL' : 'PARTIAL',
      overCapacity: present > r.capacity,
      // FB-12 (v0.2.0): идэвхгүй болсон ажилтан өрөөнд хуваарилагдсан хэвээр
      inactiveOccupants: occ.filter((o) => o.status === 'INACTIVE').length,
      occupants: occ.map(({ crew: _crew, ...rest }) => rest),
      assets: assetsByRoom.get(r.id) ?? [],
      openMaintenance: maintByRoom.get(r.id) ?? [],
    };
  });
  return {
    date,
    rooms: roomViews,
    totals: {
      rooms: roomViews.length,
      capacity: roomViews.reduce((s, r) => s + r.capacity, 0),
      present: roomViews.reduce((s, r) => s + r.presentCount, 0),
      vacant: roomViews.filter((r) => r.occupancy === 'VACANT').length,
      full: roomViews.filter((r) => r.occupancy === 'FULL').length,
    },
    unassigned: stays
      .filter((s) => !allocated.has(s.employee.id))
      .map((s) => ({ id: s.employee.id, employeeCode: s.employee.employeeCode, fullName: s.employee.fullName, departmentCode: s.employee.department.code, crewCode: s.employee.crew?.code ?? null })),
  };
}
