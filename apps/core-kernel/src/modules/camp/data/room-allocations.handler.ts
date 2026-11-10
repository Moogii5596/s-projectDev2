import { CampDataImportType, CampEmployeeStatus, CampRoomStatus } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { ApplyCtx, DataImportHandler, PlannedRow, upper } from '../../hr/import/import-types';
import { CAPACITY_WINDOW_NIGHTS, firstOverCapacityNight, type OccupantPlan } from '../attendance/camp-rooms.service';
import { getRosterSettings } from '../common/camp-lookup';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { todayUb } from '../common/camp-date';
import { fromDbDate, toDbDate } from '../common/camp-tx';

/**
 * v0.2.3 Блок D (S6) — Өрөөнд байрлуулалт (ТҮҮХТЭЙ): ажилтны код + байр + өрөө + эхэлсэн/дууссан огноо.
 * Мөр бүр = нэг хугацаа (`camp_room_allocations`); дууссан огноо хоосон = одоо байрлаж буй.
 *  - Ажилтан: TERMINATED биш бүртгэл (байхгүй бол ижил кодын хамгийн сүүлд гарсан) — гарсан өдрөөс хойш үргэлжлэхгүй.
 *  - Ижил ажилтны мөрүүд файл дотор давхцахгүй. DB-ийн байрлуулалттай давхцвал: ИЖИЛ өрөө → нэгтгэж шинэчилнэ
 *    (эхлэх = эрт, дуусах = хожуу / хоосон), ӨӨР өрөө → алдаа (UI-аас дуусгах эсвэл файлыг засна).
 *  - Багтаамж: зөвхөн одоогийн (дуусаагүй) мөрүүдэд, гараар хуваарилахтай ижил дүрмээр (ростерын шөнө, 28 шөнө).
 *    Түүх (дууссан) = болсон баримт → багтаамжаар шалгахгүй.
 */
const ROOM_ALLOCATIONS_SPEC: TableSpec = {
  type: 'room-allocations',
  title: 'table.room_allocations',
  columns: [
    { key: 'employeeCode', label: 'col.employee.code', type: 'text', required: true, maxLength: 50, aliases: ['employee_code', 'code', 'id', 'код', 'ажилтны код'], examples: ['14203', '14203'], width: 14 },
    { key: 'building', label: 'col.room.building', type: 'text', required: true, maxLength: 30, aliases: ['building', 'байр'], examples: ['B1', 'B1'] },
    { key: 'roomNo', label: 'col.room.room_no', type: 'text', required: true, maxLength: 30, aliases: ['room_no', 'room', 'өрөө'], examples: ['101', '103'] },
    { key: 'startDate', label: 'col.alloc.start_date', type: 'date', required: true, aliases: ['start_date', 'from', 'эхэлсэн', 'эхлэх огноо'], examples: ['2026-07-01', '2026-09-15'], width: 14 },
    { key: 'endDate', label: 'col.alloc.end_date', type: 'date', aliases: ['end_date', 'to', 'дууссан', 'дуусах огноо'], examples: ['2026-09-14', null], width: 14 },
  ],
};

type Resolved = { employeeId: string; roomId: string; start: string; end: string | null; mergeId?: string };
const RES = Symbol('alloc');
type Planned = PlannedRow & { [RES]?: Resolved };

const minIso = (a: string, b: string) => (a < b ? a : b);
const overlaps = (aS: string, aE: string | null, bS: string, bE: string | null) => aS <= (bE ?? '9999-12-31') && bS <= (aE ?? '9999-12-31');

