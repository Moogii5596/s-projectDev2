import { Injectable } from '@nestjs/common';
import { CampMaintenanceStatus, CampRoomStatus } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CampAuditService } from '../common/camp-audit.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, Tx } from '../common/camp-tx';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';
import { BULK_ROOMS_MAX, roomNumbers } from './room-range';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { BulkRoomsDto, CreateBuildingDto, CreateRoomDto, QueryActiveOnlyDto, QueryRoomsDto, UpdateBuildingDto, UpdateRoomDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
/** Өрөөг кемпийн мастер эсвэл өрөөний эрхтэй хүн удирдана (ERD v4 §2.2: катеринг админ room.manage-тэй) */
const ROOM_WRITE = [P.ROOM_MANAGE, P.MASTER_MANAGE];
const BUILDING_SELECT = { id: true, code: true, name: true, isActive: true, typeId: true, type: { select: { name: true } }, createdAt: true, updatedAt: true } as const;
const ROOM_SELECT = {
  id: true,
  buildingId: true,
  roomNo: true,
  floor: true,
  capacity: true,
  status: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  building: { select: { code: true, name: true } },
} as const;

const BUILDING_AUDIT_FIELDS = ['code', 'name', 'isActive', 'typeId'] as const;
const ROOM_AUDIT_FIELDS = ['buildingId', 'roomNo', 'floor', 'capacity', 'status', 'note'] as const;

/** Байр, өрөө (Шат 2.4). Дүүргэлт (сул/дүүрсэн) Шат 3.5-д тооцоологдоно. */
@Injectable()
export class CampFacilitiesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  /** v0.2.1 (C-12): байрны төрөл — байгууллагын каталог, идэвхтэй */
  private async assertBuildingType(tx: Tx, tenantId: string, typeId: string) {
    const t = await tx.campBuildingType.findFirst({ where: { id: typeId, tenantId }, select: { isActive: true, name: true } });
    if (!t) throw badRequest('camp.err.catalog.building_type_not_found');
    if (!t.isActive) throw badRequest('camp.err.catalog.building_type_inactive', { name: t.name });
  }

  async listBuildings(tenantId: string, authId: string, campId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const [rows, stats] = await Promise.all([
        tx.campBuilding.findMany({
          where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
          select: { ...BUILDING_SELECT, _count: { select: { rooms: true } } },
          orderBy: { code: 'asc' },
        }),
        // FB-07: идэвхтэй (INACTIVE биш) өрөөний тоо + нийт багтаамж
        tx.campRoom.groupBy({ by: ['buildingId'], where: { tenantId, campId, status: { not: 'INACTIVE' } }, _count: { _all: true }, _sum: { capacity: true } }),
      ]);
      const byId = new Map(stats.map((x) => [x.buildingId, x]));
      return rows.map((b) => ({ ...b, activeRooms: byId.get(b.id)?._count._all ?? 0, capacity: byId.get(b.id)?._sum.capacity ?? 0 }));
    });
  }

  async createBuilding(tenantId: string, authId: string, campId: string, dto: CreateBuildingDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const dup = await tx.campBuilding.findFirst({ where: { tenantId, campId, code: dto.code }, select: { id: true } });
        if (dup) throw conflict('camp.err.facilities.1', { code: dto.code });
        if (dto.typeId) await this.assertBuildingType(tx, tenantId, dto.typeId);
        const b = await tx.campBuilding.create({ data: { tenantId, campId, code: dto.code, name: dto.name, typeId: dto.typeId ?? null }, select: BUILDING_SELECT });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'building', entityId: b.id, action: 'CREATE', actorUserId,
          fields: BUILDING_AUDIT_FIELDS, before: null, after: b, summaryParams: { code: b.code, name: b.name },
        });
        if (!dto.rooms) return b;
        // FB-07: байр + өрөөнүүд НЭГ transaction (өрөөний алдаа → байр ч үүсэхгүй)
        const rooms = await this.createRoomsBulk(tx, { tenantId, campId, actorUserId }, b, dto.rooms);
        return { ...b, roomsCreated: rooms.created, roomsSkipped: rooms.skipped };
      }),
    );
  }

  async updateBuilding(tenantId: string, authId: string, campId: string, id: string, dto: UpdateBuildingDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        const b = await tx.campBuilding.findFirst({ where: { id, tenantId, campId }, select: BUILDING_SELECT });
        if (!b) throw notFound('camp.err.facilities.2');
        if (dto.typeId && dto.typeId !== b.typeId) await this.assertBuildingType(tx, tenantId, dto.typeId);
        if (dto.isActive === false) {
          const active = await tx.campRoom.count({ where: { tenantId, buildingId: id, status: { not: 'INACTIVE' } } });
          if (active > 0) throw conflict('camp.err.facilities.3', { active });
          // v0.2.1 (C-12): байранд шууд байрласан хөрөнгө (актлагдаагүй) — эхлээд шилжүүлнэ
          const assets = await tx.campAsset.count({ where: { tenantId, campId, buildingId: id, condition: { not: 'WRITTEN_OFF' } } });
          if (assets > 0) throw conflict('camp.err.facilities.9', { assets });
        }
        const after = await tx.campBuilding.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...(dto.typeId !== undefined ? { typeId: dto.typeId } : {}),
          },
          select: BUILDING_SELECT,
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'building', entityId: id, action: 'UPDATE', actorUserId,
          fields: BUILDING_AUDIT_FIELDS, before: b, after, summaryParams: { code: after.code, name: after.name },
        });
        return after;
      }),
    );
  }

  /** FB-07 — POST buildings/:id/rooms/bulk ("+ Олон өрөө") */
  async bulkRooms(tenantId: string, authId: string, campId: string, buildingId: string, dto: BulkRoomsDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, ROOM_WRITE);
        const b = await tx.campBuilding.findFirst({ where: { id: buildingId, tenantId, campId }, select: { id: true, code: true, isActive: true } });
        if (!b) throw notFound('camp.err.facilities.2');
        if (!b.isActive) throw badRequest('camp.err.facilities.4');
        return this.createRoomsBulk(tx, { tenantId, campId, actorUserId }, b, dto);
      }),
    );
  }

  private async createRoomsBulk(tx: Tx, ctx: { tenantId: string; campId: string; actorUserId: string }, building: { id: string; code: string }, dto: BulkRoomsDto) {
    if (dto.to < dto.from) throw badRequest('rooms.bulk_range');
    const n = dto.to - dto.from + 1;
    if (n > BULK_ROOMS_MAX) throw badRequest('rooms.bulk_too_many', { max: BULK_ROOMS_MAX, n });
    const numbers = roomNumbers(dto);
    const existing = await tx.campRoom.findMany({ where: { tenantId: ctx.tenantId, buildingId: building.id, roomNo: { in: numbers } }, select: { roomNo: true } });
    const exists = new Set(existing.map((r) => r.roomNo));
    if (exists.size > 0 && dto.skipExisting === false) {
      const list = numbers.filter((x) => exists.has(x));
      throw conflict('rooms.bulk_exists', { n: list.length, rooms: list.slice(0, 10).join(', ') + (list.length > 10 ? '…' : '') });
    }
    const toCreate = numbers.filter((x) => !exists.has(x));
    if (toCreate.length > 0) {
      await tx.campRoom.createMany({
        data: toCreate.map((roomNo) => ({ tenantId: ctx.tenantId, campId: ctx.campId, buildingId: building.id, roomNo, floor: dto.floor ?? null, capacity: dto.capacity })),
      });
      const created = await tx.campRoom.findMany({ where: { tenantId: ctx.tenantId, buildingId: building.id, roomNo: { in: toCreate } }, select: ROOM_SELECT });
      await this.audit.recordMany(
        tx,
        created.map((room) => ({
          tenantId: ctx.tenantId, campId: ctx.campId, entityType: 'room' as const, entityId: room.id, action: 'CREATE' as const, actorUserId: ctx.actorUserId,
          fields: ROOM_AUDIT_FIELDS, before: null, after: room, summaryParams: { room: room.roomNo, building: building.code },
        })),
      );
    }
    return { created: toCreate.length, skipped: numbers.filter((x) => exists.has(x)) };
  }

  async listRooms(tenantId: string, authId: string, campId: string, q: QueryRoomsDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return tx.campRoom.findMany({
        where: {
          tenantId,
          campId,
          ...(q.buildingId ? { buildingId: q.buildingId } : {}),
          ...(q.status ? { status: q.status } : {}),
        },
        select: ROOM_SELECT,
        orderBy: [{ building: { code: 'asc' } }, { roomNo: 'asc' }],
      });
    });
  }

  async createRoom(tenantId: string, authId: string, campId: string, dto: CreateRoomDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, ROOM_WRITE);
        await getCampOr404(tx, tenantId, campId);
        const b = await tx.campBuilding.findFirst({ where: { id: dto.buildingId, tenantId, campId }, select: { isActive: true } });
        if (!b) throw badRequest('camp.err.facilities.5');
        if (!b.isActive) throw badRequest('camp.err.facilities.4');
        const dup = await tx.campRoom.findFirst({ where: { tenantId, buildingId: dto.buildingId, roomNo: dto.roomNo }, select: { id: true } });
        if (dup) throw conflict('camp.err.facilities.6', { roomNo: dto.roomNo });
        const room = await tx.campRoom.create({
          data: {
            tenantId,
            campId,
            buildingId: dto.buildingId,
            roomNo: dto.roomNo,
            floor: dto.floor ?? null,
            capacity: dto.capacity,
            note: dto.note ?? null,
          },
          select: ROOM_SELECT,
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'room', entityId: room.id, action: 'CREATE', actorUserId,
          fields: ROOM_AUDIT_FIELDS, before: null, after: room, summaryParams: { room: room.roomNo, building: room.building?.code ?? null },
        });
        return room;
      }),
    );
  }

  async updateRoom(tenantId: string, authId: string, campId: string, id: string, dto: UpdateRoomDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const actorUserId = await this.access.require(tx, tenantId, authId, campId, ROOM_WRITE);
        const room = await tx.campRoom.findFirst({ where: { id, tenantId, campId }, select: ROOM_SELECT });
        if (!room) throw notFound('camp.err.facilities.7');
        if (dto.roomNo !== undefined) {
          const dup = await tx.campRoom.findFirst({
            where: { tenantId, buildingId: room.buildingId, roomNo: dto.roomNo, NOT: { id } },
            select: { id: true },
          });
          if (dup) throw conflict('camp.err.facilities.6', { roomNo: dto.roomNo });
        }
        // Шат 4: өрөөг түгжсэн (blocks_room) нээлттэй засвар байхад гараар MAINTENANCE-ээс гаргахгүй —
        // засвар дуусах/цуцлагдахад автоматаар ACTIVE болно
        if (dto.status !== undefined && dto.status !== CampRoomStatus.MAINTENANCE) {
          const blocking = await tx.campMaintenanceRequest.findFirst({
            where: { tenantId, roomId: id, blocksRoom: true, status: { in: [CampMaintenanceStatus.OPEN, CampMaintenanceStatus.IN_PROGRESS] } },
            select: { requestNo: true },
          });
          if (blocking) {
            throw conflict('camp.err.facilities.8', { requestNo: blocking.requestNo });
          }
        }
        const after = await tx.campRoom.update({
          where: { id },
          data: {
            ...(dto.roomNo !== undefined ? { roomNo: dto.roomNo } : {}),
            ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
            ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
          },
          select: ROOM_SELECT,
        });
        await this.audit.record(tx, {
          tenantId, campId, entityType: 'room', entityId: id, action: 'UPDATE', actorUserId,
          fields: ROOM_AUDIT_FIELDS, before: room, after, summaryParams: { room: after.roomNo, building: after.building?.code ?? null },
        });
        return after;
      }),
    );
  }
}
