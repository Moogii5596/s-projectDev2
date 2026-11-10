import { CampDataImportType, CampRoomStatus } from '@prisma/client';
import { CellValue, TableSpec } from '../../../common/xlsx/table-spec';
import { normalizeName } from '../../../common/name-normalization';
import type { ApplyCtx, DataImportHandler, PlannedRow } from '../../core/import-export/data-transfer.types';
import { has, upper } from '../../core/import-export/data-transfer.types';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { todayUb } from '../common/camp-date';
import { toDbDate } from '../common/camp-tx';
import { exportRooms, ROOMS_SPEC } from './rooms.export';

/**
 * v0.2.3 Блок D (S5) — Өрөөний тохиргооны импорт: байрны төрөл → байр → өрөө (дараалал чухал — нэр/кодоор холбоно).
 * HR-ийн нийтлэг импортын урсгал (PREVIEW → CONFIRM, `camp_data_imports`) — `CampHrBridge.registerHandler`.
 */
const P = CAMP_PERMISSIONS;
const CODE = /^[A-Za-z0-9._-]+$/;
const BUILDING_AUDIT_FIELDS = ['code', 'name', 'isActive', 'typeId'] as const;
const ROOM_AUDIT_FIELDS = ['buildingId', 'roomNo', 'floor', 'capacity', 'status', 'note'] as const;
const clean = (v: CellValue | undefined) => String(v ?? '').trim().replace(/\s+/g, ' ');
type Changes = Record<string, { from: CellValue; to: CellValue }>;

// ── Байрны төрөл (байгууллагын каталог) ──────────────────────
const BUILDING_TYPES_SPEC: TableSpec = {
  type: 'building-types',
  title: 'table.building_types',
  keyColumn: 'name',
  columns: [
    { key: 'name', label: 'col.building_type.name', type: 'text', required: true, maxLength: 100, aliases: ['name', 'нэр', 'төрөл', 'байрны төрөл'], examples: ['Амьдрах байр', 'Оффис'], width: 26 },
    { key: 'active', label: 'col.building_type.active', type: 'bool', aliases: ['active', 'идэвхтэй'], examples: [true, true] },
  ],
};

export const buildingTypesHandler: DataImportHandler = {
  type: CampDataImportType.BUILDING_TYPES,
  spec: BUILDING_TYPES_SPEC,
  permission: P.MASTER_MANAGE,

  async plan(tx, ctx, rows) {
    const [types, used] = await Promise.all([
      tx.campBuildingType.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, isActive: true } }),
      tx.campBuilding.groupBy({ by: ['typeId'], where: { tenantId: ctx.tenantId, isActive: true, typeId: { not: null } }, _count: { _all: true } }),
    ]);
    const byName = new Map(types.map((t) => [normalizeName(t.name), t]));
    const n = new Map(used.map((u) => [u.typeId, u._count._all]));
    return rows.map((r): PlannedRow => {
      const errors = [...r.errors];
      const cur = typeof r.values.name === 'string' ? byName.get(normalizeName(r.values.name)) : undefined;
      if (cur && r.values.active === false && cur.isActive && (n.get(cur.id) ?? 0) > 0) errors.push({ column: 'active', code: 'row.type_has_buildings', params: { n: n.get(cur.id) ?? 0 } });
      if (errors.length) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create' };
      const changes: Changes = {};
      if (has(r, 'active') && r.values.active !== null && r.values.active !== cur.isActive) changes.active = { from: cur.isActive, to: r.values.active };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes };
    });
  },

  async apply(tx, ctx, rows) {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.op === 'create') {
        await tx.campBuildingType.create({ data: { tenantId: ctx.tenantId, name: clean(row.values.name).slice(0, 100), isActive: row.values.active !== false } });
        created++;
      } else if (row.op === 'update' && row.targetId) {
        await tx.campBuildingType.update({ where: { id: row.targetId }, data: { isActive: Boolean(row.values.active) } });
        updated++;
      }
    }
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.campBuildingType.findMany({ where: { tenantId: ctx.tenantId }, select: { name: true, isActive: true }, orderBy: { name: 'asc' } });
    return rows.map((t) => ({ name: t.name, active: t.isActive }));
  },
};