export const roomAllocationsHandler: DataImportHandler = {
  type: CampDataImportType.ROOM_ALLOCATIONS,
  spec: ROOM_ALLOCATIONS_SPEC,
  permission: CAMP_PERMISSIONS.ROOM_MANAGE,

  async plan(tx, ctx, rows) {
    const codes = [...new Set(rows.map((r) => r.values.employeeCode).filter((c): c is string => typeof c === 'string' && c !== ''))];
    const [emps, buildings, rooms, settings] = await Promise.all([
      codes.length
        ? tx.hrEmployee.findMany({
            where: { tenantId: ctx.tenantId, campId: ctx.campId, employeeCode: { in: codes, mode: 'insensitive' } },
            select: { id: true, employeeCode: true, status: true, terminatedAt: true, crew: { select: { rosterAnchorDate: true } } },
          })
        : Promise.resolve([]),
      tx.campBuilding.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true } }),
      tx.campRoom.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, buildingId: true, roomNo: true, capacity: true, status: true } }),
      getRosterSettings(tx, ctx.tenantId, ctx.campId),
    ]);
    // Код → бүртгэл: идэвхтэй/идэвхгүй давуу, эс бөгөөс хамгийн сүүлд гарсан
    const empByCode = new Map<string, (typeof emps)[number]>();
    for (const e of emps) {
      const k = e.employeeCode.toUpperCase();
      const prev = empByCode.get(k);
      const rank = (x: (typeof emps)[number]) => (x.status !== CampEmployeeStatus.TERMINATED ? Number.MAX_SAFE_INTEGER : (x.terminatedAt?.getTime() ?? 0));
      if (!prev || rank(e) > rank(prev)) empByCode.set(k, e);
    }
    const bByCode = new Map(buildings.map((b) => [b.code.toUpperCase(), b.id]));
    const roomByKey = new Map(rooms.map((r) => [`${r.buildingId}|${r.roomNo.trim().toUpperCase()}`, r]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const empIds = [...new Set([...empByCode.values()].map((e) => e.id))];
    const existing = empIds.length
      ? await tx.campRoomAllocation.findMany({ where: { tenantId: ctx.tenantId, employeeId: { in: empIds } }, select: { id: true, employeeId: true, roomId: true, startDate: true, endDate: true } })
      : [];
    const existingByEmp = new Map<string, { id: string; roomId: string; start: string; end: string | null }[]>();
    for (const a of existing) {
      existingByEmp.set(a.employeeId, [...(existingByEmp.get(a.employeeId) ?? []), { id: a.id, roomId: a.roomId, start: fromDbDate(a.startDate), end: a.endDate ? fromDbDate(a.endDate) : null }]);
    }
    const fileByEmp = new Map<string, { row: number; start: string; end: string | null }[]>();
    const usedMerge = new Set<string>();

    const planned = rows.map((r): Planned => {
      const v = r.values;
      const errors = [...r.errors];
      const emp = typeof v.employeeCode === 'string' ? empByCode.get(v.employeeCode.toUpperCase()) : undefined;
      if (v.employeeCode && !emp) errors.push({ column: 'employeeCode', code: 'row.ref_not_found', params: { value: String(v.employeeCode) } });
      const bId = v.building ? bByCode.get(upper(v.building)) : undefined;
      if (v.building && !bId) errors.push({ column: 'building', code: 'row.ref_not_found', params: { value: String(v.building) } });
      const room = bId && typeof v.roomNo === 'string' ? roomByKey.get(`${bId}|${v.roomNo.trim().toUpperCase()}`) : undefined;
      if (bId && v.roomNo && !room) errors.push({ column: 'roomNo', code: 'row.ref_not_found', params: { value: `${String(v.building)} ${String(v.roomNo)}` } });
      const start = typeof v.startDate === 'string' ? v.startDate : '';
      const end = typeof v.endDate === 'string' ? v.endDate : null;
      if (start && end && end < start) errors.push({ column: 'endDate', code: 'row.end_before_start' });
      if (emp && start) {
        const term = emp.terminatedAt ? fromDbDate(emp.terminatedAt) : null;
        if (emp.status === CampEmployeeStatus.TERMINATED && term && (end === null || end > term || start > term)) {
          errors.push({ column: end === null ? 'endDate' : 'startDate', code: 'row.alloc_after_termination', params: { date: term } });
        } else if (end === null && emp.status !== CampEmployeeStatus.ACTIVE) {
          errors.push({ column: 'employeeCode', code: 'row.alloc_employee_inactive' });
        }
      }
      if (room && end === null && room.status !== CampRoomStatus.ACTIVE) errors.push({ column: 'roomNo', code: 'row.room_not_active', params: { room: room.roomNo, status: room.status } });
      if (emp && start && (!end || end >= start)) {
        const mine = fileByEmp.get(emp.id) ?? [];
        const clash = mine.find((m) => overlaps(m.start, m.end, start, end));
        if (clash) errors.push({ column: 'startDate', code: 'row.alloc_overlap_in_file', params: { first: clash.row } });
        fileByEmp.set(emp.id, [...mine, { row: r.row, start, end }]);
      }
      if (errors.length || !emp || !room) return { ...r, errors: errors.length ? errors : [{ column: 'employeeCode', code: 'row.required' }], op: 'error' };

      // DB-тэй харьцуулах
      const hits = (existingByEmp.get(emp.id) ?? []).filter((a) => overlaps(a.start, a.end, start, end));
      if (hits.length === 0) return { ...r, errors, op: 'create', [RES]: { employeeId: emp.id, roomId: room.id, start, end } };
      const other = hits.find((a) => a.roomId !== room.id);
      if (other || hits.length > 1) {
        const a = other ?? hits[1];
        errors.push({ column: 'startDate', code: 'row.alloc_overlap', params: { room: roomById.get(a.roomId)?.roomNo ?? '?', from: a.start } });
        return { ...r, errors, op: 'error' };
      }
      const a = hits[0];
      if (usedMerge.has(a.id)) {
        errors.push({ column: 'startDate', code: 'row.alloc_overlap', params: { room: room.roomNo, from: a.start } });
        return { ...r, errors, op: 'error' };
      }
      usedMerge.add(a.id);
      const nStart = minIso(a.start, start);
      const nEnd = a.end === null || end === null ? null : a.end > end ? a.end : end;
      const changes: Record<string, { from: CellValue; to: CellValue }> = {};
      if (nStart !== a.start) changes.startDate = { from: a.start, to: nStart };
      if (nEnd !== a.end) changes.endDate = { from: a.end, to: nEnd };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: a.id, changes, [RES]: { employeeId: emp.id, roomId: room.id, start: nStart, end: nEnd, mergeId: a.id } };
    });

    // Багтаамж: одоогийн (дуусаагүй) мөртэй өрөө бүрт — гараар хуваарилахтай ижил дүрэм (өнөөдрөөс 28 шөнө)
    const today = todayUb();
    const openRooms = new Set(planned.filter((p) => p.op !== 'error' && p[RES]?.end === null).map((p) => p[RES]!.roomId));
    if (openRooms.size > 0) {
      const empCrew = new Map(emps.map((e) => [e.id, e.crew ? fromDbDate(e.crew.rosterAnchorDate) : null]));
      const empCode = new Map(emps.map((e) => [e.id, e.employeeCode]));
      const others = await tx.campRoomAllocation.findMany({
        where: { tenantId: ctx.tenantId, roomId: { in: [...openRooms] }, OR: [{ endDate: null }, { endDate: { gte: toDbDate(today) } }] },
        select: { id: true, roomId: true, startDate: true, endDate: true, employee: { select: { employeeCode: true, crew: { select: { rosterAnchorDate: true } } } } },
      });
      for (const roomId of openRooms) {
        const room = roomById.get(roomId)!;
        const fromFile = planned.filter((p) => p.op !== 'error' && p[RES]?.roomId === roomId);
        const merged = new Set(fromFile.map((p) => p[RES]!.mergeId).filter(Boolean));
        const occupants: OccupantPlan[] = [
          ...others.filter((o) => o.roomId === roomId && !merged.has(o.id)).map((o) => ({
            employeeCode: o.employee.employeeCode,
            crewAnchor: o.employee.crew ? fromDbDate(o.employee.crew.rosterAnchorDate) : null,
            startDate: fromDbDate(o.startDate),
            endDate: o.endDate ? fromDbDate(o.endDate) : null,
          })),
          ...fromFile.map((p) => ({ employeeCode: empCode.get(p[RES]!.employeeId) ?? '?', crewAnchor: empCrew.get(p[RES]!.employeeId) ?? null, startDate: p[RES]!.start, endDate: p[RES]!.end })),
        ];
        const over = firstOverCapacityNight(occupants, room.capacity, today, CAPACITY_WINDOW_NIGHTS, settings);
        if (over) {
          const last = fromFile.filter((p) => p[RES]!.end === null).at(-1)!;
          last.errors = [...last.errors, { column: 'roomNo', code: 'row.over_capacity', params: { room: room.roomNo, date: over.date, count: over.count, capacity: room.capacity, codes: over.codes.join(', ') } }];
          last.op = 'error';
        }
      }
    }
    return planned;
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    for (const row of rows as Planned[]) {
      const res = row[RES];
      if (!res) continue;
      if (row.op === 'create') {
        await tx.campRoomAllocation.create({
          data: { tenantId: ctx.tenantId, campId: ctx.campId, roomId: res.roomId, employeeId: res.employeeId, startDate: toDbDate(res.start), endDate: res.end ? toDbDate(res.end) : null },
        });
        created++;
      } else if (row.op === 'update' && row.targetId) {
        await tx.campRoomAllocation.update({ where: { id: row.targetId }, data: { startDate: toDbDate(res.start), endDate: res.end ? toDbDate(res.end) : null } });
        updated++;
      }
    }
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.campRoomAllocation.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId },
      select: { startDate: true, endDate: true, employee: { select: { employeeCode: true } }, room: { select: { roomNo: true, building: { select: { code: true } } } } },
      orderBy: [{ employee: { employeeCode: 'asc' } }, { startDate: 'asc' }],
    });
    return rows.map((a) => ({
      employeeCode: a.employee.employeeCode, building: a.room.building.code, roomNo: a.room.roomNo,
      startDate: fromDbDate(a.startDate), endDate: a.endDate ? fromDbDate(a.endDate) : null,
    }));
  },
};
