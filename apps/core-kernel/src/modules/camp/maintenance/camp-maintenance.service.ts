import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CampAssetCondition, CampMaintenanceStatus, CampPartSource, CampRoomStatus, Prisma } from '@prisma/client';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { decodeCursor, encodeCursor } from '../../../common/utils/cursor';
import { CampAccessService } from '../common/camp-access.service';
import { CAMP_PERMISSIONS } from '../common/camp-permissions';
import { inTenantTx, toDbDate, Tx } from '../common/camp-tx';
import { withCampErrors } from '../common/camp-errors';
import { getCampOr404 } from '../common/camp-lookup';
import { todayUb } from '../attendance/camp-date';
import { computeVat, sumVat, vatView } from '../costs/vat';
import { writeMaintenancePartCosts } from '../costs/cost-entry-writer';
import {
  CancelMaintenanceDto,
  CreateMaintenanceDto,
  CreatePartDto,
  QueryMaintenanceDto,
  UpdateMaintenanceDto,
  UpdatePartDto,
} from './camp-maintenance.dto';
import {
  DETAILS_EDITABLE,
  formatRequestNo,
  MaintenanceAction,
  OPEN_STATUSES,
  PARTS_EDITABLE,
  requestNoPrefix,
  STATUS_LABEL,
  TRANSITIONS,
} from './maintenance-flow';

const P = CAMP_PERMISSIONS;
const DEFAULT_VAT_RATE = 10;

const REQUEST_SELECT = {
  id: true,
  campId: true,
  requestNo: true,
  roomId: true,
  assetId: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  blocksRoom: true,
  reportedBy: true,
  startedAt: true,
  completedAt: true,
  closedBy: true,
  closedAt: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  room: { select: { roomNo: true, status: true, building: { select: { code: true } } } },
  asset: { select: { inventoryNo: true, name: true } },
  reportedByUser: { select: { fullName: true, email: true } },
} as const;

