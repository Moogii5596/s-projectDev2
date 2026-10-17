import { Injectable } from '@nestjs/common';
import { addDays } from '../common/camp-date';
import { fromDbDate, toDbDate, Tx } from '../common/camp-tx';
import type { EmployeeSitePort, ProfileRoomAllocation } from '../../hr/employees/employee-hooks';

/**
 * v0.2.2 Блок 5 (D-07, Q8) — HR-ийн ажилтны мөчлөгийн порт (`EmployeeSitePort`)-ийн Кемп хэрэгжүүлэлт:
 * ажлаас гарахад өрөө автоматаар чөлөөлөх, профайлд өрөөний түүх. `CampHrBridge` бүртгэнэ.
 */
@Injectable()
export class CampEmployeeSite implements EmployeeSitePort {
  async releaseOnTermination(tx: Tx, tenantId: string, employeeId: string, date: string) {
    const d = toDbDate(date);
    // date-ээс эхлэх (ирээдүйн) хуваарилалт — хэзээ ч хэрэгжээгүй тул устгана
    const removed = await tx.campRoomAllocation.deleteMany({ where: { tenantId, employeeId, startDate: { gte: d } } });
    // date-ийг хамарсан / нээлттэй → date − 1 (startDate < date тул CHECK end ≥ start хангагдана)
    const closed = await tx.campRoomAllocation.updateMany({
      where: { tenantId, employeeId, startDate: { lt: d }, OR: [{ endDate: null }, { endDate: { gte: d } }] },
      data: { endDate: toDbDate(addDays(date, -1)) },
    });
    return { closed: closed.count, removed: removed.count };
  }

  async roomHistory(tx: Tx, tenantId: string, employeeId: string, limit: number): Promise<ProfileRoomAllocation[]> {
    const rows = await tx.campRoomAllocation.findMany({
      where: { tenantId, employeeId },
      select: { id: true, startDate: true, endDate: true, room: { select: { roomNo: true, building: { select: { name: true } } } } },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      roomNo: r.room.roomNo,
      buildingName: r.room.building.name,
      startDate: fromDbDate(r.startDate),
      endDate: r.endDate ? fromDbDate(r.endDate) : null,
    }));
  }
}
