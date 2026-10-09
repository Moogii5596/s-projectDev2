import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CampAssetCondition, CampRoomStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { isRealIsoDate, todayUb } from '../attendance/camp-date';
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
  condition: true,
  acquiredDate: true,
  acquiredCost: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
  room: { select: { roomNo: true, building: { select: { code: true } } } },
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
 *   - Хөрөнгө кемпэд харьяалагдана; room_id NULL = агуулах. Байршил зөвхөн move/write-off-оор өөрчлөгдөж,
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
    if (dup) throw new ConflictException(`Ангилал "${name}" аль хэдийн бүртгэгдсэн`);
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
        if (!c) throw new NotFoundException('Ангилал олдсонгүй');
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
    if (!c) throw new BadRequestException('Ангилал олдсонгүй');
    if (!c.isActive) throw new BadRequestException('Ангилал идэвхгүй байна');
  }

  /** Хөрөнгө байрлуулах өрөө: тухайн кемпийнх, INACTIVE биш (засварт байгаа өрөөнд байрлуулж болно) */
  private async assertRoomUsable(tx: Tx, tenantId: string, campId: string, roomId: string) {
    const r = await tx.campRoom.findFirst({ where: { id: roomId, tenantId, campId }, select: { roomNo: true, status: true } });
    if (!r) throw new BadRequestException('Өрөө энэ кемпэд олдсонгүй');
    if (r.status === CampRoomStatus.INACTIVE) throw new BadRequestException(`Өрөө ${r.roomNo} идэвхгүй — хөрөнгө байрлуулах боломжгүй`);
  }

  private async assertInventoryNoFree(tx: Tx, tenantId: string, inventoryNo: string, exceptId?: string) {
    const dup = await tx.campAsset.findFirst({
      where: { tenantId, inventoryNo, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { name: true },
    });
    if (dup) throw new ConflictException(`Инвентарийн дугаар "${inventoryNo}" (${dup.name}) аль хэдийн бүртгэгдсэн`);
  }

  private assertAcquiredDate(d: string | null | undefined) {
    if (d === undefined || d === null) return;
    if (!isRealIsoDate(d)) throw new BadRequestException(`acquiredDate буруу огноо: ${d}`);
    if (d > todayUb()) throw new BadRequestException('acquiredDate ирээдүйн огноо байж болохгүй');
  }

  private async getAssetOr404(tx: Tx, tenantId: string, campId: string, id: string) {
    const a = await tx.campAsset.findFirst({
      where: { id, tenantId, campId },
      select: { id: true, roomId: true, condition: true, note: true, inventoryNo: true },
    });
    if (!a) throw new NotFoundException('Хөрөнгө олдсонгүй');
    return a;
  }

  private static assertNotWrittenOff(a: { condition: CampAssetCondition; inventoryNo: string }) {
    if (a.condition === CampAssetCondition.WRITTEN_OFF) {
      throw new ConflictException(`Хөрөнгө ${a.inventoryNo} актлагдсан — өөрчлөх боломжгүй`);
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
        throw new BadRequestException('cursor буруу байна');
      }
    }
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      await getCampOr404(tx, tenantId, campId);
      const where: Prisma.CampAssetWhereInput = {
        tenantId,
        campId,
        ...(q.roomId === 'warehouse' ? { roomId: null } : q.roomId ? { roomId: q.roomId } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.condition ? { condition: q.condition } : {}),
        ...(q.q
          ? {
              OR: [
                { inventoryNo: { contains: q.q, mode: 'insensitive' } },
                { name: { contains: q.q, mode: 'insensitive' } },
                { serialNo: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(cursor
          ? { AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] }
          : {}),
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
      if (!a) throw new NotFoundException('Хөрөнгө олдсонгүй');
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
          throw new BadRequestException('Шинэ хөрөнгийг актлагдсан төлөвтэй бүртгэх боломжгүй');
        }
        this.assertAcquiredDate(dto.acquiredDate);
        await this.assertCategoryUsable(tx, tenantId, dto.categoryId);
        const roomId = dto.roomId ?? null;
        if (roomId) await this.assertRoomUsable(tx, tenantId, campId, roomId);
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
            condition: dto.condition ?? CampAssetCondition.GOOD,
            acquiredDate: dto.acquiredDate ? toDbDate(dto.acquiredDate) : null,
            acquiredCost: dto.acquiredCost === undefined || dto.acquiredCost === null ? null : new Prisma.Decimal(dto.acquiredCost),
            note: dto.note ?? null,
          },
          select: ASSET_SELECT,
        });
        // Анхны байршуулалт ч түүхэнд үлдэнэ (агуулах → өрөө)
        if (roomId) {
          await tx.campAssetMovement.create({
            data: { tenantId, campId, assetId: created.id, fromRoomId: null, toRoomId: roomId, movedBy: userId, reason: 'Анхны байршуулалт' },
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
          throw new BadRequestException('Актлахдаа write-off үйлдлийг ашиглана уу (шалтгаантай)');
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
        if (res.count === 0) throw new ConflictException(`Хөрөнгө ${a.inventoryNo} өөрчлөгдсөн байна — дахин ачаална уу`);
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
        if (to === a.roomId) throw new BadRequestException(to ? 'Хөрөнгө аль хэдийн энэ өрөөнд байна' : 'Хөрөнгө аль хэдийн агуулахад байна');
        if (to) await this.assertRoomUsable(tx, tenantId, campId, to);
        // Optimistic: уншсанаас хойш байршил/төлөв өөрчлөгдсөн бол 0 мөр → 409
        const res = await tx.campAsset.updateMany({
          where: { id, tenantId, roomId: a.roomId, condition: { not: CampAssetCondition.WRITTEN_OFF } },
          data: { roomId: to },
        });
        if (res.count === 0) throw new ConflictException(`Хөрөнгө ${a.inventoryNo}-ийн байршил өөрчлөгдсөн байна — дахин ачаална уу`);
        await tx.campAssetMovement.create({
          data: { tenantId, campId, assetId: id, fromRoomId: a.roomId, toRoomId: to, movedBy: userId, reason: dto.reason ?? null },
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
        if (open) throw new ConflictException(`Хөрөнгө ${a.inventoryNo} нээлттэй засвартай (${open.requestNo}) — эхлээд дуусгах эсвэл цуцлах`);
        const stamp = `[Актлав ${todayUb()}] ${dto.reason}`;
        const res = await tx.campAsset.updateMany({
          where: { id, tenantId, roomId: a.roomId, condition: { not: CampAssetCondition.WRITTEN_OFF } },
          data: { condition: CampAssetCondition.WRITTEN_OFF, roomId: null, note: a.note ? `${a.note}\n${stamp}` : stamp },
        });
        if (res.count === 0) throw new ConflictException(`Хөрөнгө ${a.inventoryNo} өөрчлөгдсөн байна — дахин ачаална уу`);
        if (a.roomId) {
          await tx.campAssetMovement.create({
            data: { tenantId, campId, assetId: id, fromRoomId: a.roomId, toRoomId: null, movedBy: userId, reason: `Актлав: ${dto.reason}`.slice(0, 500) },
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
          fromRoom: { select: { roomNo: true } },
          toRoom: { select: { roomNo: true } },
          movedByUser: { select: { fullName: true, email: true } },
        },
        orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    });
  }
}