const PART_SELECT = {
  id: true,
  partName: true,
  quantity: true,
  unit: true,
  unitPrice: true,
  vatIncluded: true,
  source: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PartRow = Prisma.CampMaintenancePartGetPayload<{ select: typeof PART_SELECT }>;

/** Засварын хүсэлтийн төлөв шилжүүлэхэд хэрэгтэй хэсэг */
interface RequestCore {
  id: string;
  requestNo: string;
  status: CampMaintenanceStatus;
  roomId: string | null;
  blocksRoom: boolean;
  reportedBy: string;
}

export const partView = (p: PartRow) => ({
  ...p,
  quantity: p.quantity.toString(),
  unitPrice: p.unitPrice ? p.unitPrice.toFixed(2) : null,
});

/**
 * Зардлын урьдчилсан тооцоо: ЗӨВХӨН катерингийн авсан (CATERING_PURCHASED) сэлбэг зардалд орно,
 * уурхайн нийлүүлсэн (MINE_SUPPLIED) нь орохгүй. Хаах үед яг энэ тооцоогоор camp_cost_entries бичигдэнэ.
 */
export function costPreview(parts: PartRow[], vatRate: Prisma.Decimal | number | string) {
  const lines = parts
    .filter((p) => p.source === CampPartSource.CATERING_PURCHASED && p.unitPrice !== null)
    .map((p) => ({ partId: p.id, ...computeVat({ quantity: p.quantity, unitPrice: p.unitPrice!, vatIncluded: p.vatIncluded, vatRate }) }));
  return {
    vatRate: new Prisma.Decimal(vatRate).toFixed(2),
    lines: lines.map((l) => ({ partId: l.partId, ...vatView(l) })),
    total: vatView(sumVat(lines)),
  };
}

/**
 * Засвар үйлчилгээ (Шат 4.4).
 *   - Дугаар ZAS-{campCode}-{YYYY}-{NNNN}: кемп+он тус бүрд advisory lock-оор дараалуулна.
 *   - blocks_room = true бол өрөөг MAINTENANCE болгоно; дуусах/цуцлахад өөр түгжих засвар үлдээгүй бол ACTIVE.
 *     Өрөөний мөрийг FOR UPDATE-аар түгжиж зэрэгцээ хүсэлтүүдийн "хэн нь сүүлд суллах" race-ийг арилгана.
 *   - Төлөв шилжилт бүр `updateMany where status = from` → зэрэгцээ өөрчлөлтөд 409.
 *   - Хаах (DONE → CLOSED): катерингийн сэлбэгийн зардлыг кемпийн тохиргооны катеринг байгууллага + НӨАТ-аар
 *     camp_cost_entries-д snapshot болгон бичнэ (DB trigger: дахин засагдахгүй).
 */
@Injectable()
export class CampMaintenanceService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
  ) {}

  // ── Туслахууд ──────────────────────────────────────────────

  private async loadCore(tx: Tx, tenantId: string, campId: string, id: string): Promise<RequestCore> {
    const r = await tx.campMaintenanceRequest.findFirst({
      where: { id, tenantId, campId },
      select: { id: true, requestNo: true, status: true, roomId: true, blocksRoom: true, reportedBy: true },
    });
    if (!r) throw new NotFoundException('Засварын хүсэлт олдсонгүй');
    return r;
  }

  private async nextRequestNo(tx: Tx, tenantId: string, campId: string, campCode: string): Promise<string> {
    const year = todayUb().slice(0, 4);
    const prefix = requestNoPrefix(campCode, year);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`camp-maintenance-no:${tenantId}:${campId}:${year}`}))`;
    // starts_with (LIKE биш — код '_' агуулж болно) + зөвхөн цифр дагавар (өөр кодын угтвартай давхцахаас хамгаална)
    const rows = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(substring(request_no FROM ${prefix.length + 1}::int)::int) AS max
        FROM camp_maintenance_requests
       WHERE tenant_id = ${tenantId}::uuid
         AND starts_with(request_no, ${prefix})
         AND substring(request_no FROM ${prefix.length + 1}::int) ~ '^[0-9]+$'`;
    return formatRequestNo(campCode, year, Number(rows[0]?.max ?? 0) + 1);
  }

  /** Өрөөний мөрийг transaction дуустал түгжинэ (lock/release зэрэгцээ ажиллахгүй) */
  private async lockRoomRow(tx: Tx, tenantId: string, roomId: string) {
    await tx.$executeRaw`SELECT 1 FROM camp_rooms WHERE tenant_id = ${tenantId}::uuid AND id = ${roomId}::uuid FOR UPDATE`;
  }

  /** Өрөөг засварт оруулна. INACTIVE → 409. Буцаах: анхааруулга (өрөөнд одоо хүн байрлаж байвал) */
  private async blockRoom(tx: Tx, tenantId: string, campId: string, roomId: string): Promise<string[]> {
    await this.lockRoomRow(tx, tenantId, roomId);
    const room = await tx.campRoom.findFirst({ where: { id: roomId, tenantId, campId }, select: { roomNo: true, status: true } });
    if (!room) throw new BadRequestException('Өрөө энэ кемпэд олдсонгүй');
    if (room.status === CampRoomStatus.INACTIVE) {
      throw new ConflictException(`Өрөө ${room.roomNo} идэвхгүй — засварт оруулах боломжгүй`);
    }
    if (room.status === CampRoomStatus.ACTIVE) {
      await tx.campRoom.update({ where: { id: roomId }, data: { status: CampRoomStatus.MAINTENANCE } });
    }
    const today = toDbDate(todayUb());
    const occupants = await tx.campRoomAllocation.count({
      where: { tenantId, roomId, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    });
    return occupants > 0 ? [`Өрөө ${room.roomNo}-д одоо ${occupants} хүн байрлаж байна — шилжүүлэх шаардлагатай эсэхийг шалгана уу`] : [];
  }

  /** Өөр нээлттэй түгжих засвар үлдээгүй бол өрөөг ACTIVE болгоно. Буцаах: суллагдсан эсэх */
  private async releaseRoom(tx: Tx, tenantId: string, roomId: string, exceptRequestId: string): Promise<boolean> {
    await this.lockRoomRow(tx, tenantId, roomId);
    const others = await tx.campMaintenanceRequest.count({
      where: { tenantId, roomId, blocksRoom: true, status: { in: [...OPEN_STATUSES] }, NOT: { id: exceptRequestId } },
    });
    if (others > 0) return false;
    const res = await tx.campRoom.updateMany({
      where: { id: roomId, tenantId, status: CampRoomStatus.MAINTENANCE },
      data: { status: CampRoomStatus.ACTIVE },
    });
    return res.count > 0;
  }

  /** Төлөв шилжүүлэх (optimistic: status = уншсан төлөв) */
  private async setStatus(tx: Tx, tenantId: string, r: RequestCore, data: Prisma.CampMaintenanceRequestUncheckedUpdateManyInput) {
    const res = await tx.campMaintenanceRequest.updateMany({ where: { id: r.id, tenantId, status: r.status }, data });
    if (res.count === 0) throw new ConflictException(`${r.requestNo} төлөв өөрчлөгдсөн байна — дахин ачаална уу`);
  }

  private async vatRateOf(tx: Tx, tenantId: string, campId: string) {
    const s = await tx.campSetting.findFirst({ where: { tenantId, campId }, select: { vatRate: true, cateringOrganizationId: true } });
    return { vatRate: s?.vatRate ?? new Prisma.Decimal(DEFAULT_VAT_RATE), cateringOrganizationId: s?.cateringOrganizationId ?? null };
  }

  private async detail(tx: Tx, tenantId: string, campId: string, id: string) {
    const r = await tx.campMaintenanceRequest.findFirst({ where: { id, tenantId, campId }, select: REQUEST_SELECT });
    if (!r) throw new NotFoundException('Засварын хүсэлт олдсонгүй');
    const parts = await tx.campMaintenancePart.findMany({ where: { tenantId, requestId: id }, select: PART_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const { vatRate } = await this.vatRateOf(tx, tenantId, campId);
    return { ...r, statusLabel: STATUS_LABEL[r.status], parts: parts.map(partView), cost: costPreview(parts, vatRate) };
  }

  // ── Унших ──────────────────────────────────────────────────

  async list(tenantId: string, authId: string, campId: string, q: QueryMaintenanceDto) {
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
      const where: Prisma.CampMaintenanceRequestWhereInput = {
        tenantId,
        campId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.priority ? { priority: q.priority } : {}),
        ...(q.roomId ? { roomId: q.roomId } : {}),
        ...(q.assetId ? { assetId: q.assetId } : {}),
        ...(q.q ? { OR: [{ requestNo: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] } : {}),
        ...(cursor
          ? { AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] }
          : {}),
      };
      const rows = await tx.campMaintenanceRequest.findMany({ where, select: REQUEST_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      const last = data[data.length - 1];
      return {
        data: data.map((r) => ({ ...r, statusLabel: STATUS_LABEL[r.status] })),
        nextCursor: hasMore && last ? encodeCursor(last.id, last.createdAt) : null,
        hasMore,
      };
    });
  }

  async get(tenantId: string, authId: string, campId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireAccess(tx, tenantId, authId, campId);
      return this.detail(tx, tenantId, campId, id);
    });
  }

  // ── Үүсгэх / засах ─────────────────────────────────────────

  async create(tenantId: string, authId: string, campId: string, dto: CreateMaintenanceDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const userId = await this.access.require(tx, tenantId, authId, campId, P.MAINTENANCE_CREATE);
        const camp = await getCampOr404(tx, tenantId, campId);
        if (!dto.roomId && !dto.assetId) throw new BadRequestException('roomId эсвэл assetId шаардлагатай');

        let roomId = dto.roomId ?? null;
        if (dto.assetId) {
          const asset = await tx.campAsset.findFirst({
            where: { id: dto.assetId, tenantId, campId },
            select: { inventoryNo: true, roomId: true, condition: true },
          });
          if (!asset) throw new BadRequestException('Хөрөнгө энэ кемпэд олдсонгүй');
          if (asset.condition === CampAssetCondition.WRITTEN_OFF) {
            throw new ConflictException(`Хөрөнгө ${asset.inventoryNo} актлагдсан — засварт оруулах боломжгүй`);
          }
          if (roomId && asset.roomId !== roomId) {
            throw new BadRequestException(`Хөрөнгө ${asset.inventoryNo} заасан өрөөнд байхгүй (${asset.roomId ? 'өөр өрөөнд' : 'агуулахад'} байна)`);
          }
          roomId ??= asset.roomId; // зөвхөн хөрөнгө өгвөл түүний одоогийн өрөө
        } else if (roomId) {
          const room = await tx.campRoom.findFirst({ where: { id: roomId, tenantId, campId }, select: { id: true } });
          if (!room) throw new BadRequestException('Өрөө энэ кемпэд олдсонгүй');
        }
        const blocksRoom = dto.blocksRoom ?? false;
        if (blocksRoom && !roomId) throw new BadRequestException('Өрөө түгжихэд (blocksRoom) өрөө шаардлагатай — хөрөнгө агуулахад байна');

        const requestNo = await this.nextRequestNo(tx, tenantId, campId, camp.code);
        const created = await tx.campMaintenanceRequest.create({
          data: {
            tenantId,
            campId,
            requestNo,
            roomId,
            assetId: dto.assetId ?? null,
            title: dto.title,
            description: dto.description ?? null,
            priority: dto.priority,
            blocksRoom,
            reportedBy: userId,
          },
          select: { id: true },
        });
        const warnings = blocksRoom && roomId ? await this.blockRoom(tx, tenantId, campId, roomId) : [];
        return { ...(await this.detail(tx, tenantId, campId, created.id)), warnings };
      }),
    );
  }

  /** Гарчиг/тайлбар/зэрэглэл — OPEN/IN_PROGRESS үед; үүсгэсэн хүн эсвэл close эрхтэй */
  async update(tenantId: string, authId: string, campId: string, id: string, dto: UpdateMaintenanceDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const r = await this.loadCoreAuthorized(tx, tenantId, authId, campId, id, [P.MAINTENANCE_CLOSE], true);
        if (!DETAILS_EDITABLE.includes(r.status)) {
          throw new ConflictException(`${r.requestNo} ${STATUS_LABEL[r.status]} төлөвтэй — засах боломжгүй`);
        }
        const data: Prisma.CampMaintenanceRequestUncheckedUpdateManyInput = {};
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.priority !== undefined) data.priority = dto.priority;
        await this.setStatus(tx, tenantId, r, data);
        return this.detail(tx, tenantId, campId, id);
      }),
    );
  }

  /**
   * Эрх шалгаад хүсэлтийг ачаална. reporterMay = true бол үүсгэсэн хүн (maintenance.create эрхтэй хэвээр) зөвшөөрөгдөнө.
   * Эрх шалгалт ЭХЭНД — эрхгүй хүнд хүсэлт байгаа эсэхийг илчлэхгүй.
   */
  private async loadCoreAuthorized(
    tx: Tx,
    tenantId: string,
    authId: string,
    campId: string,
    id: string,
    perms: readonly (typeof P)[keyof typeof P][],
    reporterMay: boolean,
  ): Promise<RequestCore & { actorId: string }> {
    const actor = await this.access.resolve(tx, tenantId, authId);
    const hasPerm = perms.some((c) => CampAccessService.has(actor.perms, campId, c));
    const mayReport = reporterMay && CampAccessService.has(actor.perms, campId, P.MAINTENANCE_CREATE);
    if (!hasPerm && !mayReport) throw new ForbiddenException(`Энэ үйлдэлд ${perms.join(' эсвэл ')} эрх шаардлагатай`);
    const r = await this.loadCore(tx, tenantId, campId, id);
    if (!hasPerm && r.reportedBy !== actor.userId) {
      throw new ForbiddenException(`Зөвхөн хүсэлт үүсгэсэн хүн эсвэл ${perms.join('/')} эрхтэй хүн хийнэ`);
    }
    return { ...r, actorId: actor.userId };
  }

  // ── Төлөв шилжилт ──────────────────────────────────────────

  async transition(tenantId: string, authId: string, campId: string, id: string, action: MaintenanceAction, dto?: CancelMaintenanceDto) {
    const rule = TRANSITIONS[action];
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const r = await this.loadCoreAuthorized(tx, tenantId, authId, campId, id, rule.perms, rule.reporterMay);
        if (!rule.from.includes(r.status)) {
          throw new ConflictException(
            `${r.requestNo}: ${STATUS_LABEL[r.status]} төлөвөөс "${action}" хийх боломжгүй (зөвхөн ${rule.from.map((s) => STATUS_LABEL[s]).join(', ')})`,
          );
        }
        const now = new Date();
        const data: Prisma.CampMaintenanceRequestUncheckedUpdateManyInput = { status: rule.to };
        let costEntries = 0;
        if (action === 'start') data.startedAt = now;
        if (action === 'complete') data.completedAt = now;
        if (action === 'reopen') data.completedAt = null;
        if (action === 'cancel') {
          if (!dto?.reason) throw new BadRequestException('Цуцлах шалтгаан шаардлагатай');
          data.cancelReason = dto.reason;
        }
        if (action === 'close') {
          data.closedBy = r.actorId;
          data.closedAt = now;
        }

        // reopen: өрөөг эхлээд түгжинэ (INACTIVE бол 409 — төлөв өөрчлөгдөхөөс өмнө)
        const warnings = rule.room === 'lock' && r.blocksRoom && r.roomId ? await this.blockRoom(tx, tenantId, campId, r.roomId) : [];

        await this.setStatus(tx, tenantId, r, data);
        if (action === 'close') {
          // Төлвийг ЭХЛЭЭД CLOSED болгоно (мөр түгжигдэнэ) → сэлбэгийн trigger (FOR SHARE) зэрэгцээ нэмэлтийг
          // хүлээлгээд татгалзана; энэ уншилт commit хийгдсэн бүх сэлбэгийг харна (зардал дутуу бичигдэхгүй)
          const parts = await tx.campMaintenancePart.findMany({ where: { tenantId, requestId: id }, select: PART_SELECT });
          const catering = parts.filter((p) => p.source === CampPartSource.CATERING_PURCHASED);
          const { vatRate, cateringOrganizationId } = await this.vatRateOf(tx, tenantId, campId);
          if (catering.length > 0 && !cateringOrganizationId) {
            throw new ConflictException('Кемпийн тохиргоонд катерингийн үйлчилгээ үзүүлэгч байгууллага сонгоогүй — сэлбэгийн зардлыг бүртгэх боломжгүй');
          }
          const unpriced = catering.find((p) => p.unitPrice === null);
          if (unpriced) throw new ConflictException(`Сэлбэг "${unpriced.partName}" үнэгүй — катерингийн сэлбэгт үнэ заавал`);
          costEntries = await writeMaintenancePartCosts(
            tx,
            { tenantId, campId, requestNo: r.requestNo, costDate: todayUb(), organizationId: cateringOrganizationId ?? '', vatRate, createdBy: r.actorId },
            catering.map((p) => ({ id: p.id, partName: p.partName, quantity: p.quantity, unit: p.unit, unitPrice: p.unitPrice!, vatIncluded: p.vatIncluded })),
          );
        }

        const roomReleased = rule.room === 'release' && r.blocksRoom && r.roomId ? await this.releaseRoom(tx, tenantId, r.roomId, r.id) : false;
        return { ...(await this.detail(tx, tenantId, campId, id)), warnings, roomReleased, costEntries };
      }),
    );
  }

  // ── Сэлбэг ─────────────────────────────────────────────────

  private async loadForParts(tx: Tx, tenantId: string, authId: string, campId: string, id: string) {
    const userId = await this.access.require(tx, tenantId, authId, campId, P.MAINTENANCE_PARTS);
    const r = await this.loadCore(tx, tenantId, campId, id);
    if (!PARTS_EDITABLE.includes(r.status)) {
      throw new ConflictException(`${r.requestNo} ${STATUS_LABEL[r.status]} — сэлбэг өөрчлөх боломжгүй`);
    }
    return { r, userId };
  }

  private static assertPriced(source: CampPartSource, unitPrice: number | Prisma.Decimal | null | undefined) {
    if (source === CampPartSource.CATERING_PURCHASED && (unitPrice === null || unitPrice === undefined)) {
      throw new BadRequestException('Катерингийн авсан сэлбэгт нэгж үнэ (unitPrice) заавал — зардалд орно');
    }
  }

  async addPart(tenantId: string, authId: string, campId: string, id: string, dto: CreatePartDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        const { userId } = await this.loadForParts(tx, tenantId, authId, campId, id);
        CampMaintenanceService.assertPriced(dto.source, dto.unitPrice);
        const part = await tx.campMaintenancePart.create({
          data: {
            tenantId,
            requestId: id,
            partName: dto.partName,
            quantity: new Prisma.Decimal(dto.quantity),
            unit: dto.unit ?? 'ш',
            unitPrice: dto.unitPrice === undefined || dto.unitPrice === null ? null : new Prisma.Decimal(dto.unitPrice),
            vatIncluded: dto.vatIncluded ?? true,
            source: dto.source,
            createdBy: userId,
          },
          select: PART_SELECT,
        });
        return partView(part);
      }),
    );
  }

  async updatePart(tenantId: string, authId: string, campId: string, id: string, partId: string, dto: UpdatePartDto) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.loadForParts(tx, tenantId, authId, campId, id);
        const part = await tx.campMaintenancePart.findFirst({ where: { id: partId, tenantId, requestId: id }, select: PART_SELECT });
        if (!part) throw new NotFoundException('Сэлбэг олдсонгүй');
        const source = dto.source ?? part.source;
        const unitPrice = dto.unitPrice !== undefined ? dto.unitPrice : part.unitPrice;
        CampMaintenanceService.assertPriced(source, unitPrice);
        const updated = await tx.campMaintenancePart.update({
          where: { id: partId },
          data: {
            ...(dto.partName !== undefined ? { partName: dto.partName } : {}),
            ...(dto.quantity !== undefined ? { quantity: new Prisma.Decimal(dto.quantity) } : {}),
            ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
            ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice === null ? null : new Prisma.Decimal(dto.unitPrice) } : {}),
            ...(dto.vatIncluded !== undefined ? { vatIncluded: dto.vatIncluded } : {}),
            ...(dto.source !== undefined ? { source: dto.source } : {}),
          },
          select: PART_SELECT,
        });
        return partView(updated);
      }),
    );
  }

  async removePart(tenantId: string, authId: string, campId: string, id: string, partId: string) {
    return withCampErrors(() =>
      inTenantTx(this.prisma, tenantId, async (tx) => {
        await this.loadForParts(tx, tenantId, authId, campId, id);
        const res = await tx.campMaintenancePart.deleteMany({ where: { id: partId, tenantId, requestId: id } });
        if (res.count === 0) throw new NotFoundException('Сэлбэг олдсонгүй');
        return { deleted: true };
      }),
    );
  }
}
