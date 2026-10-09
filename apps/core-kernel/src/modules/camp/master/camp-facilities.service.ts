import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { CreateBuildingDto, CreateRoomDto, QueryActiveOnlyDto, QueryRoomsDto, UpdateBuildingDto, UpdateRoomDto } from './camp-master.dto';

const P = CAMP_PERMISSIONS;
/** Өрөөг кемпийн мастер эсвэл өрөөний эрхтэй хүн удирдана (ERD v4 §2.2: катеринг админ room.manage-тэй) */
const ROOM_WRITE = [P.ROOM_MANAGE, P.MASTER_MANAGE];
const BUILDING_SELECT = { id: true, code: true, name: true, isActive: true, createdAt: true, updatedAt: true } as const;
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

/** Байр, өрөө (Шат 2.4). Дүүргэлт (сул/дүүрсэн) Шат 3.5-д тооцоологдоно. */
@Injectable()
export class CampFacilitiesService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  async listBuildings(tenantId: string, authId: string, campId: string, q: QueryActiveOnlyDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      return tx.campBuilding.findMany({
        where: { tenantId, campId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: { ...BUILDING_SELECT, _count: { select: { rooms: true } } },
        orderBy: { code: 'asc' },
      });
    });
  }

  async createBuilding(tenantId: string, authId: string, campId: string, dto: CreateBuildingDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        const dup = await tx.campBuilding.findFirst({ where: { tenantId, campId, code: dto.code }, select: { id: true } });
        if (dup) throw new ConflictException(`"${dto.code}" кодтой байр аль хэдийн байна`);
        return tx.campBuilding.create({ data: { tenantId, campId, code: dto.code, name: dto.name }, select: BUILDING_SELECT });
      }),
    );
  }

  async updateBuilding(tenantId: string, authId: string, campId: string, id: string, dto: UpdateBuildingDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.MASTER_MANAGE);
        const b = await tx.campBuilding.findFirst({ where: { id, tenantId, campId }, select: { id: true } });
        if (!b) throw new NotFoundException('Байр олдсонгүй');
        if (dto.isActive === false) {
          const active = await tx.campRoom.count({ where: { tenantId, buildingId: id, status: { not: 'INACTIVE' } } });
          if (active > 0) throw new ConflictException(`Байранд идэвхтэй ${active} өрөө байна — эхлээд өрөөнүүдийг INACTIVE болгоно уу`);
        }
        return tx.campBuilding.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          select: BUILDING_SELECT,
        });
      }),
    );
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
        await this.access.require(tx, tenantId, authId, campId, ROOM_WRITE);
        await getCampOr404(tx, tenantId, campId);
        const b = await tx.campBuilding.findFirst({ where: { id: dto.buildingId, tenantId, campId }, select: { isActive: true } });
        if (!b) throw new BadRequestException('Байр энэ кемпэд олдсонгүй');
        if (!b.isActive) throw new BadRequestException('Идэвхгүй байранд өрөө нэмэх боломжгүй');
        const dup = await tx.campRoom.findFirst({ where: { tenantId, buildingId: dto.buildingId, roomNo: dto.roomNo }, select: { id: true } });
        if (dup) throw new ConflictException(`"${dto.roomNo}" дугаартай өрөө энэ байранд аль хэдийн байна`);
        return tx.campRoom.create({
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
      }),
    );
  }

  async updateRoom(tenantId: string, authId: string, campId: string, id: string, dto: UpdateRoomDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, ROOM_WRITE);
        const room = await tx.campRoom.findFirst({ where: { id, tenantId, campId }, select: { id: true, buildingId: true } });
        if (!room) throw new NotFoundException('Өрөө олдсонгүй');
        if (dto.roomNo !== undefined) {
          const dup = await tx.campRoom.findFirst({
            where: { tenantId, buildingId: room.buildingId, roomNo: dto.roomNo, NOT: { id } },
            select: { id: true },
          });
          if (dup) throw new ConflictException(`"${dto.roomNo}" дугаартай өрөө энэ байранд аль хэдийн байна`);
        }
        return tx.campRoom.update({
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
      }),
    );
  }
}