// ── Байр (кемп бүрт) ─────────────────────────────────────────
const BUILDINGS_SPEC: TableSpec = {
  type: 'buildings',
  title: 'table.buildings',
  keyColumn: 'code',
  columns: [
    { key: 'code', label: 'col.building.code', type: 'text', required: true, maxLength: 30, pattern: CODE, aliases: ['code', 'код', 'байрны код'], examples: ['B1', 'B7'] },
    { key: 'name', label: 'col.building.name', type: 'text', required: true, maxLength: 200, aliases: ['name', 'нэр', 'байрны нэр'], examples: ['1-р байр', '7-р байр'], width: 22 },
    { key: 'type', label: 'col.building.type', type: 'text', maxLength: 100, aliases: ['type', 'төрөл', 'байрны төрөл'], examples: ['Амьдрах байр', null], width: 20 },
    { key: 'active', label: 'col.building.active', type: 'bool', aliases: ['active', 'идэвхтэй'], examples: [true, true] },
  ],
};

type BuildingResolved = { typeId?: string | null };
const B_RES = Symbol('building');

export const buildingsHandler: DataImportHandler = {
  type: CampDataImportType.BUILDINGS,
  spec: BUILDINGS_SPEC,
  permission: P.MASTER_MANAGE,

  async plan(tx, ctx, rows) {
    const [buildings, types, rooms] = await Promise.all([
      tx.campBuilding.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true, name: true, isActive: true, typeId: true } }),
      tx.campBuildingType.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true, isActive: true } }),
      tx.campRoom.groupBy({ by: ['buildingId'], where: { tenantId: ctx.tenantId, campId: ctx.campId, status: { not: CampRoomStatus.INACTIVE } }, _count: { _all: true } }),
    ]);
    const byCode = new Map(buildings.map((b) => [b.code.toUpperCase(), b]));
    const typeByName = new Map(types.map((t) => [normalizeName(t.name), t]));
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const activeRooms = new Map(rooms.map((x) => [x.buildingId, x._count._all]));
    return rows.map((r): PlannedRow & { [B_RES]?: BuildingResolved } => {
      const v = r.values;
      const errors = [...r.errors];
      const cur = byCode.get(upper(v.code));
      const res: BuildingResolved = {};
      if (has(r, 'type')) {
        if (!v.type) res.typeId = null;
        else {
          const t = typeByName.get(normalizeName(String(v.type)));
          if (!t) errors.push({ column: 'type', code: 'row.ref_not_found', params: { value: String(v.type) } });
          else if (!t.isActive && t.id !== cur?.typeId) errors.push({ column: 'type', code: 'row.ref_inactive', params: { value: String(v.type) } });
          else res.typeId = t.id;
        }
      }
      if (cur && v.active === false && cur.isActive && (activeRooms.get(cur.id) ?? 0) > 0) errors.push({ column: 'active', code: 'row.building_has_rooms', params: { n: activeRooms.get(cur.id) ?? 0 } });
      if (errors.length) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create', [B_RES]: res };
      const changes: Changes = {};
      if (has(r, 'name') && v.name && v.name !== cur.name) changes.name = { from: cur.name, to: v.name };
      if (res.typeId !== undefined && res.typeId !== cur.typeId) changes.type = { from: cur.typeId ? (typeName.get(cur.typeId) ?? null) : null, to: (v.type as string | null) ?? null };
      if (has(r, 'active') && v.active !== null && v.active !== cur.isActive) changes.active = { from: cur.isActive, to: v.active };
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes, [B_RES]: res };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    const SEL = { id: true, code: true, name: true, isActive: true, typeId: true } as const;
    for (const row of rows as (PlannedRow & { [B_RES]?: BuildingResolved })[]) {
      const v = row.values;
      const res = row[B_RES] ?? {};
      if (row.op === 'create') {
        const b = await tx.campBuilding.create({
          data: { tenantId: ctx.tenantId, campId: ctx.campId, code: String(v.code), name: clean(v.name), typeId: res.typeId ?? null, isActive: v.active !== false },
          select: SEL,
        });
        created++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'building', entityId: b.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: BUILDING_AUDIT_FIELDS, before: null, after: b, summaryParams: { code: b.code, name: b.name } });
      } else if (row.op === 'update' && row.targetId) {
        const before = await tx.campBuilding.findFirst({ where: { id: row.targetId, tenantId: ctx.tenantId, campId: ctx.campId }, select: SEL });
        if (!before) continue;
        const after = await tx.campBuilding.update({
          where: { id: row.targetId },
          data: {
            ...(has(row, 'name') && v.name ? { name: clean(v.name) } : {}),
            ...(res.typeId !== undefined ? { typeId: res.typeId } : {}),
            ...(has(row, 'active') && v.active !== null ? { isActive: Boolean(v.active) } : {}),
          },
          select: SEL,
        });
        updated++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'building', entityId: after.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: BUILDING_AUDIT_FIELDS, before, after, summaryParams: { code: after.code, name: after.name } });
      }
    }
    await ctx.audit.recordMany(tx, audits);
    return { created, updated };
  },

  async exportRows(tx, ctx) {
    const rows = await tx.campBuilding.findMany({
      where: { tenantId: ctx.tenantId, campId: ctx.campId },
      select: { code: true, name: true, isActive: true, type: { select: { name: true, nameI18n: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((b) => ({ code: b.code, name: b.name, type: b.type?.name ?? null, active: b.isActive }));
  },
};

// ── Өрөө (байрны код + өрөөний дугаар) ───────────────────────
const ROOMS_IMPORT_SPEC: TableSpec = {
  ...ROOMS_SPEC,
  columns: ROOMS_SPEC.columns.map((c) => ({
    ...c,
    examples: (({ building: ['B1', 'B7'], roomNo: ['101', '701'], floor: [1, null], capacity: [4, 2], status: ['ACTIVE', 'ACTIVE'], note: [null, null] }) as Record<string, CellValue[]>)[c.key],
  })),
};
type RoomResolved = { buildingId?: string };
const R_RES = Symbol('room');

export const roomsHandler: DataImportHandler = {
  type: CampDataImportType.ROOMS,
  spec: ROOMS_IMPORT_SPEC,
  permission: [P.MASTER_MANAGE, P.ROOM_MANAGE],

  async plan(tx, ctx, rows) {
    const today = toDbDate(todayUb());
    const [buildings, rooms, occ] = await Promise.all([
      tx.campBuilding.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, code: true, isActive: true } }),
      tx.campRoom.findMany({ where: { tenantId: ctx.tenantId, campId: ctx.campId }, select: { id: true, buildingId: true, roomNo: true, floor: true, capacity: true, status: true, note: true } }),
      tx.campRoomAllocation.groupBy({ by: ['roomId'], where: { tenantId: ctx.tenantId, campId: ctx.campId, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] }, _count: { _all: true } }),
    ]);
    const bByCode = new Map(buildings.map((b) => [b.code.toUpperCase(), b]));
    const roomKey = (buildingId: string, roomNo: string) => `${buildingId}|${roomNo.trim().toUpperCase()}`;
    const byKey = new Map(rooms.map((r) => [roomKey(r.buildingId, r.roomNo), r]));
    const occupants = new Map(occ.map((o) => [o.roomId, o._count._all]));
    const seen = new Map<string, number>();
    return rows.map((r): PlannedRow & { [R_RES]?: RoomResolved } => {
      const v = r.values;
      const errors = [...r.errors];
      const b = v.building ? bByCode.get(upper(v.building)) : undefined;
      if (v.building && !b) errors.push({ column: 'building', code: 'row.ref_not_found', params: { value: String(v.building) } });
      const cur = b && typeof v.roomNo === 'string' ? byKey.get(roomKey(b.id, v.roomNo)) : undefined;
      if (b && !b.isActive && !cur) errors.push({ column: 'building', code: 'row.ref_inactive', params: { value: String(v.building) } });
      if (b && typeof v.roomNo === 'string') {
        const k = roomKey(b.id, v.roomNo);
        const first = seen.get(k);
        if (first !== undefined) errors.push({ column: 'roomNo', code: 'row.duplicate_in_file', params: { value: `${String(v.building)} ${v.roomNo}`, first } });
        else seen.set(k, r.row);
      }
      if (cur && v.status === CampRoomStatus.INACTIVE && cur.status !== CampRoomStatus.INACTIVE && (occupants.get(cur.id) ?? 0) > 0) {
        errors.push({ column: 'status', code: 'row.room_has_occupants', params: { n: occupants.get(cur.id) ?? 0 } });
      }
      if (errors.length) return { ...r, errors, op: 'error' };
      if (!cur) return { ...r, errors, op: 'create', [R_RES]: { buildingId: b!.id } };
      const changes: Changes = {};
      for (const k of ['floor', 'capacity', 'status', 'note'] as const) {
        if (!has(r, k)) continue;
        const to = k === 'status' ? (v.status ?? cur.status) : (v[k] ?? null);
        if ((cur[k] ?? null) !== to) changes[k] = { from: cur[k] ?? null, to };
      }
      return { ...r, errors, op: Object.keys(changes).length ? 'update' : 'unchanged', targetId: cur.id, changes, [R_RES]: { buildingId: b!.id } };
    });
  },

  async apply(tx, ctx: ApplyCtx, rows) {
    let created = 0;
    let updated = 0;
    const audits: Parameters<ApplyCtx['audit']['recordMany']>[1] = [];
    const SEL = { id: true, buildingId: true, roomNo: true, floor: true, capacity: true, status: true, note: true, building: { select: { code: true } } } as const;
    for (const row of rows as (PlannedRow & { [R_RES]?: RoomResolved })[]) {
      const v = row.values;
      if (row.op === 'create') {
        const room = await tx.campRoom.create({
          data: {
            tenantId: ctx.tenantId, campId: ctx.campId, buildingId: row[R_RES]!.buildingId!, roomNo: clean(v.roomNo),
            floor: (v.floor as number | null) ?? null, capacity: Number(v.capacity), status: (v.status as CampRoomStatus | null) ?? CampRoomStatus.ACTIVE, note: (v.note as string | null) ?? null,
          },
          select: SEL,
        });
        created++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'room', entityId: room.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: ROOM_AUDIT_FIELDS, before: null, after: room, summaryParams: { building: room.building.code, room: room.roomNo } });
      } else if (row.op === 'update' && row.targetId) {
        const before = await tx.campRoom.findFirst({ where: { id: row.targetId, tenantId: ctx.tenantId, campId: ctx.campId }, select: SEL });
        if (!before) continue;
        const data: Record<string, unknown> = {};
        for (const k of ['floor', 'capacity', 'note'] as const) if (has(row, k) && (k !== 'capacity' || v.capacity !== null)) data[k] = v[k] ?? null;
        if (has(row, 'status') && v.status) data.status = v.status;
        const after = await tx.campRoom.update({ where: { id: row.targetId }, data, select: SEL });
        updated++;
        audits.push({ tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'room', entityId: after.id, action: 'IMPORT', actorUserId: ctx.actorUserId, importId: ctx.importId, fields: ROOM_AUDIT_FIELDS, before, after, summaryParams: { building: after.building.code, room: after.roomNo } });
      }
    }
    await ctx.audit.recordMany(tx, audits);
    return { created, updated };
  },

  exportRows: exportRooms,
};
