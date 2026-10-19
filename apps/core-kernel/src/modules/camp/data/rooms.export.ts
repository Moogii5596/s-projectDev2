import { TableSpec } from '../../../common/xlsx/table-spec';
import { ImportCtx } from '../../hr/import/import-types';
import { Tx } from '../common/camp-tx';

/** §2.4 — Өрөөний экспорт; v0.2.3 Блок D-оос импорт ч мөн энэ форматаар (`facilities.handlers.ts`). */
export const ROOMS_SPEC: TableSpec = {
  type: 'rooms',
  title: 'table.rooms',
  columns: [
    { key: 'building', label: 'col.room.building', type: 'text', required: true, maxLength: 30, aliases: ['building', 'байр'] },
    { key: 'roomNo', label: 'col.room.room_no', type: 'text', required: true, maxLength: 30, aliases: ['room_no', 'room', 'өрөө'] },
    { key: 'floor', label: 'col.room.floor', type: 'int', min: -5, max: 100, aliases: ['floor', 'давхар'] },
    { key: 'capacity', label: 'col.room.capacity', type: 'int', required: true, min: 1, max: 50, aliases: ['capacity', 'багтаамж'] },
    {
      key: 'status', label: 'col.room.status', type: 'enum', aliases: ['status', 'төлөв'],
      enumValues: { ACTIVE: 'enum.room_status.ACTIVE', MAINTENANCE: 'enum.room_status.MAINTENANCE', INACTIVE: 'enum.room_status.INACTIVE' },
    },
    { key: 'note', label: 'col.room.note', type: 'text', maxLength: 500, aliases: ['note', 'тэмдэглэл'], width: 30 },
  ],
};

export async function exportRooms(tx: Tx, ctx: ImportCtx) {
  const rows = await tx.campRoom.findMany({
    where: { tenantId: ctx.tenantId, campId: ctx.campId },
    select: { roomNo: true, floor: true, capacity: true, status: true, note: true, building: { select: { code: true } } },
    orderBy: [{ building: { code: 'asc' } }, { roomNo: 'asc' }],
  });
  return rows.map((r) => ({ building: r.building.code, roomNo: r.roomNo, floor: r.floor, capacity: r.capacity, status: r.status, note: r.note }));
}
