import { Injectable } from '@nestjs/common';
import { CampAssetCondition, CampRoomStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { isRealIsoDate, todayUb } from '../common/camp-date';
import { OPEN_STATUSES } from '../maintenance/maintenance-flow';
import {
  CreateAssetCategoryDto,
  CreateAssetDto,
  MoveAssetDto,
  QueryAssetsDto,
  QueryCategoriesDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
  WriteOffAssetDto,
} from './camp-assets.dto';
import { badRequest, conflict, notFound } from '../../../common/i18n/app-error';

const P = CAMP_PERMISSIONS;

const CATEGORY_SELECT = { id: true, name: true, isActive: true, createdAt: true, updatedAt: true } as const;
const ASSET_SELECT = {
  id: true,
  campId: true,
  categoryId: true,
  inventoryNo: true,
  name: true,
  serialNo: true,
  roomId: true,
  buildingId: true,
  condition: true,
  acquiredDate: true,
  acquiredCost: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
  room: { select: { roomNo: true, building: { select: { code: true } } } },
  building: { select: { code: true, name: true } },
} as const;

type AssetRow = Prisma.CampAssetGetPayload<{ select: typeof ASSET_SELECT }>;

/** Prisma Date/Decimal → API хэлбэр (огноо 'YYYY-MM-DD', мөнгө '123.45') */
export const assetView = (a: AssetRow) => ({
  ...a,
  acquiredDate: a.acquiredDate ? a.acquiredDate.toISOString().slice(0, 10) : null,
  acquiredCost: a.acquiredCost ? a.acquiredCost.toFixed(2) : null,
});

/**
 * Үндсэн хөрөнгө (Шат 4.3).
 *   - Ангилал = tenant түвшний лавлах: аль нэг кемпэд camp.asset.manage эрхтэй бол удирдана.
 *   - Хөрөнгө кемпэд харьяалагдана; room_id (өрөөнд) · building_id (v0.2.1: өрөөгүй, байранд) · хоёулаа NULL = агуулах. Байршил зөвхөн move/write-off-оор өөрчлөгдөж,
 *     шилжилт бүр camp_asset_movements-д бичигдэнэ (байршил + түүх НЭГ transaction).
 *   - WRITTEN_OFF (актлагдсан) хөрөнгө түгжигдэнэ — засах, шилжүүлэх, засварт оруулах боломжгүй (409).
 */
@Injectable()
export class CampAssetsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  // ── Ангилал ────────────────────────────────────────────────

  async listCategories(tenantId: string, authId: string, q: QueryCategoriesDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, null);
      return tx.campAssetCategory.findMany({
        where: { tenantId, ...(q.activeOnly ? { isActive: true } : {}) },
        select: CATEGORY_SELECT,
        orderBy: { name: 'asc' },
      });
    });
  }

  private async assertCategoryNameFree(tx: Tx, tenantId: string, name: string, exceptId?: string) {
    const dup = await tx.campAssetCategory.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) throw conflict('camp.err.assets.1', { name });
  }

  async createCategory(tenantId: string, authId: string, dto: CreateAssetCategoryDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.ASSET_MANAGE);
        await this.assertCategoryNameFree(tx, tenantId, dto.name);
        return tx.campAssetCategory.create({ data: { tenantId, name: dto.name }, select: CATEGORY_SELECT });
      }),
    );
  }

  async updateCategory(tenantId: string, authId: string, id: string, dto: UpdateAssetCategoryDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.requireInAnyCamp(tx, tenantId, authId, P.ASSET_MANAGE);
        const c = await tx.campAssetCategory.findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!c) throw notFound('camp.err.assets.2');
        if (dto.name !== undefined) await this.assertCategoryNameFree(tx, tenantId, dto.name, id);
        return tx.campAssetCategory.update({
          where: { id },
          data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) },
          select: CATEGORY_SELECT,
        });
      }),
    );
  }

  // ── Шалгалтууд ─────────────────────────────────────────────

  private async assertCategoryUsable(tx: Tx, tenantId: string, categoryId: string) {
    const c = await tx.campAssetCategory.findFirst({ where: { id: categoryId, tenantId }, select: { isActive: true } });
    if (!c) throw badRequest('camp.err.assets.2');
    if (!c.isActive) throw badRequest('camp.err.assets.3');
  }

  /** Хөрөнгө байрлуулах өрөө: тухайн кемпийнх, INACTIVE биш (засварт байгаа өрөөнд байрлуулж болно) */
  private async assertRoomUsable(tx: Tx, tenantId: string, campId: string, roomId: string) {
    const r = await tx.campRoom.findFirst({ where: { id: roomId, tenantId, campId }, select: { roomNo: true, status: true } });
    if (!r) throw badRequest('camp.err.assets.4');
    if (r.status === CampRoomStatus.INACTIVE) throw badRequest('camp.err.assets.5', { roomNo: r.roomNo });
  }

  /** v0.2.1 (C-12): хөрөнгө байрлуулах байр — тухайн кемпийнх, идэвхтэй */
  private async assertBuildingUsable(tx: Tx, tenantId: string, campId: string, buildingId: string) {
    const b = await tx.campBuilding.findFirst({ where: { id: buildingId, tenantId, campId }, select: { code: true, isActive: true } });
    if (!b) throw badRequest('camp.err.assets.20');
    if (!b.isActive) throw badRequest('camp.err.assets.21', { code: b.code });
  }

  private async assertInventoryNoFree(tx: Tx, tenantId: string, inventoryNo: string, exceptId?: string) {
    const dup = await tx.campAsset.findFirst({
      where: { tenantId, inventoryNo, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (dup) throw conflict('camp.err.assets.6', { inventoryNo, name: dup.name });
  }

  private assertAcquiredDate(d: string | null | undefined) {
    if (d === undefined || d === null) return;
    if (!isRealIsoDate(d)) throw badRequest('camp.err.assets.7', { d });
    if (d > todayUb()) throw badRequest('camp.err.assets.8');
  }

  private async getAssetOr404(tx: Tx, tenantId: string, campId: string, id: string) {
    const a = await tx.campAsset.findFirst({
      where: { id, tenantId, campId },
      select: { id: true, roomId: true, buildingId: true, condition: true, note: true, inventoryNo: true },
    });
    if (!a) throw notFound('camp.err.assets.9');
    return a;
  }

  private static assertNotWrittenOff(a: { condition: CampAssetCondition; inventoryNo: string }) {
    if (a.condition === CampAssetCondition.WRITTEN_OFF) {
      throw conflict('camp.err.assets.10', { inventoryNo: a.inventoryNo });
    }
  }

  // ── Хөрөнгө ────────────────────────────────────────────────

  async list(tenantId: string, authId: string, campId: string, q: QueryAssetsDto) {
    const limit = q.limit ?? 20;
    let cursor: { id: string; createdAt: Date } | null = null;
    if (q.cursor) {
      try {
        cursor = decodeCursor(q.cursor);
      } catch {
        throw badRequest('camp.err.assets.11');
      }
    }
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const where: Prisma.CampAssetWhereInput = {
        tenantId,
        campId,
        ...(q.roomId === 'warehouse' ? { roomId: null, buildingId: null } : q.roomId ? { roomId: q.roomId } : {}),
        ...(q.buildingId ? { OR: [{ buildingId: q.buildingId }, { room: { buildingId: q.buildingId } }] } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.condition ? { condition: q.condition } : {}),
        AND: [
          ...(q.q
            ? [
                {
                  OR: [
                    { inventoryNo: { contains: q.q, mode: 'insensitive' as const } },
                    { name: { contains: q.q, mode: 'insensitive' as const } },
                    { serialNo: { contains: q.q, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
          ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
        ],
      };
      const rows = await tx.campAsset.findMany({ where, select: ASSET_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      const last = data[data.length - 1];
      return { data: data.map(assetView), nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null, hasMore };
    });
  }

  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      const a = await tx.campAsset.findFirst({ where: { id, tenantId, campId }, select: ASSET_SELECT });
      if (!a) throw notFound('camp.err.assets.9');
      const openMaintenance = await tx.campMaintenanceRequest.count({ where: { tenantId, assetId: id, status: { in: [...OPEN_STATUSES] } } });
      return { ...assetView(a), openMaintenance };
    });
  }

  async create(tenantId: string, authId: string, campId: string, dto: CreateAssetDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.access.require(tx, tenantId, authId, campId, P.ASSET_MANAGE);
        await getCampOr404(tx, tenantId, campId);
        if (dto.condition === CampAssetCondition.WRITTEN_OFF) {
          throw badRequest('camp.err.assets.12');
        }
        this.assertAcquiredDate(dto.acquiredDate);
        await this.assertCategoryUsable(tx, tenantId, dto.categoryId);
        const roomId = dto.roomId ?? null;
        const buildingId = dto.buildingId ?? null;
        if (roomId && buildingId) throw badRequest('camp.err.assets.19');
        if (roomId) await this.assertRoomUsable(tx, tenantId, campId, roomId);
        if (buildingId) await this.assertBuildingUsable(tx, tenantId, campId, buildingId);
        await this.assertInventoryNoFree(tx, tenantId, dto.inventoryNo);
        const created = await tx.campAsset.create({
          data: {
            tenantId,
            campId,
            categoryId: dto.categoryId,
            inventoryNo: dto.inventoryNo,
            name: dto.name,
            serialNo: dto.serialNo ?? null,
            roomId,
            buildingId,
            condition: dto.condition ?? CampAssetCondition.GOOD,
            acquiredDate: dto.acquiredDate ? toDbDate(dto.acquiredDate) : null,
            acquiredCost: dto.acquiredCost === undefined || dto.acquiredCost === null ? null : new Prisma.Decimal(dto.acquiredCost),
            note: dto.note ?? null,
          },
          select: ASSET_SELECT,
        });
        // Анхны байршуулалт ч түүхэнд үлдэнэ (агуулах → өрөө)
        if (roomId || buildingId) {
          await tx.campAssetMovement.create({
            data: { tenantId, campId, assetId: created.id, fromRoomId: null, toRoomId: roomId, toBuildingId: buildingId, movedBy: userId, reason: 'Анхны байршуулалт' },
          });
        }
        return assetView(created);
      }),
    );
  }

  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateAssetDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.access.require(tx, tenantId, authId, campId, P.ASSET_MANAGE);
        const a = await this.getAssetOr404(tx, tenantId, campId, id);
        CampAssetsService.assertNotWrittenOff(a);
        if (dto.condition === CampAssetCondition.WRITTEN_OFF) {
          throw badRequest('camp.err.assets.13');
        }
        this.assertAcquiredDate(dto.acquiredDate);
        if (dto.categoryId !== undefined) await this.assertCategoryUsable(tx, tenantId, dto.categoryId);
        if (dto.inventoryNo !== undefined) await this.assertInventoryNoFree(tx, tenantId, dto.inventoryNo, id);
        const data: Prisma.CampAssetUncheckedUpdateInput = {};
        for (const f of ['categoryId', 'inventoryNo', 'name', 'serialNo', 'condition', 'note'] as const) {
          if (dto[f] !== undefined) (data as Record<string, unknown>)[f] = dto[f];
        }
        if (dto.acquiredDate !== undefined) data.acquiredDate = dto.acquiredDate === null ? null : toDbDate(dto.acquiredDate);
        if (dto.acquiredCost !== undefined) data.acquiredCost = dto.acquiredCost === null ? null : new Prisma.Decimal(dto.acquiredCost);
        // Зэрэгцээ актлалтаас хамгаална: WRITTEN_OFF болсон бол 0 мөр
        const res = await tx.campAsset.updateMany({ where: { id, tenantId, condition: { not: CampAssetCondition.WRITTEN_OFF } }, data });
        if (res.count === 0) throw conflict('camp.err.assets.14', { inventoryNo: a.inventoryNo });
        const fresh = await tx.campAsset.findFirstOrThrow({ where: { id, tenantId }, select: ASSET_SELECT });
        return assetView(fresh);
      }),
    );
  }

  async move(tenantId: string, authId: string, campId: string, id: string, dto: MoveAssetDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.access.require(tx, tenantId, authId, campId, P.ASSET_MANAGE);
        const a = await this.getAssetOr404(tx, tenantId, campId, id);
        CampAssetsService.assertNotWrittenOff(a);
        const to = dto.toRoomId;
        const toBuilding = dto.toBuildingId ?? null;
        if (to && toBuilding) throw badRequest('camp.err.assets.19');
        if (to === a.roomId && toBuilding === a.buildingId) {
          throw badRequest(to ? 'camp.err.assets.17' : toBuilding ? 'camp.err.assets.22' : 'camp.err.assets.18');
        }
        if (to) await this.assertRoomUsable(tx, tenantId, campId, to);
        if (toBuilding) await this.assertBuildingUsable(tx, tenantId, campId, toBuilding);
        // Optimistic: уншсанаас хойш байршил/төлөв өөрчлөгдсөн бол 0 мөр → 409
        const res = await tx.campAsset.updateMany({
          where: { id, tenantId, roomId: a.roomId, buildingId: a.buildingId, condition: { not: CampAssetCondition.WRITTEN_OFF } },
          data: { roomId: to, buildingId: toBuilding },
        });
        if (res.count === 0) throw conflict('camp.err.assets.15', { inventoryNo: a.inventoryNo });
        await tx.campAssetMovement.create({
          data: {
            tenantId,
            campId,
            assetId: id,
            fromRoomId: a.roomId,
            fromBuildingId: a.buildingId,
            toRoomId: to,
            toBuildingId: toBuilding,
            movedBy: userId,
            reason: dto.reason ?? null,
          },
        });
        const fresh = await tx.campAsset.findFirstOrThrow({ where: { id, tenantId }, select: ASSET_SELECT });
        return assetView(fresh);
      }),
    );
  }

  /**
   * Актлах: condition = WRITTEN_OFF, өрөөнд байсан бол агуулах руу (movement-д шалтгаан).
   * Шалтгаан + огноо тэмдэглэлд нэмэгдэнэ (агуулахад байсан хөрөнгөд movement бичигдэхгүй — CHECK from ≠ to).
   * Нээлттэй (OPEN/IN_PROGRESS) засвартай бол 409 — эхлээд засварыг дуусгах/цуцлах.
   */
  async writeOff(tenantId: string, authId: string, campId: string, id: string, dto: WriteOffAssetDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.access.require(tx, tenantId, authId, campId, P.ASSET_MANAGE);
        const a = await this.getAssetOr404(tx, tenantId, campId, id);
        CampAssetsService.assertNotWrittenOff(a);
        const open = await tx.campMaintenanceRequest.findFirst({
          where: { tenantId, assetId: id, status: { in: [...OPEN_STATUSES] } },
          select: { requestNo: true },
        });
        if (open) throw conflict('camp.err.assets.16', { inventoryNo: a.inventoryNo, requestNo: open.requestNo });
        const stamp = `[Актлав ${todayUb()}] ${dto.reason}`;
        const res = await tx.campAsset.updateMany({
          where: { id, tenantId, roomId: a.roomId, buildingId: a.buildingId, condition: { not: CampAssetCondition.WRITTEN_OFF } },
          data: { condition: CampAssetCondition.WRITTEN_OFF, roomId: null, buildingId: null, note: a.note ? `${a.note}\n${stamp}` : stamp },
        });
        if (res.count === 0) throw conflict('camp.err.assets.14', { inventoryNo: a.inventoryNo });
        if (a.roomId || a.buildingId) {
          await tx.campAssetMovement.create({
            data: {
              tenantId,
              campId,
              assetId: id,
              fromRoomId: a.roomId,
              fromBuildingId: a.buildingId,
              toRoomId: null,
              movedBy: userId,
              reason: `Актлав: ${dto.reason}`.slice(0, 500),
            },
          });
        }
        const fresh = await tx.campAsset.findFirstOrThrow({ where: { id, tenantId }, select: ASSET_SELECT });
        return assetView(fresh);
      }),
    );
  }

  async movements(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await this.getAssetOr404(tx, tenantId, campId, id);
      return tx.campAssetMovement.findMany({
        where: { tenantId, assetId: id },
        select: {
          id: true,
          fromRoomId: true,
          toRoomId: true,
          movedAt: true,
          reason: true,
          fromBuildingId: true,
          toBuildingId: true,
          fromRoom: { select: { roomNo: true, building: { select: { code: true } } } },
          toRoom: { select: { roomNo: true, building: { select: { code: true } } } },
          fromBuilding: { select: { code: true } },
          toBuilding: { select: { code: true } },
          movedByUser: { select: { fullName: true, email: true } },
        },
        orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    });
  }
}
